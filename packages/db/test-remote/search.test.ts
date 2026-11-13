import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SearchListingRow, SearchListingsArgs } from '../src/search';
import { scanRawPaths } from '../src/storage';
import {
  admin,
  anonClient,
  createUser,
  deleteCreatedUsers,
  snapped,
  ZAISAN,
  type TestUser,
} from './helpers';

// Migration 20261116100000 (step 6b): search_listings. Every call is narrowed to the test
// seller's listings (p_owner_id), so other data on the dev project does not interfere.

const anon = anonClient();
let alice: TestUser;

/** A word in every test title, for the text query. */
const TOKEN = `srch${randomBytes(4).toString('hex')}`;
const CENTRE = { lat: 47.9186, lng: 106.9176 };

interface Spec {
  type: 'sale' | 'rent';
  district: number;
  rooms: number;
  area: number;
  price: number;
  currency?: 'MNT' | 'USD';
  at?: { lat: number; lng: number };
  complexName?: string;
  photos?: number;
}

/** Creates a complete listing with a location and photos, and publishes it. */
async function publish(spec: Spec): Promise<{ id: string; photoIds: string[] }> {
  const id = randomUUID();
  const insert = await alice.client.from('listings').insert({
    id,
    type: spec.type,
    title: `${TOKEN} ${spec.rooms} өрөө`,
    city_id: 1,
    district_id: spec.district,
    price: spec.price,
    currency: spec.currency ?? 'MNT',
    rooms: spec.rooms,
    area_official_m2: spec.area,
    complex_name: spec.complexName ?? null,
  });
  expect(insert.error).toBeNull();
  const at = spec.at ?? ZAISAN;
  const location = await alice.client
    .from('listing_private')
    .insert({ listing_id: id, lat: at.lat, lng: at.lng });
  expect(location.error).toBeNull();
  // Inserted in reverse sort order, so the cover is not simply the first row written.
  const photoIds: string[] = [];
  for (let order = (spec.photos ?? 1) - 1; order >= 0; order--) {
    const photoId = randomUUID();
    const photo = await alice.client.from('listing_photos').insert({
      id: photoId,
      listing_id: id,
      storage_path: `${id}/${photoId}.jpg`,
      sort_order: order,
    });
    expect(photo.error).toBeNull();
    photoIds.unshift(photoId);
  }
  const published = await alice.client
    .from('listings')
    .update({ status: 'published' })
    .eq('id', id);
  expect(published.error).toBeNull();
  return { id, photoIds };
}

async function search(args: SearchListingsArgs = {}): Promise<SearchListingRow[]> {
  const { data, error } = await anon.rpc('search_listings', { p_owner_id: alice.id, ...args });
  expect(error).toBeNull();
  return data as unknown as SearchListingRow[];
}

const ids = async (args: SearchListingsArgs = {}) => (await search(args)).map((row) => row.id);

let scanned: { id: string; photoIds: string[] };
let centre: string;
let usdRent: string;
let riverRent: string;

beforeAll(async () => {
  alice = await createUser('search-seller');

  // Published in this order, so "newest" is the reverse.
  scanned = await publish({
    type: 'sale',
    district: 5,
    rooms: 2,
    area: 60,
    price: 250e6,
    photos: 2,
  });
  centre = (
    await publish({ type: 'sale', district: 1, rooms: 3, area: 80, price: 400e6, at: CENTRE })
  ).id;
  usdRent = (
    await publish({ type: 'rent', district: 5, rooms: 2, area: 50, price: 1200, currency: 'USD' })
  ).id;
  riverRent = (
    await publish({
      type: 'rent',
      district: 5,
      rooms: 6,
      area: 150,
      price: 3e6,
      complexName: 'Ривер Гарден',
    })
  ).id;

  // A ready scan gives the first listing has_3d.
  const scanId = randomUUID();
  const paths = scanRawPaths(scanned.id, scanId);
  const scan = await alice.client.from('room_scans').insert({
    id: scanId,
    listing_id: scanned.id,
    raw_json_path: paths.json,
    usdz_path: paths.usdz,
  });
  expect(scan.error).toBeNull();
  const ready = await admin
    .from('room_scans')
    .update({ status: 'ready', metrics: { totalAreaM2: 58 } })
    .eq('id', scanId);
  expect(ready.error).toBeNull();

  // Not in search: unconfirmed for 15 days, sold, and a draft.
  const stale = await publish({ type: 'sale', district: 5, rooms: 2, area: 60, price: 250e6 });
  const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const age = await admin.from('listings').update({ last_confirmed_at: old }).eq('id', stale.id);
  expect(age.error).toBeNull();
  const sold = await publish({ type: 'sale', district: 5, rooms: 2, area: 60, price: 250e6 });
  const markSold = await alice.client
    .from('listings')
    .update({ status: 'sold_or_rented' })
    .eq('id', sold.id);
  expect(markSold.error).toBeNull();
  const draft = await alice.client.from('listings').insert({
    type: 'sale',
    title: `${TOKEN} ноорог`,
    city_id: 1,
    district_id: 5,
    price: 250e6,
    rooms: 2,
  });
  expect(draft.error).toBeNull();
});

afterAll(deleteCreatedUsers);

describe('search_listings', () => {
  it('shows anyone only published listings confirmed within 14 days, 3D first', async () => {
    const rows = await search();
    expect(rows.map((row) => row.id)).toEqual([scanned.id, riverRent, usdRent, centre]);
    expect(rows.every((row) => row.total_count === 4)).toBe(true);
    expect(rows[0]).toMatchObject({ has_3d: true, area_scanned_m2: 58, type: 'sale', rooms: 2 });
  });

  it('gives the public pin and the cover photo, never the exact location', async () => {
    const [row] = await search({ p_has_3d: true });
    expect(row).toMatchObject({
      id: scanned.id,
      lat: snapped(ZAISAN.lat),
      lng: snapped(ZAISAN.lng),
      show_exact_location: false,
      cover_photo_id: scanned.photoIds[0],
    });
  });

  it('filters by type, district, rooms and area', async () => {
    expect(await ids({ p_type: 'sale' })).toEqual([scanned.id, centre]);
    expect(await ids({ p_district_ids: [1] })).toEqual([centre]);
    expect(await ids({ p_district_ids: [] })).toHaveLength(4);
    expect(await ids({ p_rooms: [2] })).toEqual([scanned.id, usdRent]);
    expect(await ids({ p_rooms: [5, 6, 7, 8, 9, 10] })).toEqual([riverRent]);
    expect(await ids({ p_area_min: 55, p_area_max: 100 })).toEqual([scanned.id, centre]);
  });

  it('filters by price within one currency', async () => {
    expect(await ids({ p_price_min: 200e6, p_price_max: 300e6 })).toEqual([scanned.id]);
    // Dollar rents are left out of a tögrög price range, and the other way round.
    expect(await ids({ p_price_max: 5e6 })).toEqual([riverRent]);
    expect(await ids({ p_price_max: 1500, p_currency: 'USD' })).toEqual([usdRent]);
  });

  it('matches a phrase case-insensitively, in Cyrillic too, with wildcards taken literally', async () => {
    expect(await ids({ p_query: TOKEN.toUpperCase() })).toHaveLength(4);
    expect(await ids({ p_query: '  РИВЕР гар ' })).toEqual([riverRent]);
    expect(await ids({ p_query: '%' })).toEqual([]);
    expect(await ids({ p_query: '_' })).toEqual([]);
    expect(await ids({ p_query: '   ' })).toHaveLength(4);
  });

  it('finds listings inside a map viewport', async () => {
    const around = (point: { lat: number; lng: number }) => ({
      p_west: point.lng - 0.01,
      p_south: point.lat - 0.01,
      p_east: point.lng + 0.01,
      p_north: point.lat + 0.01,
    });
    expect(await ids(around(CENTRE))).toEqual([centre]);
    expect(await ids(around(ZAISAN))).toEqual([scanned.id, riverRent, usdRent]);
    // An incomplete viewport is no viewport.
    expect(await ids({ p_west: 0 })).toHaveLength(4);
  });

  it('sorts by date and by price, the requested currency first', async () => {
    expect(await ids({ p_sort: 'newest' })).toEqual([riverRent, usdRent, centre, scanned.id]);
    expect(await ids({ p_sort: 'price_asc' })).toEqual([riverRent, scanned.id, centre, usdRent]);
    expect(await ids({ p_sort: 'price_desc' })).toEqual([centre, scanned.id, riverRent, usdRent]);
    expect(await ids({ p_sort: 'price_asc', p_currency: 'USD' })).toEqual([
      usdRent,
      riverRent,
      scanned.id,
      centre,
    ]);
  });

  it('pages through the matches', async () => {
    const first = await search({ p_limit: 2 });
    const second = await search({ p_limit: 2, p_offset: 2 });
    expect([...first, ...second].map((row) => row.id)).toEqual([
      scanned.id,
      riverRent,
      usdRent,
      centre,
    ]);
    expect(second.every((row) => row.total_count === 4)).toBe(true);
    expect(await search({ p_limit: 0 })).toHaveLength(1);
    expect(await search({ p_offset: 4 })).toEqual([]);
  });
});
