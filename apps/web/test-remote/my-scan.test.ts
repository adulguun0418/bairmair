import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BUCKETS, CONTENT_TYPES, scanRawPaths } from '@bairmair/db';
import { applyAnnotations, computeMetrics, dividerFromPlan } from '@bairmair/room-model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addPhoto,
  loadMyListing,
  loadMyScan,
  loadScanModel,
  savePhotoRoom,
  saveScanAnnotations,
} from '@/lib/my-listings';
import { browserClient } from '@/lib/supabase-browser';
import { processScan } from '@/server/process-scan';
import { adminClient, supabaseScanStore } from '@/server/supabase';

/**
 * The website's scan review (`ScanSection` through `src/lib/my-listings.ts`) against the dev
 * project: a throwaway seller's real scan, processed by the server, then read on the website,
 * divided, labelled, and a photo put in a divided room. Same browser client and RLS as the page.
 */

const admin = adminClient();
const fixture = readFileSync(
  new URL(
    '../../../packages/room-model/test/fixtures/roomplan/apartment-whole-open-plan.json',
    import.meta.url,
  ),
  'utf8',
);
const listingId = randomUUID();
const scanId = randomUUID();
let userId = '';

async function removeFolder(bucket: string, folder: string): Promise<void> {
  const queue = [folder];
  const paths: string[] = [];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    for (const entry of data ?? []) {
      if (entry.id === null) queue.push(`${dir}/${entry.name}`);
      else paths.push(`${dir}/${entry.name}`);
    }
  }
  if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
}

beforeAll(async () => {
  const phone = `+9760${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  const client = browserClient();
  const signIn = await client.auth.signInWithPassword({ phone, password });
  if (signIn.error) throw signIn.error;

  // A draft with a scan uploaded as the app uploads it, then processed by the server.
  const listing = await client
    .from('listings')
    .insert({ id: listingId, type: 'sale', title: 'Скан шалгах тест', city_id: 1 });
  expect(listing.error).toBeNull();
  const paths = scanRawPaths(listingId, scanId);
  const scan = await client.from('room_scans').insert({
    id: scanId,
    listing_id: listingId,
    raw_json_path: paths.json,
    usdz_path: paths.usdz,
  });
  expect(scan.error).toBeNull();
  const raw = client.storage.from(BUCKETS.scanRaw);
  expect(
    (await raw.upload(paths.json, new Blob([fixture], { type: CONTENT_TYPES.json }))).error,
  ).toBeNull();
  expect(
    (
      await raw.upload(
        paths.usdz,
        new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: CONTENT_TYPES.usdz }),
      )
    ).error,
  ).toBeNull();
  const processed = await processScan(supabaseScanStore(admin), scanId, userId);
  expect(processed.ok).toBe(true);
});

afterAll(async () => {
  for (const bucket of [BUCKETS.scanRaw, BUCKETS.scanModels, BUCKETS.listingPhotos]) {
    await removeFolder(bucket, listingId);
  }
  await admin.from('listings').delete().eq('id', listingId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('website scan review', () => {
  it('divides a room, labels it, and puts a photo in it', async () => {
    const scan = await loadMyScan(listingId);
    expect(scan).toEqual({ id: scanId, status: 'ready', roomLabels: {}, dividers: [] });
    const converted = await loadScanModel(listingId, scanId);
    expect(converted.rooms).toHaveLength(3);

    // The kitchen side of the open living room, drawn on the plan.
    const divider = dividerFromPlan(converted, 'kitch', [-0.3, 0.6], [-0.3, 3.4]);
    const living = converted.rooms[0]!.id;
    const kitchen = `${living.slice(0, 40)}~kitch`;
    const labels = { [kitchen]: { label: 'kitchen' as const, name: 'Гал тогоо, хоолны өрөө' } };
    await saveScanAnnotations(scanId, labels, [divider]);
    expect(await loadMyScan(listingId)).toEqual({
      id: scanId,
      status: 'ready',
      roomLabels: labels,
      dividers: [divider],
    });

    const model = applyAnnotations(converted, { dividers: [divider], roomLabels: labels });
    expect(model.rooms.map((room) => room.id)).toContain(kitchen);
    expect(model.rooms.find((room) => room.id === kitchen)?.name).toBe('Гал тогоо, хоолны өрөө');
    expect(computeMetrics(model).rooms).toHaveLength(4);

    // A photo in the new room, then out of every room again.
    const photo = await addPhoto(
      listingId,
      {
        blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
        width: 4,
        height: 3,
      },
      0,
    );
    expect(photo.room).toBeNull();
    await savePhotoRoom(photo.id, { scanId, roomId: kitchen });
    expect((await loadMyListing(listingId, userId))!.photos[0]!.room).toEqual({
      scanId,
      roomId: kitchen,
    });
    await savePhotoRoom(photo.id, null);
    expect((await loadMyListing(listingId, userId))!.photos[0]!.room).toBeNull();
  });
});
