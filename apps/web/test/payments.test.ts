import { PAYMENT_LIMITS, PAYMENT_PRODUCTS } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import {
  callbackSignature,
  callbackUrl,
  cancelPayment,
  createPayment,
  getPayment,
  handleCallback,
  type PaymentDeps,
  type PaymentRecord,
  type PaymentStore,
} from '@/server/payments';
import { QPayError, type QPayCheck, type QPayClient } from '@/server/qpay';

const TESTER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const T0 = Date.parse('2026-11-19T00:00:00Z');
const SECRET = 'callback-secret';

function memoryStore(): PaymentStore & { rows: Map<string, PaymentRecord> } {
  const rows = new Map<string, PaymentRecord>();
  const copy = (r: PaymentRecord | undefined) => (r ? { ...r } : null);
  return {
    rows,
    async find(id) {
      return copy(rows.get(id));
    },
    async findOpen(userId, product, subjectId, since) {
      const open = [...rows.values()]
        .filter(
          (r) =>
            r.userId === userId &&
            r.product === product &&
            r.subjectId === subjectId &&
            r.status === 'pending' &&
            Date.parse(r.createdAt) > since.getTime(),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return copy(open[0]);
    },
    async countSince(userId, since) {
      return [...rows.values()].filter(
        (r) => r.userId === userId && Date.parse(r.createdAt) > since.getTime(),
      ).length;
    },
    async insert(payment) {
      const record: PaymentRecord = {
        ...payment,
        status: 'pending',
        paidAt: null,
        fulfilledAt: null,
        checkedAt: null,
        createdAt: new Date(clock.now).toISOString(),
      };
      rows.set(record.id, record);
      return { ...record };
    },
    async markChecked(id, at) {
      rows.get(id)!.checkedAt = at.toISOString();
    },
    async markPaid(id, fields) {
      const row = rows.get(id)!;
      if (row.status !== 'pending') return false;
      row.status = 'paid';
      row.paidAt = fields.paidAt.toISOString();
      return true;
    },
    async markClosed(id, status) {
      const row = rows.get(id)!;
      if (row.status !== 'pending') return false;
      row.status = status;
      return true;
    },
    async markFulfilled(id, at) {
      rows.get(id)!.fulfilledAt ??= at.toISOString();
    },
  };
}

const clock = { now: T0 };

function fakeQPay() {
  const invoices = new Map<string, { status: string; check: QPayCheck }>();
  const created: { senderInvoiceNo: string; amount: number; callbackUrl: string }[] = [];
  let next = 0;
  let refuseCancel = false;
  const client: QPayClient = {
    async createInvoice(input) {
      created.push(input);
      const invoiceId = `inv-${++next}`;
      invoices.set(invoiceId, { status: 'OPEN', check: { rows: [], paidAmount: 0 } });
      return {
        invoiceId,
        qrText: 'qr',
        qrImage: 'png',
        shortUrl: 'https://s.qpay.mn/x',
        bankApps: [],
      };
    },
    async checkInvoice(id) {
      return invoices.get(id)!.check;
    },
    async invoiceStatus(id) {
      return invoices.get(id)!.status;
    },
    async cancelInvoice(id) {
      if (refuseCancel) throw new QPayError('refused', 400);
      invoices.get(id)!.status = 'CANCELED';
    },
  };
  return {
    client,
    created,
    invoices,
    pay(invoiceId: string, amount: number) {
      const invoice = invoices.get(invoiceId)!;
      invoice.status = 'PAID';
      invoice.check = {
        rows: [
          {
            paymentId: 'qp-1',
            status: 'PAID',
            amount,
            currency: 'MNT',
            date: '2026-11-19T00:01:00Z',
          },
        ],
        paidAmount: amount,
      };
    },
    refuseCancel(value: boolean) {
      refuseCancel = value;
    },
  };
}

function setup(overrides: Partial<PaymentDeps> = {}) {
  clock.now = T0;
  const store = memoryStore();
  const qpay = fakeQPay();
  const fulfilled: string[] = [];
  let ids = 0;
  const deps: PaymentDeps = {
    store,
    qpay: qpay.client,
    callback: { origin: 'https://site.test/', secret: SECRET },
    testers: new Set([TESTER]),
    fulfil: {
      test: async (payment) => {
        fulfilled.push(payment.id);
      },
    },
    now: () => new Date(clock.now),
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    ...overrides,
  };
  return { deps, store, qpay, fulfilled };
}

async function created(deps: PaymentDeps) {
  const outcome = await createPayment(deps, TESTER, { product: 'test' });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome;
}

describe('createPayment', () => {
  it('creates an invoice at the catalog price with a signed callback', async () => {
    const { deps, qpay } = setup();
    const outcome = await created(deps);
    expect(outcome.status).toBe(201);
    expect(outcome.body).toMatchObject({
      product: 'test',
      amount: PAYMENT_PRODUCTS.test.amount,
      currency: 'MNT',
      status: 'pending',
      checkout: { qrText: 'qr', qrImage: 'png' },
      expiresAt: new Date(T0 + PAYMENT_LIMITS.ttlMinutes * 60_000).toISOString(),
    });
    const id = outcome.body.id;
    expect(qpay.created[0]).toMatchObject({ senderInvoiceNo: id, amount: 50 });
    expect(qpay.created[0]!.callbackUrl).toBe(
      `https://site.test/api/qpay/callback?id=${id}&sig=${callbackSignature(SECRET, id)}`,
    );
  });

  it('ignores an amount in the request', async () => {
    const { deps, qpay } = setup();
    await createPayment(deps, TESTER, { product: 'test', amount: 1 });
    expect(qpay.created[0]!.amount).toBe(50);
  });

  it('refuses unknown products, bad subjects and non-testers', async () => {
    const { deps } = setup();
    expect(await createPayment(deps, TESTER, { product: 'boost' })).toMatchObject({
      status: 400,
      error: 'payment_invalid',
    });
    expect(await createPayment(deps, TESTER, null)).toMatchObject({ status: 400 });
    expect(await createPayment(deps, TESTER, { product: 'test', subjectId: 'nope' })).toMatchObject(
      { status: 400 },
    );
    expect(await createPayment(deps, OTHER, { product: 'test' })).toMatchObject({
      status: 403,
      error: 'payment_forbidden',
    });
  });

  it('a listing product needs one of the payer’s published listings', async () => {
    const LISTING = '44444444-4444-4444-8444-444444444444';
    const checked: [string, string][] = [];
    const { deps, qpay } = setup({
      subjects: {
        listing: async (userId, listingId) => {
          checked.push([userId, listingId]);
          return listingId === LISTING;
        },
      },
    });
    expect(await createPayment(deps, TESTER, { product: 'listing_gold_7d' })).toMatchObject({
      status: 400,
      error: 'payment_invalid',
    });
    expect(
      await createPayment(deps, TESTER, { product: 'test', subjectId: LISTING }),
    ).toMatchObject({ status: 400, error: 'payment_invalid' });
    expect(
      await createPayment(deps, OTHER, { product: 'listing_gold_7d', subjectId: LISTING }),
    ).toMatchObject({ status: 403, error: 'payment_forbidden' });
    expect(
      await createPayment(deps, TESTER, {
        product: 'listing_gold_7d',
        subjectId: '55555555-5555-4555-8555-555555555555',
      }),
    ).toMatchObject({ status: 409, error: 'payment_listing_not_published' });
    expect(qpay.created).toHaveLength(0);

    const outcome = await createPayment(deps, TESTER, {
      product: 'listing_silver_14d',
      subjectId: LISTING,
    });
    expect(outcome).toMatchObject({ ok: true, status: 201 });
    expect(outcome.ok && outcome.body.subjectId).toBe(LISTING);
    expect(checked.at(-1)).toEqual([TESTER, LISTING]);
  });

  it('a listing product is unavailable without the listing check', async () => {
    const { deps } = setup();
    expect(
      await createPayment(deps, TESTER, {
        product: 'listing_gold_7d',
        subjectId: '44444444-4444-4444-8444-444444444444',
      }),
    ).toMatchObject({ status: 503, error: 'payment_unavailable' });
  });

  it('is unavailable without QPay', async () => {
    const { deps } = setup({ qpay: null });
    expect(await createPayment(deps, TESTER, { product: 'test' })).toMatchObject({
      status: 503,
      error: 'payment_unavailable',
    });
  });

  it('does not reuse an open invoice made at an older price', async () => {
    const { deps, store, qpay } = setup();
    const first = await created(deps);
    // As if the price was different when this invoice was made.
    store.rows.get(first.body.id)!.amount = PAYMENT_PRODUCTS.test.amount + 1;
    const second = await createPayment(deps, TESTER, { product: 'test' });
    expect(second).toMatchObject({ ok: true, status: 201 });
    expect(second.ok && second.body.id).not.toBe(first.body.id);
    expect(second.ok && second.body.amount).toBe(PAYMENT_PRODUCTS.test.amount);
    expect(store.rows.get(first.body.id)!.status).toBe('cancelled');
    expect(qpay.invoices.get('inv-1')!.status).toBe('CANCELED');
  });

  it('returns the open invoice when asked again soon, a new one later', async () => {
    const { deps, qpay } = setup();
    const first = await created(deps);
    clock.now += 5 * 60_000;
    const again = await created(deps);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    clock.now += PAYMENT_LIMITS.reuseMinutes * 60_000;
    const later = await created(deps);
    expect(later.body.id).not.toBe(first.body.id);
    expect(qpay.created).toHaveLength(2);
  });

  it('limits new invoices per hour', async () => {
    const { deps, store } = setup();
    for (let i = 0; i < PAYMENT_LIMITS.perHour; i++) {
      const outcome = await created(deps);
      store.rows.get(outcome.body.id)!.status = 'cancelled';
    }
    expect(await createPayment(deps, TESTER, { product: 'test' })).toMatchObject({
      status: 429,
      error: 'payment_rate_limited',
    });
  });

  it('cancels the invoice when the row cannot be stored', async () => {
    const { deps, qpay } = setup();
    deps.store.insert = async () => {
      throw new Error('db down');
    };
    await expect(createPayment(deps, TESTER, { product: 'test' })).rejects.toThrow('db down');
    expect(qpay.invoices.get('inv-1')!.status).toBe('CANCELED');
  });
});

describe('getPayment', () => {
  it('stays pending until QPay reports the full amount, then delivers once', async () => {
    const { deps, qpay, fulfilled } = setup();
    const { body } = await created(deps);
    expect((await getPayment(deps, TESTER, body.id, { check: true })).ok).toBe(true);

    qpay.pay('inv-1', 5);
    clock.now += 10_000;
    const partly = await getPayment(deps, TESTER, body.id, { check: true });
    expect(partly).toMatchObject({ body: { status: 'pending' } });

    qpay.pay('inv-1', 50);
    clock.now += 10_000;
    const paid = await getPayment(deps, TESTER, body.id, { check: true });
    expect(paid).toMatchObject({
      body: { status: 'paid', checkout: null, paidAt: '2026-11-19T00:01:00.000Z' },
    });
    clock.now += 10_000;
    await getPayment(deps, TESTER, body.id, { check: true });
    expect(fulfilled).toEqual([body.id]);
  });

  it('asks QPay at most every few seconds', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    await getPayment(deps, TESTER, body.id, { check: true });
    qpay.pay('inv-1', 50);
    clock.now += 1000;
    expect(await getPayment(deps, TESTER, body.id, { check: true })).toMatchObject({
      body: { status: 'pending' },
    });
    clock.now += PAYMENT_LIMITS.minCheckSeconds * 1000;
    expect(await getPayment(deps, TESTER, body.id, { check: true })).toMatchObject({
      body: { status: 'paid' },
    });
  });

  it('does not ask QPay without check', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    qpay.pay('inv-1', 50);
    expect(await getPayment(deps, TESTER, body.id, { check: false })).toMatchObject({
      body: { status: 'pending' },
    });
  });

  it("hides other users' payments and bad ids", async () => {
    const { deps } = setup();
    const { body } = await created(deps);
    expect(await getPayment(deps, OTHER, body.id, { check: true })).toMatchObject({
      status: 404,
      error: 'payment_not_found',
    });
    expect(await getPayment(deps, TESTER, 'x', { check: false })).toMatchObject({ status: 404 });
  });

  it('expires an unpaid invoice after the time limit and cancels it at QPay', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    clock.now += PAYMENT_LIMITS.ttlMinutes * 60_000;
    expect(await getPayment(deps, TESTER, body.id, { check: true })).toMatchObject({
      body: { status: 'expired' },
    });
    expect(qpay.invoices.get('inv-1')!.status).toBe('CANCELED');
  });

  it('stays pending when QPay refuses to cancel an expired invoice', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    clock.now += PAYMENT_LIMITS.ttlMinutes * 60_000;
    qpay.refuseCancel(true);
    expect(await getPayment(deps, TESTER, body.id, { check: true })).toMatchObject({
      body: { status: 'pending' },
    });
  });

  it('retries a failed delivery on the next read', async () => {
    let fail = true;
    const reports: unknown[] = [];
    const { deps, qpay } = setup({
      fulfil: {
        test: async () => {
          if (fail) throw new Error('boost failed');
        },
      },
      report: async (error) => {
        reports.push(error);
      },
    });
    const { body } = await created(deps);
    qpay.pay('inv-1', 50);
    expect(await getPayment(deps, TESTER, body.id, { check: true })).toMatchObject({
      body: { status: 'paid' },
    });
    expect(reports).toHaveLength(1);
    fail = false;
    await getPayment(deps, TESTER, body.id, { check: false });
    expect((await deps.store.find(body.id))!.fulfilledAt).not.toBeNull();
  });
});

describe('cancelPayment', () => {
  it('cancels a pending invoice', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    expect(await cancelPayment(deps, TESTER, body.id)).toMatchObject({
      body: { status: 'cancelled', checkout: null },
    });
    expect(qpay.invoices.get('inv-1')!.status).toBe('CANCELED');
  });

  it('keeps a payment that was paid meanwhile', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    qpay.pay('inv-1', 50);
    expect(await cancelPayment(deps, TESTER, body.id)).toMatchObject({ body: { status: 'paid' } });
    expect(qpay.invoices.get('inv-1')!.status).toBe('PAID');
  });

  it("refuses other users' payments", async () => {
    const { deps } = setup();
    const { body } = await created(deps);
    expect(await cancelPayment(deps, OTHER, body.id)).toMatchObject({ status: 404 });
  });
});

describe('handleCallback', () => {
  it('checks the payment when the signature matches', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    qpay.pay('inv-1', 50);
    const url = new URL(callbackUrl(deps.callback, body.id));
    expect(
      await handleCallback(deps, url.searchParams.get('id'), url.searchParams.get('sig')),
    ).toEqual({ ok: true, status: 'paid' });
  });

  it('refuses a wrong or missing signature without asking QPay', async () => {
    const { deps, qpay } = setup();
    const { body } = await created(deps);
    qpay.pay('inv-1', 50);
    expect(await handleCallback(deps, body.id, 'forged')).toEqual({ ok: false });
    expect(await handleCallback(deps, body.id, null)).toEqual({ ok: false });
    expect(await handleCallback(deps, 'not-a-uuid', 'x')).toEqual({ ok: false });
    expect((await deps.store.find(body.id))!.status).toBe('pending');
  });
});
