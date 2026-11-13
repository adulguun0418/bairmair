import { dbErrorKey } from '@bairmair/db';

/**
 * - `transient`: the network, a timeout or the server; retried with backoff
 * - `permanent`: the server rejected the data; retried only after the seller edits the listing
 * - `signedOut`: no session; everything waits for sign-in
 */
export type SyncErrorKind = 'transient' | 'permanent' | 'signedOut';

/** Message keys under `listings.syncErrors`. */
export type SyncErrorKey =
  | 'network'
  | 'server'
  | 'rejected'
  | 'listingMissing'
  | 'tooManyPhotos'
  | 'signedOut'
  /** Publishing refused: the account has no verified phone number. */
  | 'needsVerifiedPhone'
  /** Publishing refused: no photo row yet. */
  | 'needsPhoto'
  /** A live listing must have price, rooms, area, district and location. */
  | 'incomplete'
  /** The scan row is gone (deleted on another phone). Handled by the engine, never shown. */
  | 'scanMissing';

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    readonly key: SyncErrorKey,
    message?: string,
  ) {
    super(message ?? key);
    this.name = 'SyncError';
  }
}

export function toSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  // fetch() rejects with a TypeError when there is no connection; anything unexpected is
  // treated as temporary too, so nothing is ever stuck because of an unknown error.
  const message = error instanceof Error ? error.message : String(error);
  return new SyncError('transient', 'network', message);
}

/** A PostgREST error (`{ code, message }`) and the HTTP status of its response. */
export function classifyPostgrestError(
  error: { code?: string; message?: string },
  status: number,
): SyncError {
  const code = error.code ?? '';
  const message = error.message ?? '';
  switch (dbErrorKey(error)) {
    case 'too_many_photos':
      return new SyncError('permanent', 'tooManyPhotos', message);
    case 'publish_requires_verified_phone':
      return new SyncError('permanent', 'needsVerifiedPhone', message);
    case 'publish_requires_photo':
      return new SyncError('permanent', 'needsPhoto', message);
    default:
      break;
  }
  if (code === '23514' && message.includes('listings_complete_when_live')) {
    return new SyncError('permanent', 'incomplete', message);
  }
  // Expired or invalid token: the next attempt refreshes the session first.
  if (code.startsWith('PGRST3')) return new SyncError('transient', 'server', message);
  // Constraint, data, privilege (RLS 42501) and raised errors: the data itself is refused.
  if (/^(22|23|42|P0)/.test(code)) return new SyncError('permanent', 'rejected', message);
  if (status === 0 || status >= 500 || status === 408 || status === 429) {
    return new SyncError('transient', status === 0 ? 'network' : 'server', message);
  }
  if (status >= 400) return new SyncError('permanent', 'rejected', message);
  // supabase-js reports a failed fetch with an empty code and no HTTP status.
  return new SyncError('transient', 'network', message);
}

/**
 * The response of a Storage upload. Storage wraps most errors in HTTP 400 with the real status
 * in the body: `{ "statusCode": "403", "error": "Unauthorized", "message": "..." }`.
 */
export function classifyStorageResponse(status: number, body: string): SyncError | null {
  if (status >= 200 && status < 300) return null;
  let inner = status;
  let message = body;
  try {
    const parsed = JSON.parse(body) as { statusCode?: string | number; message?: string };
    if (parsed.statusCode !== undefined) inner = Number(parsed.statusCode) || status;
    if (parsed.message) message = parsed.message;
  } catch {
    // Not JSON (a proxy error page): use the HTTP status.
  }
  if (/jwt|exp|token/i.test(message) && (inner === 400 || inner === 401 || inner === 403)) {
    return new SyncError('transient', 'server', message);
  }
  if (inner >= 500 || inner === 408 || inner === 429) {
    return new SyncError('transient', 'server', message);
  }
  return new SyncError('permanent', 'rejected', message);
}
