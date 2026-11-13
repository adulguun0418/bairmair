import { LISTING_LIMITS } from '@bairmair/db';
import { EMPTY_FORM, PRIVATE_FIELDS, type ListingForm, type ListingStatus } from './form';

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
}

export interface LocalListing {
  version: 1;
  id: string;
  /** The user who created the draft; only their session syncs it. */
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  /** Last known server status. 5b only writes drafts; publishing comes with 5c. */
  status: ListingStatus;
  form: ListingForm;
  location: PinnedLocation | null;
  /** In display order: the first photo is the cover. */
  photos: LocalPhoto[];
  /** Photos removed on the phone that may still have a row or file on the server. */
  removedPhotoIds: string[];
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
    form: { ...EMPTY_FORM },
    location: null,
    photos: [],
    removedPhotoIds: [],
    deleted: false,
    remote: { createAttempted: false, created: false },
    rev: 1,
    syncedRev: 0,
    privateRev: 0,
    privateSyncedRev: 0,
    editVersion: 0,
  };
}

/** Untouched and never sent: safe to drop when the seller backs out of "new listing". */
export function isUntouched(listing: LocalListing): boolean {
  return (
    !listing.remote.createAttempted &&
    listing.editVersion === 0 &&
    listing.photos.length === 0 &&
    listing.location === null
  );
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
  const added = photos
    .slice(0, photoSlotsLeft(listing))
    .map((photo): LocalPhoto => ({ ...photo, state: 'local', savedSortOrder: null }));
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

export function markPhotoRemoved(listing: LocalListing, photoId: string): LocalListing {
  return { ...listing, removedPhotoIds: listing.removedPhotoIds.filter((id) => id !== photoId) };
}

/** A photo whose file is gone from the phone before it was uploaded: nothing to send. */
export function dropPhoto(listing: LocalListing, photoId: string): LocalListing {
  return { ...listing, photos: listing.photos.filter((photo) => photo.id !== photoId) };
}
