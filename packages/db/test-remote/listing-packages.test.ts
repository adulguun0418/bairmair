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

// Listing packages (migration 20261128100000_listing_packages): 1 published listing free, 20 with
// a package, the publish trigger as the judge, hiding past the limit when a package ends, and
// republishing when a new one is bought. The limit is switched on for the test users only
// (`set_listing_limit_tester`), so other users of the dev project are unaffected.

let alice: TestUser;
let bob: TestUser;
const paymentIds: string[] = [];

/** A complete draft with a pin and a photo row: publishable by its owner. */
async function publishableDraft(user: TestUser, title: string): Promise<string> {
  const id = randomUUID();
  const insert = await user.client.from('listings').insert({
    id,
    type: 'sale',
    title,
    price: 300_000_000,
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
  return id;
}

async function setStatus(user: TestUser, id: string, status: 'published' | 'archived') {
  return user.client.from('listings').update({ status }).eq('id', id).select('status').single();
}

async function plan(user: TestUser) {
  const { data, error } = await user.client.rpc('listing_plan');
  if (error) throw error;
  return data[0]!;
}

async function statusOf(id: string) {
  const { data } = await admin
    .from('listings')
    .select('status, plan_paused_at')
    .eq('id', id)
    .single();
  return data!;
}

async function paidPayment(userId: string): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('payments').insert({
    id,
    user_id: userId,
    product: 'listing_pack_30d',
    amount: 29_900,
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

async function addPackage(userId: string, paymentId: string, days = 30) {
  const { data, error } = await admin.rpc('add_listing_package_period', {
    p_user_id: userId,
    p_payment_id: paymentId,
    p_product_id: 'listing_pack_30d',
    p_days: days,
  });
  if (error) throw error;
  return data;
}

/** Ends every package of the user now, as if its time ran out. */
async function endPackages(userId: string) {
  const past = new Date(Date.now() - 60_000).toISOString();
  const { error } = await admin
    .from('listing_packages')
    .update({ starts_at: new Date(Date.now() - 120_000).toISOString(), expires_at: past })
    .eq('user_id', userId);
  if (error) throw error;
}

/** Runs the 15-minute job now (it only touches users the switch covers). */
async function enforce() {
  const { error } = await admin.rpc('enforce_listing_limits');
  if (error) throw error;
}

beforeAll(async () => {
  alice = await createUser('pack-alice');
  bob = await createUser('pack-bob');
  for (const user of [alice, bob]) {
    const { error } = await admin.rpc('set_listing_limit_tester', {
      p_user_id: user.id,
      p_on: true,
    });
    if (error) throw error;
  }
});

afterAll(async () => {
  const users = [alice, bob].filter(Boolean);
  for (const user of users) {
    await admin.rpc('set_listing_limit_tester', { p_user_id: user.id, p_on: false });
  }
  const ids = users.map((user) => user.id);
  await admin.from('listing_packages').delete().in('user_id', ids);
  await admin.from('listings').delete().in('owner_id', ids);
  if (paymentIds.length > 0) await admin.from('payments').delete().in('id', paymentIds);
  await deleteCreatedUsers();
});

describe('listing_plan', () => {
  it('starts free: 1 listing, none live, no package, enforced for a tester', async () => {
    expect(await plan(alice)).toEqual({
      enforced: true,
      listing_limit: 1,
      live_listings: 0,
      paused_listings: 0,
      package_until: null,
    });
  });

  it('is closed to anonymous callers', async () => {
    const { error } = await anonClient().rpc('listing_plan');
    expect(error?.code).toBe('42501');
  });
});

describe('free plan', () => {
  let first = '';
  let second = '';

  it('publishes one listing, refuses the second', async () => {
    first = await publishableDraft(alice, 'Нэг');
    second = await publishableDraft(alice, 'Хоёр');
    expect((await setStatus(alice, first, 'published')).error).toBeNull();
    const refused = await setStatus(alice, second, 'published');
    expect(refused.error?.message).toBe('listing_limit_reached');
    expect((await statusOf(second)).status).toBe('draft');
    expect((await plan(alice)).live_listings).toBe(1);
  });

  it('hiding the free listing frees the slot', async () => {
    expect((await setStatus(alice, first, 'archived')).error).toBeNull();
    expect((await setStatus(alice, second, 'published')).error).toBeNull();
    // Back to one live: the first stays hidden until the second is hidden.
    expect((await setStatus(alice, first, 'published')).error?.message).toBe(
      'listing_limit_reached',
    );
    expect((await setStatus(alice, second, 'archived')).error).toBeNull();
  });

  it('does not limit users the switch does not cover', async () => {
    const { error } = await admin.rpc('set_listing_limit_tester', {
      p_user_id: bob.id,
      p_on: false,
    });
    expect(error).toBeNull();
    const a = await publishableDraft(bob, 'Bob 1');
    const b = await publishableDraft(bob, 'Bob 2');
    expect((await setStatus(bob, a, 'published')).error).toBeNull();
    expect((await setStatus(bob, b, 'published')).error).toBeNull();
    expect((await plan(bob)).enforced).toBe(false);
    await admin.rpc('set_listing_limit_tester', { p_user_id: bob.id, p_on: true });
  });
});

describe('package', () => {
  const ids: string[] = [];

  it('users cannot write packages or call the delivery', async () => {
    const paymentId = await paidPayment(alice.id);
    const insert = await alice.client.from('listing_packages').insert({
      user_id: alice.id,
      product_id: 'listing_pack_30d',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      payment_id: paymentId,
    });
    expect(insert.error?.code).toBe('42501');
    const rpc = await alice.client.rpc('add_listing_package_period', {
      p_user_id: alice.id,
      p_payment_id: paymentId,
      p_product_id: 'listing_pack_30d',
      p_days: 30,
    });
    expect(rpc.error?.code).toBe('42501');
  });

  it('a package allows more live listings; delivering twice adds no time', async () => {
    const paymentId = await paidPayment(alice.id);
    const row = await addPackage(alice.id, paymentId);
    const again = await addPackage(alice.id, paymentId);
    expect(again.id).toBe(row.id);
    const current = await plan(alice);
    expect(current.listing_limit).toBe(20);
    expect(current.package_until).not.toBeNull();

    for (const title of ['Багц нэг', 'Багц хоёр', 'Багц гурав']) {
      const id = await publishableDraft(alice, title);
      ids.push(id);
      expect((await setStatus(alice, id, 'published')).error).toBeNull();
    }
    expect((await plan(alice)).live_listings).toBe(3);
    // The owner reads their package; another user does not.
    expect((await alice.client.from('listing_packages').select('id')).data?.length).toBe(1);
    expect((await bob.client.from('listing_packages').select('id')).data).toEqual([]);
  });

  it('when it ends, all but the first-published listing are hidden', async () => {
    await endPackages(alice.id);
    await enforce();
    expect((await statusOf(ids[0]!)).status).toBe('published');
    for (const id of ids.slice(1)) {
      const row = await statusOf(id);
      expect(row.status).toBe('archived');
      expect(row.plan_paused_at).not.toBeNull();
    }
    expect(await plan(alice)).toMatchObject({
      listing_limit: 1,
      live_listings: 1,
      paused_listings: 2,
      package_until: null,
    });
    // Paused listings are not public.
    const anon = await anonClient().from('listings').select('id').in('id', ids);
    expect(anon.data?.map((row) => row.id)).toEqual([ids[0]]);
  });

  it('a new package republishes the paused listings at once', async () => {
    await addPackage(alice.id, await paidPayment(alice.id));
    for (const id of ids) {
      const row = await statusOf(id);
      expect(row.status).toBe('published');
      expect(row.plan_paused_at).toBeNull();
    }
    expect((await plan(alice)).paused_listings).toBe(0);
  });

  it('a package bought while one runs starts when it ends', async () => {
    const first = await plan(alice);
    const next = await addPackage(alice.id, await paidPayment(alice.id), 1);
    expect(new Date(next.starts_at).getTime()).toBe(new Date(first.package_until!).getTime());
  });
});
