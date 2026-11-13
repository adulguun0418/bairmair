import {
  BUCKETS,
  CONTENT_TYPES,
  isInMongolia,
  listingPhotoPath,
  processScanPath,
  scanRawPaths,
  type Json,
  type ProcessScanResponse,
  type TypedSupabaseClient,
} from '@bairmair/db';
import type { ListingRemote, ProcessResult } from './sync-engine';
import { classifyPostgrestError, classifyStorageResponse, SyncError } from './sync-errors';

/** Sends a file from the phone as the raw request body. Resolves for any HTTP status. */
export type UploadFile = (
  url: string,
  fileUri: string,
  headers: Record<string, string>,
) => Promise<{ status: number; body: string }>;

interface Options {
  supabaseUrl: string;
  publishableKey: string;
  /** Native file upload (expo-file-system), so photos stream from disk instead of memory. */
  uploadFile: UploadFile;
  /** The web app's base URL, which hosts `POST /api/scans/{id}/process`. */
  apiUrl: string;
  /** Replaceable in tests. */
  fetch?: typeof fetch;
}

const clip = (value: string | null | undefined, max: number) =>
  value ? value.slice(0, max) : null;

interface PostgrestResult {
  error: { code?: string; message?: string } | null;
  status: number;
}

const UNIQUE_VIOLATION = '23505';

function check(result: PostgrestResult, options: { duplicateOk?: boolean } = {}): void {
  if (!result.error) return;
  if (options.duplicateOk && result.error.code === UNIQUE_VIOLATION) return;
  throw classifyPostgrestError(result.error, result.status);
}

/** storage-js errors: `StorageApiError` has the HTTP status, `StorageUnknownError` is a failed fetch. */
function checkStorage(error: unknown): void {
  if (!error) return;
  const { status, message } = error as { status?: unknown; message?: string };
  if (typeof status !== 'number') throw new SyncError('transient', 'network', message);
  throw classifyStorageResponse(status, JSON.stringify({ statusCode: status, message }))!;
}

/** The sync engine's view of Supabase: listings, listing_private, listing_photos and Storage. */
export function createSupabaseRemote(client: TypedSupabaseClient, options: Options): ListingRemote {
  const storageBase = `${options.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object`;
  const apiBase = options.apiUrl.replace(/\/+$/, '');
  const fetcher = options.fetch ?? fetch;

  async function accessToken(): Promise<string> {
    const { data, error } = await client.auth.getSession();
    if (data.session) return data.session.access_token;
    // getSession refreshes an expired token; without a connection that fails, which is not
    // the same as being signed out.
    if (error) throw new SyncError('transient', 'network', error.message);
    throw new SyncError('signedOut', 'signedOut');
  }

  async function upload(bucket: string, path: string, fileUri: string, contentType: string) {
    const token = await accessToken();
    const response = await options.uploadFile(`${storageBase}/${bucket}/${path}`, fileUri, {
      Authorization: `Bearer ${token}`,
      apikey: options.publishableKey,
      'Content-Type': contentType,
      'cache-control': 'max-age=3600',
      // The same id always holds the same file, so a repeated upload just overwrites.
      'x-upsert': 'true',
    });
    const error = classifyStorageResponse(response.status, response.body);
    if (error) throw error;
  }

  return {
    async currentUserId() {
      const { data, error } = await client.auth.getSession();
      if (data.session) return data.session.user.id;
      if (error) throw new SyncError('transient', 'network', error.message);
      return null;
    },

    async createListing(id, fields) {
      // A retried insert whose first response was lost finds its own row: that is success.
      check(await client.from('listings').insert({ id, ...fields }), { duplicateOk: true });
    },

    async updateListing(id, fields) {
      const result = await client.from('listings').update(fields).eq('id', id).select('id');
      check(result);
      if (result.data?.length === 0) throw new SyncError('permanent', 'listingMissing');
    },

    async savePrivate(listingId, { lat, lng, unitNumber }) {
      // Update first, insert if there is no row yet. (An upsert would also try to update
      // listing_id, which the column grants do not allow.)
      const values = { lat, lng, unit_number: unitNumber };
      const update = () =>
        client
          .from('listing_private')
          .update(values)
          .eq('listing_id', listingId)
          .select('listing_id');
      const updated = await update();
      check(updated);
      if ((updated.data?.length ?? 0) > 0) return;
      const inserted = await client
        .from('listing_private')
        .insert({ listing_id: listingId, ...values });
      if (inserted.error?.code === UNIQUE_VIOLATION) {
        check(await update());
        return;
      }
      check(inserted);
    },

    async uploadPhoto(listingId, photoId, fileUri) {
      const path = listingPhotoPath(listingId, photoId);
      await upload(BUCKETS.listingPhotos, path, fileUri, CONTENT_TYPES.jpeg);
    },

    async insertPhoto(listingId, photo) {
      check(
        await client.from('listing_photos').insert({
          id: photo.id,
          listing_id: listingId,
          storage_path: listingPhotoPath(listingId, photo.id),
          sort_order: photo.sortOrder,
          width: photo.width,
          height: photo.height,
        }),
        { duplicateOk: true },
      );
    },

    async reorderPhoto(photoId, sortOrder) {
      // A photo deleted elsewhere matches no row; there is nothing left to order.
      check(
        await client.from('listing_photos').update({ sort_order: sortOrder }).eq('id', photoId),
      );
    },

    async removePhoto(listingId, photoId) {
      check(await client.from('listing_photos').delete().eq('id', photoId));
      const { error } = await client.storage
        .from(BUCKETS.listingPhotos)
        .remove([listingPhotoPath(listingId, photoId)]);
      checkStorage(error);
    },

    async deleteListing(listingId) {
      // Files first: the storage policies look up the listing to check its owner. Files the
      // server wrote (scan-models) stay; the client cannot delete them.
      const photos = await client.storage
        .from(BUCKETS.listingPhotos)
        .list(listingId, { limit: 1000 });
      checkStorage(photos.error);
      const photoPaths = (photos.data ?? []).map((entry) => `${listingId}/${entry.name}`);
      if (photoPaths.length > 0) {
        checkStorage((await client.storage.from(BUCKETS.listingPhotos).remove(photoPaths)).error);
      }

      const scans = await client.from('room_scans').select('id').eq('listing_id', listingId);
      check(scans);
      const rawPaths = (scans.data ?? []).flatMap((scan) => {
        const paths = scanRawPaths(listingId, scan.id);
        return [paths.json, paths.usdz];
      });
      if (rawPaths.length > 0) {
        checkStorage((await client.storage.from(BUCKETS.scanRaw).remove(rawPaths)).error);
      }

      // Rows below the listing (private, photos, scans) cascade.
      check(await client.from('listings').delete().eq('id', listingId));
    },

    async setStatus(listingId, status) {
      const result = await client
        .from('listings')
        .update({ status })
        .eq('id', listingId)
        .select('id');
      check(result);
      if (result.data?.length === 0) throw new SyncError('permanent', 'listingMissing');
    },

    async createScan(listingId, scan) {
      const paths = scanRawPaths(listingId, scan.id);
      // A location outside Mongolia would fail the column check; the scan is still worth keeping.
      const location =
        scan.location && isInMongolia(scan.location.lat, scan.location.lng) ? scan.location : null;
      check(
        await client.from('room_scans').insert({
          id: scan.id,
          listing_id: listingId,
          raw_json_path: paths.json,
          usdz_path: paths.usdz,
          device_model: clip(scan.device?.modelId, 40),
          ios_version: clip(scan.device?.osVersion, 20),
          app_version: clip(scan.appVersion, 20),
          scan_lat: location?.lat ?? null,
          scan_lng: location?.lng ?? null,
          scan_accuracy_m:
            location?.accuracyM === null || location?.accuracyM === undefined
              ? null
              : Math.min(location.accuracyM, 10_000),
        }),
        { duplicateOk: true },
      );
    },

    async saveRoomLabels(scanId, labels) {
      const result = await client
        .from('room_scans')
        .update({ room_labels: labels as unknown as Json })
        .eq('id', scanId)
        .select('id');
      check(result);
      if (result.data?.length === 0) throw new SyncError('permanent', 'scanMissing');
    },

    async assignPhotoRoom(photoId, room) {
      // A photo deleted elsewhere matches no row; there is nothing left to assign.
      check(
        await client
          .from('listing_photos')
          .update({ scan_id: room?.scanId ?? null, room_id: room?.roomId ?? null })
          .eq('id', photoId),
      );
    },

    async uploadScanFile(listingId, scanId, file, fileUri) {
      const paths = scanRawPaths(listingId, scanId);
      await upload(
        BUCKETS.scanRaw,
        paths[file],
        fileUri,
        file === 'json' ? CONTENT_TYPES.json : CONTENT_TYPES.usdz,
      );
    },

    async processScan(scanId): Promise<ProcessResult> {
      const token = await accessToken();
      let response: Response;
      try {
        response = await fetcher(`${apiBase}${processScanPath(scanId)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        throw new SyncError('transient', 'network', String(error));
      }
      switch (response.status) {
        case 200: {
          const body = (await response.json()) as ProcessScanResponse;
          return { kind: 'ready', totalAreaM2: body.totalAreaM2 };
        }
        case 404:
          return { kind: 'notFound' };
        case 409:
          return { kind: 'filesMissing' };
        case 422:
          return { kind: 'failed' };
        default:
          // 401 (token expired on the way: refreshed next time), 5xx, proxies: try again later.
          throw new SyncError('transient', 'server', `process: HTTP ${response.status}`);
      }
    },

    async removeScan(listingId, scanId) {
      const paths = scanRawPaths(listingId, scanId);
      checkStorage(
        (await client.storage.from(BUCKETS.scanRaw).remove([paths.json, paths.usdz])).error,
      );
      check(await client.from('room_scans').delete().eq('id', scanId));
    },
  };
}
