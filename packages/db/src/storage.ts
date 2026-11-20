/**
 * Storage buckets and object paths. The storage policies in
 * `supabase/migrations/*_storage.sql` check these shapes (first segment = listing id or user id),
 * so every app and the server build paths only through these helpers.
 */

export const BUCKETS = {
  /** Public. `{listingId}/{photoId}.jpg`, written by the listing owner. */
  listingPhotos: 'listing-photos',
  /** Private. `{listingId}/{scanId}/capture.json|capture.usdz`, written by the listing owner. */
  scanRaw: 'scan-raw',
  /** Public. `{listingId}/{scanId}/model.json|floorplan.png`, written by the server only. */
  scanModels: 'scan-models',
  /** Public. `{userId}/avatar.jpg`, written by the user. */
  avatars: 'avatars',
  /** Private. bairmair scan: `{ownerId}/{scanId}/capture.json|capture.usdz`, written by the owner. */
  userScanRaw: 'user-scan-raw',
  /** Private. bairmair scan: `{ownerId}/{scanId}/model.json`, written by the server only. */
  userScanModels: 'user-scan-models',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Content types the buckets accept (mirrors `allowed_mime_types`). */
export const CONTENT_TYPES = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
  json: 'application/json',
  usdz: 'model/vnd.usdz+zip',
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function assertUuid(value: string, name: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${name} must be a lowercase UUID, got "${value}"`);
  }
}

export function listingPhotoPath(listingId: string, photoId: string): string {
  assertUuid(listingId, 'listingId');
  assertUuid(photoId, 'photoId');
  return `${listingId}/${photoId}.jpg`;
}

export interface ScanRawPaths {
  json: string;
  usdz: string;
}

export function scanRawPaths(listingId: string, scanId: string): ScanRawPaths {
  assertUuid(listingId, 'listingId');
  assertUuid(scanId, 'scanId');
  const dir = `${listingId}/${scanId}`;
  return { json: `${dir}/capture.json`, usdz: `${dir}/capture.usdz` };
}

export interface ScanModelPaths {
  model: string;
  floorPlanPng: string;
}

export function scanModelPaths(listingId: string, scanId: string): ScanModelPaths {
  assertUuid(listingId, 'listingId');
  assertUuid(scanId, 'scanId');
  const dir = `${listingId}/${scanId}`;
  return { model: `${dir}/model.json`, floorPlanPng: `${dir}/floorplan.png` };
}

/** Raw export of a bairmair scan (`user_scans`), in the owner's folder of `user-scan-raw`. */
export function userScanRawPaths(ownerId: string, scanId: string): ScanRawPaths {
  assertUuid(ownerId, 'ownerId');
  assertUuid(scanId, 'scanId');
  const dir = `${ownerId}/${scanId}`;
  return { json: `${dir}/capture.json`, usdz: `${dir}/capture.usdz` };
}

/** Converted model of a bairmair scan, in `user-scan-models` (private; read by the server). */
export function userScanModelPath(ownerId: string, scanId: string): string {
  assertUuid(ownerId, 'ownerId');
  assertUuid(scanId, 'scanId');
  return `${ownerId}/${scanId}/model.json`;
}

export function avatarPath(userId: string): string {
  assertUuid(userId, 'userId');
  return `${userId}/avatar.jpg`;
}

/** Public URL of an object in a public bucket. Does not check that the object exists. */
export function publicObjectUrl(
  supabaseUrl: string,
  bucket: Exclude<
    BucketName,
    typeof BUCKETS.scanRaw | typeof BUCKETS.userScanRaw | typeof BUCKETS.userScanModels
  >,
  path: string,
): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}
