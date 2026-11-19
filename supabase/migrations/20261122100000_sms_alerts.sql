-- An email alert when sign-in codes spike, so captcha can be switched on in time.
--
-- Captcha is on standby (off in Auth; the apps handle it when Auth asks). While it is off, a bot
-- can use up the project's hourly SMS cap with many numbers: costly (80₮ per code) and nobody
-- can sign in until the hour passes. The send-sms hook calls `claim_sms_alert` after each code it
-- records in `private.sms_sends` (see 20261121100000_sms_limits.sql); when the last hour's count
-- reaches the threshold and no alert went out recently, it gets a row back and emails it.

create table private.sms_alerts (
  id                bigint generated always as identity primary key,
  sent_at           timestamptz not null default now(),
  codes_last_hour   integer not null,
  numbers_last_hour integer not null
);
alter table private.sms_alerts enable row level security;
revoke all on table private.sms_alerts from public, anon, authenticated;

-- One row when an alert is due: at least p_threshold codes in the last hour and no alert in the
-- last p_quiet_minutes. The alert is recorded at once, so concurrent codes send one email; the
-- hook releases it (`release_sms_alert`) when the email fails, so the next code tries again.
create function public.claim_sms_alert(p_threshold integer, p_quiet_minutes integer default 180)
returns table (
  alert_id          bigint,
  codes_last_hour   integer,
  numbers_last_hour integer,
  codes_last_day    integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hour integer;
  v_numbers integer;
  v_day integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('claim_sms_alert', 0));

  select
    count(*) filter (where s.sent_at > now() - interval '1 hour'),
    count(distinct s.phone_hash) filter (where s.sent_at > now() - interval '1 hour'),
    count(*) filter (where s.sent_at > now() - interval '1 day')
  into v_hour, v_numbers, v_day
  from private.sms_sends s;

  if v_hour < greatest(p_threshold, 1) then
    return;
  end if;
  if exists (
    select 1 from private.sms_alerts a
    where a.sent_at > now() - make_interval(mins => greatest(p_quiet_minutes, 0))
  ) then
    return;
  end if;

  delete from private.sms_alerts where sent_at < now() - interval '90 days';
  insert into private.sms_alerts (codes_last_hour, numbers_last_hour)
  values (v_hour, v_numbers)
  returning id into v_id;

  return query select v_id, v_hour, v_numbers, v_day;
end;
$$;

-- Forgets an alert whose email could not be sent.
create function public.release_sms_alert(p_alert_id bigint)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.sms_alerts where id = p_alert_id;
$$;

comment on function public.claim_sms_alert is
  'Send SMS hook only (secret key): an SMS spike alert when one is due, recorded at once.';
comment on function public.release_sms_alert is
  'Send SMS hook only (secret key): forgets an alert whose email failed.';

revoke all on function public.claim_sms_alert(integer, integer) from public, anon, authenticated;
revoke all on function public.release_sms_alert(bigint) from public, anon, authenticated;
grant execute on function public.claim_sms_alert(integer, integer) to service_role;
grant execute on function public.release_sms_alert(bigint) to service_role;
