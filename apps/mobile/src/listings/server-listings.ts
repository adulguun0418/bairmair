import type { Tables, TypedSupabaseClient } from '@bairmair/db';
import { formFromRow } from './form';
import type { LocalListing, LocalPhoto } from './model';
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
  const [listing, privateRow, photos] = await Promise.all([
    client.from('listings').select('*').eq('id', id).eq('owner_id', ownerId).single(),
    client
      .from('listing_private')
      .select('lat, lng, unit_number, updated_at')
      .eq('listing_id', id)
      .maybeSingle(),
    client
      .from('listing_photos')
      .select('id, width, height, sort_order')
      .eq('listing_id', id)
      .order('sort_order')
      .order('created_at'),
  ]);
  for (const result of [listing, privateRow, photos]) {
    if (result.error) throw classifyPostgrestError(result.error, result.status);
  }
  const row = listing.data!;
  const location = privateRow.data;

  const localPhotos = (photos.data ?? []).map((photo, index): LocalPhoto => ({
    id: photo.id,
    file: null,
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    state: 'saved',
    // Rows may share a sort_order (or have gaps); the next sync numbers them 0, 1, 2…
    savedSortOrder: photo.sort_order === index ? index : null,
  }));

  return {
    version: 1,
    id: row.id,
    ownerId,
    createdAt: row.created_at,
    updatedAt: now,
    status: row.status,
    form: formFromRow(row, location?.unit_number),
    location: location
      ? { lat: location.lat, lng: location.lng, accuracyM: null, capturedAt: location.updated_at }
      : null,
    photos: localPhotos,
    removedPhotoIds: [],
    deleted: false,
    remote: { createAttempted: true, created: true },
    rev: 1,
    syncedRev: 1,
    privateRev: 1,
    privateSyncedRev: 1,
    editVersion: 0,
  };
}
