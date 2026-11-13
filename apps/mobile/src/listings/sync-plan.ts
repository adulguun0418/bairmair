import type { RoomLabelOverride } from '@bairmair/room-model';
import {
  formToFields,
  missingForPublish,
  privateUnitNumber,
  type ListingFields,
  type ListingStatus,
  type PublishRequirement,
} from './form';
import { isLive, type LocalListing, type LocalScan, type PhotoRoom } from './model';

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
  | { kind: 'reorderPhoto'; photoId: string; sortOrder: number }
  | { kind: 'setStatus'; rev: number; status: ListingStatus }
  | { kind: 'createScan'; scan: LocalScan }
  | {
      kind: 'saveRoomLabels';
      scanId: string;
      rev: number;
      labels: Record<string, RoomLabelOverride>;
    }
  | { kind: 'assignPhotoRoom'; photoId: string; room: PhotoRoom | null }
  | { kind: 'uploadScanFile'; scanId: string; file: 'json' | 'usdz'; name: string }
  | { kind: 'processScan'; scanId: string; hasLocalFiles: boolean }
  | { kind: 'removeScan'; scanId: string };

/** Why a listing has nothing to send although it is not fully synced. */
export type SyncBlock =
  /** No title yet: the row cannot be created (title is NOT NULL). */
  | 'needsTitle'
  /** A field holds a value the database would reject; fix it in the form. */
  | 'invalidFields'
  /** Published (or being published) but a required field is empty. */
  | 'incompleteForLive';

export interface SyncPlan {
  op: SyncOp | null;
  block: SyncBlock | null;
}

/**
 * What a live listing still lacks, as the server will judge it: a scanned area counts only once
 * the server has processed the scan (it sets `area_scanned_m2`).
 */
export function missingForLive(listing: LocalListing): PublishRequirement[] {
  return missingForPublish({
    form: listing.form,
    hasLocation: listing.location !== null,
    photoCount: listing.photos.length,
    hasScannedArea: listing.scan?.processing === 'ready',
  });
}

/**
 * What blocks the seller from tapping "Publish". A scan still on its way counts for the area:
 * the status is sent once the server has processed it.
 */
export function missingToPublish(listing: LocalListing): PublishRequirement[] {
  const scan = listing.scan;
  return missingForPublish({
    form: listing.form,
    hasLocation: listing.location !== null,
    photoCount: listing.photos.length,
    hasScannedArea: scan !== null && scan.processing !== 'failed',
  });
}

function sameRoom(a: PhotoRoom | null, b: PhotoRoom | null): boolean {
  return a === b || (a !== null && b !== null && a.scanId === b.scanId && a.roomId === b.roomId);
}

/** The room a photo should have on the server now (needs the scan's row for the foreign key). */
export function wantedPhotoRoom(listing: LocalListing, roomId: string | null): PhotoRoom | null {
  const scan = listing.scan;
  if (roomId === null || !scan || scan.row !== 'created') return null;
  return { scanId: scan.id, roomId };
}

export function planSync(listing: LocalListing): SyncPlan {
  if (listing.deleted) return { op: { kind: 'deleteListing' }, block: null };

  const result = formToFields(listing.form);
  const formBlock: SyncBlock | null = result.ok
    ? null
    : Object.keys(result.errors).length === 1 && result.errors.title === 'required'
      ? 'needsTitle'
      : 'invalidFields';

  // Everything else lives under the listing row (RLS and storage policies check its owner).
  if (!listing.remote.created) {
    if (!result.ok) return { op: null, block: formBlock };
    return { op: { kind: 'createListing', rev: listing.rev, fields: result.fields }, block: null };
  }

  const statusPending = listing.statusRev > listing.statusSyncedRev;
  const setStatus: SyncOp = { kind: 'setStatus', rev: listing.statusRev, status: listing.status };

  // Leaving the live states first: the database checks completeness only while live, so the
  // fields below may then be saved even if incomplete.
  if (statusPending && !isLive(listing.status)) return { op: setStatus, block: null };

  // A live listing must stay complete; the database would refuse the update.
  const liveMissing = isLive(listing.status) ? missingForLive(listing) : [];
  const block: SyncBlock | null =
    formBlock ?? (liveMissing.length > 0 ? 'incompleteForLive' : null);

  const fieldsPending = listing.rev > listing.syncedRev;
  if (fieldsPending && result.ok && liveMissing.length === 0) {
    return { op: { kind: 'updateListing', rev: listing.rev, fields: result.fields }, block: null };
  }

  // The private row needs coordinates (NOT NULL), so a unit number waits for the location.
  // An invalid unit number blocks the listing fields too (it is checked with them).
  const privatePending = listing.privateRev > listing.privateSyncedRev && listing.location !== null;
  if (privatePending && listing.location && result.ok) {
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

  // Going live once the row, the location and the photos are on the server. If the area comes
  // from the scan, the status waits for the scan to be processed (below).
  const photosDone = listing.photos.every((photo) => photo.state === 'saved');
  if (
    statusPending &&
    !fieldsPending &&
    !privatePending &&
    photosDone &&
    liveMissing.length === 0
  ) {
    return { op: setStatus, block: null };
  }

  const scan = listing.scan;
  if (scan && scan.row !== 'created') {
    return { op: { kind: 'createScan', scan }, block: null };
  }

  if (scan && scan.labelsRev > scan.labelsSyncedRev) {
    return {
      op: { kind: 'saveRoomLabels', scanId: scan.id, rev: scan.labelsRev, labels: scan.roomLabels },
      block: null,
    };
  }

  for (const photo of listing.photos) {
    if (photo.state !== 'saved') continue;
    const wanted = wantedPhotoRoom(listing, photo.roomId);
    // A room on a scan whose row is not there yet waits; clearing never waits.
    if (wanted === null && photo.roomId !== null && photo.savedRoom === null) continue;
    if (!sameRoom(wanted, photo.savedRoom)) {
      return { op: { kind: 'assignPhotoRoom', photoId: photo.id, room: wanted }, block: null };
    }
  }

  if (scan?.files) {
    for (const file of ['json', 'usdz'] as const) {
      if (!scan.uploaded[file]) {
        return {
          op: { kind: 'uploadScanFile', scanId: scan.id, file, name: scan.files[file] },
          block: null,
        };
      }
    }
  }

  if (scan && scan.processing === 'pending' && scan.uploaded.json && scan.uploaded.usdz) {
    return {
      op: { kind: 'processScan', scanId: scan.id, hasLocalFiles: scan.files !== null },
      block: null,
    };
  }

  // An old scan stays current on the server until its replacement is processed, so a live
  // listing keeps its 3D view during a rescan.
  const retired = listing.removedScanIds[0];
  if (retired && (!scan || scan.processing !== 'pending')) {
    return { op: { kind: 'removeScan', scanId: retired }, block: null };
  }

  const waiting = fieldsPending || privatePending || statusPending;
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

/** Where the listing's scan is on its way to the server, for the status line. */
export function scanProgress(
  listing: LocalListing,
): 'none' | 'uploading' | 'processing' | 'ready' | 'failed' {
  const scan = listing.scan;
  if (!scan) return 'none';
  if (scan.processing !== 'pending') return scan.processing;
  return scan.row === 'created' && scan.uploaded.json && scan.uploaded.usdz
    ? 'processing'
    : 'uploading';
}
