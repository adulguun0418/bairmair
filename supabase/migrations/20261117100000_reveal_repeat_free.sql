-- A repeat reveal of the same listing by the same caller within the hour is free: it returns the
-- number again without being logged or counted, since the caller already has it. Only reveals of
-- other listings use the hourly budget (30 per signed-in user, 10 per IP for anonymous callers).
-- "Same caller" uses the same key as the limit: the user id when signed in, else the IP hash.

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
      select count(*) into v_recent
      from public.contact_reveals r
      where r.ip_hash = v_ip_hash and r.created_at > now() - interval '1 hour';
      if v_recent >= 10 then
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
  end if;

  -- auth.users stores phone numbers without the leading '+'.
  return '+' || ltrim(v_phone, '+');
end;
$$;

-- `create or replace` keeps the existing grants (execute for anon and authenticated only).
