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

/**
 * Error keys returned by the web server's API routes as `{ "error": key }`. Apps map them to
 * localized text, like the database keys.
 */
export const API_ERROR_KEYS = [
  /** No valid `Authorization: Bearer <access token>` header (HTTP 401). */
  'unauthorized',
  /** The scan does not exist or its listing is not the caller's (HTTP 404). */
  'scan_not_found',
  /** The raw RoomPlan JSON or the USDZ is not in storage yet; upload, then retry (HTTP 409). */
  'scan_files_missing',
  /** The raw file is not a RoomPlan export we can convert; the scan is now `failed` (HTTP 422). */
  'scan_conversion_failed',
  /** Anything else; safe to retry (HTTP 500). */
  'server_error',
] as const;

export type ApiErrorKey = (typeof API_ERROR_KEYS)[number];

const API_KEYS: ReadonlySet<string> = new Set(API_ERROR_KEYS);

/** Returns the key from an API error body, otherwise null. */
export function apiErrorKey(body: unknown): ApiErrorKey | null {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'string' && API_KEYS.has(error) ? (error as ApiErrorKey) : null;
}

/** Returns the error key if `error` was raised by our SQL, otherwise null. */
export function dbErrorKey(error: { message?: string } | null | undefined): DbErrorKey | null {
  const message = error?.message;
  return message !== undefined && KEYS.has(message) ? (message as DbErrorKey) : null;
}
