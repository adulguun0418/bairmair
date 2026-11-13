-- Step 5c: where a scan was made, and the "scanned on-site" badge (listings.scan_verified).
--
-- The phone records its GPS position while the seller scans. A listing is scan_verified when its
-- current ready scan was made within 150 m of the listing's exact location (listing_private),
-- with a fix accurate to 100 m or better. The position comes from the seller's phone, so this
-- is a trust signal, not proof.

alter table public.room_scans
  add column scan_lat double precision check (scan_lat between 41.5 and 52.2),  -- Mongolia
  add column scan_lng double precision check (scan_lng between 87.7 and 120.0), -- Mongolia
  add column scan_accuracy_m real check (scan_accuracy_m >= 0 and scan_accuracy_m <= 10000),
  add constraint room_scans_location_pair check ((scan_lat is null) = (scan_lng is null));

comment on column public.room_scans.scan_lat is
  'Where the phone was during the scan (GPS). Compared with listing_private for scan_verified.';

-- Written once, with the row; not updatable by clients.
grant insert (scan_lat, scan_lng, scan_accuracy_m) on public.room_scans to authenticated;

-- One place that derives every scan-dependent listing column. -------------------------------

create function private.refresh_listing_scan(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan_id  uuid;
  v_area     numeric(7, 2);
  v_scan_lat double precision;
  v_scan_lng double precision;
  v_accuracy real;
  v_lat      double precision;
  v_lng      double precision;
  v_verified boolean := false;
begin
  select s.id, round((s.metrics ->> 'totalAreaM2')::numeric, 2), s.scan_lat, s.scan_lng, s.scan_accuracy_m
  into v_scan_id, v_area, v_scan_lat, v_scan_lng, v_accuracy
  from public.room_scans s
  where s.listing_id = p_listing_id and s.is_current and s.status = 'ready';

  if v_scan_id is not null and v_scan_lat is not null and v_accuracy is not null and v_accuracy <= 100 then
    select p.lat, p.lng into v_lat, v_lng
    from public.listing_private p
    where p.listing_id = p_listing_id;
    if found then
      v_verified := extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(v_scan_lng, v_scan_lat), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography
      ) <= 150;
    end if;
  end if;

  update public.listings l
  set has_3d = (v_scan_id is not null),
      area_scanned_m2 = v_area,
      scan_verified = v_verified
  where l.id = p_listing_id
    and (l.has_3d is distinct from (v_scan_id is not null)
         or l.area_scanned_m2 is distinct from v_area
         or l.scan_verified is distinct from v_verified);
end;
$$;

-- room_scans: same trigger as before, now also for the location columns and scan_verified.
create or replace function private.sync_scan_to_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_listing_scan(old.listing_id);
  else
    perform private.refresh_listing_scan(new.listing_id);
  end if;
  return null;
end;
$$;

drop trigger room_scans_sync_listing on public.room_scans;
create trigger room_scans_sync_listing
  after insert or update of status, is_current, metrics, scan_lat, scan_lng, scan_accuracy_m or delete
  on public.room_scans
  for each row execute function private.sync_scan_to_listing();

-- listing_private: moving the exact location can make or break the on-site match.
create or replace function private.listing_private_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.listings set public_lat = null, public_lng = null where id = old.listing_id;
    perform private.refresh_listing_scan(old.listing_id);
    return old;
  end if;

  update public.listings l
  set public_lat = private.public_coord(new.lat, l.show_exact_location),
      public_lng = private.public_coord(new.lng, l.show_exact_location)
  where l.id = new.listing_id;
  perform private.refresh_listing_scan(new.listing_id);
  return new;
end;
$$;

revoke all on function private.refresh_listing_scan(uuid) from public, anon, authenticated;
