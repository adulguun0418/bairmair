import { randomInt, randomUUID } from 'node:crypto';
import type { Database, PaymentResponse } from '@bairmair/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInForTest } from './sign-in';
import { DELETE, GET } from '@/app/api/payments/[id]/route';
import { POST } from '@/app/api/payments/route';
import { GET as CALLBACK } from '@/app/api/qpay/callback/route';
import { callbackUrl } from '@/server/payments';
import { qpayFromEnv } from '@/server/qpay';

/**
 * The payment routes end to end: dev database (RLS, constraints) and the QPay merchant from
 * `QPAY_*` in `.env.local` (the live one: invoices are created and cancelled, never paid).
 * Skipped without QPay settings.
 */

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, noSession);
const configured = Boolean(
  process.env.QPAY_USERNAME && process.env.QPAY_INVOICE_CODE && process.env.QPAY_CALLBACK_SECRET,
);

interface User {
  id: string;
  token: string;
  client: Client;
}
const users: string[] = [];

async function createUser(): Promise<User> {
  const phone = `+9760${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    noSession,
  );
  const signIn = await signInForTest(client, { phone, password });
  return { id: data.user.id, token: signIn.data.session.access_token, client };
}

const request = (path: string, user: User | null, init: RequestInit = {}) =>
  new Request(`http://localhost${path}`, {
    ...init,
    headers: user ? { Authorization: `Bearer ${user.token}` } : {},
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!configured)('payments (QPay live merchant, invoices never paid)', () => {
  let tester: User;
  let other: User;
  let payment: PaymentResponse;
  const testersBefore = process.env.PAYMENT_TESTERS;

  beforeAll(async () => {
    tester = await createUser();
    other = await createUser();
    process.env.PAYMENT_TESTERS = tester.id;
  });

  afterAll(async () => {
    process.env.PAYMENT_TESTERS = testersBefore;
    if (users.length) await admin.from('payments').delete().in('user_id', users);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  it('refuses requests without a token, non-testers and unknown products', async () => {
    const body = JSON.stringify({ product: 'test' });
    expect((await POST(request('/api/payments', null, { method: 'POST', body }))).status).toBe(401);
    const forbidden = await POST(request('/api/payments', other, { method: 'POST', body }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'payment_forbidden' });
    const unknown = await POST(
      request('/api/payments', tester, { method: 'POST', body: '{"product":"gold"}' }),
    );
    expect(unknown.status).toBe(400);
  });

  it('creates an invoice with a QR code and bank apps, and reuses it', async () => {
    const body = JSON.stringify({ product: 'test' });
    const response = await POST(request('/api/payments', tester, { method: 'POST', body }));
    expect(response.status).toBe(201);
    payment = (await response.json()) as PaymentResponse;
    expect(payment).toMatchObject({ product: 'test', amount: 100, status: 'pending' });
    expect(payment.checkout?.qrText).toMatch(/^0002/);
    expect(payment.checkout?.shortUrl).toMatch(/^https:\/\/s\.qpay\.mn\//);
    expect(payment.checkout?.bankApps.length).toBeGreaterThan(5);

    const again = await POST(request('/api/payments', tester, { method: 'POST', body }));
    expect(again.status).toBe(200);
    expect(((await again.json()) as PaymentResponse).id).toBe(payment.id);
  });

  it('checks the payment with QPay: still pending', async () => {
    const response = await GET(
      request(`/api/payments/${payment.id}?check=1`, tester),
      ctx(payment.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: payment.id, status: 'pending' });

    const stored = await admin.from('payments').select('checked_at').eq('id', payment.id).single();
    expect(stored.data?.checked_at).not.toBeNull();
  });

  it('hides the payment from other users (route and RLS), and nobody can write it', async () => {
    const response = await GET(request(`/api/payments/${payment.id}`, other), ctx(payment.id));
    expect(response.status).toBe(404);

    const own = await tester.client.from('payments').select('id, status').eq('id', payment.id);
    expect(own.data).toEqual([{ id: payment.id, status: 'pending' }]);
    const foreign = await other.client.from('payments').select('id').eq('id', payment.id);
    expect(foreign.data).toEqual([]);

    const update = await tester.client
      .from('payments')
      .update({ status: 'paid' })
      .eq('id', payment.id);
    expect(update.error?.code).toBe('42501');
    const insert = await tester.client.from('payments').insert({
      id: randomUUID(),
      user_id: tester.id,
      product: 'test',
      amount: 1,
      description: 'x',
      qpay_invoice_id: 'forged',
      checkout: {},
    });
    expect(insert.error?.code).toBe('42501');
  });

  it('answers the callback only with a valid signature', async () => {
    const forged = await CALLBACK(request(`/api/qpay/callback?id=${payment.id}&sig=forged`, null));
    expect(forged.status).toBe(404);

    const signed = new URL(
      callbackUrl(
        { origin: 'http://localhost', secret: process.env.QPAY_CALLBACK_SECRET! },
        payment.id,
      ),
    );
    const response = await CALLBACK(request(`${signed.pathname}${signed.search}`, null));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'pending' });
  });

  it('cancels the invoice at QPay', async () => {
    const response = await DELETE(
      request(`/api/payments/${payment.id}`, tester, { method: 'DELETE' }),
      ctx(payment.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'cancelled', checkout: null });

    const stored = await admin
      .from('payments')
      .select('qpay_invoice_id, closed_at')
      .eq('id', payment.id)
      .single();
    expect(stored.data?.closed_at).not.toBeNull();
    expect(await qpayFromEnv()!.invoiceStatus(stored.data!.qpay_invoice_id)).toBe('CANCELED');
  });
});
