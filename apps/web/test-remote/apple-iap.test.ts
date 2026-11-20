import { randomInt, randomUUID } from 'node:crypto';
import type { Database } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInForTest } from './sign-in';
import { POST as NOTIFICATIONS } from '@/app/api/iap/apple/notifications/route';
import { POST as TRANSACTIONS } from '@/app/api/iap/apple/transactions/route';

/**
 * The Apple In-App Purchase routes wired end to end (sign-in, Apple's real verifier, answers).
 * Only Apple can sign transactions, so this covers refusals; acceptance is covered by the unit
 * tests (fake verifier) and apply_apple_subscription's database tests.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, noSession);

let userId: string;
let token: string;

/** Looks like a JWS (header with an x5c chain, payload, signature) but is not signed by Apple. */
const forged = [
  Buffer.from(JSON.stringify({ alg: 'ES256', x5c: ['AAAA', 'BBBB', 'CCCC'] })).toString(
    'base64url',
  ),
  Buffer.from(
    JSON.stringify({
      bundleId: 'mn.bairmair.scan',
      productId: 'mn.bairmair.scan.pro.yearly',
      originalTransactionId: '1',
      environment: 'Sandbox',
    }),
  ).toString('base64url'),
  'c2lnbmF0dXJl',
].join('.');

const post = (handler: (request: Request) => Promise<Response>, body: unknown, auth = true) =>
  handler(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

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
  const client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    noSession,
  );
  token = (await signInForTest(client, { phone, password })).data.session.access_token;
});

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('POST /api/iap/apple/transactions', () => {
  it('needs a signed-in user', async () => {
    const response = await post(TRANSACTIONS, { signedTransaction: forged }, false);
    expect(response.status).toBe(401);
  });

  it('refuses missing and forged transactions with iap_invalid, and records nothing', async () => {
    for (const body of [{}, { signedTransaction: '' }, { signedTransaction: forged }]) {
      const response = await post(TRANSACTIONS, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'iap_invalid' });
    }
    const { count } = await admin
      .from('scan_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    expect(count).toBe(0);
  });
});

describe('POST /api/iap/apple/notifications', () => {
  it('refuses what Apple did not sign (Apple only sends signed payloads)', async () => {
    expect((await post(NOTIFICATIONS, { signedPayload: forged }, false)).status).toBe(400);
    expect((await post(NOTIFICATIONS, { nothing: true }, false)).status).toBe(400);
  });
});
