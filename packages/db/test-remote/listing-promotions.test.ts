import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listingPhotoPath } from '../src/index';
import {
  ZAISAN,
  admin,
  anonClient,
  createUser,
  deleteCreatedUsers,
  type TestUser,
} from './helpers';

// Gold / Silver listings (migration 20261129100000_listing_promotions): stacking, ownership,
// who can read what, and the order in search_listings (Gold, then Silver, in every sort).

let alice: TestUser;
let bob: TestUser;
const paymentIds: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

async function publishedListing(user: TestUser, title: string, price: number): Promise<string> {
  const id = randomUUID();
  const insert = await user.client.from('listings').insert({
    id,
    type: 'sale',
    title,
    price,
    rooms: 2,
    area_official_m2: 55,
    city_id: 1,
    district_id: 5,
  });
  if (insert.error) throw insert.error;
  const pin = await user.client
    .from('listing_private')
    .insert({ listing_id: id, lat: ZAISAN.lat, lng: ZAISAN.lng });
  if (pin.error) throw pin.error;
  const photoId = randomUUID();
  const photo = await user.client
    .from('listing_photos')
    .insert({ id: photoId, listing_id: id, storage_path: listingPhotoPath(id, photoId) });
  if (photo.error) throw photo.error;
  const publish = await user.client.from('listings').update({ status: 'published' }).eq('id', id);
  if (publish.error) throw publish.error;
  return id;
}

async function paidPayment(userId: string, listingId: string): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('payments').insert({
    id,
    user_id: userId,
    product: 'listing_gold_7d',
    subject_id: listingId,
    amount: 100,
    description: 'test',
    status: 'paid',
    paid_at: new Date().toISOString(),
    qpay_invoice_id: `test-${id}`,
    checkout: {},
  });
  if (error) throw error;
  paymentIds.push(id);
  return id;
}

async function promote(
  user: TestUser,
  listingId: string,
  tier: 'gold' | 'silver',
  days = 7,
  paymentId?: string,
) {
  const payment = paymentId ?? (await paidPayment(user.id, listingId));
  const { data, error } = await admin.rpc('add_listing_promotion_period', {
    p_user_id: user.id,
    p_listing_id: listingId,
    p_payment_id: payment,
    p_product_id: `listing_${tier}_${days}d`,
    p_tier: tier,
    p_days: days,
  });
  if (error) throw error;
  return { row: data, paymentId: payment };
}

async function periods(listingId: string) {
  const { data, error } = await admin
    .from('listing_promotions')
    .select('tier, starts_at, expires_at')
    .eq('listing_id', listingId)
    .order('starts_at');
  if (error) throw error;
  return data.map((p) => ({
    tier: p.tier,
    // Days from now, rounded: the calls run within seconds of each other.
    from: Math.round((Date.parse(p.starts_at) - Date.now()) / DAY),
    to: Math.round((Date.parse(p.expires_at) - Date.now()) / DAY),
  }));
}

async function search(sort: string) {
  const { data, error } = await anonClient().rpc('search_listings', {
    p_owner_id: alice.id,
    p_sort: sort,
  });
  if (error) throw error;
  return data.map((row) => ({ title: row.title, tier: row.promotion_tier }));
}

beforeAll(async () => {
  alice = await createUser('promo-alice');
  bob = await createUser('promo-bob');
});

afterAll(async () => {
  const ids = [alice, bob].filter(Boolean).map((user) => user.id);
  await admin.from('listings').delete().in('owner_id', ids);
  if (paymentIds.length > 0) await admin.from('payments').delete().in('id', paymentIds);
  await deleteCreatedUsers();
});

describe('stacking', () => {
  let listing = '';

  it('silver now, then gold moves the silver time after it', async () => {
    listing = await publishedListing(alice, 'Давхарлах', 300_000_000);
    await promote(alice, listing, 'silver', 7);
    await promote(alice, listing, 'gold', 7);
    expect(await periods(listing)).toEqual([
      { tier: 'silver', from: 0, to: 14 },
      { tier: 'gold', from: 0, to: 7 },
    ]);
  });

  it('silver bought during gold starts after everything', async () => {
    await promote(alice, listing, 'silver', 7);
    expect((await periods(listing)).at(-1)).toEqual({ tier: 'silver', from: 14, to: 21 });
  });

  it('gold again starts after the last gold and moves later silver', async () => {
    await promote(alice, listing, 'gold', 14);
    expect(await periods(listing)).toEqual([
      { tier: 'silver', from: 0, to: 28 },
      { tier: 'gold', from: 0, to: 7 },
      { tier: 'gold', from: 7, to: 21 },
      { tier: 'silver', from: 28, to: 35 },
    ]);
  });

  it('repeating a delivery adds nothing', async () => {
    const first = await promote(alice, listing, 'silver', 7);
    const again = await promote(alice, listing, 'silver', 7, first.paymentId);
    expect(again.row?.id).toBe(first.row?.id);
    expect((await periods(listing)).length).toBe(5);
  });

  it('another user’s listing gets nothing', async () => {
    const { row } = await promote(bob, listing, 'gold', 7);
    expect(row?.id ?? null).toBeNull();
    expect((await periods(listing)).length).toBe(5);
  });
});

describe('who reads what', () => {
  it('the payer reads their periods; others and anonymous callers do not', async () => {
    const own = await alice.client.from('listing_promotions').select('id');
    expect(own.error).toBeNull();
    expect(own.data!.length).toBeGreaterThan(0);
    const other = await bob.client.from('listing_promotions').select('id');
    expect(other.data).toEqual([]);
    const anon = await anonClient().from('listing_promotions').select('id');
    expect(anon.error?.code).toBe('42501');
  });

  it('nobody but the server adds periods', async () => {
    const { error } = await alice.client.rpc('add_listing_promotion_period', {
      p_user_id: alice.id,
      p_listing_id: randomUUID(),
      p_payment_id: randomUUID(),
      p_product_id: 'listing_gold_7d',
      p_tier: 'gold',
      p_days: 7,
    });
    expect(error?.code).toBe('42501');
  });
});

describe('search order', () => {
  beforeAll(async () => {
    await admin.from('listings').delete().eq('owner_id', alice.id);
    // Published in this order, so "newest" without tiers would be D, C, B, A.
    const a = await publishedListing(alice, 'A', 100_000_000);
    const b = await publishedListing(alice, 'B', 200_000_000);
    await publishedListing(alice, 'C', 300_000_000);
    await publishedListing(alice, 'D', 400_000_000);
    await promote(alice, b, 'gold');
    await promote(alice, a, 'silver');
  });

  it('gold first, then silver, in every sort', async () => {
    for (const sort of ['recommended', 'newest', 'price_asc', 'price_desc']) {
      const rows = await search(sort);
      expect(rows.slice(0, 2), sort).toEqual([
        { title: 'B', tier: 'gold' },
        { title: 'A', tier: 'silver' },
      ]);
      expect(rows.slice(2).map((row) => row.tier)).toEqual([null, null]);
    }
    expect((await search('price_desc')).slice(2).map((row) => row.title)).toEqual(['D', 'C']);
  });

  it('a hidden listing loses its place and badge', async () => {
    const { data } = await admin
      .from('listings')
      .select('id')
      .eq('owner_id', alice.id)
      .eq('title', 'B')
      .single();
    await alice.client.from('listings').update({ status: 'archived' }).eq('id', data!.id);
    const tiers = await anonClient().rpc('active_listing_tiers');
    expect(tiers.data?.some((row) => row.listing_id === data!.id)).toBe(false);
    expect((await search('newest'))[0]).toEqual({ title: 'A', tier: 'silver' });
  });
});
