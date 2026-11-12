/**
 * Error keys raised by the database (triggers and RPCs in `supabase/migrations`). The message of
 * the PostgREST error is exactly one of these keys; apps map them to localized text.
 */
export const DB_ERROR_KEYS = [
  /** Publishing needs an OTP-verified phone on the owner's account. */
  'publish_requires_verified_phone',
  /** Publishing needs at least one photo. */
  'publish_requires_photo',
  /** Only a published listing can be marked sold/rented. */
  'listing_not_published',
  /** A listing holds at most 40 photos. */
  'too_many_photos',
  /** The listing does not exist, is not published, or is not the caller's (HTTP 404). */
  'listing_not_available',
  /** The seller has no verified phone (HTTP 404). */
  'contact_unavailable',
  /** Too many phone reveals in the last hour (HTTP 429). */
  'rate_limited',
] as const;

export type DbErrorKey = (typeof DB_ERROR_KEYS)[number];

const KEYS: ReadonlySet<string> = new Set(DB_ERROR_KEYS);

/** Returns the error key if `error` was raised by our SQL, otherwise null. */
export function dbErrorKey(error: { message?: string } | null | undefined): DbErrorKey | null {
  const message = error?.message;
  return message !== undefined && KEYS.has(message) ? (message as DbErrorKey) : null;
}
