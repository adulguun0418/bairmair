import type { Database } from './database.types';

type Enums = Database['public']['Enums'];

/** Sort orders of `search_listings` (migration 11). */
export const SEARCH_SORTS = ['recommended', 'newest', 'price_asc', 'price_desc'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_LIMITS = {
  /** Results per page of the search list. */
  pageSize: 24,
  /** Pins per map request; the RPC's own maximum. */
  mapPins: 1000,
  /** The RPC ignores offsets past this; the list stops offering further pages there. */
  maxOffset: 10_000,
  /** Room filter chips 1..roomsPlus, the last one meaning "this many or more". */
  roomsPlus: 5,
} as const;

/** Arguments of `search_listings`, as supabase-js sends them. */
export type SearchListingsArgs = Database['public']['Functions']['search_listings']['Args'];

/**
 * A row of `search_listings`. The generated types mark every column non-null; these are the
 * real ones (a published listing has a price, rooms, a district and a public pin, by the
 * `listings_complete_when_live` constraint).
 */
export interface SearchListingRow {
  id: string;
  owner_id: string;
  type: Enums['listing_type'];
  title: string;
  price: number;
  currency: Enums['currency_code'];
  negotiable: boolean;
  rooms: number;
  area_official_m2: number | null;
  area_scanned_m2: number | null;
  floor: number | null;
  total_floors: number | null;
  district_id: number;
  complex_name: string | null;
  /** The public pin: approximate (a 0.0025° cell centre) unless the owner shows the exact spot. */
  lat: number;
  lng: number;
  show_exact_location: boolean;
  has_3d: boolean;
  scan_verified: boolean;
  /** The first photo by sort order; its file is `listingPhotoPath(id, cover_photo_id)`. */
  cover_photo_id: string | null;
  published_at: string;
  last_confirmed_at: string;
  /** Matches before paging. */
  total_count: number;
}

/** The columns a map pin needs; the map selects only these. */
export const MAP_PIN_COLUMNS = 'id, lat, lng, type, price, currency, area_official_m2, has_3d';

export type MapPinRow = Pick<
  SearchListingRow,
  'id' | 'lat' | 'lng' | 'type' | 'price' | 'currency' | 'area_official_m2' | 'has_3d'
>;

/** Ulaanbaatar's centre (Sükhbaatar Square), where maps open. */
export const ULAANBAATAR_CENTER = { lat: 47.9186, lng: 106.9176 } as const;
