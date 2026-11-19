import type { PaymentBankApp } from '@bairmair/db';

/**
 * QPay Merchant API v2 (https://developer.qpay.mn/mn/docs/merchant?version=2.0.0), the calls the
 * payment flow needs. Checked against production on 2026-11-19: token, invoice, check, invoice
 * read, cancel.
 *
 * - Token: `POST /v2/auth/token` with Basic auth. `expires_in` is an absolute Unix time (seconds),
 *   about 24 h ahead. The token is kept in memory and reused until a minute before it expires, as
 *   QPay asks (no token per invoice; never stored in the database or the browser).
 * - QPay may revoke tokens early: a 401/403 drops the cached token and the call is repeated once
 *   with a new one. A second failure is an error (wrong credentials or permissions).
 * - Every request gives up after 10 s.
 */

export interface QPayConfig {
  /** `https://merchant.qpay.mn` (production) or `https://merchant-sandbox.qpay.mn`. */
  baseUrl: string;
  username: string;
  password: string;
  /** The merchant's invoice template (`invoice_code`), from QPay. */
  invoiceCode: string;
  fetch?: typeof fetch;
  /** Milliseconds since the epoch; replaceable in tests. */
  now?: () => number;
}

export interface QPayInvoice {
  invoiceId: string;
  qrText: string;
  qrImage: string;
  shortUrl: string;
  bankApps: PaymentBankApp[];
}

export interface QPayPaymentRow {
  paymentId: string;
  /** `PAID`, `FAILED`, `REFUNDED`… as QPay sends it. */
  status: string;
  amount: number;
  currency: string;
  date: string | null;
}

export interface QPayCheck {
  rows: QPayPaymentRow[];
  /** Sum of the `PAID` rows in tögrög. */
  paidAmount: number;
}

export interface QPayClient {
  createInvoice(input: {
    /** Our id for the invoice (the payment id). */
    senderInvoiceNo: string;
    description: string;
    amount: number;
    callbackUrl: string;
  }): Promise<QPayInvoice>;
  /** Payments made against an invoice. */
  checkInvoice(invoiceId: string): Promise<QPayCheck>;
  /** `OPEN`, `PAID`, `CANCELED`… */
  invoiceStatus(invoiceId: string): Promise<string>;
  cancelInvoice(invoiceId: string): Promise<void>;
}

/** A QPay call that failed: HTTP status (0 = no answer) and QPay's error code when it sent one. */
export class QPayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'QPayError';
  }
}

const TIMEOUT_MS = 10_000;
/** Renew this long before QPay's expiry. */
const TOKEN_MARGIN_MS = 60_000;

export function createQPayClient(config: QPayConfig): QPayClient {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const base = config.baseUrl.replace(/\/+$/, '');
  let token: { value: string; expiresAt: number } | null = null;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (cause) {
      throw new QPayError(`QPay ${path}: no answer (${String(cause)})`, 0);
    }
  }

  async function fail(path: string, response: Response): Promise<never> {
    let code: string | null = null;
    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      code = typeof body.error === 'string' ? body.error : null;
    } catch {
      // Not JSON.
    }
    throw new QPayError(
      `QPay ${path}: HTTP ${response.status} ${code ?? ''}`.trim(),
      response.status,
      code,
    );
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
    const path = '/v2/auth/token';
    const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const response = await send(path, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!response.ok) await fail(path, response);
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') throw new QPayError(`QPay ${path}: no token`, 502);
    // Absolute Unix seconds; fall back to an hour if QPay ever sends something else.
    const expiresAt =
      typeof body.expires_in === 'number' && body.expires_in * 1000 > now()
        ? body.expires_in * 1000
        : now() + 3_600_000;
    token = { value: body.access_token, expiresAt };
    return token.value;
  }

  async function call(path: string, init: { method: string; body?: unknown }): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(path, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        token = null;
        continue;
      }
      if (!response.ok) await fail(path, response);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : null;
    }
  }

  return {
    async createInvoice(input) {
      const body = (await call('/v2/invoice', {
        method: 'POST',
        body: {
          invoice_code: config.invoiceCode,
          sender_invoice_no: input.senderInvoiceNo,
          // No customer data goes to QPay; "terminal" is QPay's code for an anonymous payer.
          invoice_receiver_code: 'terminal',
          invoice_description: input.description,
          amount: input.amount,
          callback_url: input.callbackUrl,
        },
      })) as Record<string, unknown> | null;
      return parseInvoice(body);
    },

    async checkInvoice(invoiceId) {
      const body = await call('/v2/payment/check', {
        method: 'POST',
        body: {
          object_type: 'INVOICE',
          object_id: invoiceId,
          offset: { page_number: 1, page_limit: 100 },
        },
      });
      return parseCheck(body);
    },

    async invoiceStatus(invoiceId) {
      const body = (await call(`/v2/invoice/${encodeURIComponent(invoiceId)}`, {
        method: 'GET',
      })) as { invoice_status?: unknown } | null;
      if (typeof body?.invoice_status !== 'string') {
        throw new QPayError('QPay invoice: no invoice_status', 502);
      }
      return body.invoice_status;
    },

    async cancelInvoice(invoiceId) {
      await call(`/v2/invoice/${encodeURIComponent(invoiceId)}`, { method: 'DELETE' });
    },
  };
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new QPayError(`QPay invoice: missing ${field}`, 502);
  }
  return value;
}

export function parseInvoice(body: Record<string, unknown> | null): QPayInvoice {
  if (!body) throw new QPayError('QPay invoice: empty answer', 502);
  const urls = Array.isArray(body.urls) ? (body.urls as unknown[]) : [];
  const bankApps: PaymentBankApp[] = [];
  for (const entry of urls) {
    const app = entry as Record<string, unknown> | null;
    if (typeof app?.link !== 'string' || typeof app.name !== 'string') continue;
    bankApps.push({
      name: app.name,
      description: typeof app.description === 'string' ? app.description : app.name,
      logo: typeof app.logo === 'string' ? app.logo : '',
      link: app.link,
    });
  }
  return {
    invoiceId: text(body.invoice_id, 'invoice_id'),
    qrText: text(body.qr_text, 'qr_text'),
    qrImage: text(body.qr_image, 'qr_image'),
    shortUrl: text(body.qPay_shortUrl, 'qPay_shortUrl'),
    bankApps,
  };
}

/** Amounts come as numbers or as strings such as "100.00". */
function amount(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function parseCheck(body: unknown): QPayCheck {
  const rawRows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rawRows)) throw new QPayError('QPay check: no rows', 502);
  const rows: QPayPaymentRow[] = rawRows.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      paymentId: String(row.payment_id ?? ''),
      status: String(row.payment_status ?? ''),
      amount: amount(row.payment_amount),
      currency: String(row.payment_currency ?? 'MNT'),
      date: typeof row.payment_date === 'string' ? row.payment_date : null,
    };
  });
  const paidAmount = rows
    .filter((row) => row.status === 'PAID' && row.currency === 'MNT')
    .reduce((sum, row) => sum + row.amount, 0);
  return { rows, paidAmount };
}

let shared: QPayClient | null | undefined;

/**
 * The server's QPay client from `QPAY_*` env vars (one per server instance, so the token is
 * shared), or null when payments are not configured here (local, Vercel previews).
 */
export function qpayFromEnv(): QPayClient | null {
  if (shared !== undefined) return shared;
  const { QPAY_BASE_URL, QPAY_USERNAME, QPAY_PASSWORD, QPAY_INVOICE_CODE } = process.env;
  shared =
    QPAY_BASE_URL && QPAY_USERNAME && QPAY_PASSWORD && QPAY_INVOICE_CODE
      ? createQPayClient({
          baseUrl: QPAY_BASE_URL,
          username: QPAY_USERNAME,
          password: QPAY_PASSWORD,
          invoiceCode: QPAY_INVOICE_CODE,
        })
      : null;
  return shared;
}
