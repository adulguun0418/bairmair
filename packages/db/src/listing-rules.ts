/**
 * Limits on listing fields, mirrored from the CHECK constraints in
 * `supabase/migrations/*_tables.sql`. Apps validate with these before writing, so a value the
 * database would reject is caught in the form instead.
 */
export const LISTING_LIMITS = {
  title: { min: 3, max: 120 },
  description: { max: 5000 },
  /** numeric(14, 2) */
  price: { min: 0, max: 999_999_999_999.99 },
  /** numeric(7, 2), must be > 0 */
  area: { max: 99_999.99 },
  rooms: { min: 1, max: 20 },
  floor: { min: -5, max: 200 },
  totalFloors: { min: 1, max: 200 },
  buildingYear: { min: 1900, max: 2100 },
  balconies: { min: 0, max: 20 },
  minTermMonths: { min: 0, max: 120 },
  khoroo: { min: 1, max: 99 },
  complexName: { max: 120 },
  addressText: { max: 500 },
  unitNumber: { max: 20 },
  /** listing_photos trigger */
  photos: { max: 40 },
  /** RoomModel room name (`name`, max 80) stored in `room_scans.room_labels`. */
  roomName: { max: 80 },
} as const;

/**
 * "Scanned on-site" (`listings.scan_verified`), computed by `private.refresh_listing_scan()`:
 * the current scan's GPS fix is this accurate and this close to the listing's exact location.
 */
export const SCAN_ON_SITE = { maxAccuracyM: 100, maxDistanceM: 150 } as const;

/**
 * Freshness: a published listing stays in search while its seller has confirmed it is still
 * available within this many days (`listings.last_confirmed_at`, set on publish and by
 * `confirm_listing_available()`). Mirrored in `district_price_stats` (migration 10).
 */
export const LISTING_FRESHNESS = { confirmEveryDays: 14 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether a listing confirmed at `lastConfirmedAt` is still fresh at `now`. */
export function isListingFresh(lastConfirmedAt: string | null, now: Date): boolean {
  if (!lastConfirmedAt) return false;
  const confirmed = Date.parse(lastConfirmedAt);
  if (Number.isNaN(confirmed)) return false;
  return now.getTime() - confirmed <= LISTING_FRESHNESS.confirmEveryDays * DAY_MS;
}

/**
 * Whole days a listing confirmed at `lastConfirmedAt` stays in search after `now`: 14 right after
 * a confirmation, 0 on its last day, null once it has dropped out (or was never confirmed).
 */
export function daysLeftInSearch(lastConfirmedAt: string | null, now: Date): number | null {
  if (!lastConfirmedAt || !isListingFresh(lastConfirmedAt, now)) return null;
  const until = Date.parse(lastConfirmedAt) + LISTING_FRESHNESS.confirmEveryDays * DAY_MS;
  return Math.floor((until - now.getTime()) / DAY_MS);
}

/** Whole days from `then` to `now` (0 on the same day or for a date in the future). */
export function daysSince(then: string, now: Date): number {
  const time = Date.parse(then);
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

/** A district median price per m² is shown only when at least this many listings back it. */
export const DISTRICT_STATS_MIN_LISTINGS = 3;

/** listing_private.lat/lng must fall inside this box (Mongolia). */
export const MONGOLIA_BOUNDS = {
  minLat: 41.5,
  maxLat: 52.2,
  minLng: 87.7,
  maxLng: 120.0,
} as const;

export function isInMongolia(lat: number, lng: number): boolean {
  return (
    lat >= MONGOLIA_BOUNDS.minLat &&
    lat <= MONGOLIA_BOUNDS.maxLat &&
    lng >= MONGOLIA_BOUNDS.minLng &&
    lng <= MONGOLIA_BOUNDS.maxLng
  );
}
