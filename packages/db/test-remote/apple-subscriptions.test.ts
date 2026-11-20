import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, createUser, deleteCreatedUsers, type TestUser } from './helpers';

// bairmair scan Pro through Apple (migration 20261127100000_apple_subscriptions):
// apply_apple_subscription() owns rows per original transaction, never moves them to another
// account, and ignores data older than what it holds.

let alice: TestUser;
let bob: TestUser;
const original = `test-${randomUUID()}`;
const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.now() - DAY;
const iso = (ms: number) => new Date(ms).toISOString();

interface Apply {
  user?: string | null;
  original?: string;
  expires?: number;
  status?: 'active' | 'refunded' | 'revoked';
  signed?: number | null;
  autoRenew?: boolean | null;
  renewalSigned?: number | null;
}

async function apply(input: Apply) {
  const signed = input.signed === undefined ? t0 : input.signed;
  const { data, error } = await admin.rpc('apply_apple_subscription', {
    p_user_id: input.user === undefined ? alice.id : (input.user as string),
    p_original_transaction_id: input.original ?? original,
    p_environment: 'Sandbox',
    p_transaction_id: signed === null ? (null as unknown as string) : `tx-${signed}`,
    p_product_id: signed === null ? (null as unknown as string) : 'mn.bairmair.scan.pro.monthly',
    p_starts_at: signed === null ? (null as unknown as string) : iso(t0),
    p_expires_at:
      signed === null ? (null as unknown as string) : iso(input.expires ?? t0 + 30 * DAY),
    p_status: signed === null ? (null as unknown as 'active') : (input.status ?? 'active'),
    p_signed_at: signed === null ? (null as unknown as string) : iso(signed),
    p_auto_renew: (input.autoRenew ?? null) as boolean,
    p_renewal_signed_at: (input.renewalSigned == null
      ? null
      : iso(input.renewalSigned)) as unknown as string,
  });
  if (error) throw error;
  return data;
}

async function row() {
  const { data, error } = await admin
    .from('scan_subscriptions')
    .select('user_id, expires_at, status, apple_auto_renew, apple_transaction_id')
    .eq('apple_original_transaction_id', original)
    .single();
  if (error) throw error;
  return data;
}

async function plan(user: TestUser) {
  const { data, error } = await user.client.rpc('scan_plan');
  if (error) throw error;
  return data[0]!;
}

beforeAll(async () => {
  alice = await createUser('apple-alice');
  bob = await createUser('apple-bob');
});

afterAll(async () => {
  const users = [alice, bob].filter(Boolean).map((user) => user.id);
  await admin.from('scan_subscriptions').delete().in('user_id', users);
  await deleteCreatedUsers();
});

describe('apply_apple_subscription', () => {
  it('is closed to users', async () => {
    const { error } = await alice.client.rpc('apply_apple_subscription', {
      p_user_id: alice.id,
      p_original_transaction_id: original,
      p_environment: 'Sandbox',
      p_transaction_id: 'x',
      p_product_id: 'mn.bairmair.scan.pro.monthly',
      p_starts_at: iso(t0),
      p_expires_at: iso(t0 + 30 * DAY),
      p_status: 'active',
      p_signed_at: iso(t0),
      p_auto_renew: true,
      p_renewal_signed_at: iso(t0),
    });
    expect(error?.code).toBe('42501');
  });

  it('a first transaction makes the account Pro until it expires', async () => {
    expect(await apply({ autoRenew: true, renewalSigned: t0 })).toBe('applied');
    expect(await row()).toMatchObject({
      user_id: alice.id,
      status: 'active',
      apple_auto_renew: true,
      apple_transaction_id: `tx-${t0}`,
    });
    const current = await plan(alice);
    expect(current.scan_limit).toBe(100);
    expect(Date.parse(current.pro_until!)).toBe(t0 + 30 * DAY);
  });

  it('a renewal moves the expiry; older data afterwards changes nothing', async () => {
    expect(await apply({ signed: t0 + 30 * DAY, expires: t0 + 60 * DAY })).toBe('applied');
    expect(await apply({ signed: t0 + 1000, expires: t0 + 30 * DAY })).toBe('stale');
    expect(Date.parse((await row()).expires_at)).toBe(t0 + 60 * DAY);
  });

  it('renewal info alone (auto-renew off) needs no account, the row keeps its owner', async () => {
    expect(
      await apply({ user: null, signed: null, autoRenew: false, renewalSigned: t0 + 2000 }),
    ).toBe('applied');
    expect(await row()).toMatchObject({ user_id: alice.id, apple_auto_renew: false });
    expect(await apply({ user: null, signed: null, autoRenew: true, renewalSigned: t0 + 1 })).toBe(
      'stale',
    );
    expect((await row()).apple_auto_renew).toBe(false);
  });

  it('never moves a subscription to another account', async () => {
    expect(await apply({ user: bob.id, signed: t0 + 40 * DAY, expires: t0 + 90 * DAY })).toBe(
      'other_account',
    );
    expect(await row()).toMatchObject({ user_id: alice.id });
    expect((await plan(bob)).pro_until).toBeNull();
  });

  it('a refund ends Pro, the scans limit goes back to 2', async () => {
    expect(await apply({ signed: t0 + 31 * DAY, expires: t0 + 60 * DAY, status: 'refunded' })).toBe(
      'applied',
    );
    expect(await plan(alice)).toMatchObject({ scan_limit: 2, pro_until: null });
  });

  it('data without a live account makes no row', async () => {
    expect(await apply({ user: randomUUID(), original: `test-${randomUUID()}` })).toBe(
      'unknown_user',
    );
    expect(await apply({ user: null, original: `test-${randomUUID()}` })).toBe('unknown_user');
  });

  it('the owner sees their Apple row', async () => {
    const { data } = await alice.client
      .from('scan_subscriptions')
      .select('source, apple_auto_renew')
      .eq('source', 'apple');
    expect(data).toEqual([{ source: 'apple', apple_auto_renew: false }]);
    const other = await bob.client.from('scan_subscriptions').select('id');
    expect(other.data).toEqual([]);
  });
});
