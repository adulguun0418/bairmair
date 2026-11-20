-- bairmair scan: scans that belong to a user, not to a listing (apps/scan, docs/scan/PLAN.md).
--
-- A user scans an apartment, uploads the raw RoomPlan export, and the web server converts it
-- (POST /api/user-scans/{id}/process). Each scan gets a private, unlisted link
-- (/s/{share_slug}) that anyone holding it can open; the table itself is readable only by its
-- owner, and the website reads a scan by slug with the secret key.
--
-- Free users keep at most private.scan_limit() scans (2 for now; step 4 adds subscriptions).
-- The insert trigger enforces it, so a reinstall or a hand-made request changes nothing. A scan
-- that became a listing (listing_id set, step 6) no longer counts.
--
-- Files (paths rebuilt from ids by @bairmair/db userScanRawPaths/userScanModelPath, never
-- stored):
-- | bucket           | public | path                                        | written by |
-- |------------------|--------|---------------------------------------------|------------|
-- | user-scan-raw    | no     | {owner_id}/{scan_id}/capture.json, .usdz    | the owner  |
-- | user-scan-models | no     | {owner_id}/{scan_id}/model.json             | server     |

-- Random link ids: 12 letters and digits from 16 random bytes (about 71 bits).
create function private.new_share_slug()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(
    translate(
      encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
      '+/=', ''
    ),
    1, 12
  )
$$;

create table public.user_scans (
  id                uuid primary key,  -- made by the app, so file paths exist before the row
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title             text check (char_length(title) between 1 and 80),
  -- Set by the insert trigger (clients cannot reach the private schema, so not a default).
  share_slug        text not null unique check (share_slug ~ '^[A-Za-z0-9]{12}$'),
  link_enabled      boolean not null default true,
  status            public.scan_status not null default 'uploaded',  -- server-maintained
  schema_version    smallint,                                        -- server-maintained
  converter_version text,                                            -- server-maintained
  metrics           jsonb,                                           -- server-maintained
  processing_error  text,                                            -- server-maintained
  room_labels       jsonb not null default '{}'
    constraint user_scans_labels_shape check (
      jsonb_typeof(room_labels) = 'object' and length(room_labels::text) <= 20000
    ),
  room_dividers     jsonb not null default '[]'
    constraint user_scans_room_dividers_shape check (
      jsonb_typeof(room_dividers) = 'array'
      and jsonb_array_length(room_dividers) <= 20
      and length(room_dividers::text) <= 4000
    ),
  entrance_door_id  text
    constraint user_scans_entrance_door_id_length check (char_length(entrance_door_id) between 1 and 64),
  device_model      text check (char_length(device_model) <= 40),
  ios_version       text check (char_length(ios_version) <= 20),
  app_version       text check (char_length(app_version) <= 20),
  listing_id        uuid references public.listings (id) on delete set null,  -- step 6, server
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.user_scans is
  'bairmair scan: a user''s own scans with a private link. Owner-only under RLS; the website reads by share_slug with the secret key.';

create index user_scans_owner_idx on public.user_scans (owner_id, created_at desc);

create trigger user_scans_touch_updated_at
  before update on public.user_scans
  for each row execute function private.touch_updated_at();

-- The scan limit -------------------------------------------------------------------------------

-- How many scans (not turned into listings) a user may keep. Step 4 adds subscriptions here.
create function private.scan_limit(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select 2
$$;

revoke execute on function private.new_share_slug() from public;
revoke execute on function private.scan_limit(uuid) from public;

-- Before insert: a fresh link id, and the scan limit.
create function private.before_user_scan_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  new.share_slug := private.new_share_slug();

  -- One insert per user at a time, so two parallel inserts cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('user_scans:' || new.owner_id::text, 0));

  -- A repeated insert of the same scan (an app retrying) fails as a duplicate key, which the
  -- app treats as success, not as over the limit.
  if exists (select 1 from public.user_scans s where s.id = new.id) then
    return new;
  end if;

  select count(*) into v_count
  from public.user_scans s
  where s.owner_id = new.owner_id and s.listing_id is null;

  if v_count >= private.scan_limit(new.owner_id) then
    raise exception 'scan_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.before_user_scan_insert() from public;

create trigger user_scans_before_insert
  before insert on public.user_scans
  for each row execute function private.before_user_scan_insert();

-- Privileges and RLS ---------------------------------------------------------------------------
-- status, schema_version, converter_version, metrics, processing_error, share_slug and
-- listing_id are written only by trusted server code (service_role) or their defaults.

alter table public.user_scans enable row level security;
revoke all on table public.user_scans from public, anon, authenticated;

grant select on public.user_scans to authenticated;
grant insert (id, title, device_model, ios_version, app_version),
      update (title, link_enabled, room_labels, room_dividers, entrance_door_id),
      delete
  on public.user_scans to authenticated;

create policy "select own" on public.user_scans for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "insert own" on public.user_scans for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "update own" on public.user_scans for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "delete own" on public.user_scans for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Storage --------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('user-scan-raw',    'user-scan-raw',    false, 52428800, array['application/json', 'model/vnd.usdz+zip']),
  ('user-scan-models', 'user-scan-models', false, 10485760, array['application/json', 'image/png', 'image/svg+xml'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- user-scan-raw: {owner_id}/{scan_id}/file in the caller's own folder. Uploads need the scan row
-- first (so files cannot pile up outside the scan limit); deleting needs only the folder, so
-- files can still be removed after their row. The server reads with the secret key.

create policy "user-scan-raw: owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'user-scan-raw'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "user-scan-raw: owner insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-scan-raw'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_scans s
      where s.owner_id = (select auth.uid()) and s.id::text = (storage.foldername(name))[2]
    )
  );
create policy "user-scan-raw: owner update" on storage.objects for update to authenticated
  using (
    bucket_id = 'user-scan-raw'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-scan-raw'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_scans s
      where s.owner_id = (select auth.uid()) and s.id::text = (storage.foldername(name))[2]
    )
  );
create policy "user-scan-raw: owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-scan-raw'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- user-scan-models: written by the server; the owner may read and delete their own.

create policy "user-scan-models: owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'user-scan-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "user-scan-models: owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-scan-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
