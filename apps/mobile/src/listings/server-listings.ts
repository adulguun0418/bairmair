import type { Json, Tables, TypedSupabaseClient } from '@bairmair/db';
import { ROOM_LABELS, type RoomLabel, type RoomLabelOverride } from '@bairmair/room-model';
import { formFromRow } from './form';
import type { LocalListing, LocalPhoto, LocalScan } from './model';
import { classifyPostgrestError } from './sync-errors';

export type ServerListingSummary = Pick<
  Tables<'listings'>,
  'id' | 'title' | 'type' | 'status' | 'price' | 'currency' | 'has_3d' | 'updated_at'
>;

/** The signed-in user's listings on the server (any status), newest first. */
export async function fetchMyListings(
  client: TypedSupabaseClient,
  ownerId: string,
): Promise<ServerListingSummary[]> {
  const result = await client
    .from('listings')
    .select('id, title, type, status, price, currency, has_3d, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
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
        'id, status, metrics, room_labels, created_at, device_model, ios_version, app_version, scan_lat, scan_lng, scan_accuracy_m',
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
  const scan = scanRow ? scanFromRow(scanRow) : null;

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
  | 'scan_lat'
  | 'scan_lng'
  | 'scan_accuracy_m'
>;

const LABELS: ReadonlySet<string> = new Set(ROOM_LABELS);

/** `room_scans.room_labels` is JSON written by phones; keep only well-formed entries. */
export function parseRoomLabels(value: Json): Record<string, RoomLabelOverride> {
  const labels: Record<string, RoomLabelOverride> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return labels;
  for (const [roomId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const override: RoomLabelOverride = {};
    if (typeof entry.label === 'string' && LABELS.has(entry.label)) {
      override.label = entry.label as RoomLabel;
    }
    if (typeof entry.name === 'string' && entry.name.trim() !== '') override.name = entry.name;
    labels[roomId] = override;
  }
  return labels;
}

/** A scan on the server, as this phone tracks it. Its raw files stay on the server. */
export function scanFromRow(row: ScanRow): LocalScan {
  const metrics = row.metrics as { totalAreaM2?: unknown } | null;
  return {
    id: row.id,
    createdAt: row.created_at,
    files: null,
    device: { modelId: row.device_model, osVersion: row.ios_version },
    appVersion: row.app_version,
    location:
      row.scan_lat !== null && row.scan_lng !== null
        ? {
            lat: row.scan_lat,
            lng: row.scan_lng,
            accuracyM: row.scan_accuracy_m,
            capturedAt: row.created_at,
          }
        : null,
    row: 'created',
    // Only the phone that scanned could upload; this one asks the server to process, at most.
    uploaded: { json: true, usdz: true },
    processing: row.status === 'ready' ? 'ready' : row.status === 'failed' ? 'failed' : 'pending',
    totalAreaM2: typeof metrics?.totalAreaM2 === 'number' ? metrics.totalAreaM2 : null,
    roomLabels: parseRoomLabels(row.room_labels),
    labelsRev: 0,
    labelsSyncedRev: 0,
  };
}
