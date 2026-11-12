-- One SELECT policy per role and table (Supabase advisor "multiple_permissive_policies").
-- The rules are unchanged; each row now runs one check instead of two. The "owner all" policies
-- are split by command so they no longer also grant SELECT.

-- listings -----------------------------------------------------------------------------------

drop policy "read live" on public.listings;
drop policy "read own" on public.listings;

create policy "read live" on public.listings for select to anon
  using (status in ('published', 'sold_or_rented'));
create policy "read live or own" on public.listings for select to authenticated
  using (status in ('published', 'sold_or_rented') or owner_id = (select auth.uid()));

-- listing_photos -----------------------------------------------------------------------------

drop policy "read live" on public.listing_photos;
drop policy "owner all" on public.listing_photos;

create policy "read live" on public.listing_photos for select to anon
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.status in ('published', 'sold_or_rented')
  ));
create policy "read live or own" on public.listing_photos for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (l.status in ('published', 'sold_or_rented') or l.owner_id = (select auth.uid()))
  ));
create policy "owner insert" on public.listing_photos for insert to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));
create policy "owner update" on public.listing_photos for update to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));
create policy "owner delete" on public.listing_photos for delete to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));

-- room_scans ---------------------------------------------------------------------------------

drop policy "read live" on public.room_scans;
drop policy "owner all" on public.room_scans;

create policy "read live" on public.room_scans for select to anon
  using (
    status = 'ready' and is_current
    and exists (
      select 1 from public.listings l
      where l.id = listing_id and l.status in ('published', 'sold_or_rented')
    )
  );
-- Owners see all their scans; everyone else sees only the current ready scan of a live listing.
create policy "read live or own" on public.room_scans for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (
        l.owner_id = (select auth.uid())
        or (
          l.status in ('published', 'sold_or_rented')
          and room_scans.status = 'ready' and room_scans.is_current
        )
      )
  ));
create policy "owner insert" on public.room_scans for insert to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));
create policy "owner update" on public.room_scans for update to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));
create policy "owner delete" on public.room_scans for delete to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  ));
