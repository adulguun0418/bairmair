-- Phone reveals: limits that bound scraping, and an email alert when reveals spike.
--
-- Anyone can call reveal_listing_contact with the public key, and the per-IP limit (10 an hour)
-- alone does not stop a scraper with rotating proxies. Added:
--   1. A daily cap per IP: 30 new numbers a day, on top of 10 an hour.
--   2. A budget for all anonymous reveals together: 150 an hour. Past it, anonymous callers get
--      `reveal_requires_sign_in` and the apps offer sign-in; signed-in users keep their own
--      30 an hour. A scraper then needs accounts, which need a SIM (SMS) or an Apple ID.
--   3. An alert when the hour's reveals (anonymous and signed in) reach 100: a row in
--      private.alerts, and pg_net calls the `alerts` Edge Function, which emails it and marks it.
--
-- Budget and alert threshold live in private.settings (defaults below when a key is missing), so
-- they can be changed from the SQL editor without a migration. `anon_reveals_per_hour = 0` makes
-- every anonymous reveal ask for sign-in.

create extension if not exists pg_net with schema extensions;

-- Small per-project settings that are not secrets (the alerts function's URL differs per project).
create table private.settings (
  key   text primary key,
  value text not null
);
alter table private.settings enable row level security;
revoke all on table private.settings from public, anon, authenticated;

comment on table private.settings is
  'Per-project settings: alerts_url (the alerts Edge Function), anon_reveals_per_hour (150), '
  'reveal_alert_per_hour (100).';

create function private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case when s.value ~ '^\d{1,6}$' then s.value::integer end
     from private.settings s where s.key = p_key),
    p_default
  );
$$;

-- Alerts waiting to be emailed by the `alerts` Edge Function (generic: `kind` + `details`).
create table private.alerts (
  id         bigint generated always as identity primary key,
  kind       text not null,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);
create index alerts_kind_idx on private.alerts (kind, created_at);
create index alerts_pending_idx on private.alerts (created_at) where emailed_at is null;
alter table private.alerts enable row level security;
revoke all on table private.alerts from public, anon, authenticated;

-- The global counts below scan the last hour by time.
create index contact_reveals_created_idx on public.contact_reveals (created_at);

-- Records a `reveals` alert when the last hour reached the threshold and none was recorded in the
-- last 3 hours, and asks the alerts function to send it (after this transaction commits).
create function private.note_reveal_spike()
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_threshold integer := private.setting_int('reveal_alert_per_hour', 100);
  v_total integer;
  v_url text;
begin
  if v_threshold < 1 then
    return;
  end if;
  select count(*) into v_total
  from public.contact_reveals r
  where r.created_at > now() - interval '1 hour';
  if v_total < v_threshold then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('note_reveal_spike', 0));
  select s.value into v_url from private.settings s where s.key = 'alerts_url';
  if exists (
    select 1 from private.alerts a
    where a.kind = 'reveals' and a.created_at > now() - interval '3 hours'
  ) then
    -- Already alerted. If that email failed (released, still pending), ask again.
    if v_url is not null and exists (
      select 1 from private.alerts a where a.emailed_at is null
    ) then
      perform net.http_post(url := v_url, body := '{}'::jsonb, timeout_milliseconds := 10000);
    end if;
    return;
  end if;

  insert into private.alerts (kind, details)
  select 'reveals', jsonb_build_object(
    'reveals_last_hour', count(*),
    'anonymous', count(*) filter (where r.viewer_id is null),
    'ip_addresses', count(distinct r.ip_hash) filter (where r.viewer_id is null),
    'signed_in', count(*) filter (where r.viewer_id is not null),
    'users', count(distinct r.viewer_id),
    'listings', count(distinct r.listing_id),
    'reveals_last_day', (
      select count(*) from public.contact_reveals d where d.created_at > now() - interval '1 day'
    ),
    'threshold', v_threshold,
    'anon_budget', private.setting_int('anon_reveals_per_hour', 150)
  )
  from public.contact_reveals r
  where r.created_at > now() - interval '1 hour';

  if v_url is not null then
    -- Queued by pg_net and sent after commit; the function reads the alert itself.
    perform net.http_post(url := v_url, body := '{}'::jsonb, timeout_milliseconds := 10000);
  end if;
end;
$$;

create or replace function public.reveal_listing_contact(p_listing_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_ip_hash text;
  v_owner_id uuid;
  v_phone text;
  v_recent integer;
  v_today integer;
  v_repeat boolean;
begin
  select l.owner_id into v_owner_id
  from public.listings l
  where l.id = p_listing_id and l.status = 'published';
  if v_owner_id is null then
    raise exception 'listing_not_available' using errcode = 'PT404';
  end if;

  if v_viewer_id is not null then
    select exists (
      select 1 from public.contact_reveals r
      where r.viewer_id = v_viewer_id and r.listing_id = p_listing_id
        and r.created_at > now() - interval '1 hour'
    ) into v_repeat;
    if not v_repeat then
      select count(*) into v_recent
      from public.contact_reveals r
      where r.viewer_id = v_viewer_id and r.created_at > now() - interval '1 hour';
      if v_recent >= 30 then
        raise exception 'rate_limited' using errcode = 'PT429';
      end if;
    end if;
  else
    v_ip_hash := encode(sha256(convert_to(coalesce(private.request_ip(), 'unknown'), 'UTF8')), 'hex');
    select exists (
      select 1 from public.contact_reveals r
      where r.ip_hash = v_ip_hash and r.listing_id = p_listing_id
        and r.created_at > now() - interval '1 hour'
    ) into v_repeat;
    if not v_repeat then
      -- All anonymous callers together: past the budget, sign-in is the way on.
      select count(*) into v_recent
      from public.contact_reveals r
      where r.viewer_id is null and r.created_at > now() - interval '1 hour';
      if v_recent >= private.setting_int('anon_reveals_per_hour', 150) then
        raise exception 'reveal_requires_sign_in' using errcode = 'PT429';
      end if;

      select
        count(*) filter (where r.created_at > now() - interval '1 hour'),
        count(*)
      into v_recent, v_today
      from public.contact_reveals r
      where r.ip_hash = v_ip_hash and r.created_at > now() - interval '1 day';
      if v_recent >= 10 or v_today >= 30 then
        raise exception 'rate_limited' using errcode = 'PT429';
      end if;
    end if;
  end if;

  -- Read every time: the seller may have changed or removed their number since.
  select u.phone into v_phone
  from auth.users u
  where u.id = v_owner_id and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';
  if v_phone is null then
    raise exception 'contact_unavailable' using errcode = 'PT404';
  end if;

  if not v_repeat then
    insert into public.contact_reveals (listing_id, viewer_id, ip_hash)
    values (p_listing_id, v_viewer_id, v_ip_hash);
    perform private.note_reveal_spike();
  end if;

  -- auth.users stores phone numbers without the leading '+'.
  return '+' || ltrim(v_phone, '+');
end;
$$;
-- `create or replace` keeps the existing grants (execute for anon and authenticated only).

-- For the `alerts` Edge Function (secret key): the pending alerts, marked emailed at once so
-- concurrent calls do not send twice; `release_alert` puts one back when its email failed.
create function public.take_alerts()
returns table (id bigint, kind text, details jsonb, created_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  update private.alerts a
  set emailed_at = now()
  where a.id in (
    select p.id from private.alerts p
    where p.emailed_at is null
    order by p.created_at
    limit 20
    for update skip locked
  )
  returning a.id, a.kind, a.details, a.created_at;
$$;

create function public.release_alert(p_alert_id bigint)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update private.alerts set emailed_at = null where id = p_alert_id;
$$;

comment on function public.take_alerts is
  'alerts Edge Function only (secret key): pending alerts, marked emailed.';
comment on function public.release_alert is
  'alerts Edge Function only (secret key): marks an alert pending again after a failed email.';

revoke all on function public.take_alerts() from public, anon, authenticated;
revoke all on function public.release_alert(bigint) from public, anon, authenticated;
grant execute on function public.take_alerts() to service_role;
grant execute on function public.release_alert(bigint) to service_role;
