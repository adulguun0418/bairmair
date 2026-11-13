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
