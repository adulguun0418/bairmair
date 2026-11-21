/**
 * Contract of the web server's API routes, shared by the route handlers and the apps.
 * Errors are `{ "error": ApiErrorKey }` (see `errors.ts`).
 */

/** `POST` with `Authorization: Bearer <access token>` and no body. */
export function processScanPath(scanId: string): string {
  return `/api/scans/${encodeURIComponent(scanId)}/process`;
}

/**
 * bairmair scan: `POST` with `Authorization: Bearer <access token>` and no body, after the raw
 * JSON and USDZ of a `user_scans` row are uploaded. Answers like `processScanPath`.
 */
export function processUserScanPath(scanId: string): string {
  return `/api/user-scans/${encodeURIComponent(scanId)}/process`;
}

/** The private link of a bairmair scan: `/s/<slug>` (Mongolian) or `/en/s/<slug>`. */
export function sharedScanPath(slug: string, locale: 'mn' | 'en' = 'mn'): string {
  const path = `/s/${encodeURIComponent(slug)}`;
  return locale === 'mn' ? path : `/en${path}`;
}

/**
 * Scans a free bairmair scan user may keep (not counting scans turned into listings). Mirrors
 * `private.scan_limit()` in the database, which enforces it; the apps read the caller's actual
 * limit with the `scan_plan` RPC.
 */
export const USER_SCAN_FREE_LIMIT = 2;

/** Scans a bairmair scan Pro user may keep (a fair-use cap). Mirrors `private.scan_limit()`. */
export const USER_SCAN_PRO_LIMIT = 100;

/**
 * Published listings a seller may have at once without a package. Mirrors
 * `private.listing_limit()`, which enforces it (only where `private.listing_limit_applies()`);
 * the apps read the caller's actual plan with the `listing_plan` RPC.
 */
export const LISTING_FREE_LIMIT = 1;

/** Published listings a seller may have at once with a listing package. */
export const LISTING_PACKAGE_LIMIT = 20;

/** Whether a string can be a share slug (12 letters and digits, as the database makes them). */
export function isShareSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{12}$/.test(value);
}

/**
 * `DELETE` with `Authorization: Bearer <access token>` and no body: deletes the signed-in user's
 * account for good (listings, photos, scans, favorites, profile, and the Auth user).
 */
export const ACCOUNT_PATH = '/api/account';

/** Successful response of `DELETE ACCOUNT_PATH`. */
export interface DeleteAccountResponse {
  deleted: true;
  /** Storage objects removed (photos, raw scans, models, avatar). */
  removedFiles: number;
}

/** Successful response of `processScanPath` and `processUserScanPath`: the scan is `ready`. */
export interface ProcessScanResponse {
  scanId: string;
  status: 'ready';
  modelPath: string;
  schemaVersion: number;
  converterVersion: string;
  totalAreaM2: number;
  /** How often each conversion warning occurred. */
  warnings: Record<string, number>;
}
