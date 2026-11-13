import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUCKETS, listingPhotoPath } from '@bairmair/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createUser,
  deleteCreatedUsers,
  env,
  removeFolders,
  snapped,
  TINY_JPEG,
  ZAISAN,
  type TestUser,
} from '../../../packages/db/test-remote/helpers';
import { formToFields } from '../src/listings/form';
import {
  addPhotos,
  markDeleted,
  movePhoto,
  newListing,
  removePhoto,
  setLocation,
  updateForm,
  type LocalListing,
} from '../src/listings/model';
import { createSupabaseRemote, type UploadFile } from '../src/listings/remote';
import { downloadListing } from '../src/listings/server-listings';
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

function remoteFor(user: TestUser) {
  return createSupabaseRemote(user.client, {
    supabaseUrl: env.url,
    publishableKey: env.publishableKey,
    uploadFile,
  });
}

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

  it('downloads the listing for editing on another phone', async () => {
    const copy = await downloadListing(alice.client, listingId, alice.id, NOW);
    const local = store.get(listingId)!;
    // Numbers come back in canonical form ("85,5" was typed).
    expect(copy.form).toEqual({ ...local.form, areaOfficial: '85.5' });
    expect(copy.location).toMatchObject({ lat: ZAISAN.lat, lng: ZAISAN.lng });
    expect(copy.photos).toEqual([
      { id: second.id, file: null, width: 2048, height: 1536, state: 'saved', savedSortOrder: 0 },
    ]);
    expect(isSynced(copy)).toBe(true);
  });

  it('deletes the listing with its photos', async () => {
    edit((listing) => markDeleted(listing, NOW));
    await engine.run();

    expect(store.get(listingId)).toBeUndefined();
    const row = await admin.from('listings').select('id').eq('id', listingId);
    expect(row.data).toEqual([]);
    expect(await objectExists(second.id)).toBe(false);
  });
});

/** The listing's current fields, from the local copy. */
async function currentFields() {
  return formToFields(store.get(listingId)!.form).fields!;
}
