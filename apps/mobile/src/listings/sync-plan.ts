import { formToFields, privateUnitNumber, type ListingFields } from './form';
import type { LocalListing } from './model';

// What to send next for one listing. Pure, so the order of operations is unit-tested.
// The engine runs one operation at a time and asks again, so edits made while an operation is
// in flight are picked up by the next call.

export type SyncOp =
  | { kind: 'deleteListing' }
  | { kind: 'createListing'; rev: number; fields: ListingFields }
  | { kind: 'updateListing'; rev: number; fields: ListingFields }
  | {
      kind: 'savePrivate';
      rev: number;
      lat: number;
      lng: number;
      unitNumber: string | null;
    }
  | { kind: 'removePhoto'; photoId: string }
  | { kind: 'uploadPhoto'; photoId: string; file: string }
  | { kind: 'insertPhoto'; photoId: string; sortOrder: number; width: number; height: number }
  | { kind: 'reorderPhoto'; photoId: string; sortOrder: number };

/** Why a listing has nothing to send although it is not fully synced. */
export type SyncBlock =
  /** No title yet: the row cannot be created (title is NOT NULL). */
  | 'needsTitle'
  /** A field holds a value the database would reject; fix it in the form. */
  | 'invalidFields';

export interface SyncPlan {
  op: SyncOp | null;
  block: SyncBlock | null;
}

export function planSync(listing: LocalListing): SyncPlan {
  if (listing.deleted) return { op: { kind: 'deleteListing' }, block: null };

  const result = formToFields(listing.form);
  const block: SyncBlock | null = result.ok
    ? null
    : Object.keys(result.errors).length === 1 && result.errors.title === 'required'
      ? 'needsTitle'
      : 'invalidFields';

  // Everything else lives under the listing row (RLS and storage policies check its owner).
  if (!listing.remote.created) {
    if (!result.ok) return { op: null, block };
    return { op: { kind: 'createListing', rev: listing.rev, fields: result.fields }, block: null };
  }

  if (listing.rev > listing.syncedRev && result.ok) {
    return { op: { kind: 'updateListing', rev: listing.rev, fields: result.fields }, block: null };
  }

  // The private row needs coordinates (NOT NULL), so a unit number waits for the location.
  // An invalid unit number blocks the listing fields too (it is checked with them).
  if (listing.privateRev > listing.privateSyncedRev && listing.location && result.ok) {
    return {
      op: {
        kind: 'savePrivate',
        rev: listing.privateRev,
        lat: listing.location.lat,
        lng: listing.location.lng,
        unitNumber: privateUnitNumber(listing.form),
      },
      block: null,
    };
  }

  const removed = listing.removedPhotoIds[0];
  if (removed) return { op: { kind: 'removePhoto', photoId: removed }, block: null };

  for (const [index, photo] of listing.photos.entries()) {
    if (photo.state === 'local' && photo.file) {
      return { op: { kind: 'uploadPhoto', photoId: photo.id, file: photo.file }, block: null };
    }
    if (photo.state === 'uploaded') {
      return {
        op: {
          kind: 'insertPhoto',
          photoId: photo.id,
          sortOrder: index,
          width: photo.width,
          height: photo.height,
        },
        block: null,
      };
    }
  }

  for (const [index, photo] of listing.photos.entries()) {
    if (photo.state === 'saved' && photo.savedSortOrder !== index) {
      return { op: { kind: 'reorderPhoto', photoId: photo.id, sortOrder: index }, block: null };
    }
  }

  const waiting =
    listing.rev > listing.syncedRev ||
    (listing.privateRev > listing.privateSyncedRev && listing.location !== null);
  return { op: null, block: waiting ? block : null };
}

/** True when the phone holds nothing the server lacks. */
export function isSynced(listing: LocalListing): boolean {
  const plan = planSync(listing);
  return plan.op === null && plan.block === null;
}

/** Photos not yet fully on the server (file or row missing). */
export function pendingPhotoCount(listing: LocalListing): number {
  return listing.photos.filter((photo) => photo.state !== 'saved').length;
}
