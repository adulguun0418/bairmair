import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUCKETS, listingPhotoPath } from '@bairmair/db';
import { convertRoomPlan } from '@bairmair/room-model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createEmailUser,
  createUser,
  deleteCreatedUsers,
  env,
  removeFolders,
  snapped,
  TINY_JPEG,
  ZAISAN,
  type TestUser,
} from '../../../packages/db/test-remote/helpers';
import { processScan } from '../../web/src/server/process-scan';
import { supabaseScanStore } from '../../web/src/server/supabase';
import { formToFields } from '@bairmair/browse';
import {
  addPhotos,
  assignPhotoRoom,
  attachScan,
  markDeleted,
  movePhoto,
  newListing,
  removePhoto,
  setLocation,
  setRoomLabel,
  setStatus,
  updateForm,
  type LocalListing,
} from '../src/listings/model';
import { createSupabaseRemote, type UploadFile } from '../src/listings/remote';
import { ListingRefresher } from '../src/listings/refresh';
import { downloadListing, fetchServerCopies } from '../src/listings/server-listings';
import { ListingStore, type ListingPersistence } from '../src/listings/store';
import { SyncEngine, type ListingFiles } from '../src/listings/sync-engine';
import { SyncError } from '../src/listings/sync-errors';
import { isSynced } from '../src/listings/sync-plan';

// The sync engine with the real Supabase remote: the payloads it sends must pass RLS, the
// column grants and the table constraints. The native upload is replaced by fetch.

const NOW = new Date().toISOString();
const listingId = randomUUID();
const dir = mkdtempSync(join(tmpdir(), 'bairmair-sync-'));

const uploadFile: UploadFile = async (url, fileUri, headers) => {
  const response = await fetch(url, { method: 'POST', headers, body: await readFile(fileUri) });
  return { status: response.status, body: await response.text() };
};

const files: ListingFiles = {
  uri: (_listingId, file) => join(dir, file),
  exists: (_listingId, file) => existsSync(join(dir, file)),
  removeFolder: () => {},
};

const memory: ListingPersistence = {
  loadAll: () => [],
  save: async () => {},
  remove: async () => {},
};

/**
 * Stands in for the web server: the real route logic (`processScan` with the real store and the
 * secret key), behind the URL the app calls.
 */
const serverFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const match = /\/api\/scans\/([^/]+)\/process$/.exec(String(input));
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  const { data } = await admin.auth.getUser(auth.replace(/^Bearer /, ''));
  if (!match || !data.user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const outcome = await processScan(supabaseScanStore(admin), match[1]!, data.user.id);
  return outcome.ok
    ? Response.json(outcome.body)
    : Response.json({ error: outcome.error }, { status: outcome.status });
}) as typeof fetch;

function remoteFor(user: TestUser) {
  return createSupabaseRemote(user.client, {
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
    uploadFile,
    apiUrl: 'http://api.test',
    fetch: serverFetch,
  });
}

const fixture = readFileSync(
  new URL(
    '../../../packages/room-model/test/fixtures/roomplan/l-shaped-room-shelves.json',
    import.meta.url,
  ),
  'utf8',
);
const fixtureRoomId = convertRoomPlan(JSON.parse(fixture)).model.rooms[0]!.id;

/** A scan "saved by the scanner": the real RoomPlan export and a stand-in USDZ. */
function scanFiles(scanId: string) {
  const files = { json: `scan-${scanId}.json`, usdz: `scan-${scanId}.usdz` };
  writeFileSync(join(dir, files.json), fixture);
  writeFileSync(join(dir, files.usdz), new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  return {
    id: scanId,
    createdAt: NOW,
    files,
    device: { modelId: 'iPhone16,2', osVersion: '26.1' },
    appVersion: '0.1.0',
    location: { ...ZAISAN, accuracyM: 8, capturedAt: NOW },
  };
}

async function rawFileCount(scanId: string): Promise<number> {
  const { data } = await admin.storage.from(BUCKETS.scanRaw).list(`${listingId}/${scanId}`);
  return (data ?? []).length;
}

const firstScan = randomUUID();
const secondScan = randomUUID();

function photo(name: string) {
  writeFileSync(join(dir, name), TINY_JPEG);
  return { id: randomUUID(), file: name, width: 2048, height: 1536 };
}

let alice: TestUser;
let bob: TestUser;
let store: ListingStore;
let engine: SyncEngine;
const first = photo('first.jpg');
const second = photo('second.jpg');

const edit = (change: (listing: LocalListing) => LocalListing) => store.update(listingId, change);

beforeAll(async () => {
  alice = await createUser('seller');
  bob = await createUser('other');
  store = new ListingStore(memory);
  engine = new SyncEngine(store, remoteFor(alice), files);
});

afterAll(async () => {
  await removeFolders(BUCKETS.listingPhotos, [listingId]);
  await removeFolders(BUCKETS.scanRaw, [listingId]);
  await removeFolders(BUCKETS.scanModels, [listingId]);
  await deleteCreatedUsers();
  rmSync(dir, { recursive: true, force: true });
});

async function objectExists(photoId: string): Promise<boolean> {
  const { data } = await admin.storage.from(BUCKETS.listingPhotos).list(listingId);
  return (data ?? []).some((entry) => entry.name === `${photoId}.jpg`);
}

describe('listing sync against the dev project', () => {
  it('sends a new draft with its location, unit number and photos', async () => {
    let listing = newListing(listingId, alice.id, NOW);
    listing = updateForm(
      listing,
      {
        title: 'Зайсан хотхон, 3 өрөө',
        price: '450 000 000',
        rooms: '3',
        areaOfficial: '85,5',
        districtId: 5,
        khoroo: '11',
        mortgageEligible: true,
        unitNumber: '45',
      },
      NOW,
    );
    listing = setLocation(listing, { ...ZAISAN, accuracyM: 8, capturedAt: NOW }, NOW);
    listing = addPhotos(listing, [first, second], NOW);
    store.put(listing);

    await engine.run();

    expect(engine.status(listingId)).toEqual({ state: 'idle' });
    expect(isSynced(store.get(listingId)!)).toBe(true);

    const row = await admin.from('listings').select('*').eq('id', listingId).single();
    expect(row.data).toMatchObject({
      owner_id: alice.id,
      status: 'draft',
      title: 'Зайсан хотхон, 3 өрөө',
      price: 450_000_000,
      rooms: 3,
      area_official_m2: 85.5,
      city_id: 1,
      district_id: 5,
      khoroo: 11,
      mortgage_eligible: true,
      public_lat: snapped(ZAISAN.lat),
      public_lng: snapped(ZAISAN.lng),
    });
    const privateRow = await admin
      .from('listing_private')
      .select('lat, lng, unit_number')
      .eq('listing_id', listingId)
      .single();
    expect(privateRow.data).toEqual({ lat: ZAISAN.lat, lng: ZAISAN.lng, unit_number: '45' });

    const photos = await admin
      .from('listing_photos')
      .select('id, storage_path, sort_order, width, height')
      .eq('listing_id', listingId)
      .order('sort_order');
    expect(photos.data).toEqual([
      {
        id: first.id,
        storage_path: listingPhotoPath(listingId, first.id),
        sort_order: 0,
        width: 2048,
        height: 1536,
      },
      {
        id: second.id,
        storage_path: listingPhotoPath(listingId, second.id),
        sort_order: 1,
        width: 2048,
        height: 1536,
      },
    ]);
    expect(await objectExists(first.id)).toBe(true);
  });

  it('repeats inserts and uploads without errors (interrupted operations)', async () => {
    const remote = remoteFor(alice);
    const fields = { type: 'sale' as const, title: 'Зайсан хотхон, 3 өрөө' };
    await expect(
      remote.createListing(listingId, { ...(await currentFields()), ...fields }),
    ).resolves.toBeUndefined();
    await expect(
      remote.insertPhoto(listingId, { id: first.id, sortOrder: 0, width: 2048, height: 1536 }),
    ).resolves.toBeUndefined();
    await expect(
      remote.uploadPhoto(listingId, first.id, join(dir, 'first.jpg')),
    ).resolves.toBeUndefined();
  });

  it('applies edits: fields, unit number (update path), reorder and photo removal', async () => {
    edit((listing) => updateForm(listing, { price: '430000000', unitNumber: '46' }, NOW));
    edit((listing) => movePhoto(listing, second.id, 0, NOW));
    edit((listing) => removePhoto(listing, first.id, NOW));

    await engine.run();
    expect(isSynced(store.get(listingId)!)).toBe(true);

    const row = await admin.from('listings').select('price').eq('id', listingId).single();
    expect(row.data?.price).toBe(430_000_000);
    const privateRow = await admin
      .from('listing_private')
      .select('unit_number')
      .eq('listing_id', listingId)
      .single();
    expect(privateRow.data?.unit_number).toBe('46');
    const photos = await admin
      .from('listing_photos')
      .select('id, sort_order')
      .eq('listing_id', listingId);
    expect(photos.data).toEqual([{ id: second.id, sort_order: 0 }]);
    expect(await objectExists(first.id)).toBe(false);
  });

  it('refuses another user permanently', async () => {
    const remote = remoteFor(bob);
    const update = remote.updateListing(listingId, await currentFields());
    await expect(update).rejects.toMatchObject({ kind: 'permanent', key: 'listingMissing' });
    const upload = remote.uploadPhoto(listingId, randomUUID(), join(dir, 'first.jpg'));
    await expect(upload).rejects.toBeInstanceOf(SyncError);
    await expect(upload).rejects.toMatchObject({ kind: 'permanent', key: 'rejected' });
    const insert = remote.insertPhoto(listingId, {
      id: randomUUID(),
      sortOrder: 5,
      width: 1,
      height: 1,
    });
    await expect(insert).rejects.toMatchObject({ kind: 'permanent' });
  });

  it('reports a database check as a permanent rejection', async () => {
    const remote = remoteFor(alice);
    const update = remote.updateListing(listingId, { ...(await currentFields()), rooms: 0 });
    await expect(update).rejects.toMatchObject({ kind: 'permanent', key: 'rejected' });
  });

  it('sends a scan with room labels and photo rooms; the server makes it current', async () => {
    edit((listing) => attachScan(listing, scanFiles(firstScan), NOW));
    edit((listing) =>
      setRoomLabel(listing, fixtureRoomId, { label: 'livingRoom', name: 'Том өрөө ' }, NOW),
    );
    edit((listing) => assignPhotoRoom(listing, second.id, fixtureRoomId, NOW));

    await engine.run();
    expect(engine.status(listingId)).toEqual({ state: 'idle' });
    const local = store.get(listingId)!;
    expect(isSynced(local)).toBe(true);
    expect(local.scan).toMatchObject({ row: 'created', processing: 'ready' });

    const scan = await admin
      .from('room_scans')
      .select('status, is_current, room_labels, scan_lat, scan_lng, scan_accuracy_m, device_model')
      .eq('id', firstScan)
      .single();
    expect(scan.data).toEqual({
      status: 'ready',
      is_current: true,
      room_labels: { [fixtureRoomId]: { label: 'livingRoom', name: 'Том өрөө ' } },
      scan_lat: ZAISAN.lat,
      scan_lng: ZAISAN.lng,
      scan_accuracy_m: 8,
      device_model: 'iPhone16,2',
    });
    expect(await rawFileCount(firstScan)).toBe(2);

    const row = await admin
      .from('listings')
      .select('has_3d, area_scanned_m2, scan_verified')
      .eq('id', listingId)
      .single();
    expect(row.data).toEqual({
      has_3d: true,
      area_scanned_m2: local.scan!.totalAreaM2,
      scan_verified: true,
    });

    const photo = await admin
      .from('listing_photos')
      .select('scan_id, room_id')
      .eq('id', second.id)
      .single();
    expect(photo.data).toEqual({ scan_id: firstScan, room_id: fixtureRoomId });
  });

  it('publishes, then hides the listing', async () => {
    edit((listing) => setStatus(listing, 'published', NOW));
    await engine.run();
    expect(store.get(listingId)!.serverStatus).toBe('published');
    const published = await admin
      .from('listings')
      .select('status, published_at')
      .eq('id', listingId)
      .single();
    expect(published.data?.status).toBe('published');
    expect(published.data?.published_at).not.toBeNull();

    edit((listing) => setStatus(listing, 'archived', NOW));
    await engine.run();
    const archived = await admin.from('listings').select('status').eq('id', listingId).single();
    expect(archived.data?.status).toBe('archived');
  });

  it('refuses publishing for an account without a verified phone', async () => {
    const carol = await createEmailUser('no-phone');
    const remote = remoteFor(carol);
    const id = randomUUID();
    await remote.createListing(id, { ...(await currentFields()), title: 'Утасгүй' });
    await expect(remote.setStatus(id, 'published')).rejects.toMatchObject({
      kind: 'permanent',
      key: 'needsVerifiedPhone',
    });
  });

  it('a rescan replaces the scan once the new one is processed', async () => {
    edit((listing) => attachScan(listing, scanFiles(secondScan), NOW));
    await engine.run();
    expect(isSynced(store.get(listingId)!)).toBe(true);

    const scans = await admin
      .from('room_scans')
      .select('id, is_current')
      .eq('listing_id', listingId);
    expect(scans.data).toEqual([{ id: secondScan, is_current: true }]);
    expect(await rawFileCount(firstScan)).toBe(0);
    // Room ids belong to one scan: the photo is no longer in a room.
    const photo = await admin
      .from('listing_photos')
      .select('scan_id, room_id')
      .eq('id', second.id)
      .single();
    expect(photo.data).toEqual({ scan_id: null, room_id: null });
  });

  it('downloads the listing for editing on another phone', async () => {
    const copy = await downloadListing(alice.client, listingId, alice.id, NOW);
    const local = store.get(listingId)!;
    // Numbers come back in canonical form ("85,5" was typed).
    expect(copy.form).toEqual({ ...local.form, areaOfficial: '85.5' });
    expect(copy.location).toMatchObject({ lat: ZAISAN.lat, lng: ZAISAN.lng });
    expect(copy.serverStatus).toBe('archived');
    expect(copy.photos).toEqual([
      {
        id: second.id,
        file: null,
        width: 2048,
        height: 1536,
        state: 'saved',
        savedSortOrder: 0,
        roomId: null,
        savedRoom: null,
      },
    ]);
    expect(copy.scan).toMatchObject({
      id: secondScan,
      files: null,
      processing: 'ready',
      totalAreaM2: local.scan!.totalAreaM2,
      // Through the owner-only scan_location() RPC: the column is not readable.
      location: { lat: ZAISAN.lat, lng: ZAISAN.lng, accuracyM: 8 },
    });
    expect(isSynced(copy)).toBe(true);
  });

  it('takes edits made on the website into the phone copy', async () => {
    // What the web editor does: direct writes to the tables and storage.
    const added = photo('web.jpg');
    const remote = remoteFor(alice);
    await remote.uploadPhoto(listingId, added.id, join(dir, added.file));
    await remote.insertPhoto(listingId, { id: added.id, sortOrder: 1, width: 1024, height: 768 });
    const updated = await alice.client
      .from('listings')
      .update({ title: 'Зайсан хотхон, вэбээс засав', price: 420_000_000 })
      .eq('id', listingId);
    expect(updated.error).toBeNull();
    const unit = await alice.client
      .from('listing_private')
      .update({ unit_number: '47' })
      .eq('listing_id', listingId);
    expect(unit.error).toBeNull();

    const before = store.get(listingId)!;
    const removedFiles: string[] = [];
    const refresher = new ListingRefresher({
      store,
      currentUserId: () => remote.currentUserId(),
      fetchCopies: (ownerId, ids, knownScans, now) =>
        fetchServerCopies(alice.client, ownerId, ids, knownScans, now),
      removeFiles: (_id, names) => removedFiles.push(...names),
      removeFolder: () => {},
      now: () => Date.now(),
    });
    expect(await refresher.refresh()).toEqual({ updated: [listingId], removed: [] });

    const after = store.get(listingId)!;
    expect(after.form).toMatchObject({
      title: 'Зайсан хотхон, вэбээс засав',
      price: '420000000',
      unitNumber: '47',
    });
    expect(after.photos.map((p) => [p.id, p.file])).toEqual([
      [second.id, before.photos[0]!.file],
      [added.id, null],
    ]);
    // The same scan: the phone keeps its raw files and GPS fix.
    expect(after.scan).toBe(before.scan);
    expect(removedFiles).toEqual([]);
    expect(isSynced(after)).toBe(true);

    // Nothing changed since: the next check finds the same listing.
    expect(await refresher.refresh({ maxAgeMs: 0 })).toEqual({ updated: [], removed: [] });
    // Another user, or a listing that is not there, gets no copy.
    expect((await fetchServerCopies(bob.client, alice.id, [listingId], new Map(), NOW)).size).toBe(
      0,
    );
    const missing = await fetchServerCopies(
      alice.client,
      alice.id,
      [listingId, randomUUID()],
      new Map(),
      NOW,
    );
    expect([...missing.keys()]).toEqual([listingId]);
  });

  it('deletes the listing with its photos and raw scan files', async () => {
    edit((listing) => markDeleted(listing, NOW));
    await engine.run();

    expect(store.get(listingId)).toBeUndefined();
    const row = await admin.from('listings').select('id').eq('id', listingId);
    expect(row.data).toEqual([]);
    expect(await objectExists(second.id)).toBe(false);
    expect(await rawFileCount(secondScan)).toBe(0);
  });
});

/** The listing's current fields, from the local copy. */
async function currentFields() {
  return formToFields(store.get(listingId)!.form).fields!;
}
