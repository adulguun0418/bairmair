/**
 * Contract of the web server's API routes, shared by the route handlers and the apps.
 * Errors are `{ "error": ApiErrorKey }` (see `errors.ts`).
 */

/** `POST` with `Authorization: Bearer <access token>` and no body. */
export function processScanPath(scanId: string): string {
  return `/api/scans/${encodeURIComponent(scanId)}/process`;
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

/** Successful response of `processScanPath`: the scan is `ready` and current. */
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
