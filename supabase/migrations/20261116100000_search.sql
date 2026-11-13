-- Step 6b: search.
--
-- One RPC behind the web search list, the map, agent pages and (6c) the mobile app. It shows only
-- listings that are in search: published and confirmed by the seller within the last 14 days
-- (LISTING_FRESHNESS in @bairmair/db; the same rule as district_price_stats). Older ones stay
-- reachable by link, with a notice, but are hidden here.
--
-- security invoker: RLS on listings and listing_photos still applies; the filter below only
-- narrows it.
--
-- Filters (null = no filter):
-- - p_type, p_district_ids, p_rooms (exact counts; the app sends 5..20 for "5+"), p_owner_id
-- - p_price_min / p_price_max, in p_currency. A price bound keeps only listings in that currency
--   (rents can be in dollars; there is no exchange rate).
-- - p_area_min / p_area_max: the official area, else the scanned one
-- - p_has_3d: only listings with a scan
-- - p_query: a phrase in the title, complex name or directions (case-insensitive, trigram index)
-- - p_west / p_south / p_east / p_north: the map viewport (all four, or none). The GiST index on
--   location_public finds candidates; the exact lat/lng check trims the geodesic box's edges.
--
-- p_sort:
-- - 'recommended' (default): listings with a 3D scan first (the brief: scanned listings get
--   better placement), then newest
-- - 'newest': by first publish date
-- - 'price_asc' / 'price_desc': listings in p_currency first, then by price
-- Unknown values sort as 'newest'.
--
-- Paging: p_limit (1..1000, the map asks for up to 1000 pins) and p_offset (up to 10000).
-- total_count is the number of matches before paging.

create function public.search_listings(
  p_type         public.listing_type   default null,
  p_district_ids smallint[]            default null,
  p_rooms        smallint[]            default null,
  p_price_min    numeric               default null,
  p_price_max    numeric               default null,
  p_currency     public.currency_code  default 'MNT',
  p_area_min     numeric               default null,
  p_area_max     numeric               default null,
  p_has_3d       boolean               default false,
  p_query        text                  default null,
  p_owner_id     uuid                  default null,
  p_west         double precision      default null,
  p_south        double precision      default null,
  p_east         double precision      default null,
  p_north        double precision      default null,
  p_sort         text                  default 'recommended',
  p_limit        integer               default 24,
  p_offset       integer               default 0
)
returns table (
  id                  uuid,
  owner_id            uuid,
  type                public.listing_type,
  title               text,
  price               numeric,
  currency            public.currency_code,
  negotiable          boolean,
  rooms               smallint,
  area_official_m2    numeric,
  area_scanned_m2     numeric,
  floor               smallint,
  total_floors        smallint,
  district_id         smallint,
  complex_name        text,
  lat                 double precision,
  lng                 double precision,
  show_exact_location boolean,
  has_3d              boolean,
  scan_verified       boolean,
  cover_photo_id      uuid,
  published_at        timestamptz,
  last_confirmed_at   timestamptz,
  total_count         bigint
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      nullif(
        '%' || replace(replace(replace(lower(btrim(left(p_query, 100))), '\', '\\'), '%', '\%'), '_', '\_') || '%',
        '%%'
      ) as pattern,
      case
        when p_west is not null and p_south is not null and p_east is not null and p_north is not null
        then extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
      end as viewport
  ),
  matches as (
    select l.*
    from public.listings l, params
    where l.status = 'published'
      and l.last_confirmed_at >= now() - interval '14 days'
      and (p_type is null or l.type = p_type)
      and (coalesce(cardinality(p_district_ids), 0) = 0 or l.district_id = any (p_district_ids))
      and (coalesce(cardinality(p_rooms), 0) = 0 or l.rooms = any (p_rooms))
      and (
        (p_price_min is null and p_price_max is null)
        or (
          l.currency = coalesce(p_currency, 'MNT')
          and (p_price_min is null or l.price >= p_price_min)
          and (p_price_max is null or l.price <= p_price_max)
        )
      )
      and (p_area_min is null or coalesce(l.area_official_m2, l.area_scanned_m2) >= p_area_min)
      and (p_area_max is null or coalesce(l.area_official_m2, l.area_scanned_m2) <= p_area_max)
      and (not coalesce(p_has_3d, false) or l.has_3d)
      and (params.pattern is null or l.search_text like params.pattern)
      and (p_owner_id is null or l.owner_id = p_owner_id)
      and (
        params.viewport is null
        or (
          l.location_public operator(extensions.&&) params.viewport
          and l.public_lat between p_south and p_north
          and l.public_lng between p_west and p_east
        )
      )
  )
  select
    m.id, m.owner_id, m.type, m.title, m.price, m.currency, m.negotiable,
    m.rooms, m.area_official_m2, m.area_scanned_m2, m.floor, m.total_floors,
    m.district_id, m.complex_name, m.public_lat, m.public_lng, m.show_exact_location,
    m.has_3d, m.scan_verified,
    (
      select p.id from public.listing_photos p
      where p.listing_id = m.id
      order by p.sort_order, p.created_at
      limit 1
    ),
    m.published_at, m.last_confirmed_at,
    count(*) over ()
  from matches m
  order by
    case when p_sort in ('price_asc', 'price_desc') then m.currency <> coalesce(p_currency, 'MNT') end,
    case when p_sort = 'price_asc' then m.price end asc,
    case when p_sort = 'price_desc' then m.price end desc,
    case when coalesce(p_sort, 'recommended') = 'recommended' then m.has_3d end desc,
    m.published_at desc,
    m.id
  limit least(greatest(coalesce(p_limit, 24), 1), 1000)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
$$;

comment on function public.search_listings is
  'Listings in search (published, confirmed within 14 days) with filters, viewport, sort and paging.';

revoke all on function public.search_listings from public, anon, authenticated;
grant execute on function public.search_listings to anon, authenticated;
