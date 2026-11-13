import { isInMongolia, LISTING_LIMITS } from '@bairmair/db';
import type { RoomLabelOverride } from '@bairmair/room-model';
import { EMPTY_FORM, PRIVATE_FIELDS, type ListingForm, type ListingStatus } from '@bairmair/browse';

// A listing as saved on the phone, and the pure changes made to it by the editor (user edits)
// and by the sync engine (progress). Saved as JSON in `Documents/listings/<id>/listing.json`.

export interface PinnedLocation {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres, as reported by the phone. */
  accuracyM: number | null;
  capturedAt: string;
}

/**
 * Upload progress of one photo:
 * - `local`: only on the phone
 * - `uploaded`: the file is in storage, the `listing_photos` row is not written yet
 * - `saved`: the row exists
 */
export type PhotoState = 'local' | 'uploaded' | 'saved';

/** A photo's room in one scan (`listing_photos.scan_id` + `room_id`). */
export interface PhotoRoom {
  scanId: string;
  roomId: string;
}

export interface LocalPhoto {
  /** Also the storage object name: `{listingId}/{id}.jpg`. */
  id: string;
  /** File name in the listing folder; null for a photo that exists only on the server. */
  file: string | null;
  width: number;
  height: number;
  state: PhotoState;
  /** The `sort_order` last written to the row, or null before the row exists. */
  savedSortOrder: number | null;
  /** The room of the listing's current scan the seller put this photo in. */
  roomId: string | null;
  /** The scan and room last written to the row (null: none). */
  savedRoom: PhotoRoom | null;
}

/**
 * Upload progress of a scan:
 * - `row`: the `room_scans` row (`attempted`: an insert was sent, its response may be lost)
 * - `uploaded`: the raw RoomPlan JSON and USDZ in the private `scan-raw` bucket
 * - `processing`: the server's conversion (`POST /api/scans/{id}/process`)
 */
export interface LocalScan {
  /** `room_scans.id`, chosen on the phone, so storage paths exist before the row does. */
  id: string;
  createdAt: string;
  /** Raw files in the listing folder; null for a scan downloaded from the server. */
  files: { json: string; usdz: string } | null;
  device: { modelId: string | null; osVersion: string | null } | null;
  appVersion: string | null;
  /** The phone's best GPS fix during the scan ("scanned on-site"). */
  location: PinnedLocation | null;
  row: 'none' | 'attempted' | 'created';
  uploaded: { json: boolean; usdz: boolean };
  processing: 'pending' | 'ready' | 'failed';
  /** Total scanned area reported by the server, once processed. */
  totalAreaM2: number | null;
  /** The seller's room label corrections (`room_scans.room_labels`), keyed by room id. */
  roomLabels: Record<string, RoomLabelOverride>;
  labelsRev: number;
  labelsSyncedRev: number;
}

export interface LocalListing {
  version: 1;
  id: string;
  /** The user who created the draft; only their session syncs it. */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** The status the seller chose. Sent to the server when `statusRev > statusSyncedRev`. */
  status: ListingStatus;
  /** The last status the server accepted. */
  serverStatus: ListingStatus;
  statusRev: number;
  statusSyncedRev: number;
  form: ListingForm;
  location: PinnedLocation | null;
  /** In display order: the first photo is the cover. */
  photos: LocalPhoto[];
  /** Photos removed on the phone that may still have a row or file on the server. */
  removedPhotoIds: string[];
  /** The listing's scan (one at a time; a rescan replaces it). */
  scan: LocalScan | null;
  /** Replaced or removed scans that may still have a row or raw files on the server. */
  removedScanIds: string[];
  /** Set when the seller deletes the listing; the sync engine removes it everywhere. */
  deleted: boolean;
  remote: {
    /** An insert was sent at least once (its response may have been lost). */
    createAttempted: boolean;
    created: boolean;
  };
  /** Bumped by every change to `listings` columns; `syncedRev` is the last one written. */
  rev: number;
  syncedRev: number;
  /** The same for `listing_private` (location, unit number). */
  privateRev: number;
  privateSyncedRev: number;
  /** Bumped by every user edit; a failed sync is retried once this changes. */
  editVersion: number;
}

export function newListing(id: string, ownerId: string, now: string): LocalListing {
  return {
    version: 1,
    id,
    ownerId,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    serverStatus: 'draft',
    statusRev: 0,
    statusSyncedRev: 0,
    form: { ...EMPTY_FORM },
    location: null,
    photos: [],
    removedPhotoIds: [],
    scan: null,
    removedScanIds: [],
    deleted: false,
    remote: { createAttempted: false, created: false },
    rev: 1,
    syncedRev: 0,
    privateRev: 0,
    privateSyncedRev: 0,
    editVersion: 0,
  };
}

/**
 * Fills fields added after a listing was saved on the phone (5b files have no scan or status
 * revisions). The file format stays version 1: every addition has a safe default.
 */
export function normalizeListing(saved: LocalListing): LocalListing {
  const raw = saved as Partial<LocalListing> & LocalListing;
  return {
    ...raw,
    serverStatus: raw.serverStatus ?? raw.status,
    statusRev: raw.statusRev ?? 0,
    statusSyncedRev: raw.statusSyncedRev ?? 0,
    scan: raw.scan ?? null,
    removedScanIds: raw.removedScanIds ?? [],
    photos: raw.photos.map((photo) => ({
      ...photo,
      roomId: photo.roomId ?? null,
      savedRoom: photo.savedRoom ?? null,
    })),
  };
}

/** The more accurate of two GPS fixes (a fix without accuracy counts as the least accurate). */
export function betterFix(
  current: PinnedLocation | null,
  candidate: PinnedLocation,
): PinnedLocation {
  if (!current) return candidate;
  const accuracy = (fix: PinnedLocation) => fix.accuracyM ?? Number.POSITIVE_INFINITY;
  return accuracy(candidate) < accuracy(current) ? candidate : current;
}

/** Six decimals ≈ 0.1 m: plenty, and keeps the saved numbers short (as on the website). */
const roundCoordinate = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * A pin the seller placed on the map (no GPS, so no accuracy). Null outside Mongolia, which the
 * database refuses.
 */
export function mapPin(lat: number, lng: number, now: string): PinnedLocation | null {
  const pin = { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };
  if (!isInMongolia(pin.lat, pin.lng)) return null;
  return { ...pin, accuracyM: null, capturedAt: now };
}

/** Untouched and never sent: safe to drop when the seller backs out of "new listing". */
export function isUntouched(listing: LocalListing): boolean {
  return (
    !listing.remote.createAttempted &&
    listing.editVersion === 0 &&
    listing.photos.length === 0 &&
    listing.location === null &&
    listing.scan === null
  );
}

/** Published or sold/rented: publicly visible, so the row must stay complete. */
export function isLive(status: ListingStatus): boolean {
  return status === 'published' || status === 'sold_or_rented';
}

// User edits ----------------------------------------------------------------------------------

function edited(listing: LocalListing, now: string, changes: Partial<LocalListing>): LocalListing {
  return { ...listing, ...changes, updatedAt: now, editVersion: listing.editVersion + 1 };
}

export function updateForm(
  listing: LocalListing,
  patch: Partial<ListingForm>,
  now: string,
): LocalListing {
  const keys = (Object.keys(patch) as (keyof ListingForm)[]).filter(
    (key) => patch[key] !== listing.form[key],
  );
  if (keys.length === 0) return listing;
  const touchesPrivate = keys.some((key) => PRIVATE_FIELDS.includes(key));
  const touchesPublic = keys.some((key) => !PRIVATE_FIELDS.includes(key));
  return edited(listing, now, {
    form: { ...listing.form, ...patch },
    rev: touchesPublic ? listing.rev + 1 : listing.rev,
    privateRev: touchesPrivate ? listing.privateRev + 1 : listing.privateRev,
  });
}

export function setLocation(
  listing: LocalListing,
  location: PinnedLocation,
  now: string,
): LocalListing {
  return edited(listing, now, { location, privateRev: listing.privateRev + 1 });
}

export function photoSlotsLeft(listing: LocalListing): number {
  return Math.max(0, LISTING_LIMITS.photos.max - listing.photos.length);
}

export function addPhotos(
  listing: LocalListing,
  photos: Pick<LocalPhoto, 'id' | 'file' | 'width' | 'height'>[],
  now: string,
): LocalListing {
  const added = photos.slice(0, photoSlotsLeft(listing)).map((photo): LocalPhoto => ({
    ...photo,
    state: 'local',
    savedSortOrder: null,
    roomId: null,
    savedRoom: null,
  }));
  if (added.length === 0) return listing;
  return edited(listing, now, { photos: [...listing.photos, ...added] });
}

export function removePhoto(listing: LocalListing, photoId: string, now: string): LocalListing {
  if (!listing.photos.some((photo) => photo.id === photoId)) return listing;
  // Even a `local` photo may be uploading right now, so the server copy is always cleaned up.
  // Deleting a row or file that does not exist is harmless.
  const removedPhotoIds = listing.remote.createAttempted
    ? [...listing.removedPhotoIds, photoId]
    : listing.removedPhotoIds;
  return edited(listing, now, {
    photos: listing.photos.filter((photo) => photo.id !== photoId),
    removedPhotoIds,
  });
}

/** Moves a photo to `toIndex` (clamped). Index 0 is the cover. */
export function movePhoto(
  listing: LocalListing,
  photoId: string,
  toIndex: number,
  now: string,
): LocalListing {
  const from = listing.photos.findIndex((photo) => photo.id === photoId);
  if (from === -1) return listing;
  const to = Math.max(0, Math.min(listing.photos.length - 1, toIndex));
  if (to === from) return listing;
  const photos = [...listing.photos];
  const [photo] = photos.splice(from, 1);
  photos.splice(to, 0, photo!);
  return edited(listing, now, { photos });
}

export function markDeleted(listing: LocalListing, now: string): LocalListing {
  return edited(listing, now, { deleted: true });
}

/** No change, but counts as an edit: a refused sync is tried again (after a fix elsewhere). */
export function touch(listing: LocalListing, now: string): LocalListing {
  return edited(listing, now, {});
}

/** The seller publishes, archives or marks the listing sold/rented. */
export function setStatus(listing: LocalListing, status: ListingStatus, now: string): LocalListing {
  if (status === listing.status) return listing;
  return edited(listing, now, { status, statusRev: listing.statusRev + 1 });
}

/** Gives up a status change the server refused: back to the server's status. */
export function revertStatus(listing: LocalListing, now: string): LocalListing {
  return setStatus(listing, listing.serverStatus, now);
}

export type NewScan = Pick<
  LocalScan,
  'id' | 'createdAt' | 'files' | 'device' | 'appVersion' | 'location'
>;

/** Where a scan that is being replaced or removed still has to be cleaned up. */
function retire(listing: LocalListing): string[] {
  const old = listing.scan;
  return old && old.row !== 'none' ? [...listing.removedScanIds, old.id] : listing.removedScanIds;
}

/** Room ids belong to one scan, so a new or removed scan clears every photo's room. */
function clearPhotoRooms(photos: LocalPhoto[]): LocalPhoto[] {
  return photos.map((photo) => (photo.roomId === null ? photo : { ...photo, roomId: null }));
}

/** Attaches a new scan, replacing the current one (a rescan). */
export function attachScan(listing: LocalListing, scan: NewScan, now: string): LocalListing {
  return edited(listing, now, {
    scan: {
      ...scan,
      row: 'none',
      uploaded: { json: false, usdz: false },
      processing: 'pending',
      totalAreaM2: null,
      roomLabels: {},
      labelsRev: 0,
      labelsSyncedRev: 0,
    },
    removedScanIds: retire(listing),
    photos: clearPhotoRooms(listing.photos),
  });
}

export function removeScan(listing: LocalListing, now: string): LocalListing {
  if (!listing.scan) return listing;
  return edited(listing, now, {
    scan: null,
    removedScanIds: retire(listing),
    photos: clearPhotoRooms(listing.photos),
  });
}

/**
 * Corrects one room's label and/or name. The name is kept as typed (`applyAnnotations` trims
 * it); an empty name removes the custom name.
 */
export function setRoomLabel(
  listing: LocalListing,
  roomId: string,
  change: RoomLabelOverride,
  now: string,
): LocalListing {
  const scan = listing.scan;
  if (!scan) return listing;
  const current = scan.roomLabels[roomId] ?? {};
  const next: RoomLabelOverride = { ...current, ...change };
  if (next.name === null || next.name === '') delete next.name;
  if (next.label === current.label && next.name === current.name) return listing;
  return edited(listing, now, {
    scan: {
      ...scan,
      roomLabels: { ...scan.roomLabels, [roomId]: next },
      labelsRev: scan.labelsRev + 1,
    },
  });
}

/** Puts a photo in a room of the current scan, or takes it out (null). */
export function assignPhotoRoom(
  listing: LocalListing,
  photoId: string,
  roomId: string | null,
  now: string,
): LocalListing {
  const photo = listing.photos.find((candidate) => candidate.id === photoId);
  if (!photo || photo.roomId === roomId || (roomId !== null && !listing.scan)) return listing;
  return edited(listing, now, {
    photos: listing.photos.map((candidate) =>
      candidate.id === photoId ? { ...candidate, roomId } : candidate,
    ),
  });
}

// Sync progress -------------------------------------------------------------------------------
// These do not count as edits: they must not clear a sync error or bump editVersion.

export function markCreateAttempted(listing: LocalListing): LocalListing {
  return { ...listing, remote: { ...listing.remote, createAttempted: true } };
}

export function markCreated(listing: LocalListing, rev: number): LocalListing {
  return {
    ...listing,
    remote: { createAttempted: true, created: true },
    syncedRev: Math.max(listing.syncedRev, rev),
  };
}

export function markSynced(listing: LocalListing, rev: number): LocalListing {
  return { ...listing, syncedRev: Math.max(listing.syncedRev, rev) };
}

export function markPrivateSynced(listing: LocalListing, rev: number): LocalListing {
  return { ...listing, privateSyncedRev: Math.max(listing.privateSyncedRev, rev) };
}

function mapPhoto(
  listing: LocalListing,
  photoId: string,
  change: (photo: LocalPhoto) => LocalPhoto,
): LocalListing {
  return {
    ...listing,
    photos: listing.photos.map((photo) => (photo.id === photoId ? change(photo) : photo)),
  };
}

export function markPhotoUploaded(listing: LocalListing, photoId: string): LocalListing {
  return mapPhoto(listing, photoId, (photo) =>
    photo.state === 'local' ? { ...photo, state: 'uploaded' } : photo,
  );
}

export function markPhotoSaved(
  listing: LocalListing,
  photoId: string,
  sortOrder: number,
): LocalListing {
  return mapPhoto(listing, photoId, (photo) => ({
    ...photo,
    state: 'saved',
    savedSortOrder: sortOrder,
  }));
}

export function markPhotoRoomSaved(
  listing: LocalListing,
  photoId: string,
  room: PhotoRoom | null,
): LocalListing {
  return mapPhoto(listing, photoId, (photo) => ({ ...photo, savedRoom: room }));
}

export function markStatusSynced(
  listing: LocalListing,
  rev: number,
  status: ListingStatus,
): LocalListing {
  return {
    ...listing,
    serverStatus: status,
    statusSyncedRev: Math.max(listing.statusSyncedRev, rev),
  };
}

/** Applies a change to the scan, if it is still the listing's scan. */
export function updateScan(
  listing: LocalListing,
  scanId: string,
  change: (scan: LocalScan) => LocalScan,
): LocalListing {
  if (listing.scan?.id !== scanId) return listing;
  return { ...listing, scan: change(listing.scan) };
}

export function markScanRowAttempted(listing: LocalListing, scanId: string): LocalListing {
  return updateScan(listing, scanId, (scan) =>
    scan.row === 'none' ? { ...scan, row: 'attempted' } : scan,
  );
}

export function markScanRowCreated(listing: LocalListing, scanId: string): LocalListing {
  return updateScan(listing, scanId, (scan) => ({ ...scan, row: 'created' }));
}

export function markScanFileUploaded(
  listing: LocalListing,
  scanId: string,
  kind: 'json' | 'usdz',
): LocalListing {
  return updateScan(listing, scanId, (scan) => ({
    ...scan,
    uploaded: { ...scan.uploaded, [kind]: true },
  }));
}

export function markScanLabelsSynced(
  listing: LocalListing,
  scanId: string,
  rev: number,
): LocalListing {
  return updateScan(listing, scanId, (scan) => ({
    ...scan,
    labelsSyncedRev: Math.max(scan.labelsSyncedRev, rev),
  }));
}

export function markScanProcessed(
  listing: LocalListing,
  scanId: string,
  result: { ok: true; totalAreaM2: number } | { ok: false },
): LocalListing {
  return updateScan(listing, scanId, (scan) =>
    result.ok
      ? { ...scan, processing: 'ready', totalAreaM2: result.totalAreaM2 }
      : { ...scan, processing: 'failed' },
  );
}

/** The server lacks the scan's files or row: send everything again from the phone's copy. */
export function resetScanUpload(listing: LocalListing, scanId: string): LocalListing {
  return updateScan(listing, scanId, (scan) => ({
    ...scan,
    uploaded: { json: false, usdz: false },
  }));
}

/**
 * The server no longer has the scan row (deleted on another phone): create it again, with its
 * labels. Deleting the row also cleared the photos' rooms on the server.
 */
export function resetScanRow(listing: LocalListing, scanId: string): LocalListing {
  const reset = updateScan(listing, scanId, (scan) => ({
    ...scan,
    row: 'none',
    uploaded: { json: false, usdz: false },
    labelsSyncedRev: 0,
  }));
  if (reset === listing) return listing;
  return {
    ...reset,
    photos: reset.photos.map((photo) =>
      photo.savedRoom?.scanId === scanId ? { ...photo, savedRoom: null } : photo,
    ),
  };
}

export function markScanRemoved(listing: LocalListing, scanId: string): LocalListing {
  return { ...listing, removedScanIds: listing.removedScanIds.filter((id) => id !== scanId) };
}

export function markPhotoRemoved(listing: LocalListing, photoId: string): LocalListing {
  return { ...listing, removedPhotoIds: listing.removedPhotoIds.filter((id) => id !== photoId) };
}

/** A photo whose file is gone from the phone before it was uploaded: nothing to send. */
export function dropPhoto(listing: LocalListing, photoId: string): LocalListing {
  return { ...listing, photos: listing.photos.filter((photo) => photo.id !== photoId) };
}
