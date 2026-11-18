-- Per-number limit on sign-in codes, checked by the send-sms Edge Function (the Send SMS auth
-- hook) before it texts a code.
--
-- Auth's phone endpoint is reachable with the public key, so anyone can ask it to text a code to
-- any Mongolian number. Auth allows one code per number per 60 s and a project-wide hourly cap;
-- this adds a cap per number, so one number cannot be flooded (harassment, and 80₮ per SMS):
-- at most 5 codes an hour and 10 a day. Test numbers never reach the hook.
--
-- The log keeps a SHA-256 of the number (not the number itself) for one day. Phone numbers are a
-- small space, so the hash keeps the plain number out of the table, not out of reach.

create table private.sms_sends (
  phone_hash text not null,
  sent_at    timestamptz not null default now()
);
create index sms_sends_phone_idx on private.sms_sends (phone_hash, sent_at);
alter table private.sms_sends enable row level security;
revoke all on table private.sms_sends from public, anon, authenticated;

-- Records one code for p_phone (E.164) and returns true, or returns false (recording nothing)
-- when the number has reached its limit. Called by the hook with the secret key only.
create function public.claim_sms_send(p_phone text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(sha256(convert_to(btrim(p_phone), 'UTF8')), 'hex');
  v_hour integer;
  v_day integer;
begin
  -- Concurrent requests for one number wait for each other, so both cannot pass the check.
  perform pg_advisory_xact_lock(hashtextextended('claim_sms_send:' || v_hash, 0));

  delete from private.sms_sends where sent_at < now() - interval '1 day';

  select
    count(*) filter (where s.sent_at > now() - interval '1 hour'),
    count(*)
  into v_hour, v_day
  from private.sms_sends s
  where s.phone_hash = v_hash;

  if v_hour >= 5 or v_day >= 10 then
    return false;
  end if;

  insert into private.sms_sends (phone_hash) values (v_hash);
  return true;
end;
$$;

comment on function public.claim_sms_send is
  'Send SMS hook only (secret key): records one sign-in code for a number, false over its limit.';

revoke all on function public.claim_sms_send(text) from public, anon, authenticated;
grant execute on function public.claim_sms_send(text) to service_role;
