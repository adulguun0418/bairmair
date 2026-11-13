import type { Viewport } from './map-pins';
import {
  DISTRICTS,
  LISTING_LIMITS,
  SEARCH_LIMITS,
  SEARCH_SORTS,
  type SearchListingsArgs,
  type SearchSort,
} from '@bairmair/db';

// The search page keeps its filters in the URL, so a search can be shared and bookmarked:
//   /search?type=sale&district=khan-uul&district=bayangol&rooms=2&priceMax=300&has3d=1&view=map
// Prices are in the unit the form asks for: millions of tögrög (`priceMax=300` = 300 сая ₮), or
// dollars when `currency=USD` (rents only). Districts use their slugs, rooms 1..5 (5 = "5+").
// `bbox=west,south,east,north` keeps listings inside a map area ("search this area").

export type SearchView = 'list' | 'map';

export interface SearchFilters {
  type: 'sale' | 'rent' | null;
  /** District slugs, in the order of DISTRICTS. */
  districts: string[];
  /** 1..roomsPlus; the last one means "that many or more". */
  rooms: number[];
  /** Always MNT for sales. */
  currency: 'MNT' | 'USD';
  /** In the form's unit: millions of tögrög, or dollars. */
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  has3d: boolean;
  q: string;
  sort: SearchSort;
  /** Only listings inside this map area (rounded to 5 decimals, about a metre). */
  bounds: Viewport | null;
  /** 1-based. */
  page: number;
  view: SearchView;
}

export const DEFAULT_FILTERS: SearchFilters = {
  type: null,
  districts: [],
  rooms: [],
  currency: 'MNT',
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  has3d: false,
  q: '',
  sort: 'recommended',
  bounds: null,
  page: 1,
  view: 'list',
};

/** Search params as Next.js passes them to a page, or as a form produces them. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = Math.floor(SEARCH_LIMITS.maxOffset / SEARCH_LIMITS.pageSize) + 1;

function all(raw: RawSearchParams, key: string): string[] {
  const value = raw[key];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function first(raw: RawSearchParams, key: string): string {
  return all(raw, key)[0] ?? '';
}

/** "250", "1.5", "1,5" (decimal comma), "1 500": a non-negative number, or null. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Reads filters from the URL, dropping anything unknown or malformed. */
export function parseSearchParams(raw: RawSearchParams): SearchFilters {
  const typeParam = first(raw, 'type');
  const type = typeParam === 'sale' || typeParam === 'rent' ? typeParam : null;

  const slugs = new Set(all(raw, 'district'));
  const districts = DISTRICTS.filter((district) => slugs.has(district.slug)).map((d) => d.slug);

  const rooms = [
    ...new Set(
      all(raw, 'rooms')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= SEARCH_LIMITS.roomsPlus),
    ),
  ].sort((a, b) => a - b);

  const currency = type !== 'sale' && first(raw, 'currency') === 'USD' ? 'USD' : 'MNT';

  const sortParam = first(raw, 'sort');
  const sort = (SEARCH_SORTS as readonly string[]).includes(sortParam)
    ? (sortParam as SearchSort)
    : 'recommended';

  const page = Number(first(raw, 'page'));

  const [priceMin, priceMax] = ordered(
    parseAmount(first(raw, 'priceMin')),
    parseAmount(first(raw, 'priceMax')),
  );
  const [areaMin, areaMax] = ordered(
    parseAmount(first(raw, 'areaMin')),
    parseAmount(first(raw, 'areaMax')),
  );

  return {
    type,
    districts,
    rooms,
    currency,
    priceMin,
    priceMax,
    areaMin,
    areaMax,
    has3d: ['1', 'true', 'on'].includes(first(raw, 'has3d')),
    q: first(raw, 'q').slice(0, MAX_QUERY_LENGTH),
    sort,
    bounds: parseBounds(first(raw, 'bbox')),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
    view: first(raw, 'view') === 'map' ? 'map' : 'list',
  };
}

const roundCoordinate = (value: number) => Math.round(value * 1e5) / 1e5;

/** A map area from `west,south,east,north`, or null when malformed or empty. */
export function parseBounds(text: string): Viewport | null {
  const parts = text.split(',').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts.map(roundCoordinate) as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90) return null;
  if (west >= east || south >= north) return null;
  return { west, south, east, north };
}

function formatBounds({ west, south, east, north }: Viewport): string {
  return [west, south, east, north].map(roundCoordinate).join(',');
}

/** Swaps a min and max typed the wrong way round. */
function ordered(min: number | null, max: number | null): [number | null, number | null] {
  return min !== null && max !== null && min > max ? [max, min] : [min, max];
}

/**
 * The query string of a search (with a leading `?`, or empty), leaving out defaults. Changing any
 * filter goes back to page 1 unless `page` is given.
 */
export function searchQuery(filters: SearchFilters, changes: Partial<SearchFilters> = {}): string {
  const next: SearchFilters = { ...filters, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.type) params.set('type', next.type);
  if (next.q) params.set('q', next.q);
  for (const slug of next.districts) params.append('district', slug);
  for (const rooms of next.rooms) params.append('rooms', String(rooms));
  if (next.currency === 'USD' && next.type !== 'sale') params.set('currency', 'USD');
  if (next.priceMin !== null) params.set('priceMin', String(next.priceMin));
  if (next.priceMax !== null) params.set('priceMax', String(next.priceMax));
  if (next.areaMin !== null) params.set('areaMin', String(next.areaMin));
  if (next.areaMax !== null) params.set('areaMax', String(next.areaMax));
  if (next.has3d) params.set('has3d', '1');
  if (next.sort !== 'recommended') params.set('sort', next.sort);
  if (next.bounds) params.set('bbox', formatBounds(next.bounds));
  if (next.page > 1) params.set('page', String(next.page));
  if (next.view === 'map') params.set('view', 'map');
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Whether any filter narrows the results (type, sort, paging and view do not count). */
export function hasFilters(filters: SearchFilters): boolean {
  return (
    filters.districts.length > 0 ||
    filters.rooms.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.areaMin !== null ||
    filters.areaMax !== null ||
    filters.has3d ||
    filters.q !== '' ||
    filters.bounds !== null
  );
}

/**
 * How many filter groups narrow the results, for a "Filters (2)" button: districts, rooms, price,
 * area and 3D count once each. The text query and the map area have their own controls and do
 * not count.
 */
export function activeFilterCount(filters: SearchFilters): number {
  return [
    filters.districts.length > 0,
    filters.rooms.length > 0,
    filters.priceMin !== null || filters.priceMax !== null,
    filters.areaMin !== null || filters.areaMax !== null,
    filters.has3d,
  ].filter(Boolean).length;
}

/** The `search_listings` arguments for the filters (the map area included), without paging. */
export function searchArgs(filters: SearchFilters): SearchListingsArgs {
  const args: SearchListingsArgs = { p_sort: filters.sort, p_currency: filters.currency };
  if (filters.type) args.p_type = filters.type;
  if (filters.districts.length > 0) {
    args.p_district_ids = DISTRICTS.filter((d) => filters.districts.includes(d.slug)).map(
      (d) => d.id,
    );
  }
  if (filters.rooms.length > 0) args.p_rooms = expandRooms(filters.rooms);
  const unit = filters.currency === 'MNT' ? 1_000_000 : 1;
  if (filters.priceMin !== null) args.p_price_min = Math.round(filters.priceMin * unit);
  if (filters.priceMax !== null) args.p_price_max = Math.round(filters.priceMax * unit);
  if (filters.areaMin !== null) args.p_area_min = filters.areaMin;
  if (filters.areaMax !== null) args.p_area_max = filters.areaMax;
  if (filters.has3d) args.p_has_3d = true;
  if (filters.q) args.p_query = filters.q;
  if (filters.bounds) {
    args.p_west = filters.bounds.west;
    args.p_south = filters.bounds.south;
    args.p_east = filters.bounds.east;
    args.p_north = filters.bounds.north;
  }
  return args;
}

/** Room chips to exact counts: the last chip ("5+") stands for 5 up to the database maximum. */
export function expandRooms(rooms: readonly number[]): number[] {
  const counts = new Set<number>();
  for (const count of rooms) {
    if (count >= SEARCH_LIMITS.roomsPlus) {
      for (let n = SEARCH_LIMITS.roomsPlus; n <= LISTING_LIMITS.rooms.max; n++) counts.add(n);
    } else {
      counts.add(count);
    }
  }
  return [...counts].sort((a, b) => a - b);
}

/** The list page's paging arguments. */
export function pageArgs(page: number): Pick<SearchListingsArgs, 'p_limit' | 'p_offset'> {
  return { p_limit: SEARCH_LIMITS.pageSize, p_offset: (page - 1) * SEARCH_LIMITS.pageSize };
}

/** Pages for a result count, capped where the RPC stops paging. */
export function pageCount(total: number): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / SEARCH_LIMITS.pageSize)));
}
