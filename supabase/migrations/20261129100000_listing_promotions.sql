-- Gold and Silver listings (your call, 2026-11-21; like unegui's "онцгой" / VIP).
--
-- - A seller pays (QPay, website only) to promote one of their published listings for 7 or 14
--   days: Gold or Silver. Search shows Gold listings first, then Silver, then the rest, in every
--   sort. Within a tier the chosen sort applies; for "recommended" the tier's order rotates every
--   hour (stable within the hour, so paging does not repeat), so every buyer gets a turn on top.
--   No cap on how many can be bought.
-- - The clock runs from purchase whatever happens to the listing (sold, hidden, not confirmed
--   within 14 days: then it is simply not in search). Deleting the listing deletes its periods.
-- - Stacking, nothing paid is lost:
--   - same tier: the new period starts when that tier's last period ends;
--   - Gold during Silver: Gold starts now (or after the Gold already bought), and the Silver time
--     it covers moves to after it;
--   - Silver during Gold: starts after everything already bought.
--   Representation: a Silver row may span Gold time; the listing's tier at a moment is Gold if a
--   Gold row covers it, else Silver if a Silver row does. Buying Gold for d days stretches every
--   Silver row that ends after the Gold's start by d (and moves later ones by d), so the Silver
--   time actually shown stays what was paid.

create table public.listing_promotions (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tier        text not null check (tier in ('gold', 'silver')),
  product_id  text not null check (char_length(product_id) between 1 and 100),
  starts_at   timestamptz not null,
  expires_at  timestamptz not null,
  status      text not null default 'active' check (status in ('active', 'refunded', 'revoked')),
  payment_id  uuid not null unique references public.payments (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint listing_promotions_period check (expires_at > starts_at)
);

comment on table public.listing_promotions is
  'Paid Gold/Silver periods of a listing (QPay). Written only by the web server.';

create index listing_promotions_listing_idx on public.listing_promotions (listing_id, expires_at desc);
create index listing_promotions_active_idx on public.listing_promotions (expires_at)
  where status = 'active';

create trigger listing_promotions_touch_updated_at
  before update on public.listing_promotions
  for each row execute function private.touch_updated_at();

alter table public.listing_promotions enable row level security;
revoke all on table public.listing_promotions from public, anon, authenticated;
grant select on public.listing_promotions to authenticated;

create policy "select own" on public.listing_promotions for select to authenticated
  using (user_id = (select auth.uid()));

-- Tier now ------------------------------------------------------------------------------------

-- The live listings that are Gold (2) or Silver (1) right now. Public on purpose: search runs as
-- the caller and the badge shows the same thing; payer and payment stay private.
create function public.active_listing_tiers()
returns table (listing_id uuid, tier_rank smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.listing_id, max(case p.tier when 'gold' then 2 else 1 end)::smallint
  from public.listing_promotions p
  join public.listings l on l.id = p.listing_id and l.status = 'published'
  where p.status = 'active' and p.starts_at <= now() and p.expires_at > now()
  group by p.listing_id
$$;

revoke execute on function public.active_listing_tiers() from public;
grant execute on function public.active_listing_tiers() to anon, authenticated;

-- Delivery ------------------------------------------------------------------------------------

-- Adds a paid period (server only). Returns null when the listing no longer exists or is not the
-- payer's (deleted between invoice and payment: nothing to promote; the payment stays). Repeating
-- it for the same payment returns the row already made, so a retried delivery adds no time.
create function public.add_listing_promotion_period(
  p_user_id    uuid,
  p_listing_id uuid,
  p_payment_id uuid,
  p_product_id text,
  p_tier       text,
  p_days       integer
)
returns public.listing_promotions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.listing_promotions;
  v_start timestamptz;
  v_length interval;
begin
  if p_tier is null or p_tier not in ('gold', 'silver') then
    raise exception 'invalid tier: %', p_tier;
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'invalid period: % days', p_days;
  end if;
  v_length := make_interval(days => p_days);

  perform pg_advisory_xact_lock(hashtextextended('listing_promotions:' || p_listing_id::text, 0));

  select * into v_row from public.listing_promotions p where p.payment_id = p_payment_id;
  if found then
    return v_row;
  end if;

  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and l.owner_id = p_user_id
  ) then
    return null;
  end if;

  if p_tier = 'gold' then
    select greatest(now(), coalesce(max(p.expires_at), now())) into v_start
    from public.listing_promotions p
    where p.listing_id = p_listing_id and p.status = 'active' and p.tier = 'gold';

    -- Silver time under the new Gold moves to after it.
    update public.listing_promotions p
    set starts_at = case when p.starts_at >= v_start then p.starts_at + v_length else p.starts_at end,
        expires_at = p.expires_at + v_length
    where p.listing_id = p_listing_id and p.status = 'active' and p.tier = 'silver'
      and p.expires_at > v_start;
  else
    select greatest(now(), coalesce(max(p.expires_at), now())) into v_start
    from public.listing_promotions p
    where p.listing_id = p_listing_id and p.status = 'active';
  end if;

  insert into public.listing_promotions
    (listing_id, user_id, tier, product_id, starts_at, expires_at, payment_id)
  values
    (p_listing_id, p_user_id, p_tier, p_product_id, v_start, v_start + v_length, p_payment_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_listing_promotion_period(uuid, uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.add_listing_promotion_period(uuid, uuid, uuid, text, text, integer)
  to service_role;

-- Search, with tiers --------------------------------------------------------------------------
-- Same as migration 20261116100000 plus `promotion_tier` and the tier ordering. The return type
-- changes, so the function is dropped and created again (grants included).

drop function public.search_listings(
  public.listing_type, smallint[], smallint[], numeric, numeric, public.currency_code, numeric,
  numeric, boolean, text, uuid, double precision, double precision, double precision,
  double precision, text, integer, integer
);

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
  promotion_tier      text,
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
      end as viewport,
      -- Changes every hour: the order inside a tier for "recommended".
      extract(epoch from date_trunc('hour', now()))::bigint::text as rotation
  ),
  tiers as (
    select t.listing_id, t.tier_rank from public.active_listing_tiers() t
  ),
  matches as (
    select l.*, coalesce(t.tier_rank, 0) as tier_rank, params.rotation
    from public.listings l
    cross join params
    left join tiers t on t.listing_id = l.id
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
    case m.tier_rank when 2 then 'gold' when 1 then 'silver' end,
    count(*) over ()
  from matches m
  order by
    m.tier_rank desc,
    case
      when coalesce(p_sort, 'recommended') = 'recommended' and m.tier_rank > 0
      then md5(m.id::text || m.rotation)
    end,
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
  'Listings in search (published, confirmed within 14 days) with filters, viewport, sort and '
  'paging. Gold, then Silver, then the rest in every sort.';

revoke all on function public.search_listings from public, anon, authenticated;
grant execute on function public.search_listings to anon, authenticated;
