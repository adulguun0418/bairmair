-- bairmair scan Pro (docs/scan/PLAN.md, step 4): subscriptions and the real scan limit.
--
-- A user keeps at most 2 scans (not turned into listings) for free, and up to 100 (a fair-use
-- cap) while Pro. Pro comes from two sources, one row per purchase:
-- - qpay: a prepaid period bought on the website (QPay has no automatic renewal). The web server
--   adds it with add_scan_pro_period() once the payment is confirmed; a period bought while Pro
--   starts when the current one ends.
-- - apple: an auto-renewing App Store subscription (step 5), one row per original transaction,
--   its expiry moved by the server on each renewal.
-- The limit looks at any active row, so a refund at one source never cancels time bought at the
-- other. When Pro ends, existing scans and their links stay; new scans wait until the user is
-- back under the free limit or renews.
--
-- Rows are written only by the server (secret key); a user reads their own.

create type public.scan_subscription_source as enum ('apple', 'qpay');
create type public.scan_subscription_status as enum ('active', 'refunded', 'revoked');

create table public.scan_subscriptions (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references public.profiles (id) on delete cascade,
  source                        public.scan_subscription_source not null,
  product_id                    text not null check (char_length(product_id) between 1 and 100),
  starts_at                     timestamptz not null,
  expires_at                    timestamptz not null,
  -- Expiry is a time, not a status: an active row counts only between starts_at and expires_at.
  status                        public.scan_subscription_status not null default 'active',
  payment_id                    uuid unique references public.payments (id),
  apple_original_transaction_id text unique
    check (char_length(apple_original_transaction_id) between 1 and 64),
  apple_environment             text check (apple_environment in ('Production', 'Sandbox')),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint scan_subscriptions_period check (expires_at > starts_at),
  constraint scan_subscriptions_source_ref check (
    (source = 'qpay' and payment_id is not null and apple_original_transaction_id is null)
    or (source = 'apple' and apple_original_transaction_id is not null and payment_id is null)
  )
);

comment on table public.scan_subscriptions is
  'bairmair scan Pro periods (QPay prepaid, Apple subscriptions). Written only by the web server.';

create index scan_subscriptions_user_idx on public.scan_subscriptions (user_id, expires_at desc);

create trigger scan_subscriptions_touch_updated_at
  before update on public.scan_subscriptions
  for each row execute function private.touch_updated_at();

alter table public.scan_subscriptions enable row level security;
revoke all on table public.scan_subscriptions from public, anon, authenticated;

grant select on public.scan_subscriptions to authenticated;

create policy "select own" on public.scan_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Entitlement ----------------------------------------------------------------------------------

-- When the user's Pro ends, or null when they are not Pro now. Periods bought in a row touch
-- (each starts where the previous ends), so the end is the latest expiry of the active rows.
create function private.scan_pro_until(p_user_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.scan_subscriptions s
      where s.user_id = p_user_id and s.status = 'active'
        and s.starts_at <= now() and s.expires_at > now()
    )
    then (
      select max(s.expires_at) from public.scan_subscriptions s
      where s.user_id = p_user_id and s.status = 'active' and s.expires_at > now()
    )
  end
$$;

revoke execute on function private.scan_pro_until(uuid) from public;

-- Replaces the 2-for-everyone stub of migration 20261125100000. Mirrored in @bairmair/db
-- (USER_SCAN_FREE_LIMIT, USER_SCAN_PRO_LIMIT).
create or replace function private.scan_limit(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when private.scan_pro_until(p_user_id) is not null then 100 else 2 end
$$;

-- The caller's plan, for the apps: how many scans they may keep, how many they keep, and when
-- Pro ends (null = free).
create function public.scan_plan()
returns table (scan_limit integer, scans_kept integer, pro_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.scan_limit(auth.uid()),
    (select count(*)::integer from public.user_scans s
      where s.owner_id = auth.uid() and s.listing_id is null),
    private.scan_pro_until(auth.uid())
  where auth.uid() is not null
$$;

revoke execute on function public.scan_plan() from public, anon;
grant execute on function public.scan_plan() to authenticated;

-- Adds a paid QPay period (server only). Starts now, or when the user's current Pro ends if they
-- are Pro. Repeating it for the same payment returns the row already made, so a delivery retried
-- after a failure never adds time twice.
create function public.add_scan_pro_period(
  p_user_id uuid,
  p_payment_id uuid,
  p_product_id text,
  p_days integer
)
returns public.scan_subscriptions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.scan_subscriptions;
  v_start timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 400 then
    raise exception 'invalid period: % days', p_days;
  end if;

  -- One period at a time per user, so two payments cannot both start at the same moment.
  perform pg_advisory_xact_lock(hashtextextended('scan_subscriptions:' || p_user_id::text, 0));

  select * into v_row from public.scan_subscriptions s where s.payment_id = p_payment_id;
  if found then
    return v_row;
  end if;

  v_start := greatest(now(), coalesce(private.scan_pro_until(p_user_id), now()));

  insert into public.scan_subscriptions (user_id, source, product_id, starts_at, expires_at, payment_id)
  values (p_user_id, 'qpay', p_product_id, v_start, v_start + make_interval(days => p_days), p_payment_id)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.add_scan_pro_period(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.add_scan_pro_period(uuid, uuid, text, integer) to service_role;
