import { BUCKETS, listingPhotoPath, publicObjectUrl } from '@bairmair/db';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { analyzeExport } from '@/scanner/analyze';
import { deleteScan as deleteScannerFolder, getScan } from '@/scanner/storage';
import type { ListingStatus } from './form';
import {
  deleteListingFile,
  deletePhotoFile,
  filePersistence,
  listingFiles,
  moveScanFiles,
} from './files';
import {
  addPhotos,
  attachScan,
  isUntouched,
  markDeleted,
  newListing,
  photoSlotsLeft,
  removePhoto,
  removeScan,
  setStatus,
  touch,
  type LocalListing,
  type LocalPhoto,
  type PinnedLocation,
} from './model';
import { preparePhoto } from './photos';
import { createSupabaseRemote, type UploadFile } from './remote';
import { downloadListing } from './server-listings';
import { ListingStore } from './store';
import { SyncEngine, type SyncStatus } from './sync-engine';

// The app's listings: one store (files on the phone) and one sync engine, created at startup.

const uploadFile: UploadFile = async (url, fileUri, headers) => {
  // A background URL session: an upload in progress continues for a while if the app is
  // switched away. If the app is killed, the engine uploads the photo again on next launch.
  const result = await new File(fileUri).upload(url, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers,
  });
  return { status: result.status, body: result.body };
};

export const listingStore = new ListingStore(filePersistence);
listingStore.load();

export const syncEngine = new SyncEngine(
  listingStore,
  createSupabaseRemote(supabase, {
    supabaseUrl: env.supabaseUrl,
    publishableKey: env.supabasePublishableKey,
    uploadFile,
    apiUrl: env.apiUrl,
  }),
  listingFiles,
);

let started = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** Starts syncing: now, whenever the app comes to the foreground, and on sign-in/out. */
export function startListingSync(): void {
  if (started) return;
  started = true;
  void syncEngine.run();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncEngine.retryNow();
  });
  supabase.auth.onAuthStateChange((event) => {
    // Supabase advises against calling its client inside this callback; defer.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      setTimeout(() => void syncEngine.run(), 0);
    }
  });
}

/** Syncs shortly after the last edit, so typing does not send a request per key. */
function syncSoon(delayMs = 1500): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncEngine.run();
  }, delayMs);
}

const nowIso = () => new Date().toISOString();

export function createDraft(ownerId: string): string {
  const id = randomUUID();
  listingStore.put(newListing(id, ownerId, nowIso()));
  return id;
}

/** Applies a user edit and schedules a sync. */
export function editListing(
  id: string,
  change: (listing: LocalListing, now: string) => LocalListing,
) {
  listingStore.update(id, (listing) => change(listing, nowIso()));
  syncSoon();
}

/** A new listing the seller left without entering anything is not kept. */
export function discardIfUntouched(id: string): void {
  const listing = listingStore.get(id);
  if (listing && isUntouched(listing)) {
    listingStore.remove(id);
    void listingStore.flush().then(() => listingFiles.removeFolder(id));
  }
}

/** Deleted on this phone since launch; the server may still list them for a moment. */
const deletedIds = new Set<string>();

/** True if the listing is on this phone, or was deleted here (so it is not offered again). */
export function isKnownLocally(id: string): boolean {
  return listingStore.get(id) !== undefined || deletedIds.has(id);
}

export function deleteListing(id: string): void {
  const listing = listingStore.get(id);
  if (!listing) return;
  deletedIds.add(id);
  if (!listing.remote.createAttempted) {
    // Never sent: nothing to clean up on the server.
    listingStore.remove(id);
    void listingStore.flush().then(() => listingFiles.removeFolder(id));
    return;
  }
  listingStore.update(id, (current) => markDeleted(current, nowIso()));
  void syncEngine.run();
}

/**
 * Removes this owner's listings from the phone without touching the server: after their
 * account was deleted, the server copies are already gone and the files here must go too.
 */
export async function forgetListingsOf(ownerId: string): Promise<void> {
  const mine = listingStore.all().filter((listing) => listing.ownerId === ownerId);
  for (const listing of mine) {
    deletedIds.add(listing.id);
    listingStore.remove(listing.id);
  }
  await listingStore.flush();
  for (const listing of mine) listingFiles.removeFolder(listing.id);
}

/**
 * Resizes the picked photos into the listing folder and adds them in order. Returns how many
 * could not be read. Source files from the picker (in caches) are removed afterwards.
 */
export async function addPickedPhotos(id: string, uris: string[]): Promise<number> {
  let failed = 0;
  for (const uri of uris) {
    const listing = listingStore.get(id);
    if (!listing || photoSlotsLeft(listing) === 0) break;
    try {
      const photo = await preparePhoto(id, uri);
      editListing(id, (current, now) => addPhotos(current, [photo], now));
    } catch (error) {
      console.warn('Could not prepare photo', error);
      failed += 1;
    } finally {
      try {
        const source = new File(uri);
        if (source.exists) source.delete();
      } catch {
        // The picker's copy is in caches; iOS clears it eventually.
      }
    }
  }
  return failed;
}

export function removeListingPhoto(id: string, photo: LocalPhoto): void {
  editListing(id, (listing, now) => removePhoto(listing, photo.id, now));
  deletePhotoFile(id, photo.file);
}

export type AttachScanResult =
  | { ok: true }
  /** - `missing`: the scanner's files are gone; `noUsdz`: the export has no 3D file;
   *  `unreadable`: the converter cannot read it (the scan stays in the RoomPlan test list) */
  | { ok: false; reason: 'missing' | 'noUsdz' | 'unreadable' };

/**
 * Takes a scan the scanner just saved (`Documents/scans/<scannerId>/`) and makes it the
 * listing's scan, replacing any previous one. The files move into the listing folder.
 */
export async function attachScannedRoom(
  listingId: string,
  scannerId: string,
  location: PinnedLocation | null,
): Promise<AttachScanResult> {
  const saved = getScan(scannerId);
  const listing = listingStore.get(listingId);
  if (!saved || !listing) return { ok: false, reason: 'missing' };
  if (!saved.usdz) return { ok: false, reason: 'noUsdz' };
  // The server runs the same converter; a file the phone cannot convert would only fail there.
  if (!analyzeExport(saved.rawJson.textSync()).ok) return { ok: false, reason: 'unreadable' };

  const scanId = randomUUID();
  const files = await moveScanFiles(listingId, scanId, { json: saved.rawJson, usdz: saved.usdz });
  deleteScannerFolder(scannerId);

  const previous = listing.scan?.files;
  editListing(listingId, (current, now) =>
    attachScan(
      current,
      {
        id: scanId,
        createdAt: saved.meta.createdAt || now,
        files,
        device: saved.meta.device,
        appVersion: Constants.expoConfig?.version ?? null,
        location,
      },
      now,
    ),
  );
  if (previous) {
    deleteListingFile(listingId, previous.json);
    deleteListingFile(listingId, previous.usdz);
  }
  return { ok: true };
}

export function removeListingScan(id: string): void {
  const files = listingStore.get(id)?.scan?.files;
  editListing(id, removeScan);
  if (files) {
    deleteListingFile(id, files.json);
    deleteListingFile(id, files.usdz);
  }
}

/** Publish, archive, mark sold/rented, or go back to the server's status. */
export function changeListingStatus(id: string, status: ListingStatus): void {
  listingStore.update(id, (listing) => setStatus(listing, status, nowIso()));
  void syncEngine.run();
}

/** Sends a refused change again, after the seller fixed the cause elsewhere (e.g. their phone). */
export function retryRefusedSync(id: string): void {
  listingStore.update(id, (listing) => touch(listing, nowIso()));
  void syncEngine.run();
}

/** Downloads a listing from the server so it can be edited on this phone. */
export async function downloadToPhone(id: string, ownerId: string): Promise<void> {
  const listing = await downloadListing(supabase, id, ownerId, nowIso());
  listingStore.put(listing);
  void syncEngine.run();
}

/** Where to show a photo from: the file on the phone, else its public URL. */
export function photoUri(listingId: string, photo: LocalPhoto): string {
  if (photo.file && listingFiles.exists(listingId, photo.file)) {
    return listingFiles.uri(listingId, photo.file);
  }
  return publicObjectUrl(
    env.supabaseUrl,
    BUCKETS.listingPhotos,
    listingPhotoPath(listingId, photo.id),
  );
}

export function retrySyncNow(): void {
  void syncEngine.retryNow();
}

// Hooks ---------------------------------------------------------------------------------------

const subscribeStore = (listener: () => void) => listingStore.subscribe(listener);
const subscribeSync = (listener: () => void) => syncEngine.subscribe(listener);

/** The listings on the phone (not deleted), newest edit first. */
export function useLocalListings(): readonly LocalListing[] {
  return useSyncExternalStore(subscribeStore, () => listingStore.visible());
}

export function useLocalListing(id: string): LocalListing | undefined {
  return useSyncExternalStore(subscribeStore, () => listingStore.get(id));
}

export function useSyncStatus(id: string): SyncStatus {
  return useSyncExternalStore(subscribeSync, () => syncEngine.status(id));
}
