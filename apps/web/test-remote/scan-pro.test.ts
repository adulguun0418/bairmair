import { randomInt, randomUUID } from 'node:crypto';
import { PAYMENT_PRODUCTS, type Database, type PaymentResponse } from '@bairmair/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInForTest } from './sign-in';
import { GET } from '@/app/api/payments/[id]/route';

/**
 * bairmair scan Pro delivery end to end, without QPay: a scan Pro payment that is already paid
 * (as after QPay's check) is read through `GET /api/payments/{id}`, whose delivery adds the
 * period with the real store and `add_scan_pro_period` on the dev database. QPay itself is
 * covered by payments.test.ts.
 */

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, noSession);
const DAY = 24 * 60 * 60 * 1000;

let userId: string;
let token: string;
let client: Client;
const paymentIds: string[] = [];

/** A paid, undelivered payment, as the server leaves it right after QPay confirms. */
async function paidPayment(product: 'scan_pro_30d' | 'scan_pro_365d'): Promise<string> {
  const id = randomUUID();
  const { error } = await admin.from('payments').insert({
    id,
    user_id: userId,
    product,
    amount: PAYMENT_PRODUCTS[product].amount,
    description: PAYMENT_PRODUCTS[product].invoiceDescription,
    status: 'paid',
    paid_amount: PAYMENT_PRODUCTS[product].amount,
    paid_at: new Date().toISOString(),
    qpay_invoice_id: `test-${id}`,
    checkout: { qrText: '', qrImage: '', shortUrl: '', bankApps: [] },
  });
  if (error) throw error;
  paymentIds.push(id);
  return id;
}

async function read(id: string): Promise<PaymentResponse> {
  const response = await GET(
    new Request(`http://localhost/api/payments/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as PaymentResponse;
}

async function plan() {
  const { data, error } = await client.rpc('scan_plan');
  if (error) throw error;
  return data[0]!;
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
  client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    noSession,
  );
  token = (await signInForTest(client, { phone, password })).data.session.access_token;
});

afterAll(async () => {
  if (!userId) return;
  await admin.from('scan_subscriptions').delete().eq('user_id', userId);
  if (paymentIds.length > 0) await admin.from('payments').delete().in('id', paymentIds);
  await admin.auth.admin.deleteUser(userId);
});

describe('scan Pro through the payment route', () => {
  it('a paid monthly payment makes the payer Pro for 30 days, once', async () => {
    expect((await plan()).pro_until).toBeNull();
    const id = await paidPayment('scan_pro_30d');

    const before = Date.now();
    expect((await read(id)).status).toBe('paid');
    const after = await plan();
    expect(after.scan_limit).toBe(100);
    const until = Date.parse(after.pro_until!);
    expect(until - before).toBeGreaterThan(30 * DAY - 60_000);
    expect(until - before).toBeLessThan(30 * DAY + 60_000);

    const { data: row } = await admin.from('payments').select('fulfilled_at').eq('id', id).single();
    expect(row?.fulfilled_at).not.toBeNull();

    // Reading it again delivers nothing more.
    await read(id);
    expect(Date.parse((await plan()).pro_until!)).toBe(until);
  });

  it('a yearly payment while Pro adds a year after the current end', async () => {
    const current = Date.parse((await plan()).pro_until!);
    await read(await paidPayment('scan_pro_365d'));
    expect(Date.parse((await plan()).pro_until!)).toBe(current + 365 * DAY);

    const { data } = await client
      .from('scan_subscriptions')
      .select('product_id, source')
      .order('starts_at');
    expect(data).toEqual([
      { product_id: 'scan_pro_30d', source: 'qpay' },
      { product_id: 'scan_pro_365d', source: 'qpay' },
    ]);
  });
});
