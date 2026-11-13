import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCAN_ON_SITE } from '../src/listing-rules';
import { scanRawPaths } from '../src/storage';
import { admin, createUser, deleteCreatedUsers, ZAISAN, type TestUser } from './helpers';

// listings.scan_verified ("scanned on-site", migration 20261114100000): the current ready scan
// was made close to the listing's exact location, with an accurate enough GPS fix.

const listingId = randomUUID();
let alice: TestUser;

/** About 1.1 km north of Zaisan. */
const FAR = { lat: ZAISAN.lat + 0.01, lng: ZAISAN.lng };
/** About 90 m north: inside the radius. */
const NEAR = { lat: ZAISAN.lat + 0.0008, lng: ZAISAN.lng };

async function verified(): Promise<boolean> {
  const { data, error } = await admin
    .from('listings')
    .select('scan_verified')
    .eq('id', listingId)
    .single();
  if (error) throw error;
  return data.scan_verified;
}

/** A scan by the seller, made ready by the server (service role), so it becomes current. */
async function readyScan(location: { lat: number; lng: number; accuracy: number } | null) {
  const id = randomUUID();
  const paths = scanRawPaths(listingId, id);
  const insert = await alice.client.from('room_scans').insert({
    id,
    listing_id: listingId,
    raw_json_path: paths.json,
    usdz_path: paths.usdz,
    scan_lat: location?.lat ?? null,
    scan_lng: location?.lng ?? null,
    scan_accuracy_m: location?.accuracy ?? null,
  });
  expect(insert.error).toBeNull();
  const ready = await admin
    .from('room_scans')
    .update({ status: 'ready', metrics: { totalAreaM2: 50 } })
    .eq('id', id);
  expect(ready.error).toBeNull();
  return id;
}

async function moveListing(point: { lat: number; lng: number }) {
  const { error } = await alice.client
    .from('listing_private')
    .update({ lat: point.lat, lng: point.lng })
    .eq('listing_id', listingId);
  expect(error).toBeNull();
}

beforeAll(async () => {
  alice = await createUser('on-site');
  const listing = await alice.client
    .from('listings')
    .insert({ id: listingId, type: 'sale', title: 'Байран дээр скан', city_id: 1 });
  expect(listing.error).toBeNull();
  const location = await alice.client
    .from('listing_private')
    .insert({ listing_id: listingId, lat: ZAISAN.lat, lng: ZAISAN.lng });
  expect(location.error).toBeNull();
});

afterAll(deleteCreatedUsers);

describe('scanned on-site', () => {
  it(`holds within ${SCAN_ON_SITE.maxDistanceM} m with a good fix`, async () => {
    await readyScan({ ...NEAR, accuracy: 12 });
    expect(await verified()).toBe(true);
  });

  it('follows the listing location when the seller moves the pin', async () => {
    await moveListing(FAR);
    expect(await verified()).toBe(false);
    await moveListing(ZAISAN);
    expect(await verified()).toBe(true);
  });

  it(`needs a fix accurate to ${SCAN_ON_SITE.maxAccuracyM} m`, async () => {
    await readyScan({ ...ZAISAN, accuracy: 150 });
    expect(await verified()).toBe(false);
  });

  it('is off for a scan without a location, or a scan made elsewhere', async () => {
    await readyScan(null);
    expect(await verified()).toBe(false);
    await readyScan({ ...FAR, accuracy: 5 });
    expect(await verified()).toBe(false);
  });

  it('sellers cannot change where a scan was made, or set the badge', async () => {
    const id = await readyScan({ ...ZAISAN, accuracy: 5 });
    expect(await verified()).toBe(true);
    const move = await alice.client.from('room_scans').update({ scan_lat: FAR.lat }).eq('id', id);
    expect(move.error?.code).toBe('42501');
    const badge = await alice.client
      .from('listings')
      .update({ scan_verified: true } as never)
      .eq('id', listingId);
    expect(badge.error?.code).toBe('42501');
  });

  it('rejects a scan location outside Mongolia', async () => {
    const id = randomUUID();
    const paths = scanRawPaths(listingId, id);
    const { error } = await alice.client.from('room_scans').insert({
      id,
      listing_id: listingId,
      raw_json_path: paths.json,
      usdz_path: paths.usdz,
      scan_lat: 37.5665,
      scan_lng: 126.978,
      scan_accuracy_m: 5,
    });
    expect(error?.code).toBe('23514');
  });

  it('turns off when the scans are deleted', async () => {
    const { error } = await alice.client.from('room_scans').delete().eq('listing_id', listingId);
    expect(error).toBeNull();
    expect(await verified()).toBe(false);
  });
});
