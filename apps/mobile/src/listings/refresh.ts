import { formToFields, privateUnitNumber } from '@bairmair/browse';
import type { LocalListing, LocalPhoto, LocalScan } from './model';
import type { ListingStore } from './store';
import { isSynced } from './sync-plan';

// Takes changes made elsewhere (the website, another phone) into the phone's copy of a listing.
// Only a listing with nothing left to send is refreshed: the phone never loses an unsent edit,
// and an edit made while a refresh is in flight wins (the refresh is dropped).

export interface MergeResult {
  listing: LocalListing;
  /** Files in the listing folder the merged listing no longer uses (removed photos, old scan). */
  staleFiles: string[];
}

/** JSON with sorted object keys, so equal values compare equal whatever the key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

/**
 * The `listings` columns a form stands for. Text inputs are kept as typed ("250 000 000"), so
 * forms are compared by what they would write, not character by character.
 */
function fieldsKey(listing: LocalListing): string {
  const result = formToFields(listing.form);
  return stableJson(result.ok ? result.fields : listing.form);
}

/** The server's scan, keeping what only this phone knows when it is the same scan. */
function mergeScan(local: LocalScan | null, server: LocalScan | null): LocalScan | null {
  if (!server) return null;
  if (!local || local.id !== server.id) return server;
  // A pending scan on the server may still be on its way from this phone: keep the phone's
  // progress until the server has a result.
  const final = server.processing !== 'pending';
  const sameResult =
    !final || (server.processing === local.processing && server.totalAreaM2 === local.totalAreaM2);
  if (sameResult && stableJson(server.roomLabels) === stableJson(local.roomLabels)) return local;
  return {
    ...local,
    roomLabels: server.roomLabels,
    ...(final ? { processing: server.processing, totalAreaM2: server.totalAreaM2 } : {}),
  };
}

function samePhotos(a: readonly LocalPhoto[], b: readonly LocalPhoto[]): boolean {
  return (
    a.length === b.length &&
    a.every((photo, index) => photo.id === b[index]!.id && photo.roomId === b[index]!.roomId)
  );
}

/**
 * Merges the server's copy (`server`, as `downloadListing` builds it) into a fully synced local
 * listing. Returns null when they hold the same listing. Photo and scan files already on the
 * phone are kept; revisions stay as they are, so the result is synced too.
 */
export function mergeServerCopy(
  local: LocalListing,
  server: LocalListing,
  now: string,
): MergeResult | null {
  const sameFields = fieldsKey(local) === fieldsKey(server);
  const sameUnit = privateUnitNumber(local.form) === privateUnitNumber(server.form);
  const sameLocation =
    local.location?.lat === server.location?.lat && local.location?.lng === server.location?.lng;
  const sameStatus = local.serverStatus === server.serverStatus;
  const scan = mergeScan(local.scan, server.scan);
  const photosUnchanged = samePhotos(local.photos, server.photos);

  if (
    sameFields &&
    sameUnit &&
    sameLocation &&
    sameStatus &&
    scan === local.scan &&
    photosUnchanged
  ) {
    return null;
  }

  const photos = photosUnchanged
    ? local.photos
    : server.photos.map((photo) => {
        const mine = local.photos.find((candidate) => candidate.id === photo.id);
        return mine?.file
          ? { ...photo, file: mine.file, width: mine.width, height: mine.height }
          : photo;
      });

  const staleFiles = local.photos
    .filter((photo) => photo.file && !photos.some((kept) => kept.id === photo.id))
    .map((photo) => photo.file!);
  if (local.scan?.files && scan?.id !== local.scan.id) {
    staleFiles.push(local.scan.files.json, local.scan.files.usdz);
  }

  return {
    listing: {
      ...local,
      updatedAt: now,
      status: server.serverStatus,
      serverStatus: server.serverStatus,
      form: sameFields
        ? sameUnit
          ? local.form
          : { ...local.form, unitNumber: server.form.unitNumber }
        : server.form,
      location: sameLocation ? local.location : server.location,
      photos,
      scan,
      removedPhotoIds: [],
      removedScanIds: [],
    },
    staleFiles,
  };
}

export interface RefreshDeps {
  store: ListingStore;
  /** The signed-in user, or null. */
  currentUserId(): Promise<string | null>;
  /** The server's copies of `ids` (see `fetchServerCopies`); missing ids are not on the server. */
  fetchCopies(
    ownerId: string,
    ids: string[],
    knownScans: Map<string, string>,
    now: string,
  ): Promise<Map<string, LocalListing>>;
  removeFiles(listingId: string, files: string[]): void;
  removeFolder(listingId: string): void;
  /** ms since epoch. */
  now(): number;
}

export interface RefreshOptions {
  /** Only these listings (default: all of the signed-in user's). */
  ids?: string[];
  /** Skip listings checked less than this long ago (default 30 s). */
  maxAgeMs?: number;
}

export interface RefreshResult {
  /** Listings that took a newer version from the server. */
  updated: string[];
  /** Listings deleted elsewhere, now removed from the phone too. */
  removed: string[];
}

export const REFRESH_MAX_AGE_MS = 30_000;

/** Checks the server for newer versions of the phone's listings. One check at a time. */
export class ListingRefresher {
  private readonly checkedAt = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: RefreshDeps) {}

  refresh(options: RefreshOptions = {}): Promise<RefreshResult> {
    const next = this.queue.then(() => this.check(options));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async check({
    ids,
    maxAgeMs = REFRESH_MAX_AGE_MS,
  }: RefreshOptions): Promise<RefreshResult> {
    const result: RefreshResult = { updated: [], removed: [] };
    const { store } = this.deps;
    const userId = await this.deps.currentUserId();
    if (!userId) return result;

    const startedAt = this.deps.now();
    const candidates = store
      .all()
      .filter(
        (listing) =>
          listing.ownerId === userId &&
          !listing.deleted &&
          listing.remote.created &&
          (!ids || ids.includes(listing.id)) &&
          startedAt - (this.checkedAt.get(listing.id) ?? -Infinity) >= maxAgeMs &&
          isSynced(listing),
      );
    if (candidates.length === 0) return result;

    const knownScans = new Map(
      candidates.flatMap((listing) =>
        listing.scan ? [[listing.id, listing.scan.id] as const] : [],
      ),
    );
    const nowIso = new Date(startedAt).toISOString();
    const copies = await this.deps.fetchCopies(
      userId,
      candidates.map((listing) => listing.id),
      knownScans,
      nowIso,
    );
    // A missing row means "deleted elsewhere" only if it was asked as this user: a session that
    // ended meanwhile would read as anonymous, and drafts would look deleted.
    const sameUser = (await this.deps.currentUserId()) === userId;

    for (const before of candidates) {
      this.checkedAt.set(before.id, startedAt);
      // Changed on the phone while the server was asked (an edit, a sync step): the phone wins.
      if (store.get(before.id) !== before) continue;
      const server = copies.get(before.id);
      if (!server) {
        if (!sameUser) continue;
        store.remove(before.id);
        result.removed.push(before.id);
        continue;
      }
      const merged = mergeServerCopy(before, server, nowIso);
      if (!merged) continue;
      store.put(merged.listing);
      if (merged.staleFiles.length > 0) this.deps.removeFiles(before.id, merged.staleFiles);
      result.updated.push(before.id);
    }

    if (result.removed.length > 0) {
      await store.flush();
      for (const id of result.removed) {
        this.checkedAt.delete(id);
        this.deps.removeFolder(id);
      }
    }
    return result;
  }
}
