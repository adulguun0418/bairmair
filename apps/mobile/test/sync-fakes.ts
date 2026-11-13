import type { RoomLabelOverride } from '@bairmair/room-model';
import type { ListingStatus } from '../src/listings/form';
import type { LocalListing, LocalScan, PhotoRoom } from '../src/listings/model';
import { ListingStore, type ListingPersistence } from '../src/listings/store';
import {
  SyncEngine,
  type Clock,
  type ListingFiles,
  type ListingRemote,
  type ProcessResult,
} from '../src/listings/sync-engine';

export const OWNER = '22222222-2222-4222-8222-222222222222';

export class MemoryPersistence implements ListingPersistence {
  saved = new Map<string, LocalListing>();
  loadAll() {
    return [...this.saved.values()];
  }
  async save(listing: LocalListing) {
    this.saved.set(listing.id, listing);
  }
  async remove(id: string) {
    this.saved.delete(id);
  }
}

/** A server in memory that can be told to fail. */
export class FakeRemote implements ListingRemote {
  userId: string | null = OWNER;
  calls: string[] = [];
  rows = new Map<string, unknown>();
  status = new Map<string, ListingStatus>();
  photos = new Map<string, { sortOrder: number; room?: PhotoRoom | null }>();
  objects = new Set<string>();
  scans = new Map<string, { scan: LocalScan; labels: Record<string, RoomLabelOverride> }>();
  /** Errors thrown by the next calls, in order. */
  failures: Error[] = [];
  /** Answers of the next processScan calls; `ready` (12.5 m²) when empty. */
  processResults: ProcessResult[] = [];

  private async call(name: string): Promise<void> {
    this.calls.push(name);
    const failure = this.failures.shift();
    if (failure) throw failure;
  }
  async currentUserId() {
    return this.userId;
  }
  async createListing(id: string, fields: unknown) {
    await this.call('createListing');
    this.rows.set(id, fields);
  }
  async updateListing(id: string, fields: unknown) {
    await this.call('updateListing');
    this.rows.set(id, fields);
  }
  async savePrivate() {
    await this.call('savePrivate');
  }
  async uploadPhoto(listingId: string, photoId: string) {
    await this.call('uploadPhoto');
    this.objects.add(`${listingId}/${photoId}.jpg`);
  }
  async insertPhoto(_listingId: string, p: { id: string; sortOrder: number }) {
    await this.call('insertPhoto');
    this.photos.set(p.id, { sortOrder: p.sortOrder });
  }
  async reorderPhoto(photoId: string, sortOrder: number) {
    await this.call('reorderPhoto');
    this.photos.set(photoId, { ...this.photos.get(photoId), sortOrder });
  }
  async removePhoto(listingId: string, photoId: string) {
    await this.call('removePhoto');
    this.photos.delete(photoId);
    this.objects.delete(`${listingId}/${photoId}.jpg`);
  }
  async deleteListing(id: string) {
    await this.call('deleteListing');
    this.rows.delete(id);
  }
  async setStatus(id: string, status: ListingStatus) {
    await this.call(`setStatus:${status}`);
    this.status.set(id, status);
  }
  async createScan(_listingId: string, scan: LocalScan) {
    await this.call('createScan');
    this.scans.set(scan.id, { scan, labels: {} });
  }
  async saveRoomLabels(scanId: string, labels: Record<string, RoomLabelOverride>) {
    await this.call('saveRoomLabels');
    const row = this.scans.get(scanId);
    if (row) row.labels = labels;
  }
  async assignPhotoRoom(photoId: string, room: PhotoRoom | null) {
    await this.call('assignPhotoRoom');
    const photo = this.photos.get(photoId);
    if (photo) photo.room = room;
  }
  async uploadScanFile(listingId: string, scanId: string, file: 'json' | 'usdz') {
    await this.call(`uploadScanFile:${file}`);
    this.objects.add(`${listingId}/${scanId}/${file}`);
  }
  async processScan(): Promise<ProcessResult> {
    await this.call('processScan');
    return this.processResults.shift() ?? { kind: 'ready', totalAreaM2: 12.5 };
  }
  async removeScan(listingId: string, scanId: string) {
    await this.call('removeScan');
    this.scans.delete(scanId);
    this.objects.delete(`${listingId}/${scanId}/json`);
    this.objects.delete(`${listingId}/${scanId}/usdz`);
  }
}

export class FakeFiles implements ListingFiles {
  missing = new Set<string>();
  removedFolders: string[] = [];
  uri(listingId: string, file: string) {
    return `file:///listings/${listingId}/${file}`;
  }
  exists(_listingId: string, file: string) {
    return !this.missing.has(file);
  }
  removeFolder(listingId: string) {
    this.removedFolders.push(listingId);
  }
}

export class FakeClock implements Clock {
  time = 1_000_000;
  timers: { at: number; callback: () => void }[] = [];
  now() {
    return this.time;
  }
  setTimeout(callback: () => void, ms: number) {
    const timer = { at: this.time + ms, callback };
    this.timers.push(timer);
    return timer;
  }
  clearTimeout(handle: unknown) {
    this.timers = this.timers.filter((timer) => timer !== handle);
  }
}

export function setup(listing: LocalListing) {
  const store = new ListingStore(new MemoryPersistence());
  store.put(listing);
  const remote = new FakeRemote();
  const files = new FakeFiles();
  const clock = new FakeClock();
  const engine = new SyncEngine(store, remote, files, clock);
  return { store, remote, files, clock, engine };
}
