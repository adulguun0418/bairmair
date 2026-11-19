import { describe, expect, it } from 'vitest';
import { createQPayClient, parseCheck, parseInvoice, QPayError } from '@/server/qpay';

const BASE = 'https://qpay.test';
const T0 = Date.parse('2026-11-19T00:00:00Z');

/** The shape production answered with on 2026-11-19 (values shortened). */
const INVOICE = {
  invoice_id: 'b410bd84-266f-430a-9a0d-9b6a4a815bba',
  qr_text: '000201010212',
  qr_image: 'iVBORw0KGgo=',
  qPay_shortUrl: 'https://s.qpay.mn/abc',
  urls: [
    {
      name: 'Khan bank',
      description: 'Хаан банк',
      logo: 'https://s3.qpay.mn/khan.png',
      link: 'khanbank://q?qPay_QRcode=000201',
    },
    { name: 'broken' },
  ],
};

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

function fakeQPay(handler: (call: Call, tokenNo: number) => Response | undefined) {
  const calls: Call[] = [];
  let tokens = 0;
  let now = T0;
  const fetchFn: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      auth: headers.get('authorization'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    if (call.url === `${BASE}/v2/auth/token`) {
      tokens++;
      return Response.json({
        access_token: `token-${tokens}`,
        expires_in: Math.floor(now / 1000) + 24 * 3600,
      });
    }
    return handler(call, tokens) ?? new Response('not found', { status: 404 });
  };
  const client = createQPayClient({
    baseUrl: `${BASE}/`,
    username: 'MERCHANT',
    password: 'secret',
    invoiceCode: 'MERCHANT_INVOICE',
    fetch: fetchFn,
    now: () => now,
  });
  return {
    client,
    calls,
    tokens: () => tokens,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('QPay client', () => {
  it('gets a token with Basic auth and reuses it', async () => {
    const qpay = fakeQPay((call) =>
      call.url.endsWith('/v2/payment/check') ? Response.json({ count: 0, rows: [] }) : undefined,
    );
    await qpay.client.checkInvoice('inv-1');
    await qpay.client.checkInvoice('inv-1');
    expect(qpay.tokens()).toBe(1);
    expect(qpay.calls[0]!.auth).toBe(`Basic ${Buffer.from('MERCHANT:secret').toString('base64')}`);
    expect(qpay.calls[1]!.auth).toBe('Bearer token-1');
    expect(qpay.calls[1]!.body).toEqual({
      object_type: 'INVOICE',
      object_id: 'inv-1',
      offset: { page_number: 1, page_limit: 100 },
    });
  });

  it('renews the token shortly before it expires', async () => {
    const qpay = fakeQPay(() => Response.json({ rows: [] }));
    await qpay.client.checkInvoice('a');
    qpay.advance(24 * 3600_000 - 30_000);
    await qpay.client.checkInvoice('a');
    expect(qpay.tokens()).toBe(2);
  });

  it('retries once with a new token after a 401', async () => {
    const qpay = fakeQPay((call, tokenNo) =>
      tokenNo === 1 ? new Response('', { status: 401 }) : Response.json({ rows: [] }),
    );
    await expect(qpay.client.checkInvoice('a')).resolves.toEqual({ rows: [], paidAmount: 0 });
    expect(qpay.tokens()).toBe(2);
  });

  it('gives up after a second 401', async () => {
    const qpay = fakeQPay(() => Response.json({ error: 'NO_CREDENDIALS' }, { status: 401 }));
    const error = await qpay.client.checkInvoice('a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QPayError);
    expect(error).toMatchObject({ status: 401, code: 'NO_CREDENDIALS' });
    expect(qpay.tokens()).toBe(2);
  });

  it('creates an invoice without customer data', async () => {
    const qpay = fakeQPay((call) =>
      call.url === `${BASE}/v2/invoice` ? Response.json(INVOICE) : undefined,
    );
    const invoice = await qpay.client.createInvoice({
      senderInvoiceNo: 'pay-1',
      description: 'Тест',
      amount: 100,
      callbackUrl: 'https://site.test/cb',
    });
    expect(qpay.calls[1]!.body).toEqual({
      invoice_code: 'MERCHANT_INVOICE',
      sender_invoice_no: 'pay-1',
      invoice_receiver_code: 'terminal',
      invoice_description: 'Тест',
      amount: 100,
      callback_url: 'https://site.test/cb',
    });
    expect(invoice.invoiceId).toBe(INVOICE.invoice_id);
    expect(invoice.bankApps).toEqual([INVOICE.urls[0]]);
  });

  it('cancels an invoice (empty JSON answer)', async () => {
    const qpay = fakeQPay((call) => (call.method === 'DELETE' ? Response.json({}) : undefined));
    await qpay.client.cancelInvoice('inv/1');
    expect(qpay.calls[1]!.url).toBe(`${BASE}/v2/invoice/inv%2F1`);
  });

  it('turns a network failure into a QPayError with status 0', async () => {
    const client = createQPayClient({
      baseUrl: BASE,
      username: 'u',
      password: 'p',
      invoiceCode: 'c',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(client.invoiceStatus('a')).rejects.toMatchObject({ status: 0 });
  });
});

describe('parseInvoice', () => {
  it('refuses an answer without a QR code', () => {
    expect(() => parseInvoice({ ...INVOICE, qr_text: '' })).toThrow(QPayError);
    expect(() => parseInvoice(null)).toThrow(QPayError);
  });
});

describe('parseCheck', () => {
  it('sums PAID tögrög rows, amounts as strings or numbers', () => {
    const check = parseCheck({
      count: 3,
      rows: [
        { payment_id: 1, payment_status: 'PAID', payment_amount: '60.00', payment_currency: 'MNT' },
        {
          payment_id: '2',
          payment_status: 'PAID',
          payment_amount: 40,
          payment_date: '2026-11-19T01:00:00Z',
        },
        { payment_id: '3', payment_status: 'FAILED', payment_amount: '100.00' },
        { payment_id: '4', payment_status: 'PAID', payment_amount: '5', payment_currency: 'USD' },
      ],
    });
    expect(check.paidAmount).toBe(100);
    expect(check.rows[0]).toEqual({
      paymentId: '1',
      status: 'PAID',
      amount: 60,
      currency: 'MNT',
      date: null,
    });
  });

  it('refuses an answer without rows', () => {
    expect(() => parseCheck({ count: 0 })).toThrow(QPayError);
  });
});
