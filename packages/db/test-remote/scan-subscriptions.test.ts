import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonClient, createUser, deleteCreatedUsers, type TestUser } from './helpers';

// bairmair scan Pro (migration 20261126100000_scan_subscriptions): server-written periods, the
// caller's plan, prepaid periods that stack, and the scan limit that follows them.

let alice: TestUser;
let bob: TestUser;
const paymentIds: string[] = [];

const DAY = 24 * 60 * 60 * 1000;

/** A paid payment row to hang a period on (the server makes these after QPay confirms). */
async function paidPayment(userId: string): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('payments').insert({
    id,
    user_id: userId,
    product: 'scan_pro_30d',
    amount: 19_900,
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

async function addPeriod(userId: string, paymentId: string, days: number) {
  const { data, error } = await admin.rpc('add_scan_pro_period', {
    p_user_id: userId,
    p_payment_id: paymentId,
    p_product_id: 'scan_pro_30d',
    p_days: days,
  });
  if (error) throw error;
  return data;
}

async function plan(user: TestUser) {
  const { data, error } = await user.client.rpc('scan_plan');
  if (error) throw error;
  return data[0]!;
}

async function addScan(user: TestUser) {
  return user.client.from('user_scans').insert({ id: randomUUID() });
}

beforeAll(async () => {
  alice = await createUser('pro-alice');
  bob = await createUser('pro-bob');
});

afterAll(async () => {
  const users = [alice, bob].filter(Boolean).map((user) => user.id);
  await admin.from('scan_subscriptions').delete().in('user_id', users);
  if (paymentIds.length > 0) await admin.from('payments').delete().in('id', paymentIds);
  await deleteCreatedUsers();
});

describe('scan_plan', () => {
  it('starts free: 2 scans, none kept, no Pro', async () => {
    expect(await plan(alice)).toEqual({ scan_limit: 2, scans_kept: 0, pro_until: null });
  });

  it('is closed to anonymous callers', async () => {
    const { error } = await anonClient().rpc('scan_plan');
    expect(error?.code).toBe('42501');
  });
});

describe('writing periods', () => {
  it('refuses users: no insert, no add_scan_pro_period', async () => {
    const paymentId = await paidPayment(alice.id);
    const insert = await alice.client.from('scan_subscriptions').insert({
      user_id: alice.id,
      source: 'qpay',
      product_id: 'scan_pro_30d',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + DAY).toISOString(),
      payment_id: paymentId,
    });
    expect(insert.error?.code).toBe('42501');

    const rpc = await alice.client.rpc('add_scan_pro_period', {
      p_user_id: alice.id,
      p_payment_id: paymentId,
      p_product_id: 'scan_pro_30d',
      p_days: 30,
    });
    expect(rpc.error?.code).toBe('42501');
  });

  it('refuses a period outside 1–400 days', async () => {
    const paymentId = await paidPayment(alice.id);
    await expect(addPeriod(alice.id, paymentId, 0)).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('Pro periods and the limit', () => {
  let firstPayment: string;
  let firstExpiry: string;

  it('a paid period makes the user Pro from now, with 100 scans', async () => {
    firstPayment = await paidPayment(alice.id);
    const before = Date.now();
    const row = await addPeriod(alice.id, firstPayment, 30);
    firstExpiry = row.expires_at;
    expect(row.source).toBe('qpay');
    expect(row.status).toBe('active');
    expect(Math.abs(Date.parse(row.starts_at) - before)).toBeLessThan(60_000);
    expect(Date.parse(row.expires_at) - Date.parse(row.starts_at)).toBe(30 * DAY);

    const current = await plan(alice);
    expect(current.scan_limit).toBe(100);
    expect(Date.parse(current.pro_until!)).toBe(Date.parse(firstExpiry));
  });

  it('delivering the same payment again adds no time', async () => {
    const again = await addPeriod(alice.id, firstPayment, 30);
    expect(again.expires_at).toBe(firstExpiry);
    const { count } = await admin
      .from('scan_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', alice.id);
    expect(count).toBe(1);
  });

  it('a period bought while Pro starts when the current one ends', async () => {
    const row = await addPeriod(alice.id, await paidPayment(alice.id), 1);
    expect(Date.parse(row.starts_at)).toBe(Date.parse(firstExpiry));
    expect(Date.parse(row.expires_at)).toBe(Date.parse(firstExpiry) + DAY);
    expect(Date.parse((await plan(alice)).pro_until!)).toBe(Date.parse(row.expires_at));
  });

  it('owners read their own periods, nobody else does', async () => {
    const own = await alice.client.from('scan_subscriptions').select('id, user_id');
    expect(own.data).toHaveLength(2);
    const other = await bob.client.from('scan_subscriptions').select('id');
    expect(other.data).toHaveLength(0);
    const anon = await anonClient().from('scan_subscriptions').select('id');
    expect(anon.data ?? []).toHaveLength(0);
  });

  it('while Pro, a user keeps more than 2 scans', async () => {
    for (let i = 0; i < 3; i++) expect((await addScan(alice)).error).toBeNull();
    expect((await plan(alice)).scans_kept).toBe(3);
  });

  it('when Pro ends, the scans stay but no new one fits', async () => {
    const { error } = await admin
      .from('scan_subscriptions')
      .update({ status: 'revoked' })
      .eq('user_id', alice.id);
    expect(error).toBeNull();

    expect(await plan(alice)).toEqual({ scan_limit: 2, scans_kept: 3, pro_until: null });
    expect((await addScan(alice)).error?.message).toBe('scan_limit_reached');
    const kept = await alice.client.from('user_scans').select('id');
    expect(kept.data).toHaveLength(3);
  });

  it('an expired period, or one that has not started, does not count', async () => {
    const now = Date.now();
    for (const [start, end] of [
      [now - 40 * DAY, now - 10 * DAY],
      [now + DAY, now + 31 * DAY],
    ] as const) {
      const { error } = await admin.from('scan_subscriptions').insert({
        user_id: bob.id,
        source: 'qpay',
        product_id: 'scan_pro_30d',
        starts_at: new Date(start).toISOString(),
        expires_at: new Date(end).toISOString(),
        payment_id: await paidPayment(bob.id),
      });
      expect(error).toBeNull();
    }
    expect(await plan(bob)).toEqual({ scan_limit: 2, scans_kept: 0, pro_until: null });
  });
});
