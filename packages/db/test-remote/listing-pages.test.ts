import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanRawPaths } from '../src/storage';
import {
  admin,
  anonClient,
  createUser,
  deleteCreatedUsers,
  ZAISAN,
  type TestUser,
} from './helpers';

// Migration 20261115100000 (step 6a): scan locations are private, and the district median price
// per m² behind listing pages.

const anon = anonClient();
let alice: TestUser;
let bob: TestUser;

/** Bagakhangai, dollar rents: a combination no other test or dev listing uses. */
const DISTRICT = 9;
const scanId = randomUUID();
/** About 30 m north of ZAISAN (a literal: float sums would not round-trip exactly). */
const FIX = { lat: 47.8867, lng: ZAISAN.lng, accuracy: 7 };

/** A published dollar rent of 50 m² in DISTRICT, owned by alice. */
async function publishRent(price: number): Promise<string> {
  const id = randomUUID();
  const insert = await alice.client.from('listings').insert({
    id,
    type: 'rent',
    title: 'Түрээсийн байр',
    city_id: 1,
    district_id: DISTRICT,
    price,
    currency: 'USD',
    rooms: 2,
    area_official_m2: 50,
  });
  expect(insert.error).toBeNull();
  const location = await alice.client
    .from('listing_private')
    .insert({ listing_id: id, lat: ZAISAN.lat, lng: ZAISAN.lng });
  expect(location.error).toBeNull();
  const photo = await alice.client
    .from('listing_photos')
    .insert({ listing_id: id, storage_path: `${id}/${randomUUID()}.jpg` });
  expect(photo.error).toBeNull();
  const publish = await alice.client.from('listings').update({ status: 'published' }).eq('id', id);
  expect(publish.error).toBeNull();
  return id;
}

let scannedListing: string;

beforeAll(async () => {
  alice = await createUser('pages-seller');
  bob = await createUser('pages-buyer');

  scannedListing = await publishRent(1000);
  const paths = scanRawPaths(scannedListing, scanId);
  const scan = await alice.client.from('room_scans').insert({
    id: scanId,
    listing_id: scannedListing,
    raw_json_path: paths.json,
    usdz_path: paths.usdz,
    scan_lat: FIX.lat,
    scan_lng: FIX.lng,
    scan_accuracy_m: FIX.accuracy,
  });
  expect(scan.error).toBeNull();
  const ready = await admin
    .from('room_scans')
    .update({ status: 'ready', metrics: { totalAreaM2: 48 } })
    .eq('id', scanId);
  expect(ready.error).toBeNull();
});

afterAll(deleteCreatedUsers);

describe('scan locations', () => {
  it('are not readable from a live listing, by anyone', async () => {
    for (const client of [anon, bob.client, alice.client]) {
      const located = await client.from('room_scans').select('scan_lat, scan_lng').eq('id', scanId);
      expect(located.error?.code).toBe('42501');
      const everything = await client.from('room_scans').select('*').eq('id', scanId);
      expect(everything.error?.code).toBe('42501');
    }
  });

  it('leave the columns a listing page needs readable', async () => {
    const { data, error } = await anon
      .from('room_scans')
      .select('id, status, is_current, model_path, room_labels, metrics')
      .eq('listing_id', scannedListing);
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ id: scanId, status: 'ready', is_current: true }),
    ]);
  });

  it("reach only the scan's owner, through scan_location()", async () => {
    const own = await alice.client.rpc('scan_location', { p_scan_id: scanId });
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ lat: FIX.lat, lng: FIX.lng, accuracy_m: FIX.accuracy }]);

    const other = await bob.client.rpc('scan_location', { p_scan_id: scanId });
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);

    const signedOut = await anon.rpc('scan_location', { p_scan_id: scanId });
    expect(signedOut.error?.code).toBe('42501');
  });
});

describe('district_price_stats', () => {
  beforeAll(async () => {
    await publishRent(1500);
    await publishRent(3000);
    // Not counted: a listing the seller has not confirmed for 20 days, and a draft.
    const stale = await publishRent(10_000);
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const age = await admin.from('listings').update({ last_confirmed_at: old }).eq('id', stale);
    expect(age.error).toBeNull();
    const draft = await alice.client.from('listings').insert({
      type: 'rent',
      title: 'Ноорог',
      city_id: 1,
      district_id: DISTRICT,
      price: 20_000,
      currency: 'USD',
      area_official_m2: 50,
    });
    expect(draft.error).toBeNull();
  });

  it('gives the median price per official m² of fresh live listings, to anyone', async () => {
    const { data, error } = await anon
      .from('district_price_stats')
      .select('listing_count, median_price_per_m2')
      .eq('type', 'rent')
      .eq('district_id', DISTRICT)
      .eq('currency', 'USD');
    expect(error).toBeNull();
    // 1000, 1500 and 3000 dollars for 50 m²: 20, 30 and 60 per m².
    expect(data).toEqual([{ listing_count: 3, median_price_per_m2: 30 }]);
  });
});
