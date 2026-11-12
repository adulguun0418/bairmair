-- Privileges and row level security.
-- Column grants decide which columns anon/authenticated may touch; RLS decides which rows.
-- Every table starts from zero for anon and authenticated, so the result does not depend on the
-- project's default grants. service_role keeps its grants and bypasses RLS (trusted server code
-- and the dashboard only).
-- Policies use (select auth.uid()) so Postgres evaluates it once per query, not once per row.

revoke all on table
  public.cities, public.districts, public.profiles, public.agent_profiles,
  public.listings, public.listing_private, public.room_scans, public.listing_photos,
  public.favorites, public.listing_views, public.contact_reveals, public.reports
from anon, authenticated;
revoke all on sequence public.contact_reveals_id_seq from anon, authenticated;

alter table public.cities          enable row level security;
alter table public.districts       enable row level security;
alter table public.profiles        enable row level security;
alter table public.agent_profiles  enable row level security;
alter table public.listings        enable row level security;
alter table public.listing_private enable row level security;
alter table public.room_scans      enable row level security;
alter table public.listing_photos  enable row level security;
alter table public.favorites       enable row level security;
alter table public.listing_views   enable row level security;
alter table public.contact_reveals enable row level security;
alter table public.reports         enable row level security;

-- cities, districts --------------------------------------------------------------------------

grant select on public.cities, public.districts to anon, authenticated;

create policy "read" on public.cities    for select to anon, authenticated using (true);
create policy "read" on public.districts for select to anon, authenticated using (true);

-- profiles -----------------------------------------------------------------------------------
-- Only public columns exist here. Rows are created by the auth.users trigger; role is
-- server-maintained.

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

create policy "read" on public.profiles for select to anon, authenticated using (true);
create policy "update own" on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- agent_profiles -----------------------------------------------------------------------------

grant select on public.agent_profiles to anon, authenticated;
grant insert (agency_name, bio), update (agency_name, bio) on public.agent_profiles to authenticated;

create policy "read" on public.agent_profiles for select to anon, authenticated using (true);
create policy "insert own" on public.agent_profiles for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy "update own" on public.agent_profiles for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- listings -----------------------------------------------------------------------------------
-- Not client-writable: owner_id, area_scanned_m2, public_lat/lng, location_public, has_3d,
-- scan_verified, published_at, last_confirmed_at, timestamps. has_3d drives search placement,
-- so a seller must not be able to set it.

grant select on public.listings to anon, authenticated;
grant insert (
  id, type, status, title, description, price, currency, negotiable,
  area_official_m2, rooms, floor, total_floors, building_year, building_material, new_building,
  heating, balconies, parking, furnishing,
  mortgage_eligible, deposit, min_term_months, utilities_included,
  city_id, district_id, khoroo, complex_name, address_text, show_exact_location
), update (
  type, status, title, description, price, currency, negotiable,
  area_official_m2, rooms, floor, total_floors, building_year, building_material, new_building,
  heating, balconies, parking, furnishing,
  mortgage_eligible, deposit, min_term_months, utilities_included,
  city_id, district_id, khoroo, complex_name, address_text, show_exact_location
), delete on public.listings to authenticated;

create policy "read live" on public.listings for select to anon, authenticated
  using (status in ('published', 'sold_or_rented'));
create policy "read own" on public.listings for select to authenticated
  using (owner_id = (select auth.uid()));
-- New listings start as drafts; publishing is an update, checked by the listings trigger.
create policy "insert own draft" on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft');
create policy "update own" on public.listings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "delete own" on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- listing_private: owner only ----------------------------------------------------------------

grant select, insert (listing_id, lat, lng, unit_number), update (lat, lng, unit_number)
  on public.listing_private to authenticated;

create policy "owner all" on public.listing_private for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- listing_photos -----------------------------------------------------------------------------

grant select on public.listing_photos to anon, authenticated;
grant insert (id, listing_id, storage_path, sort_order, width, height, scan_id, room_id),
      update (sort_order, width, height, scan_id, room_id),
      delete
  on public.listing_photos to authenticated;

create policy "read live" on public.listing_photos for select to anon, authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.status in ('published', 'sold_or_rented')
  ));
create policy "owner all" on public.listing_photos for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- room_scans ---------------------------------------------------------------------------------
-- status, is_current, model_path, floor_plan_path, metrics, schema_version and
-- converter_version are written only by trusted server code (service_role).

grant select on public.room_scans to anon, authenticated;
grant insert (id, listing_id, raw_json_path, usdz_path, device_model, ios_version, app_version),
      update (room_labels),
      delete
  on public.room_scans to authenticated;

create policy "read live" on public.room_scans for select to anon, authenticated
  using (
    status = 'ready' and is_current
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status in ('published', 'sold_or_rented')
    )
  );
create policy "owner all" on public.room_scans for all to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- favorites ----------------------------------------------------------------------------------

grant select, insert (listing_id), delete on public.favorites to authenticated;

create policy "own all" on public.favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- listing_views: owners read their own counters; written only by record_listing_view() --------

grant select on public.listing_views to authenticated;

create policy "owner read" on public.listing_views for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- contact_reveals: RLS on, no grants, no policies. Only reveal_listing_contact() touches it. ---

-- reports ------------------------------------------------------------------------------------

grant select, insert (listing_id, reason, details) on public.reports to authenticated;

create policy "insert own" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "read own" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
