import type { Tables, TypedSupabaseClient } from '@bairmair/db';
import { parseRoomLabelOverrides } from '@bairmair/room-model';
import { formFromRow } from '@bairmair/browse';
import type { LocalListing, LocalPhoto, LocalScan } from './model';
import { classifyPostgrestError } from './sync-errors';

export type ServerListingSummary = Pick<
  Tables<'listings'>,
  | 'id'
  | 'title'
  | 'type'
  | 'status'
  | 'price'
  | 'currency'
  | 'has_3d'
  | 'updated_at'
  | 'last_confirmed_at'
>;

/** The signed-in user's listings on the server (any status), newest first. */
export async function fetchMyListings(
  client: TypedSupabaseClient,
  ownerId: string,
): Promise<ServerListingSummary[]> {
  const result = await client
    .from('listings')
    .select('id, title, type, status, price, currency, has_3d, updated_at, last_confirmed_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (result.error) throw classifyPostgrestError(result.error, result.status);
  return result.data;
}

/**
 * When the seller last confirmed a listing is still available (set on publish too), or null.
 * Server-maintained, so it is read when needed rather than kept on the phone.
 */
export async function fetchLastConfirmed(
  client: TypedSupabaseClient,
  id: string,
): Promise<string | null> {
  const result = await client
    .from('listings')
    .select('last_confirmed_at')
    .eq('id', id)
    .maybeSingle();
  if (result.error) throw classifyPostgrestError(result.error, result.status);
  return result.data?.last_confirmed_at ?? null;
}

/**
 * "Still available": keeps a published listing in search for another 14 days. Returns the new
 * confirmation time. Online only: there is nothing to queue, the seller just tries again.
 */
export async function confirmAvailable(client: TypedSupabaseClient, id: string): Promise<string> {
  const result = await client.rpc('confirm_listing_available', { p_listing_id: id });
  if (result.error) throw classifyPostgrestError(result.error, result.status);
  return result.data;
}

/**
 * Builds a local copy of a listing that exists on the server, so it can be edited on this phone.
 * Its photos stay on the server (`file: null`) and are shown from their public URLs.
 */
export async function downloadListing(
  client: TypedSupabaseClient,
  id: string,
  ownerId: string,
  now: string,
): Promise<LocalListing> {
  const [listing, privateRow, photos, scans] = await Promise.all([
    client.from('listings').select('*').eq('id', id).eq('owner_id', ownerId).single(),
    client
      .from('listing_private')
      .select('lat, lng, unit_number, updated_at')
      .eq('listing_id', id)
      .maybeSingle(),
    client
      .from('listing_photos')
      .select('id, width, height, sort_order, scan_id, room_id')
      .eq('listing_id', id)
      .order('sort_order')
      .order('created_at'),
    // The current scan, else the newest (still processing, or failed).
    client
      .from('room_scans')
      .select(
        'id, status, metrics, room_labels, created_at, device_model, ios_version, app_version',
      )
      .eq('listing_id', id)
      .order('is_current', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  for (const result of [listing, privateRow, photos, scans]) {
    if (result.error) throw classifyPostgrestError(result.error, result.status);
  }
  const row = listing.data!;
  const location = privateRow.data;
  const scanRow = scans.data?.[0];
  let scan: LocalScan | null = null;
  if (scanRow) {
    // The scan's GPS fix is not readable from the table (it is close to the exact location);
    // the owner gets it through an RPC.
    const fix = await client.rpc('scan_location', { p_scan_id: scanRow.id }).maybeSingle();
    if (fix.error) throw classifyPostgrestError(fix.error, fix.status);
    scan = scanFromRow(scanRow, fix.data);
  }

  const localPhotos = (photos.data ?? []).map((photo, index): LocalPhoto => ({
    id: photo.id,
    file: null,
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    state: 'saved',
    // Rows may share a sort_order (or have gaps); the next sync numbers them 0, 1, 2…
    savedSortOrder: photo.sort_order === index ? index : null,
    roomId: scan && photo.scan_id === scan.id ? photo.room_id : null,
    savedRoom:
      photo.scan_id && photo.room_id ? { scanId: photo.scan_id, roomId: photo.room_id } : null,
  }));

  return {
    version: 1,
    id: row.id,
    ownerId,
    createdAt: row.created_at,
    updatedAt: now,
    status: row.status,
    serverStatus: row.status,
    statusRev: 0,
    statusSyncedRev: 0,
    form: formFromRow(row, location?.unit_number),
    location: location
      ? { lat: location.lat, lng: location.lng, accuracyM: null, capturedAt: location.updated_at }
      : null,
    photos: localPhotos,
    removedPhotoIds: [],
    scan,
    removedScanIds: [],
    deleted: false,
    remote: { createAttempted: true, created: true },
    rev: 1,
    syncedRev: 1,
    privateRev: 1,
    privateSyncedRev: 1,
    editVersion: 0,
  };
}

type ScanRow = Pick<
  Tables<'room_scans'>,
  | 'id'
  | 'status'
  | 'metrics'
  | 'room_labels'
  | 'created_at'
  | 'device_model'
  | 'ios_version'
  | 'app_version'
>;

/** A row of the `scan_location` RPC. */
export interface ScanFix {
  lat: number;
  lng: number;
  accuracy_m: number | null;
}

/** A scan on the server, as this phone tracks it. Its raw files stay on the server. */
export function scanFromRow(row: ScanRow, fix: ScanFix | null): LocalScan {
  const metrics = row.metrics as { totalAreaM2?: unknown } | null;
  return {
    id: row.id,
    createdAt: row.created_at,
    files: null,
    device: { modelId: row.device_model, osVersion: row.ios_version },
    appVersion: row.app_version,
    location: fix
      ? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracy_m, capturedAt: row.created_at }
      : null,
    row: 'created',
    // Only the phone that scanned could upload; this one asks the server to process, at most.
    uploaded: { json: true, usdz: true },
    processing: row.status === 'ready' ? 'ready' : row.status === 'failed' ? 'failed' : 'pending',
    totalAreaM2: typeof metrics?.totalAreaM2 === 'number' ? metrics.totalAreaM2 : null,
    roomLabels: parseRoomLabelOverrides(row.room_labels),
    labelsRev: 0,
    labelsSyncedRev: 0,
  };
}
