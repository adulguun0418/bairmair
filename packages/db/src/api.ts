/**
 * Contract of the web server's API routes, shared by the route handlers and the apps.
 * Errors are `{ "error": ApiErrorKey }` (see `errors.ts`).
 */

/** `POST` with `Authorization: Bearer <access token>` and no body. */
export function processScanPath(scanId: string): string {
  return `/api/scans/${encodeURIComponent(scanId)}/process`;
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
