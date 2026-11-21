-- Listing packages: one live listing is free, more need a package (your call, 2026-11-21).
--
-- - Free: 1 published listing at a time. Drafts, sold/rented and hidden listings never count, so
--   when the free listing is sold or hidden the next one is free again.
-- - Package (QPay, 29,900₮): 30 days with up to 20 published listings. A package bought while one
--   runs starts when the current one ends. No automatic renewal (QPay has none).
-- - When the package ends: the listing published first stays live; the others are hidden
--   (`archived` with `plan_paused_at` set) by a job every 15 minutes. Paying again republishes
--   the paused ones (oldest first, up to the limit) at once.
--
-- The database is the judge: the publish trigger refuses a publish past the limit with
-- `listing_limit_reached`, whichever client sends it (website, app, API).
--
-- Switch (private.settings, no migration needed):
-- - `listing_limit` = 'on': the limit applies to everyone.
-- - otherwise it applies only to the user ids in `listing_limit_testers` (comma-separated).
-- Default: off for everyone. Turning it on also lets the job hide the extra listings of every
-- seller without a package (all but their first-published live listing).

-- Packages ------------------------------------------------------------------------------------

create table public.listing_packages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  product_id  text not null check (char_length(product_id) between 1 and 100),
  starts_at   timestamptz not null,
  expires_at  timestamptz not null,
  -- Expiry is a time, not a status: an active row counts only between starts_at and expires_at.
  status      text not null default 'active' check (status in ('active', 'refunded', 'revoked')),
  payment_id  uuid not null unique references public.payments (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint listing_packages_period check (expires_at > starts_at)
);

comment on table public.listing_packages is
  'Paid listing packages (QPay prepaid periods: up to 20 live listings). Written only by the web server.';

create index listing_packages_user_idx on public.listing_packages (user_id, expires_at desc);

create trigger listing_packages_touch_updated_at
  before update on public.listing_packages
  for each row execute function private.touch_updated_at();

alter table public.listing_packages enable row level security;
revoke all on table public.listing_packages from public, anon, authenticated;
grant select on public.listing_packages to authenticated;

create policy "select own" on public.listing_packages for select to authenticated
  using (user_id = (select auth.uid()));

-- Listings hidden because a package ended. Server-written (no client grant); cleared by the
-- listings trigger whenever the status leaves `archived`.
alter table public.listings add column plan_paused_at timestamptz;

create index listings_owner_published_idx on public.listings (owner_id, published_at)
  where status = 'published';

-- Entitlement ---------------------------------------------------------------------------------

-- When the user's package ends, or null without an active package now. Periods bought in a row
-- touch, so the end is the latest expiry of the active rows.
create function private.listing_package_until(p_user_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.listing_packages p
      where p.user_id = p_user_id and p.status = 'active'
        and p.starts_at <= now() and p.expires_at > now()
    )
    then (
      select max(p.expires_at) from public.listing_packages p
      where p.user_id = p_user_id and p.status = 'active' and p.expires_at > now()
    )
  end
$$;

-- Whether the limit applies to this user (the switch above).
create function private.listing_limit_applies(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.value = 'on' from private.settings s where s.key = 'listing_limit'), false)
    or coalesce((
      select p_user_id::text = any (string_to_array(replace(lower(s.value), ' ', ''), ','))
      from private.settings s where s.key = 'listing_limit_testers'
    ), false)
$$;

-- Published listings the user may have at once. Mirrored in @bairmair/db
-- (LISTING_FREE_LIMIT, LISTING_PACKAGE_LIMIT).
create function private.listing_limit(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when private.listing_package_until(p_user_id) is not null then 20 else 1 end
$$;

revoke execute on function private.listing_package_until(uuid) from public;
revoke execute on function private.listing_limit_applies(uuid) from public;
revoke execute on function private.listing_limit(uuid) from public;

-- The caller's plan, for the apps: whether the limit applies, how many listings may be live,
-- how many are, how many a package's end hid, and when the package ends (null = none).
create function public.listing_plan()
returns table (
  enforced        boolean,
  listing_limit   integer,
  live_listings   integer,
  paused_listings integer,
  package_until   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.listing_limit_applies(auth.uid()),
    private.listing_limit(auth.uid()),
    (select count(*)::integer from public.listings l
      where l.owner_id = auth.uid() and l.status = 'published'),
    (select count(*)::integer from public.listings l
      where l.owner_id = auth.uid() and l.status = 'archived' and l.plan_paused_at is not null),
    private.listing_package_until(auth.uid())
  where auth.uid() is not null
$$;

revoke execute on function public.listing_plan() from public, anon;
grant execute on function public.listing_plan() to authenticated;

-- The publish trigger, with the limit ----------------------------------------------------------
-- Same as migration 20261112100300 plus the limit check and plan_paused_at.

create or replace function private.listings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_live integer;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();

    -- The owner switched between exact and approximate pin: recompute the public point.
    if new.show_exact_location is distinct from old.show_exact_location then
      select p.lat, p.lng into v_lat, v_lng
      from public.listing_private p
      where p.listing_id = new.id;
      if found then
        new.public_lat := private.public_coord(v_lat, new.show_exact_location);
        new.public_lng := private.public_coord(v_lng, new.show_exact_location);
      end if;
    end if;

    -- Only a published listing can be marked sold/rented (it becomes publicly visible).
    if new.status = 'sold_or_rented' and old.status not in ('published', 'sold_or_rented') then
      raise exception 'listing_not_published' using errcode = 'P0001';
    end if;
  end if;

  -- A paused listing stops being paused once its status changes (republished, sold, draft).
  if new.status <> 'archived' then
    new.plan_paused_at := null;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if not exists (
      select 1 from auth.users u
      where u.id = new.owner_id
        and u.phone_confirmed_at is not null
        and coalesce(u.phone, '') <> ''
    ) then
      raise exception 'publish_requires_verified_phone' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.listing_photos p where p.listing_id = new.id) then
      raise exception 'publish_requires_photo' using errcode = 'P0001';
    end if;
    if private.listing_limit_applies(new.owner_id) then
      -- One publish at a time per owner, so two parallel publishes cannot both fit.
      perform pg_advisory_xact_lock(hashtextextended('listing_limit:' || new.owner_id::text, 0));
      select count(*) into v_live from public.listings l
      where l.owner_id = new.owner_id and l.status = 'published' and l.id <> new.id;
      if v_live >= private.listing_limit(new.owner_id) then
        raise exception 'listing_limit_reached' using errcode = 'P0001';
      end if;
    end if;
    -- Keep the first publish date, so archiving and republishing does not bump a listing.
    new.published_at := coalesce(new.published_at, now());
    new.last_confirmed_at := now();
  end if;

  return new;
end;
$$;

-- Hiding and restoring ------------------------------------------------------------------------

-- Hides the published listings past each owner's limit (all but the first-published ones).
-- Run by pg_cron every 15 minutes; safe to run any time (service role: the integration tests, or
-- `select public.enforce_listing_limits()` in the SQL editor). Returns how many it hid.
create function public.enforce_listing_limits()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner record;
  v_limit integer;
  v_hidden integer;
  v_total integer := 0;
begin
  for v_owner in
    select l.owner_id from public.listings l
    where l.status = 'published'
    group by l.owner_id
    having count(*) > 1
  loop
    if not private.listing_limit_applies(v_owner.owner_id) then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('listing_limit:' || v_owner.owner_id::text, 0));
    v_limit := private.listing_limit(v_owner.owner_id);
    update public.listings l
    set status = 'archived', plan_paused_at = now()
    where l.id in (
      select x.id from public.listings x
      where x.owner_id = v_owner.owner_id and x.status = 'published'
      order by x.published_at asc nulls last, x.created_at asc, x.id
      offset v_limit
    );
    get diagnostics v_hidden = row_count;
    v_total := v_total + v_hidden;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.enforce_listing_limits() from public, anon, authenticated;
grant execute on function public.enforce_listing_limits() to service_role;

-- Republishes the user's paused listings that fit (oldest first). A listing the trigger refuses
-- (a photo removed meanwhile, the phone no longer verified) stays paused; the others go on.
create function private.restore_paused_listings(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_restored integer := 0;
begin
  for v_id in
    select l.id from public.listings l
    where l.owner_id = p_user_id and l.status = 'archived' and l.plan_paused_at is not null
    order by l.published_at asc nulls last, l.created_at asc, l.id
  loop
    begin
      update public.listings set status = 'published' where id = v_id;
      v_restored := v_restored + 1;
    exception
      when raise_exception or check_violation then
        -- Over the limit, or no longer publishable: leave it paused.
        null;
    end;
  end loop;
  return v_restored;
end;
$$;

revoke execute on function private.restore_paused_listings(uuid) from public;

-- Adds a paid package period (server only) and republishes paused listings. Starts now, or when
-- the current package ends. Repeating it for the same payment returns the row already made, so a
-- delivery retried after a failure never adds time twice.
create function public.add_listing_package_period(
  p_user_id uuid,
  p_payment_id uuid,
  p_product_id text,
  p_days integer
)
returns public.listing_packages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.listing_packages;
  v_start timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 400 then
    raise exception 'invalid period: % days', p_days;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('listing_packages:' || p_user_id::text, 0));

  select * into v_row from public.listing_packages p where p.payment_id = p_payment_id;
  if found then
    perform private.restore_paused_listings(p_user_id);
    return v_row;
  end if;

  v_start := greatest(now(), coalesce(private.listing_package_until(p_user_id), now()));

  insert into public.listing_packages (user_id, product_id, starts_at, expires_at, payment_id)
  values (p_user_id, p_product_id, v_start, v_start + make_interval(days => p_days), p_payment_id)
  returning * into v_row;

  perform private.restore_paused_listings(p_user_id);
  return v_row;
end;
$$;

revoke execute on function public.add_listing_package_period(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.add_listing_package_period(uuid, uuid, text, integer) to service_role;

-- Adds (p_on = true) or removes one user id from `listing_limit_testers` (service role only:
-- the integration tests, or `select public.set_listing_limit_tester('<user id>', true)` in the
-- SQL editor). Returns the list after the change.
create function public.set_listing_limit_tester(p_user_id uuid, p_on boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_value text;
begin
  perform pg_advisory_xact_lock(hashtextextended('settings:listing_limit_testers', 0));
  select coalesce(string_to_array(replace(lower(s.value), ' ', ''), ','), '{}')
  into v_ids from private.settings s where s.key = 'listing_limit_testers';
  v_ids := array_remove(coalesce(v_ids, '{}'), p_user_id::text);
  v_ids := array_remove(v_ids, '');
  if p_on then
    v_ids := v_ids || p_user_id::text;
  end if;
  v_value := array_to_string(v_ids, ',');
  insert into private.settings (key, value) values ('listing_limit_testers', v_value)
  on conflict (key) do update set value = excluded.value;
  return v_value;
end;
$$;

revoke execute on function public.set_listing_limit_tester(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_listing_limit_tester(uuid, boolean) to service_role;

-- Schedule ------------------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'enforce-listing-limits',
  '*/15 * * * *',
  $$select public.enforce_listing_limits()$$
);

comment on table private.settings is
  'Per-project settings: alerts_url (the alerts Edge Function), anon_reveals_per_hour (150), '
  'reveal_alert_per_hour (100), listing_limit (''on'' = for everyone), listing_limit_testers '
  '(comma-separated user ids the limit applies to while it is not on for everyone).';
