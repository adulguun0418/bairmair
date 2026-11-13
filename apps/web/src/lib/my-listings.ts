'use client';

import { UNIQUE_VIOLATION, type ListingFields } from '@bairmair/browse';
import {
  BUCKETS,
  CONTENT_TYPES,
  listingPhotoPath,
  publicObjectUrl,
  scanRawPaths,
  type Tables,
} from '@bairmair/db';
import { publicEnv } from './public-env';
import { browserClient } from './supabase-browser';

/**
 * The seller's side of the website: reads and writes the signed-in user's listings directly in
 * Supabase (RLS: owner only), the same tables, paths and order of operations as the app's sync
 * engine (`apps/mobile/src/listings/remote.ts`). The website is online, so nothing is queued:
 * every call either succeeds or reports an error to show.
 */

export type MyListingRow = Tables<'listings'>;

export interface MyPhoto {
  id: string;
  sortOrder: number;
  url: string;
}

export interface MyListing {
  row: MyListingRow;
  /** The exact pin and apartment number (listing_private), or null if not set yet. */
  pin: { lat: number; lng: number } | null;
  unitNumber: string | null;
  photos: MyPhoto[];
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export type MyListingSummary = Pick<
  MyListingRow,
  'id' | 'title' | 'type' | 'status' | 'price' | 'currency' | 'has_3d' | 'updated_at'
>;

/** The user's listings (any status), most recently changed first. */
export async function fetchMyListings(ownerId: string): Promise<MyListingSummary[]> {
  const { data, error } = await browserClient()
    .from('listings')
    .select('id, title, type, status, price, currency, has_3d, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  fail(error);
  return data ?? [];
}

/** One of the user's listings with its private location and photos, or null if not theirs. */
export async function loadMyListing(id: string, ownerId: string): Promise<MyListing | null> {
  const client = browserClient();
  const [listing, privateRow, photos] = await Promise.all([
    client.from('listings').select('*').eq('id', id).eq('owner_id', ownerId).maybeSingle(),
    client
      .from('listing_private')
      .select('lat, lng, unit_number')
      .eq('listing_id', id)
      .maybeSingle(),
    client
      .from('listing_photos')
      .select('id, sort_order')
      .eq('listing_id', id)
      .order('sort_order', { ascending: true }),
  ]);
  fail(listing.error);
  fail(privateRow.error);
  fail(photos.error);
  if (!listing.data) return null;
  return {
    row: listing.data,
    pin: privateRow.data ? { lat: privateRow.data.lat, lng: privateRow.data.lng } : null,
    unitNumber: privateRow.data?.unit_number ?? null,
    photos: (photos.data ?? []).map((photo) => ({
      id: photo.id,
      sortOrder: photo.sort_order,
      url: photoUrl(id, photo.id),
    })),
  };
}

export function photoUrl(listingId: string, photoId: string): string {
  return publicObjectUrl(
    publicEnv.supabaseUrl,
    BUCKETS.listingPhotos,
    listingPhotoPath(listingId, photoId),
  );
}

/** Creates the listing (a draft) with a client id, or saves its fields. */
export async function saveListingFields(
  id: string,
  fields: ListingFields,
  isNew: boolean,
): Promise<MyListingRow> {
  const client = browserClient();
  const result = isNew
    ? await client
        .from('listings')
        .insert({ id, ...fields })
        .select('*')
        .single()
    : await client.from('listings').update(fields).eq('id', id).select('*').single();
  fail(result.error);
  return result.data!;
}

/**
 * The exact pin and apartment number. Update first, insert if there is no row yet (an upsert
 * would also update `listing_id`, which has no update grant).
 */
export async function savePrivate(
  listingId: string,
  pin: { lat: number; lng: number },
  unitNumber: string | null,
): Promise<void> {
  const client = browserClient();
  const values = { lat: pin.lat, lng: pin.lng, unit_number: unitNumber };
  const update = () =>
    client.from('listing_private').update(values).eq('listing_id', listingId).select('listing_id');
  const updated = await update();
  fail(updated.error);
  if ((updated.data?.length ?? 0) > 0) return;
  const inserted = await client
    .from('listing_private')
    .insert({ listing_id: listingId, ...values });
  if (inserted.error?.code === UNIQUE_VIOLATION) {
    fail((await update()).error);
    return;
  }
  fail(inserted.error);
}

/** Uploads a prepared JPEG and adds it after the other photos. */
export async function addPhoto(
  listingId: string,
  photo: { blob: Blob; width: number; height: number },
  sortOrder: number,
): Promise<MyPhoto> {
  const client = browserClient();
  const id = crypto.randomUUID();
  const path = listingPhotoPath(listingId, id);
  const upload = await client.storage.from(BUCKETS.listingPhotos).upload(path, photo.blob, {
    contentType: CONTENT_TYPES.jpeg,
    cacheControl: '3600',
    upsert: true,
  });
  fail(upload.error);
  const row = await client.from('listing_photos').insert({
    id,
    listing_id: listingId,
    storage_path: path,
    sort_order: sortOrder,
    width: photo.width,
    height: photo.height,
  });
  if (row.error) {
    // Do not leave an orphan file behind (e.g. the 40-photo limit refused the row).
    await client.storage.from(BUCKETS.listingPhotos).remove([path]);
    fail(row.error);
  }
  return { id, sortOrder, url: photoUrl(listingId, id) };
}

export async function removePhoto(listingId: string, photoId: string): Promise<void> {
  const client = browserClient();
  fail((await client.from('listing_photos').delete().eq('id', photoId)).error);
  fail(
    (
      await client.storage
        .from(BUCKETS.listingPhotos)
        .remove([listingPhotoPath(listingId, photoId)])
    ).error,
  );
}

/** Saves the given order (index = sort_order) for photos whose position changed. */
export async function savePhotoOrder(photos: readonly MyPhoto[]): Promise<void> {
  const client = browserClient();
  await Promise.all(
    photos.map(async (photo, index) => {
      if (photo.sortOrder === index) return;
      fail(
        (await client.from('listing_photos').update({ sort_order: index }).eq('id', photo.id))
          .error,
      );
    }),
  );
}

export async function setListingStatus(
  id: string,
  status: MyListingRow['status'],
): Promise<MyListingRow> {
  const result = await browserClient()
    .from('listings')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (result.error) throw result.error;
  return result.data;
}

/** "Still available": keeps a published listing in search for another 14 days. */
export async function confirmAvailable(id: string): Promise<string> {
  const { data, error } = await browserClient().rpc('confirm_listing_available', {
    p_listing_id: id,
  });
  fail(error);
  return data!;
}

/**
 * Deletes the listing: its photo and raw scan files first (the storage policies look up the
 * listing to check the owner), then the row; private location, photos and scans cascade.
 */
export async function deleteMyListing(id: string): Promise<void> {
  const client = browserClient();
  const photos = await client.storage.from(BUCKETS.listingPhotos).list(id, { limit: 1000 });
  fail(photos.error);
  const photoPaths = (photos.data ?? []).map((entry) => `${id}/${entry.name}`);
  if (photoPaths.length > 0) {
    fail((await client.storage.from(BUCKETS.listingPhotos).remove(photoPaths)).error);
  }
  const scans = await client.from('room_scans').select('id').eq('listing_id', id);
  fail(scans.error);
  const rawPaths = (scans.data ?? []).flatMap((scan) => {
    const paths = scanRawPaths(id, scan.id);
    return [paths.json, paths.usdz];
  });
  if (rawPaths.length > 0) {
    fail((await client.storage.from(BUCKETS.scanRaw).remove(rawPaths)).error);
  }
  fail((await client.from('listings').delete().eq('id', id)).error);
}
