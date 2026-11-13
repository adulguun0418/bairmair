-- Step 6a: public listing pages.

-- 1. Scan locations are private ----------------------------------------------------------------
--
-- Migration 9 added room_scans.scan_lat/scan_lng/scan_accuracy_m, but room_scans had a
-- table-wide SELECT grant, so anyone could read where the seller's phone was during the scan of
-- a live listing: in practice the exact location, which the public pin deliberately hides.
-- Replace the table grant with a column grant that leaves those three columns out. The owner's
-- app reads them through scan_location().

revoke select on public.room_scans from anon, authenticated;
grant select (
  id, listing_id, status, is_current, schema_version, converter_version,
  raw_json_path, usdz_path, model_path, floor_plan_path, metrics, room_labels,
  device_model, ios_version, app_version, processing_error, created_at, updated_at
) on public.room_scans to anon, authenticated;

-- Where the phone was during one of the caller's own scans. No row for someone else's scan or a
-- scan without a location.
create function public.scan_location(p_scan_id uuid)
returns table (lat double precision, lng double precision, accuracy_m real)
language sql
stable
security definer
set search_path = ''
as $$
  select s.scan_lat, s.scan_lng, s.scan_accuracy_m
  from public.room_scans s
  join public.listings l on l.id = s.listing_id
  where s.id = p_scan_id
    and l.owner_id = (select auth.uid())
    and s.scan_lat is not null;
$$;

revoke all on function public.scan_location(uuid) from public, anon, authenticated;
grant execute on function public.scan_location(uuid) to authenticated;

-- 2. Median price per m² by district ------------------------------------------------------------
--
-- Shown on listing pages next to the listing's own price per m². Uses the official area (from
-- the property certificate), not the scanned one, and only listings in search: published and
-- confirmed within the last 14 days (LISTING_FRESHNESS in @bairmair/db). Grouped by currency,
-- since rents can be in dollars. The page shows the median only when enough listings back it.

create view public.district_price_stats
with (security_invoker = true)
as
select
  l.type,
  l.district_id,
  l.currency,
  count(*)::integer as listing_count,
  round(
    (percentile_cont(0.5) within group (order by l.price / l.area_official_m2))::numeric,
    2
  ) as median_price_per_m2
from public.listings l
where l.status = 'published'
  and l.last_confirmed_at >= now() - interval '14 days'
  and l.district_id is not null
  and l.price > 0
  and l.area_official_m2 > 0
group by l.type, l.district_id, l.currency;

comment on view public.district_price_stats is
  'Median price per official m² of live, recently confirmed listings, by type, district and currency.';

revoke all on public.district_price_stats from public, anon, authenticated;
grant select on public.district_price_stats to anon, authenticated;
