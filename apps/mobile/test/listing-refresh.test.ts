import { EMPTY_FORM } from '@bairmair/browse';
import { describe, expect, it } from 'vitest';
import {
  updateForm,
  type LocalListing,
  type LocalPhoto,
  type LocalScan,
} from '../src/listings/model';
import { ListingRefresher, mergeServerCopy, type RefreshDeps } from '../src/listings/refresh';
import { ListingStore } from '../src/listings/store';
import { isSynced } from '../src/listings/sync-plan';
import { MemoryPersistence, OWNER } from './sync-fakes';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const SCAN = '44444444-4444-4444-8444-444444444444';
const NEW_SCAN = '55555555-5555-4555-8555-555555555555';
const CREATED = '2026-11-01T10:00:00.000Z';
const NOW = '2026-11-13T10:00:00.000Z';

const photoId = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function photo(n: number, index: number, roomId: string | null = null): LocalPhoto {
  return {
    id: photoId(n),
    file: null,
    width: 2048,
    height: 1536,
    state: 'saved',
    savedSortOrder: index,
    roomId,
    savedRoom: roomId ? { scanId: SCAN, roomId } : null,
  };
}

function scan(id = SCAN): LocalScan {
  return {
    id,
    createdAt: CREATED,
    files: null,
    device: { modelId: 'iPhone16,1', osVersion: '26.1' },
    appVersion: '0.1.0',
    location: { lat: 47.8864, lng: 106.9057, accuracyM: 8, capturedAt: CREATED },
    row: 'created',
    uploaded: { json: true, usdz: true },
    processing: 'ready',
    totalAreaM2: 54.2,
    roomLabels: { r1: { label: 'bedroom' } },
    labelsRev: 0,
    labelsSyncedRev: 0,
  };
}

/** A listing as the server holds it (the shape `fetchServerCopies` builds): fully synced. */
function serverCopy(changes: Partial<LocalListing> = {}): LocalListing {
  return {
    version: 1,
    id: ID,
    ownerId: OWNER,
    createdAt: CREATED,
    updatedAt: NOW,
    status: 'published',
    serverStatus: 'published',
    statusRev: 0,
    statusSyncedRev: 0,
    form: {
      ...EMPTY_FORM,
      title: 'Зайсан, 3 өрөө',
      price: '250000000',
      rooms: '3',
      areaOfficial: '65.5',
      districtId: 1,
      unitNumber: '45',
    },
    location: { lat: 47.8864, lng: 106.9057, accuracyM: null, capturedAt: CREATED },
    photos: [photo(1, 0, 'r1'), photo(2, 1)],
    removedPhotoIds: [],
    scan: scan(),
    removedScanIds: [],
    deleted: false,
    remote: { createAttempted: true, created: true },
    rev: 1,
    syncedRev: 1,
    privateRev: 1,
    privateSyncedRev: 1,
    editVersion: 0,
    ...changes,
  };
}

/** The phone's copy of the same listing: as typed, with its own photo and scan files. */
function phoneCopy(): LocalListing {
  const server = serverCopy();
  return {
    ...server,
    updatedAt: CREATED,
    form: { ...server.form, price: '250 000 000', areaOfficial: '65,5' },
    location: { lat: 47.8864, lng: 106.9057, accuracyM: 12, capturedAt: CREATED },
    photos: server.photos.map((p, i) => ({ ...p, file: `photo-${i + 1}.jpg` })),
    scan: { ...scan(), files: { json: `${SCAN}.json`, usdz: `${SCAN}.usdz` } },
    rev: 7,
    syncedRev: 7,
    privateRev: 3,
    privateSyncedRev: 3,
    editVersion: 12,
  };
}

describe('mergeServerCopy', () => {
  it('sees no change when only the typing differs', () => {
    const local = phoneCopy();
    expect(isSynced(local)).toBe(true);
    expect(mergeServerCopy(local, serverCopy(), NOW)).toBeNull();
  });

  it('takes changed fields from the server and stays synced', () => {
    const local = phoneCopy();
    const server = serverCopy({
      form: { ...serverCopy().form, price: '240000000', title: 'Шинэ' },
    });
    const merged = mergeServerCopy(local, server, NOW)!;
    expect(merged.listing.form.price).toBe('240000000');
    expect(merged.listing.form.title).toBe('Шинэ');
    expect(merged.listing.updatedAt).toBe(NOW);
    expect([merged.listing.rev, merged.listing.syncedRev]).toEqual([7, 7]);
    expect(merged.listing.editVersion).toBe(12);
    // Unchanged parts keep the phone's own data.
    expect(merged.listing.photos).toBe(local.photos);
    expect(merged.listing.scan).toBe(local.scan);
    expect(merged.listing.location).toBe(local.location);
    expect(merged.staleFiles).toEqual([]);
    expect(isSynced(merged.listing)).toBe(true);
  });

  it('takes a changed unit number without retyping the other fields', () => {
    const local = phoneCopy();
    const server = serverCopy({ form: { ...serverCopy().form, unitNumber: '46' } });
    const merged = mergeServerCopy(local, server, NOW)!;
    expect(merged.listing.form).toEqual({ ...local.form, unitNumber: '46' });
  });

  it('takes a moved pin', () => {
    const local = phoneCopy();
    const moved = { lat: 47.9, lng: 106.91, accuracyM: null, capturedAt: NOW };
    const merged = mergeServerCopy(local, serverCopy({ location: moved }), NOW)!;
    expect(merged.listing.location).toEqual(moved);
    expect(isSynced(merged.listing)).toBe(true);
  });

  it('takes a status changed on the website', () => {
    const merged = mergeServerCopy(
      phoneCopy(),
      serverCopy({ status: 'sold_or_rented', serverStatus: 'sold_or_rented' }),
      NOW,
    )!;
    expect([merged.listing.status, merged.listing.serverStatus]).toEqual([
      'sold_or_rented',
      'sold_or_rented',
    ]);
    expect(isSynced(merged.listing)).toBe(true);
  });

  it('takes added, removed and reordered photos, keeping files on the phone', () => {
    const local = phoneCopy();
    // On the website: photo 1 removed, photo 3 added as the cover, photo 2 second.
    const server = serverCopy({ photos: [photo(3, 0), photo(2, 1)] });
    const merged = mergeServerCopy(local, server, NOW)!;
    expect(merged.listing.photos.map((p) => [p.id, p.file])).toEqual([
      [photoId(3), null],
      [photoId(2), 'photo-2.jpg'],
    ]);
    expect(merged.staleFiles).toEqual(['photo-1.jpg']);
    expect(isSynced(merged.listing)).toBe(true);
  });

  it('takes room labels of the same scan, keeping its raw files', () => {
    const local = phoneCopy();
    const server = serverCopy({
      scan: { ...scan(), roomLabels: { r1: { label: 'livingRoom', name: 'Зочны' } } },
    });
    const merged = mergeServerCopy(local, server, NOW)!;
    expect(merged.listing.scan).toEqual({
      ...local.scan,
      roomLabels: { r1: { label: 'livingRoom', name: 'Зочны' } },
    });
    expect(merged.staleFiles).toEqual([]);
  });

  it('compares room labels whatever their key order', () => {
    const labels = { a: { label: 'bedroom', name: 'Х' }, b: { label: 'kitchen' } } as const;
    const local = { ...phoneCopy(), scan: { ...phoneCopy().scan!, roomLabels: labels } };
    const server = serverCopy({
      scan: {
        ...scan(),
        roomLabels: { b: { label: 'kitchen' }, a: { name: 'Х', label: 'bedroom' } },
      },
    });
    expect(mergeServerCopy(local, server, NOW)).toBeNull();
  });

  it('takes a scan replaced elsewhere and drops the old raw files', () => {
    const local = phoneCopy();
    const server = serverCopy({
      scan: scan(NEW_SCAN),
      photos: [photo(1, 0), photo(2, 1)],
    });
    const merged = mergeServerCopy(local, server, NOW)!;
    expect(merged.listing.scan?.id).toBe(NEW_SCAN);
    expect(merged.staleFiles).toEqual([`${SCAN}.json`, `${SCAN}.usdz`]);
  });

  it('keeps the phone’s progress while the server has no result for the same scan', () => {
    const local = phoneCopy();
    const server = serverCopy({ scan: { ...scan(), processing: 'pending', totalAreaM2: null } });
    expect(mergeServerCopy(local, server, NOW)).toBeNull();
  });
});

function setupRefresher(listings: LocalListing[]) {
  const persistence = new MemoryPersistence();
  for (const listing of listings) persistence.saved.set(listing.id, listing);
  const store = new ListingStore(persistence);
  store.load();
  const server = new Map<string, LocalListing>();
  const state = {
    time: 1_000_000,
    userId: OWNER as string | null,
    /** The user after the fetch (a session that ended meanwhile). */
    userAfterFetch: undefined as string | null | undefined,
    fetches: [] as string[][],
    removedFiles: [] as string[],
    removedFolders: [] as string[],
    /** Runs while the server is being asked (an edit on the phone meanwhile). */
    duringFetch: null as (() => void) | null,
  };
  let fetched = false;
  const deps: RefreshDeps = {
    store,
    currentUserId: async () =>
      fetched && state.userAfterFetch !== undefined ? state.userAfterFetch : state.userId,
    fetchCopies: async (_owner, ids) => {
      state.fetches.push(ids);
      state.duringFetch?.();
      fetched = true;
      return new Map(ids.flatMap((id) => (server.has(id) ? [[id, server.get(id)!] as const] : [])));
    },
    removeFiles: (id, files) => state.removedFiles.push(...files.map((f) => `${id}/${f}`)),
    removeFolder: (id) => state.removedFolders.push(id),
    now: () => state.time,
  };
  const refresher = new ListingRefresher(deps);
  const refresh = (options?: Parameters<ListingRefresher['refresh']>[0]) => {
    fetched = false;
    return refresher.refresh(options);
  };
  return { store, server, state, refresh, persistence };
}

describe('ListingRefresher', () => {
  it('takes a newer server version and removes stale files', async () => {
    const { store, server, state, refresh, persistence } = setupRefresher([phoneCopy()]);
    server.set(ID, serverCopy({ photos: [photo(2, 0)] }));
    expect(await refresh()).toEqual({ updated: [ID], removed: [] });
    expect(store.get(ID)!.photos.map((p) => p.id)).toEqual([photoId(2)]);
    expect(state.removedFiles).toEqual([`${ID}/photo-1.jpg`]);
    await store.flush();
    expect(persistence.saved.get(ID)!.photos).toHaveLength(1);
  });

  it('leaves a listing with unsent changes alone', async () => {
    const { store, server, state, refresh } = setupRefresher([
      updateForm(phoneCopy(), { title: 'Засварласан' }, NOW),
    ]);
    server.set(ID, serverCopy());
    expect(await refresh()).toEqual({ updated: [], removed: [] });
    expect(state.fetches).toEqual([]);
    expect(store.get(ID)!.form.title).toBe('Засварласан');
  });

  it('drops the server version when the phone changed meanwhile', async () => {
    const { store, server, state, refresh } = setupRefresher([phoneCopy()]);
    server.set(ID, serverCopy({ form: { ...serverCopy().form, title: 'Вэбээс' } }));
    state.duringFetch = () => store.update(ID, (l) => updateForm(l, { title: 'Утаснаас' }, NOW));
    expect(await refresh()).toEqual({ updated: [], removed: [] });
    expect(store.get(ID)!.form.title).toBe('Утаснаас');
  });

  it('removes a listing deleted elsewhere', async () => {
    const { store, state, refresh } = setupRefresher([phoneCopy()]);
    expect(await refresh()).toEqual({ updated: [], removed: [ID] });
    expect(store.get(ID)).toBeUndefined();
    expect(state.removedFolders).toEqual([ID]);
  });

  it('keeps a listing that looks deleted when the session ended during the check', async () => {
    const { store, state, refresh } = setupRefresher([phoneCopy()]);
    state.userAfterFetch = null;
    expect(await refresh()).toEqual({ updated: [], removed: [] });
    expect(store.get(ID)).toBeDefined();
  });

  it('checks only the signed-in owner’s listings that exist on the server', async () => {
    const someoneElse = { ...phoneCopy(), id: OTHER_ID, ownerId: 'someone-else' };
    const neverSent = {
      ...phoneCopy(),
      id: photoId(9),
      remote: { createAttempted: false, created: false },
    };
    const { state, refresh } = setupRefresher([phoneCopy(), someoneElse, neverSent]);
    await refresh();
    expect(state.fetches).toEqual([[ID]]);

    state.userId = null;
    state.time += 60_000;
    await refresh();
    expect(state.fetches).toHaveLength(1);
  });

  it('checks a listing again only after maxAge', async () => {
    const { server, state, refresh } = setupRefresher([phoneCopy()]);
    server.set(ID, serverCopy());
    await refresh();
    state.time += 10_000;
    await refresh();
    expect(state.fetches).toHaveLength(1);
    await refresh({ ids: [ID], maxAgeMs: 5_000 });
    expect(state.fetches).toHaveLength(2);
    state.time += 30_000;
    await refresh({ ids: [OTHER_ID] });
    expect(state.fetches).toHaveLength(2);
  });

  it('runs one check at a time', async () => {
    const { server, state, refresh } = setupRefresher([phoneCopy()]);
    server.set(ID, serverCopy());
    await Promise.all([refresh(), refresh()]);
    // The second waits for the first, then finds the listing just checked.
    expect(state.fetches).toHaveLength(1);
  });
});
