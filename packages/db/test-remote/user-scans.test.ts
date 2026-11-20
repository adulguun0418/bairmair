import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUCKETS, CONTENT_TYPES, userScanModelPath, userScanRawPaths } from '../src/storage';
import {
  admin,
  anonClient,
  createUser,
  deleteCreatedUsers,
  removeFolders,
  type TestUser,
} from './helpers';

// bairmair scan (migration 20261125100000_user_scans): owner-only rows with a server-made share
// slug, the free scan limit in the insert trigger, column grants for server-maintained fields,
// and the storage policies of the two private buckets.

let alice: TestUser;
let bob: TestUser;

/** A minimal JSON body with the content type the bucket accepts. */
const json = (text: string) => new Blob([text], { type: CONTENT_TYPES.json });

beforeAll(async () => {
  alice = await createUser('scan-alice');
  bob = await createUser('scan-bob');
});

afterAll(async () => {
  for (const user of [alice, bob].filter(Boolean)) {
    await removeFolders(BUCKETS.userScanRaw, [user.id]);
    await removeFolders(BUCKETS.userScanModels, [user.id]);
  }
  await deleteCreatedUsers();
});

describe('user_scans rows', () => {
  const first = randomUUID();
  const second = randomUUID();

  it('lets a user add a scan: their own, with a fresh 12-character link id', async () => {
    const { data, error } = await alice.client
      .from('user_scans')
      .insert({ id: first, title: 'Манай байр', device_model: 'iPhone16,1', app_version: '0.1.0' })
      .select('owner_id, share_slug, link_enabled, status')
      .single();
    expect(error).toBeNull();
    expect(data?.owner_id).toBe(alice.id);
    expect(data?.share_slug).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(data?.link_enabled).toBe(true);
    expect(data?.status).toBe('uploaded');
  });

  it('refuses server-maintained columns on insert', async () => {
    for (const extra of [
      { status: 'ready' as const },
      { share_slug: 'AAAAAAAAAAAA' },
      { owner_id: bob.id },
      { metrics: {} },
      { listing_id: randomUUID() },
    ]) {
      const { error } = await alice.client
        .from('user_scans')
        .insert({ id: randomUUID(), ...extra });
      expect(error?.code, JSON.stringify(extra)).toBe('42501');
    }
  });

  it('stops at 2 scans, and a repeated insert is a duplicate, not over the limit', async () => {
    expect((await alice.client.from('user_scans').insert({ id: second })).error).toBeNull();

    const third = await alice.client.from('user_scans').insert({ id: randomUUID() });
    expect(third.error?.message).toBe('scan_limit_reached');

    const again = await alice.client.from('user_scans').insert({ id: second });
    expect(again.error?.code).toBe('23505');
  });

  it('does not count a scan that became a listing', async () => {
    const listingId = randomUUID();
    const listing = await alice.client
      .from('listings')
      .insert({ id: listingId, type: 'sale', title: 'Скан болсон зар', city_id: 1 });
    expect(listing.error).toBeNull();
    // Step 6: the server links the scan to the listing.
    expect(
      (await admin.from('user_scans').update({ listing_id: listingId }).eq('id', first)).error,
    ).toBeNull();

    const third = randomUUID();
    expect((await alice.client.from('user_scans').insert({ id: third })).error).toBeNull();
    expect((await alice.client.from('user_scans').delete().eq('id', third)).error).toBeNull();
    await admin.from('listings').delete().eq('id', listingId);
  });

  it('shows a scan to its owner only', async () => {
    expect((await bob.client.from('user_scans').select('id').eq('id', second)).data).toEqual([]);
    expect((await anonClient().from('user_scans').select('id')).error?.code).toBe('42501');
    expect((await alice.client.from('user_scans').select('id').eq('id', second)).data).toEqual([
      { id: second },
    ]);
  });

  it('lets the owner change what they own, and nothing the server maintains', async () => {
    const own = await alice.client
      .from('user_scans')
      .update({
        title: 'Шинэ нэр',
        link_enabled: false,
        room_labels: { r1: { label: 'kitchen' } },
        room_dividers: [],
        entrance_door_id: 'door-1',
      })
      .eq('id', second)
      .select('title, link_enabled')
      .single();
    expect(own.error).toBeNull();
    expect(own.data).toEqual({ title: 'Шинэ нэр', link_enabled: false });

    for (const patch of [{ status: 'ready' as const }, { share_slug: 'BBBBBBBBBBBB' }]) {
      const { error } = await alice.client.from('user_scans').update(patch).eq('id', second);
      expect(error?.code, JSON.stringify(patch)).toBe('42501');
    }

    const stranger = await bob.client
      .from('user_scans')
      .update({ title: 'Бобын' })
      .eq('id', second)
      .select('id');
    expect(stranger.data).toEqual([]);
    const after = await admin.from('user_scans').select('title').eq('id', second).single();
    expect(after.data?.title).toBe('Шинэ нэр');
  });

  it('keeps the database shape checks', async () => {
    const { error } = await alice.client
      .from('user_scans')
      .update({ room_dividers: { not: 'an array' } })
      .eq('id', second);
    expect(error?.code).toBe('23514');
  });
});

describe('user scan files', () => {
  const scanId = randomUUID();

  beforeAll(async () => {
    // A slot for this scan: earlier tests left alice at her limit.
    await admin.from('user_scans').delete().eq('owner_id', alice.id);
    const { error } = await alice.client.from('user_scans').insert({ id: scanId });
    if (error) throw error;
  });

  it("lets the owner upload a scan's raw files into their own folder", async () => {
    const paths = userScanRawPaths(alice.id, scanId);
    const raw = alice.client.storage.from(BUCKETS.userScanRaw);
    expect((await raw.upload(paths.json, json('{}'), { upsert: true })).error).toBeNull();
    const usdz = new Blob([new Uint8Array([1, 2, 3])], { type: CONTENT_TYPES.usdz });
    expect((await raw.upload(paths.usdz, usdz, { upsert: true })).error).toBeNull();
    // Uploading again (an interrupted upload repeated) overwrites.
    expect((await raw.upload(paths.json, json('{"a":1}'), { upsert: true })).error).toBeNull();
  });

  it('refuses files without a scan row, in someone else’s folder, or in the model bucket', async () => {
    const raw = alice.client.storage.from(BUCKETS.userScanRaw);
    expect(
      (await raw.upload(userScanRawPaths(alice.id, randomUUID()).json, json('{}'))).error,
    ).not.toBeNull();
    expect(
      (await raw.upload(userScanRawPaths(bob.id, scanId).json, json('{}'))).error,
    ).not.toBeNull();
    expect(
      (
        await alice.client.storage
          .from(BUCKETS.userScanModels)
          .upload(userScanModelPath(alice.id, scanId), json('{}'))
      ).error,
    ).not.toBeNull();
  });

  it('keeps raw files and models private to their owner', async () => {
    const path = userScanRawPaths(alice.id, scanId).json;
    expect((await alice.client.storage.from(BUCKETS.userScanRaw).download(path)).error).toBeNull();
    expect(
      (await bob.client.storage.from(BUCKETS.userScanRaw).download(path)).error,
    ).not.toBeNull();
    expect(
      (await anonClient().storage.from(BUCKETS.userScanRaw).download(path)).error,
    ).not.toBeNull();

    // The server writes the model; its owner may read it, nobody else.
    const modelPath = userScanModelPath(alice.id, scanId);
    const written = await admin.storage
      .from(BUCKETS.userScanModels)
      .upload(modelPath, json('{"m":1}'), { upsert: true });
    expect(written.error).toBeNull();
    expect(
      (await alice.client.storage.from(BUCKETS.userScanModels).download(modelPath)).error,
    ).toBeNull();
    expect(
      (await bob.client.storage.from(BUCKETS.userScanModels).download(modelPath)).error,
    ).not.toBeNull();
  });

  it('lets the owner delete the files, even after the row is gone', async () => {
    expect((await alice.client.from('user_scans').delete().eq('id', scanId)).error).toBeNull();
    const paths = userScanRawPaths(alice.id, scanId);
    const removed = await alice.client.storage
      .from(BUCKETS.userScanRaw)
      .remove([paths.json, paths.usdz]);
    expect(removed.error).toBeNull();
    expect(removed.data?.length).toBe(2);
    const model = await alice.client.storage
      .from(BUCKETS.userScanModels)
      .remove([userScanModelPath(alice.id, scanId)]);
    expect(model.data?.length).toBe(1);
  });
});
