import type { RoomLabelOverride } from '@bairmair/room-model';
import type { ListingFields, ListingStatus } from './form';
import {
  dropPhoto,
  markCreateAttempted,
  markCreated,
  markPhotoRemoved,
  markPhotoRoomSaved,
  markPhotoSaved,
  markPhotoUploaded,
  markPrivateSynced,
  markScanFileUploaded,
  markScanLabelsSynced,
  markScanProcessed,
  markScanRemoved,
  markScanRowAttempted,
  markScanRowCreated,
  markStatusSynced,
  markSynced,
  resetScanRow,
  resetScanUpload,
  type LocalListing,
  type LocalScan,
  type PhotoRoom,
} from './model';
import type { ListingStore } from './store';
import { SyncError, toSyncError, type SyncErrorKey } from './sync-errors';
import { planSync, type SyncBlock, type SyncOp } from './sync-plan';

/** The server, as the engine needs it. Methods throw `SyncError` (or anything, = transient). */
export interface ListingRemote {
  /** The signed-in user (refreshing an expired session first), or null. */
  currentUserId(): Promise<string | null>;
  /** Inserts the draft row. An existing row with this id counts as success (a retried insert). */
  createListing(id: string, fields: ListingFields): Promise<void>;
  /** Throws `listingMissing` if the row is gone (deleted on another device). */
  updateListing(id: string, fields: ListingFields): Promise<void>;
  savePrivate(
    listingId: string,
    value: { lat: number; lng: number; unitNumber: string | null },
  ): Promise<void>;
  /** Uploads (or overwrites) `{listingId}/{photoId}.jpg`. */
  uploadPhoto(listingId: string, photoId: string, fileUri: string): Promise<void>;
  /** Inserts the photo row. An existing row counts as success. */
  insertPhoto(
    listingId: string,
    photo: { id: string; sortOrder: number; width: number; height: number },
  ): Promise<void>;
  reorderPhoto(photoId: string, sortOrder: number): Promise<void>;
  /** Deletes the row, then the file. Either may already be gone. */
  removePhoto(listingId: string, photoId: string): Promise<void>;
  /** Deletes the listing's files it can reach, then the row (rows below it cascade). */
  deleteListing(listingId: string): Promise<void>;
  /** Sets the status; the database checks publishing (verified phone, photo, complete row). */
  setStatus(listingId: string, status: ListingStatus): Promise<void>;
  /** Inserts the `room_scans` row. An existing row counts as success. */
  createScan(listingId: string, scan: LocalScan): Promise<void>;
  /** Writes `room_scans.room_labels`. Throws `scanMissing` if the row is gone. */
  saveRoomLabels(scanId: string, labels: Record<string, RoomLabelOverride>): Promise<void>;
  /** Sets (or clears) a photo's scan and room. */
  assignPhotoRoom(photoId: string, room: PhotoRoom | null): Promise<void>;
  /** Uploads (or overwrites) the raw RoomPlan JSON or USDZ in `scan-raw`. */
  uploadScanFile(
    listingId: string,
    scanId: string,
    file: 'json' | 'usdz',
    fileUri: string,
  ): Promise<void>;
  /** Asks the web server to convert the scan. Network and server errors throw. */
  processScan(scanId: string): Promise<ProcessResult>;
  /** Deletes a replaced scan: its raw files, then its row. Either may already be gone. */
  removeScan(listingId: string, scanId: string): Promise<void>;
}

/**
 * The outcome of `processScan`:
 * - `ready`: converted; the scan is now the listing's current scan
 * - `failed`: the server could not convert the raw file (it marked the scan failed)
 * - `filesMissing`: a raw file is not in storage
 * - `notFound`: no such scan row (deleted on another phone)
 */
export type ProcessResult =
  | { kind: 'ready'; totalAreaM2: number }
  | { kind: 'failed' }
  | { kind: 'filesMissing' }
  | { kind: 'notFound' };

/** The listing folders on the phone. */
export interface ListingFiles {
  uri(listingId: string, file: string): string;
  exists(listingId: string, file: string): boolean;
  removeFolder(listingId: string): void;
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing'; op: SyncOp['kind'] }
  /** A temporary failure; retried automatically at `retryAt` (ms since epoch). */
  | { state: 'waiting'; key: SyncErrorKey; retryAt: number }
  /** Refused by the server; retried after the next edit. */
  | { state: 'failed'; key: SyncErrorKey }
  | { state: 'blocked'; block: SyncBlock }
  | { state: 'signedOut' };

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** 5 s, 10 s, 20 s … capped at 5 minutes. */
export function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 300_000);
}

interface Failure {
  permanent: boolean;
  key: SyncErrorKey;
  attempts: number;
  retryAt: number;
  /** The listing's editVersion when it failed; a permanent failure clears once it changes. */
  editVersion: number;
}

const IDLE: SyncStatus = { state: 'idle' };
/** A safety net against a bug that would make an operation repeat forever. */
const MAX_OPS_PER_PASS = 500;
const PASS_RETRY_MS = 15_000;

/**
 * Sends local changes to the server, one operation at a time, listing by listing. Runs while
 * the app is open: on start, after edits, when the app returns to the foreground, and on
 * a backoff timer after temporary failures. Every operation is idempotent, so an interrupted
 * one (app killed mid-upload) is simply repeated.
 */
export class SyncEngine {
  private readonly statuses = new Map<string, SyncStatus>();
  private readonly failures = new Map<string, Failure>();
  private readonly listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: unknown = null;
  private passRetryAt = 0;

  constructor(
    private readonly store: ListingStore,
    private readonly remote: ListingRemote,
    private readonly files: ListingFiles,
    private readonly clock: Clock = systemClock,
  ) {}

  status(id: string): SyncStatus {
    return this.statuses.get(id) ?? IDLE;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Retries temporary failures now instead of waiting for the backoff (app back in front). */
  retryNow(): Promise<void> {
    for (const [id, failure] of this.failures) {
      if (!failure.permanent) this.failures.set(id, { ...failure, retryAt: 0 });
    }
    return this.run();
  }

  /** Runs a sync pass. Resolves when the pass (and any pass requested meanwhile) is over. */
  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.pass();
        } while (this.again);
      } finally {
        this.running = null;
        this.schedule();
      }
    })();
    return this.running;
  }

  private async pass(): Promise<void> {
    let userId: string | null;
    try {
      userId = await this.remote.currentUserId();
    } catch {
      // The session could not be refreshed (no connection): try the whole pass again later.
      this.passRetryAt = this.clock.now() + PASS_RETRY_MS;
      return;
    }
    this.passRetryAt = 0;
    for (const listing of this.store.all()) {
      if (!userId) {
        this.setStatus(listing.id, { state: 'signedOut' });
      } else if (listing.ownerId === userId) {
        await this.drain(listing.id);
      }
    }
  }

  private async drain(id: string): Promise<void> {
    for (let i = 0; i < MAX_OPS_PER_PASS; i++) {
      const listing = this.store.get(id);
      if (!listing) {
        this.statuses.delete(id);
        this.failures.delete(id);
        this.emit();
        return;
      }

      const failure = this.failures.get(id);
      if (failure?.permanent && failure.editVersion === listing.editVersion) {
        this.setStatus(id, { state: 'failed', key: failure.key });
        return;
      }
      if (failure && !failure.permanent && failure.retryAt > this.clock.now()) {
        this.setStatus(id, { state: 'waiting', key: failure.key, retryAt: failure.retryAt });
        return;
      }

      const plan = planSync(listing);
      if (!plan.op) {
        this.failures.delete(id);
        this.setStatus(id, plan.block ? { state: 'blocked', block: plan.block } : IDLE);
        return;
      }

      this.setStatus(id, { state: 'syncing', op: plan.op.kind });
      try {
        await this.execute(listing, plan.op);
        // Success: keep the attempt count only until the listing is fully synced.
        if (failure) this.failures.set(id, { ...failure, retryAt: 0, permanent: false });
      } catch (cause) {
        this.fail(id, toSyncError(cause), failure);
        return;
      }
    }
    console.warn(`Sync of listing ${id} stopped after ${MAX_OPS_PER_PASS} operations`);
  }

  private fail(id: string, error: SyncError, previous: Failure | undefined): void {
    const editVersion = this.store.get(id)?.editVersion ?? 0;
    if (error.kind === 'signedOut') {
      this.setStatus(id, { state: 'signedOut' });
      return;
    }
    if (error.kind === 'permanent') {
      console.warn(`Sync of listing ${id} refused: ${error.message}`);
      this.failures.set(id, {
        permanent: true,
        key: error.key,
        attempts: 0,
        retryAt: 0,
        editVersion,
      });
      this.setStatus(id, { state: 'failed', key: error.key });
      return;
    }
    const attempts = (previous?.attempts ?? 0) + 1;
    const retryAt = this.clock.now() + backoffMs(attempts);
    this.failures.set(id, { permanent: false, key: error.key, attempts, retryAt, editVersion });
    this.setStatus(id, { state: 'waiting', key: error.key, retryAt });
  }

  private async execute(listing: LocalListing, op: SyncOp): Promise<void> {
    const id = listing.id;
    switch (op.kind) {
      case 'deleteListing':
        if (listing.remote.createAttempted) await this.remote.deleteListing(id);
        this.store.remove(id);
        await this.store.flush();
        this.files.removeFolder(id);
        return;
      case 'createListing':
        this.store.update(id, markCreateAttempted);
        await this.remote.createListing(id, op.fields);
        this.store.update(id, (current) => markCreated(current, op.rev));
        return;
      case 'updateListing':
        await this.remote.updateListing(id, op.fields);
        this.store.update(id, (current) => markSynced(current, op.rev));
        return;
      case 'savePrivate':
        await this.remote.savePrivate(id, {
          lat: op.lat,
          lng: op.lng,
          unitNumber: op.unitNumber,
        });
        this.store.update(id, (current) => markPrivateSynced(current, op.rev));
        return;
      case 'removePhoto':
        await this.remote.removePhoto(id, op.photoId);
        this.store.update(id, (current) => markPhotoRemoved(current, op.photoId));
        return;
      case 'uploadPhoto':
        if (!this.files.exists(id, op.file)) {
          console.warn(`Photo file ${op.file} of listing ${id} is missing; dropping the photo`);
          this.store.update(id, (current) => dropPhoto(current, op.photoId));
          return;
        }
        await this.remote.uploadPhoto(id, op.photoId, this.files.uri(id, op.file));
        this.store.update(id, (current) => markPhotoUploaded(current, op.photoId));
        return;
      case 'insertPhoto':
        await this.remote.insertPhoto(id, {
          id: op.photoId,
          sortOrder: op.sortOrder,
          width: op.width,
          height: op.height,
        });
        this.store.update(id, (current) => markPhotoSaved(current, op.photoId, op.sortOrder));
        return;
      case 'reorderPhoto':
        await this.remote.reorderPhoto(op.photoId, op.sortOrder);
        this.store.update(id, (current) => markPhotoSaved(current, op.photoId, op.sortOrder));
        return;
      case 'setStatus':
        await this.remote.setStatus(id, op.status);
        this.store.update(id, (current) => markStatusSynced(current, op.rev, op.status));
        return;
      case 'createScan':
        this.store.update(id, (current) => markScanRowAttempted(current, op.scan.id));
        await this.remote.createScan(id, op.scan);
        this.store.update(id, (current) => markScanRowCreated(current, op.scan.id));
        return;
      case 'saveRoomLabels':
        try {
          await this.remote.saveRoomLabels(op.scanId, op.labels);
        } catch (error) {
          if (error instanceof SyncError && error.key === 'scanMissing') {
            this.store.update(id, (current) => resetScanRow(current, op.scanId));
            return;
          }
          throw error;
        }
        this.store.update(id, (current) => markScanLabelsSynced(current, op.scanId, op.rev));
        return;
      case 'assignPhotoRoom':
        await this.remote.assignPhotoRoom(op.photoId, op.room);
        this.store.update(id, (current) => markPhotoRoomSaved(current, op.photoId, op.room));
        return;
      case 'uploadScanFile':
        if (!this.files.exists(id, op.name)) {
          // The raw file is the only copy of the scan; without it the scan cannot be sent.
          console.warn(`Scan file ${op.name} of listing ${id} is missing`);
          this.store.update(id, (current) => markScanProcessed(current, op.scanId, { ok: false }));
          return;
        }
        await this.remote.uploadScanFile(id, op.scanId, op.file, this.files.uri(id, op.name));
        this.store.update(id, (current) => markScanFileUploaded(current, op.scanId, op.file));
        return;
      case 'processScan':
        await this.process(id, op.scanId, op.hasLocalFiles);
        return;
      case 'removeScan':
        await this.remote.removeScan(id, op.scanId);
        this.store.update(id, (current) => markScanRemoved(current, op.scanId));
        return;
    }
  }

  private async process(id: string, scanId: string, hasLocalFiles: boolean): Promise<void> {
    const result = await this.remote.processScan(scanId);
    switch (result.kind) {
      case 'ready':
        this.store.update(id, (current) =>
          markScanProcessed(current, scanId, { ok: true, totalAreaM2: result.totalAreaM2 }),
        );
        return;
      case 'failed':
        this.store.update(id, (current) => markScanProcessed(current, scanId, { ok: false }));
        return;
      case 'filesMissing':
      case 'notFound':
        if (!hasLocalFiles) {
          // Scanned on another phone: only that phone could send the files again.
          this.store.update(id, (current) => markScanProcessed(current, scanId, { ok: false }));
          return;
        }
        this.store.update(id, (current) =>
          result.kind === 'notFound'
            ? resetScanRow(current, scanId)
            : resetScanUpload(current, scanId),
        );
        // Wait (with backoff) before sending again, so a server bug cannot cause a tight loop.
        throw new SyncError('transient', 'server', `Scan ${scanId}: ${result.kind}`);
    }
  }

  private schedule(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const waits = [...this.failures.values()]
      .filter((failure) => !failure.permanent && failure.retryAt > 0)
      .map((failure) => failure.retryAt);
    if (this.passRetryAt > 0) waits.push(this.passRetryAt);
    if (waits.length === 0) return;
    const delay = Math.max(0, Math.min(...waits) - this.clock.now());
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private setStatus(id: string, status: SyncStatus): void {
    const current = this.statuses.get(id);
    if (current && JSON.stringify(current) === JSON.stringify(status)) return;
    this.statuses.set(id, status);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
