-- Storage buckets and object policies.
--
-- | bucket         | public | path                                            | written by    |
-- |----------------|--------|-------------------------------------------------|---------------|
-- | listing-photos | yes    | {listing_id}/{photo_id}.jpg                     | listing owner |
-- | scan-raw       | no     | {listing_id}/{scan_id}/capture.json, .usdz      | listing owner |
-- | scan-models    | yes    | {listing_id}/{scan_id}/model.json, floorplan.png| server only   |
-- | avatars        | yes    | {user_id}/avatar.jpg                            | the user      |
--
-- Public buckets are read through public URLs, which skip RLS. The policies below cover the
-- Storage API (upload, upsert, list, delete). Photos of a draft listing sit in the public bucket
-- under an unguessable UUID path (accepted MVP trade-off).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true,  10485760, array['image/jpeg', 'image/webp']),
  ('scan-raw',       'scan-raw',       false, 52428800, array['application/json', 'model/vnd.usdz+zip']),
  ('scan-models',    'scan-models',    true,  10485760, array['application/json', 'image/png', 'image/svg+xml']),
  ('avatars',        'avatars',        true,   2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- listing-photos: the first path segment is a listing the caller owns. -----------------------
-- The listings lookup goes through the owner index; owners have few listings.

create policy "listing-photos: owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "listing-photos: owner insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and array_length(storage.foldername(name), 1) = 1
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "listing-photos: owner update" on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'listing-photos'
    and array_length(storage.foldername(name), 1) = 1
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "listing-photos: owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );

-- scan-raw: {listing_id}/{scan_id}/file, listing owned by the caller. Server reads with the
-- secret key. ----------------------------------------------------------------------------------

create policy "scan-raw: owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'scan-raw'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "scan-raw: owner insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'scan-raw'
    and array_length(storage.foldername(name), 1) = 2
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "scan-raw: owner update" on storage.objects for update to authenticated
  using (
    bucket_id = 'scan-raw'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'scan-raw'
    and array_length(storage.foldername(name), 1) = 2
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );
create policy "scan-raw: owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'scan-raw'
    and exists (
      select 1 from public.listings l
      where l.owner_id = (select auth.uid()) and l.id::text = (storage.foldername(name))[1]
    )
  );

-- scan-models: no client policies. Written by server code with the secret key. ----------------

-- avatars: {user_id}/avatar.jpg ---------------------------------------------------------------

create policy "avatars: own folder" on storage.objects for all to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
