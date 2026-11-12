-- Tables and indexes. Privileges and RLS are set in a later migration.
-- Columns marked "server-maintained" are written only by triggers or by trusted server code;
-- clients get no grant on them.

-- Reference data -----------------------------------------------------------------------------

create table public.cities (
  id      smallint primary key,
  slug    text not null unique,
  name_mn text not null,
  name_en text not null
);

create table public.districts (
  id         smallint primary key,
  city_id    smallint not null references public.cities (id),
  slug       text not null unique,
  name_mn    text not null,
  name_en    text not null,
  sort_order smallint not null default 0,
  unique (id, city_id)  -- target of the listings (district_id, city_id) foreign key
);
create index districts_city_idx on public.districts (city_id, sort_order);

-- People -------------------------------------------------------------------------------------

-- No phone column: the contact number is the OTP-verified auth.users.phone, returned only by
-- reveal_listing_contact().
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null default 'owner',  -- server-maintained
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_avatar_in_own_folder check (avatar_path like id::text || '/%')
);

create table public.agent_profiles (
  profile_id  uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  agency_name text not null check (char_length(agency_name) between 1 and 120),
  bio         text check (char_length(bio) <= 2000),
  verified    boolean not null default false,  -- set by an admin in the dashboard
  verified_at timestamptz,                     -- server-maintained
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Listings -----------------------------------------------------------------------------------

create table public.listings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type        public.listing_type not null,
  status      public.listing_status not null default 'draft',
  title       text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 5000),

  price      numeric(14, 2) check (price >= 0),
  currency   public.currency_code not null default 'MNT',
  negotiable boolean not null default false,

  area_official_m2  numeric(7, 2) check (area_official_m2 > 0),  -- from the property certificate
  area_scanned_m2   numeric(7, 2),                               -- server-maintained
  rooms             smallint check (rooms between 1 and 20),     -- local convention: includes the living room
  floor             smallint check (floor between -5 and 200),
  total_floors      smallint check (total_floors between 1 and 200),
  building_year     smallint check (building_year between 1900 and 2100),
  building_material public.building_material,
  new_building      boolean not null default false,
  heating           public.heating_type,
  balconies         smallint not null default 0 check (balconies between 0 and 20),
  parking           public.parking_type,
  furnishing        public.furnishing,

  mortgage_eligible  boolean,                                           -- sale only (ипотек)
  deposit            numeric(14, 2) check (deposit >= 0),               -- rent only
  min_term_months    smallint check (min_term_months between 0 and 120), -- rent only
  utilities_included boolean,                                           -- rent only

  city_id      smallint not null references public.cities (id),
  district_id  smallint,
  khoroo       smallint check (khoroo between 1 and 99),
  complex_name text check (char_length(complex_name) <= 120),  -- хотхон / building name
  address_text text check (char_length(address_text) <= 500),  -- free-text directions
  show_exact_location boolean not null default false,
  -- Public pin: the exact point if the owner opted in, otherwise the centre of a 0.0025° grid
  -- cell. Server-maintained from listing_private.
  public_lat double precision,
  public_lng double precision,
  location_public extensions.geography(Point, 4326) generated always as (
    case
      when public_lat is not null and public_lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(public_lng, public_lat), 4326)::extensions.geography
    end
  ) stored,

  has_3d            boolean not null default false,  -- server-maintained
  scan_verified     boolean not null default false,  -- server-maintained ("scanned on-site", step 5)
  published_at      timestamptz,                     -- server-maintained, first publish
  last_confirmed_at timestamptz,                     -- server-maintained, publish or confirm_listing_available()
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  search_text text generated always as (
    lower(coalesce(title, '') || ' ' || coalesce(complex_name, '') || ' ' || coalesce(address_text, ''))
  ) stored,

  constraint listings_district_in_city
    foreign key (district_id, city_id) references public.districts (id, city_id),
  constraint listings_sale_fields check (type = 'sale' or mortgage_eligible is null),
  constraint listings_rent_fields check (
    type = 'rent' or (deposit is null and min_term_months is null and utilities_included is null)
  ),
  constraint listings_usd_rent_only check (currency = 'MNT' or type = 'rent'),
  constraint listings_floor_range check (floor is null or total_floors is null or floor <= total_floors),
  constraint listings_complete_when_live check (
    status in ('draft', 'archived') or (
      price is not null and rooms is not null and district_id is not null
      and public_lat is not null and public_lng is not null
      and coalesce(area_official_m2, area_scanned_m2) is not null
    )
  )
);

create index listings_owner_idx    on public.listings (owner_id);
create index listings_browse_idx   on public.listings (type, district_id, published_at desc) where status = 'published';
create index listings_location_idx on public.listings using gist (location_public);
create index listings_search_idx   on public.listings using gin (search_text extensions.gin_trgm_ops);

-- Owner-only details. Plain numbers rather than a PostGIS point, so clients write JSON numbers.
create table public.listing_private (
  listing_id  uuid primary key references public.listings (id) on delete cascade,
  lat         double precision not null check (lat between 41.5 and 52.2),   -- Mongolia
  lng         double precision not null check (lng between 87.7 and 120.0),  -- Mongolia
  unit_number text check (char_length(unit_number) <= 20),                   -- apartment / door number
  updated_at  timestamptz not null default now()
);

-- Scans --------------------------------------------------------------------------------------

create table public.room_scans (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings (id) on delete cascade,
  status            public.scan_status not null default 'uploaded',  -- server-maintained
  is_current        boolean not null default false,                  -- server-maintained
  schema_version    smallint,                                        -- RoomModel version of model_path
  converter_version text,
  raw_json_path     text not null,  -- scan-raw bucket (private)
  usdz_path         text not null,  -- scan-raw bucket (private)
  model_path        text,           -- scan-models bucket (public), written by the server
  floor_plan_path   text,           -- scan-models bucket (public), written by the server
  metrics           jsonb,          -- { totalAreaM2, rooms: [{ id, areaM2 }], ... }, written by the server
  room_labels       jsonb not null default '{}',  -- user corrections: { roomId: { label, name } }
  device_model      text check (char_length(device_model) <= 40),
  ios_version       text check (char_length(ios_version) <= 20),
  app_version       text check (char_length(app_version) <= 20),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, listing_id),  -- target of the listing_photos (scan_id, listing_id) foreign key
  constraint room_scans_raw_paths check (
    raw_json_path like listing_id::text || '/' || id::text || '/%'
    and usdz_path like listing_id::text || '/' || id::text || '/%'
  ),
  constraint room_scans_current_is_ready check (not is_current or status = 'ready'),
  constraint room_scans_labels_shape check (
    jsonb_typeof(room_labels) = 'object' and length(room_labels::text) <= 20000
  )
);
create unique index room_scans_current_idx on public.room_scans (listing_id) where is_current;
create index room_scans_listing_idx on public.room_scans (listing_id);

create table public.listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,  -- listing-photos bucket: {listing_id}/{photo_id}.jpg
  sort_order   integer not null default 0,
  width        integer check (width > 0),
  height       integer check (height > 0),
  scan_id      uuid,
  room_id      text check (char_length(room_id) <= 64),  -- RoomModel room id within scan_id
  camera_pose  jsonb,                                    -- reserved for pose-pinned photos
  created_at   timestamptz not null default now(),
  constraint listing_photos_path check (storage_path like listing_id::text || '/%'),
  constraint listing_photos_room_needs_scan check (room_id is null or scan_id is not null),
  -- The scan must belong to the same listing. Deleting the scan clears scan_id only
  -- (and a trigger clears room_id with it).
  constraint listing_photos_scan_same_listing
    foreign key (scan_id, listing_id) references public.room_scans (id, listing_id)
    on delete set null (scan_id)
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);
create index listing_photos_scan_idx on public.listing_photos (scan_id) where scan_id is not null;

-- Engagement ---------------------------------------------------------------------------------

create table public.favorites (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index favorites_listing_idx on public.favorites (listing_id);

-- One counter row per listing per local (Ulaanbaatar) day. Written only by record_listing_view().
create table public.listing_views (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day        date not null default (now() at time zone 'Asia/Ulaanbaatar')::date,
  views      integer not null default 0,
  primary key (listing_id, day)
);

-- Phone reveals, for rate limiting and lead counts. Written only by reveal_listing_contact().
create table public.contact_reveals (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  viewer_id  uuid references public.profiles (id) on delete set null,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index contact_reveals_listing_idx on public.contact_reveals (listing_id);
create index contact_reveals_viewer_idx  on public.contact_reveals (viewer_id, created_at);
create index contact_reveals_ip_idx      on public.contact_reveals (ip_hash, created_at);

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
create index reports_reporter_idx on public.reports (reporter_id);
