# Proposal 3: database schema and RLS

Target: your hosted Supabase project (treated as dev). Everything below becomes hand-written migrations in `supabase/migrations/`. SQL here is for review; it gets verified against the live project in step 3.

## Changes from the brief's initial data model

| Brief | Proposal | Why |
|-------|----------|-----|
| `profiles.phone` | No phone column in `public`. The contact number is the OTP-verified `auth.users.phone`, returned only by `reveal_listing_contact()`. | You chose tap-to-reveal. RLS is row-level, so a phone column on a publicly readable table would be readable by everyone. |
| listing "PostGIS point" | `listings.location_public` (public) + `listing_private.location_exact` (owner only) | "Public pin is approximate unless the owner chooses exact." The exact pin must not sit in a public row. |
| `listing_views` | Daily counter rows, written by an RPC | Simple counts, plus a per-day trend for sellers at no extra cost. |
| (new) `contact_reveals` | Log of phone reveals | Rate limiting and lead counts. |
| (new) `cities`, `districts` | Seeded reference tables | Filters and localized names. Khoroo stays a number on the listing. |
| `room_scans` | adds `status`, `is_current`, `room_labels`, device info | Trusted "ready" state, rescans, and label corrections kept outside the JSON file. |
| `listing_photos` | adds `scan_id` | A `room_id` only means something relative to one scan. |

Admin work uses the Supabase dashboard, which bypasses RLS, so there are no admin policies in the MVP. `admin` stays in the role enum for later. Boosts, subscriptions and payments get no tables now.

## Extensions, schema, enums

```sql
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Helper functions and trigger functions live here. Not exposed through the API.
create schema if not exists private;

create type public.user_role         as enum ('owner', 'agent', 'admin');
create type public.listing_type      as enum ('sale', 'rent');
create type public.listing_status    as enum ('draft', 'published', 'sold_or_rented', 'archived');
create type public.currency_code     as enum ('MNT', 'USD');
create type public.building_material as enum ('panel', 'brick', 'monolithic', 'other');
create type public.heating_type      as enum ('central', 'autonomous', 'electric', 'other');
create type public.parking_type      as enum ('none', 'outdoor', 'garage', 'underground');
create type public.furnishing        as enum ('none', 'partial', 'full');
create type public.scan_status       as enum ('uploaded', 'ready', 'failed');
create type public.report_reason     as enum ('fake', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other');
create type public.report_status     as enum ('open', 'resolved', 'dismissed');
```

## Tables

```sql
create table public.cities (
  id       smallint primary key,
  slug     text not null unique,
  name_mn  text not null,
  name_en  text not null
);

create table public.districts (
  id         smallint primary key,
  city_id    smallint not null references public.cities (id),
  slug       text not null unique,
  name_mn    text not null,
  name_en    text not null,
  sort_order smallint not null default 0
);
-- Seed: Ulaanbaatar + its 9 districts.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null default 'owner',
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.agent_profiles (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  agency_name text not null check (char_length(agency_name) between 1 and 120),
  bio         text check (char_length(bio) <= 2000),
  verified    boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type        public.listing_type not null,
  status      public.listing_status not null default 'draft',
  title       text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 5000),

  price       numeric(14,2) check (price >= 0),
  currency    public.currency_code not null default 'MNT',
  negotiable  boolean not null default false,

  area_official_m2  numeric(7,2) check (area_official_m2 > 0),
  area_scanned_m2   numeric(7,2),                 -- server-maintained
  rooms             smallint check (rooms between 1 and 20),
  floor             smallint,
  total_floors      smallint check (total_floors >= 1),
  building_year     smallint check (building_year between 1900 and 2100),
  building_material public.building_material,
  new_building      boolean not null default false,
  heating           public.heating_type,
  balconies         smallint not null default 0 check (balconies >= 0),
  parking           public.parking_type,
  furnishing        public.furnishing,

  mortgage_eligible  boolean,                     -- sale only
  deposit            numeric(14,2) check (deposit >= 0),      -- rent only
  min_term_months    smallint check (min_term_months >= 0),   -- rent only
  utilities_included boolean,                     -- rent only

  city_id      smallint not null references public.cities (id),
  district_id  smallint references public.districts (id),
  khoroo       smallint check (khoroo between 1 and 99),
  complex_name text check (char_length(complex_name) <= 120),   -- хотхон / building
  address_text text check (char_length(address_text) <= 500),   -- free-text directions
  show_exact_location boolean not null default false,
  location_public extensions.geography(Point, 4326),            -- server-maintained

  has_3d       boolean not null default false,    -- server-maintained
  published_at timestamptz,                       -- server-maintained
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  search_text text generated always as (
    lower(coalesce(title, '') || ' ' || coalesce(complex_name, '') || ' ' || coalesce(address_text, ''))
  ) stored,

  constraint listings_sale_fields check (type = 'sale' or mortgage_eligible is null),
  constraint listings_rent_fields check (
    type = 'rent' or (deposit is null and min_term_months is null and utilities_included is null)
  ),
  constraint listings_usd_rent_only check (currency = 'MNT' or type = 'rent'),
  constraint listings_floor_range check (floor is null or total_floors is null or floor <= total_floors),
  constraint listings_complete_when_live check (
    status in ('draft', 'archived') or (
      price is not null and rooms is not null and district_id is not null
      and location_public is not null
      and coalesce(area_official_m2, area_scanned_m2) is not null
    )
  )
);

create index listings_owner_idx    on public.listings (owner_id);
create index listings_browse_idx   on public.listings (type, district_id, published_at desc) where status = 'published';
create index listings_location_idx on public.listings using gist (location_public);
create index listings_search_idx   on public.listings using gin (search_text extensions.gin_trgm_ops);

create table public.listing_private (
  listing_id     uuid primary key references public.listings (id) on delete cascade,
  location_exact extensions.geography(Point, 4326) not null,
  updated_at     timestamptz not null default now()
);

create table public.room_scans (
  id             uuid primary key default gen_random_uuid(),
  listing_id     uuid not null references public.listings (id) on delete cascade,
  status         public.scan_status not null default 'uploaded',
  is_current     boolean not null default false,  -- server-maintained
  schema_version smallint,                        -- RoomModel version of model_path
  converter_version text,
  raw_json_path  text not null,                   -- private bucket
  usdz_path      text not null,                   -- private bucket
  model_path     text,                            -- public bucket, written by the server
  floor_plan_path text,                           -- public bucket, written by the server
  metrics        jsonb,                           -- { totalAreaM2, rooms: [{ id, areaM2 }], ... }
  room_labels    jsonb not null default '{}',     -- user corrections: { roomId: { label, name } }
  device_model   text,
  ios_version    text,
  app_version    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index room_scans_current_idx on public.room_scans (listing_id) where is_current;
create index room_scans_listing_idx on public.room_scans (listing_id);

create table public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order   integer not null default 0,
  width        integer,
  height       integer,
  scan_id      uuid references public.room_scans (id) on delete set null,
  room_id      text,                              -- RoomModel room id within scan_id
  camera_pose  jsonb,                             -- reserved; raw scan coordinates
  created_at   timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

create table public.favorites (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.listing_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day        date not null default current_date,
  views      integer not null default 0,
  primary key (listing_id, day)
);

create table public.contact_reveals (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  viewer_id  uuid references public.profiles (id) on delete set null,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index contact_reveals_rate_idx on public.contact_reveals (ip_hash, created_at);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason      public.report_reason not null,
  details     text check (char_length(details) <= 2000),
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (listing_id, reporter_id)
);
```

## Privileges

RLS decides which rows; column grants decide which columns. Every table starts with `revoke all ... from anon, authenticated`, then gets exactly the grants below, so the result does not depend on the project's default grants.

| Table | `anon` | `authenticated` |
|-------|--------|-----------------|
| `cities`, `districts` | select | select |
| `profiles` | select | select; update (`display_name`, `avatar_path`) |
| `agent_profiles` | select | select; insert / update (`agency_name`, `bio`) |
| `listings` | select | select; insert and update on user-editable columns only; delete |
| `listing_private` | none | select, insert, update |
| `listing_photos` | select | select, insert, update, delete |
| `room_scans` | select | select; insert (`listing_id`, paths, device info); update (`room_labels`); delete |
| `favorites` | none | select, insert, delete |
| `listing_views` | none | select |
| `contact_reveals` | none | none |
| `reports` | none | select; insert (`listing_id`, `reason`, `details`) |

Not client-writable on `listings`: `owner_id`, `has_3d`, `area_scanned_m2`, `location_public`, `published_at`, timestamps. `has_3d` drives search placement, so a seller must not be able to set it.

## RLS policies

RLS is enabled on every table. `(select auth.uid())` is wrapped in a subselect so Postgres evaluates it once per query.

```sql
-- cities, districts
create policy "read" on public.cities    for select to anon, authenticated using (true);
create policy "read" on public.districts for select to anon, authenticated using (true);

-- profiles: public columns only exist here, so everyone may read
create policy "read"       on public.profiles for select to anon, authenticated using (true);
create policy "update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- rows are created by a trigger on auth.users; no insert policy

-- agent_profiles
create policy "read"       on public.agent_profiles for select to anon, authenticated using (true);
create policy "insert own" on public.agent_profiles for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy "update own" on public.agent_profiles for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- listings
create policy "read live" on public.listings for select to anon, authenticated
  using (status in ('published', 'sold_or_rented'));
create policy "read own"  on public.listings for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "insert own draft" on public.listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft');
create policy "update own" on public.listings for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own" on public.listings for delete to authenticated
  using (owner_id = (select auth.uid()));

-- listing_private: owner only
create policy "owner all" on public.listing_private for all to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l
                      where l.id = listing_id and l.owner_id = (select auth.uid())));

-- listing_photos
create policy "read live" on public.listing_photos for select to anon, authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.status in ('published', 'sold_or_rented')));
create policy "owner all" on public.listing_photos for all to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l
                      where l.id = listing_id and l.owner_id = (select auth.uid())));

-- room_scans
create policy "read live" on public.room_scans for select to anon, authenticated
  using (status = 'ready' and is_current
         and exists (select 1 from public.listings l
                     where l.id = listing_id and l.status in ('published', 'sold_or_rented')));
create policy "owner all" on public.room_scans for all to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l
                      where l.id = listing_id and l.owner_id = (select auth.uid())));

-- favorites
create policy "own all" on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- listing_views: owners read their own counters; written only by record_listing_view()
create policy "owner read" on public.listing_views for select to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_id and l.owner_id = (select auth.uid())));

-- contact_reveals: RLS on, no policies. Only reveal_listing_contact() touches it.

-- reports
create policy "insert own" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "read own"   on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
```

## Functions and triggers

All `security definer` functions use `set search_path = ''` and fully qualified names.

| Name | Kind | Behaviour |
|------|------|-----------|
| `private.handle_new_user()` | trigger on `auth.users` insert | Creates the `profiles` row. |
| `private.sync_agent_role()` | trigger on `agent_profiles` insert | Sets `profiles.role = 'agent'`. Users cannot write `role` themselves. |
| `private.listings_before_write()` | trigger on `listings` | Maintains `updated_at`. On a change to `published`: requires a confirmed phone on the owner's auth user and at least one photo; stamps `published_at`. |
| `private.refresh_public_location()` | triggers on `listing_private` and on `listings.show_exact_location` | Sets `location_public` to the exact point if the owner opted in, otherwise to the point snapped to a 0.0025° grid (cells of roughly 190 x 280 m in Ulaanbaatar). Snapping is deterministic and many-to-one, so repeated edits cannot be averaged to recover the exact pin. The UI draws approximate locations as a circle, not a pin. |
| `private.sync_scan_to_listing()` | trigger on `room_scans` | When a scan is `ready` and current: sets `listings.has_3d` and `area_scanned_m2` from `metrics`. Clears them when no ready scan remains. |
| `public.reveal_listing_contact(listing_id)` | RPC, `anon` + `authenticated` | Listing must be `published`. Rate-limited per caller (user id, else hashed IP). Logs to `contact_reveals`. Returns the owner's verified phone. |
| `public.record_listing_view(listing_id)` | RPC, `anon` + `authenticated` | Upserts today's counter. No server-side de-duplication in MVP. |

`room_scans.status = 'ready'`, `is_current`, `model_path`, `floor_plan_path` and `metrics` are written only by trusted server code using the secret key (see open decision 1 in `01-repo-structure.md`).

A `search_listings(...)` RPC with filters, map bounds and ranking (3D first, then newest) is designed in step 6. The indexes above already support it.

## Storage buckets

| Bucket | Public | Path | Who writes |
|--------|--------|------|-----------|
| `listing-photos` | yes | `{listing_id}/{photo_id}.jpg` | listing owner |
| `scan-raw` | no | `{listing_id}/{scan_id}/capture.json`, `capture.usdz` | listing owner; read by owner and server |
| `scan-models` | yes | `{listing_id}/{scan_id}/model.json`, `floorplan.png` | server only |
| `avatars` | yes | `{user_id}/avatar.jpg` | the user |

Owner write policies on `storage.objects` check the first path segment against `listings.owner_id` (or `auth.uid()` for avatars). Buckets get MIME-type and size limits. Photos are resized on the device before upload.

Known trade-off: photos of a draft listing sit in a public bucket under an unguessable UUID path. Acceptable for MVP in my view; say so if you want drafts in a private bucket.

## Auth

- Phone + SMS OTP through the Send SMS hook, implemented as the `send-sms` Edge Function. Per the current Supabase docs the hook receives `user.phone` and `sms.otp` (6 digits), is verified with the Standard Webhooks library using a `v1,whsec_...` secret, and an empty 200 response means success.
- Sign in with Apple and Google. These users have no phone yet, so they must add and verify one before publishing (enforced by the publish trigger).

## To verify on the live project in step 3

1. `select show_trgm('Зайсан хотхон');` returns Cyrillic trigrams. `pg_trgm` depends on the database's character classification, so this must be checked, not assumed.
2. Whether phone auth with the Send SMS hook still requires a built-in SMS provider to be configured. The docs do not say.
3. That the caller's IP is available to SQL through `request.headers` for the reveal rate limit, and which header value can be trusted.
4. `supabase db push`, `gen types` and `functions deploy` working from Windows without Docker.
5. **Whether your SMS gateway requires IP allowlisting.** Supabase Edge Functions have no fixed outbound IP. If the gateway insists on one, we need a small relay with a static IP.
