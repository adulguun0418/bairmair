-- Trigger functions, helpers and RPCs.
-- Every security definer function sets search_path = '' and uses fully qualified names.
-- Error messages are stable keys (e.g. 'publish_requires_photo') that the apps map to
-- localized text.

-- Helpers ------------------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- One coordinate of the public pin. Approximate locations are snapped to the centre of a
-- 0.0025° grid cell (about 190 x 280 m in Ulaanbaatar). Snapping is deterministic and
-- many-to-one, so repeated edits cannot be averaged to recover the exact point.
create function private.public_coord(coord double precision, exact boolean)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when exact then coord
    else round((floor(coord / 0.0025) * 0.0025 + 0.00125)::numeric, 6)::double precision
  end;
$$;

-- The caller's IP as seen by the API gateway, or null outside an API request.
-- The first x-forwarded-for entry is whatever the client sent, so it is not used. Cloudflare
-- (in front of hosted Supabase) overwrites cf-connecting-ip; the last x-forwarded-for entry,
-- appended by the nearest proxy, is the fallback. The remote tests check that forged headers do
-- not change the result.
create function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  with h as (
    select nullif(current_setting('request.headers', true), '')::json as headers
  )
  select coalesce(
    nullif(btrim(headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(regexp_replace(coalesce(headers ->> 'x-forwarded-for', ''), '^.*,', '')), '')
  )
  from h;
$$;

-- profiles -----------------------------------------------------------------------------------

-- Creates the profile when an auth user is created (any sign-in method).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 80), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- agent_profiles -----------------------------------------------------------------------------

create function private.agent_profiles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.verified and not old.verified then
    new.verified_at := now();
  elsif not new.verified then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger agent_profiles_before_update
  before update on public.agent_profiles
  for each row execute function private.agent_profiles_before_update();

-- Users cannot write profiles.role; it follows the agent profile.
create function private.sync_agent_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set role = 'agent' where id = new.profile_id and role = 'owner';
  elsif tg_op = 'DELETE' then
    update public.profiles set role = 'owner' where id = old.profile_id and role = 'agent';
  end if;
  return null;
end;
$$;

create trigger agent_profiles_sync_role
  after insert or delete on public.agent_profiles
  for each row execute function private.sync_agent_role();

-- listings -----------------------------------------------------------------------------------

create function private.listings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
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
    -- Keep the first publish date, so archiving and republishing does not bump a listing.
    new.published_at := coalesce(new.published_at, now());
    new.last_confirmed_at := now();
  end if;

  return new;
end;
$$;

create trigger listings_before_write
  before insert or update on public.listings
  for each row execute function private.listings_before_write();

-- listing_private ----------------------------------------------------------------------------

create trigger listing_private_touch
  before update on public.listing_private
  for each row execute function private.touch_updated_at();

-- Keeps listings.public_lat/public_lng in step with the exact location.
create function private.listing_private_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.listings set public_lat = null, public_lng = null where id = old.listing_id;
    return old;
  end if;

  update public.listings l
  set public_lat = private.public_coord(new.lat, l.show_exact_location),
      public_lng = private.public_coord(new.lng, l.show_exact_location)
  where l.id = new.listing_id;
  return new;
end;
$$;

create trigger listing_private_sync
  after insert or update of lat, lng or delete on public.listing_private
  for each row execute function private.listing_private_sync();

-- listing_photos -----------------------------------------------------------------------------

create function private.listing_photos_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deleting a scan clears scan_id through the foreign key. A room id is meaningless without
  -- its scan, so clear it too.
  if tg_op = 'UPDATE' and old.scan_id is not null and new.scan_id is null then
    new.room_id := null;
  end if;

  if tg_op = 'INSERT'
     and (select count(*) from public.listing_photos p where p.listing_id = new.listing_id) >= 40 then
    raise exception 'too_many_photos' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger listing_photos_before_write
  before insert or update on public.listing_photos
  for each row execute function private.listing_photos_before_write();

-- room_scans ---------------------------------------------------------------------------------

-- A scan that becomes ready becomes the listing's current scan; a scan that is not ready is
-- never current. Only trusted server code changes status.
create function private.room_scans_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  if new.status = 'ready' and old.status is distinct from 'ready' then
    update public.room_scans
    set is_current = false
    where listing_id = new.listing_id and id <> new.id and is_current;
    new.is_current := true;
  elsif new.status <> 'ready' then
    new.is_current := false;
  end if;

  return new;
end;
$$;

create trigger room_scans_before_write
  before insert or update on public.room_scans
  for each row execute function private.room_scans_before_write();

-- Mirrors the current ready scan onto the listing: has_3d and area_scanned_m2.
create function private.sync_scan_to_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_scan_id uuid;
  v_area numeric(7, 2);
begin
  if tg_op = 'DELETE' then
    v_listing_id := old.listing_id;
  else
    v_listing_id := new.listing_id;
  end if;

  select s.id, round((s.metrics ->> 'totalAreaM2')::numeric, 2)
  into v_scan_id, v_area
  from public.room_scans s
  where s.listing_id = v_listing_id and s.is_current and s.status = 'ready';

  update public.listings l
  set has_3d = (v_scan_id is not null),
      area_scanned_m2 = v_area
  where l.id = v_listing_id
    and (l.has_3d is distinct from (v_scan_id is not null)
         or l.area_scanned_m2 is distinct from v_area);

  return null;
end;
$$;

create trigger room_scans_sync_listing
  after insert or update of status, is_current, metrics or delete on public.room_scans
  for each row execute function private.sync_scan_to_listing();

-- RPCs ---------------------------------------------------------------------------------------

-- Returns the seller's verified phone number (E.164) for a published listing.
-- Rate-limited per caller: signed-in users by user id, everyone else by hashed IP.
-- PostgREST turns SQLSTATE 'PTxyz' into HTTP status xyz.
create function public.reveal_listing_contact(p_listing_id uuid)
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
begin
  select l.owner_id into v_owner_id
  from public.listings l
  where l.id = p_listing_id and l.status = 'published';
  if v_owner_id is null then
    raise exception 'listing_not_available' using errcode = 'PT404';
  end if;

  if v_viewer_id is not null then
    select count(*) into v_recent
    from public.contact_reveals r
    where r.viewer_id = v_viewer_id and r.created_at > now() - interval '1 hour';
    if v_recent >= 30 then
      raise exception 'rate_limited' using errcode = 'PT429';
    end if;
  else
    v_ip_hash := encode(sha256(convert_to(coalesce(private.request_ip(), 'unknown'), 'UTF8')), 'hex');
    select count(*) into v_recent
    from public.contact_reveals r
    where r.ip_hash = v_ip_hash and r.created_at > now() - interval '1 hour';
    if v_recent >= 10 then
      raise exception 'rate_limited' using errcode = 'PT429';
    end if;
  end if;

  select u.phone into v_phone
  from auth.users u
  where u.id = v_owner_id and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';
  if v_phone is null then
    raise exception 'contact_unavailable' using errcode = 'PT404';
  end if;

  insert into public.contact_reveals (listing_id, viewer_id, ip_hash)
  values (p_listing_id, v_viewer_id, v_ip_hash);

  -- auth.users stores phone numbers without the leading '+'.
  return '+' || ltrim(v_phone, '+');
end;
$$;

-- Counts one view of a live listing for today (Ulaanbaatar time). The owner's own views are
-- not counted. No de-duplication in the MVP.
create function public.record_listing_view(p_listing_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and l.status in ('published', 'sold_or_rented')
      and l.owner_id is distinct from auth.uid()
  ) then
    return;
  end if;

  insert into public.listing_views as v (listing_id, day, views)
  values (p_listing_id, (now() at time zone 'Asia/Ulaanbaatar')::date, 1)
  on conflict (listing_id, day) do update set views = v.views + 1;
end;
$$;

-- The owner confirms a published listing is still available (freshness, every 14 days).
create function public.confirm_listing_available(p_listing_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_confirmed_at timestamptz;
begin
  update public.listings l
  set last_confirmed_at = now()
  where l.id = p_listing_id and l.owner_id = auth.uid() and l.status = 'published'
  returning l.last_confirmed_at into v_confirmed_at;

  if v_confirmed_at is null then
    raise exception 'listing_not_available' using errcode = 'PT404';
  end if;
  return v_confirmed_at;
end;
$$;

-- Function privileges ------------------------------------------------------------------------
-- New functions are executable by PUBLIC, and Supabase's default privileges also grant them to
-- anon and authenticated. Lock everything down, then open the three RPCs.

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.reveal_listing_contact(uuid)    from public, anon, authenticated;
revoke all on function public.record_listing_view(uuid)       from public, anon, authenticated;
revoke all on function public.confirm_listing_available(uuid) from public, anon, authenticated;

grant execute on function public.reveal_listing_contact(uuid)    to anon, authenticated;
grant execute on function public.record_listing_view(uuid)       to anon, authenticated;
grant execute on function public.confirm_listing_available(uuid) to authenticated;
