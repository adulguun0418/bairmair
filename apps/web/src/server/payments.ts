import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  isPaymentProduct,
  PAYMENT_LIMITS,
  PAYMENT_PRODUCTS,
  type ApiErrorKey,
  type PaymentCheckout,
  type PaymentProductKey,
  type PaymentResponse,
  type PaymentStatus,
} from '@bairmair/db';
import type { QPayClient } from './qpay';

/**
 * Payments through QPay, independent of what is sold.
 *
 * - Create: the server takes the price from `PAYMENT_PRODUCTS` (the request names a product, never
 *   an amount), creates the QPay invoice with the payment id as `sender_invoice_no`, then stores
 *   the row. An open invoice for the same product and subject from the last 15 minutes is
 *   returned instead of a new one; at most 10 new invoices per user per hour.
 * - Paid: only when QPay's `/v2/payment/check` lists PAID payments covering the amount. The
 *   callback (signed URL, so strangers cannot make us call QPay) and the waiting page's polling
 *   only trigger that check. `pending → paid` is a conditional update, so concurrent checks
 *   deliver the product once.
 * - Delivery: `fulfil[product]` runs after the payment is paid; `fulfilled_at` records it, and an
 *   undelivered paid payment is retried on the next read.
 * - Expiry: an unpaid invoice older than an hour is cancelled at QPay when next checked. If QPay
 *   refuses the cancel (paid meanwhile), the payment stays pending and the next check finds it.
 */

export interface PaymentRecord {
  id: string;
  userId: string | null;
  product: string;
  subjectId: string | null;
  amount: number;
  description: string;
  status: PaymentStatus;
  qpayInvoiceId: string;
  checkout: PaymentCheckout;
  paidAt: string | null;
  fulfilledAt: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export type NewPayment = Pick<
  PaymentRecord,
  | 'id'
  | 'userId'
  | 'product'
  | 'subjectId'
  | 'amount'
  | 'description'
  | 'qpayInvoiceId'
  | 'checkout'
>;

export interface PaymentStore {
  find(id: string): Promise<PaymentRecord | null>;
  /** The user's newest pending payment for this product and subject created after `since`. */
  findOpen(
    userId: string,
    product: string,
    subjectId: string | null,
    since: Date,
  ): Promise<PaymentRecord | null>;
  /** Payments the user created after `since`. */
  countSince(userId: string, since: Date): Promise<number>;
  insert(payment: NewPayment): Promise<PaymentRecord>;
  markChecked(id: string, at: Date): Promise<void>;
  /** pending → paid. False when the payment was no longer pending. */
  markPaid(
    id: string,
    fields: { paidAmount: number; qpayPaymentId: string | null; paidAt: Date },
  ): Promise<boolean>;
  /** pending → cancelled | expired. False when the payment was no longer pending. */
  markClosed(id: string, status: 'cancelled' | 'expired', at: Date): Promise<boolean>;
  markFulfilled(id: string, at: Date): Promise<void>;
}

/** Delivers a paid product (e.g. turns a boost on). Must be safe to run twice. */
export type Fulfilment = (payment: PaymentRecord) => Promise<void>;

export interface PaymentDeps {
  store: PaymentStore;
  /** Null when payments are not configured on this server. */
  qpay: QPayClient | null;
  /** Public origin for QPay's callback (`https://bairmair.vercel.app`) and the signing secret. */
  callback: { origin: string; secret: string };
  /** User ids allowed to buy `testersOnly` products. */
  testers: ReadonlySet<string>;
  fulfil: Partial<Record<string, Fulfilment>>;
  now: () => Date;
  newId: () => string;
  /** Errors that must not fail the request (a delivery that will be retried). */
  report?: (error: unknown, context: Record<string, string>) => Promise<void>;
}

export type PaymentOutcome =
  | { ok: true; status: 200 | 201; body: PaymentResponse }
  | { ok: false; status: 400 | 403 | 404 | 429 | 503; error: ApiErrorKey };

export const CALLBACK_PATH = '/api/qpay/callback';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** HMAC of the payment id, put in the callback URL. */
export function callbackSignature(secret: string, paymentId: string): string {
  return createHmac('sha256', secret).update(paymentId).digest('base64url');
}

export function verifyCallbackSignature(
  secret: string,
  paymentId: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(callbackSignature(secret, paymentId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function callbackUrl(callback: PaymentDeps['callback'], paymentId: string): string {
  const params = new URLSearchParams({
    id: paymentId,
    sig: callbackSignature(callback.secret, paymentId),
  });
  return `${callback.origin.replace(/\/+$/, '')}${CALLBACK_PATH}?${params}`;
}

function minutesBefore(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60_000);
}

function expiresAt(record: PaymentRecord): Date {
  return new Date(Date.parse(record.createdAt) + PAYMENT_LIMITS.ttlMinutes * 60_000);
}

export function toPaymentResponse(record: PaymentRecord): PaymentResponse {
  return {
    id: record.id,
    product: record.product,
    subjectId: record.subjectId,
    amount: record.amount,
    currency: 'MNT',
    description: record.description,
    status: record.status,
    checkout: record.status === 'pending' ? record.checkout : null,
    createdAt: record.createdAt,
    expiresAt: expiresAt(record).toISOString(),
    paidAt: record.paidAt,
  };
}

function parseCreateRequest(
  body: unknown,
): { product: PaymentProductKey; subjectId: string | null } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { product, subjectId } = body as { product?: unknown; subjectId?: unknown };
  if (!isPaymentProduct(product)) return null;
  if (subjectId !== undefined && subjectId !== null && !isUuid(subjectId)) return null;
  return { product, subjectId: subjectId ?? null };
}

function ok(status: 200 | 201, record: PaymentRecord): PaymentOutcome {
  return { ok: true, status, body: toPaymentResponse(record) };
}

function fail(status: 400 | 403 | 404 | 429 | 503, error: ApiErrorKey): PaymentOutcome {
  return { ok: false, status, error };
}

export async function createPayment(
  deps: PaymentDeps,
  userId: string,
  body: unknown,
): Promise<PaymentOutcome> {
  const request = parseCreateRequest(body);
  if (!request) return fail(400, 'payment_invalid');
  if (!deps.qpay) return fail(503, 'payment_unavailable');
  const product = PAYMENT_PRODUCTS[request.product];
  if (product.testersOnly && !deps.testers.has(userId)) return fail(403, 'payment_forbidden');

  const now = deps.now();
  const open = await deps.store.findOpen(
    userId,
    request.product,
    request.subjectId,
    minutesBefore(now, PAYMENT_LIMITS.reuseMinutes),
  );
  if (open) return ok(200, open);
  if ((await deps.store.countSince(userId, minutesBefore(now, 60))) >= PAYMENT_LIMITS.perHour) {
    return fail(429, 'payment_rate_limited');
  }

  const id = deps.newId();
  const invoice = await deps.qpay.createInvoice({
    senderInvoiceNo: id,
    description: product.invoiceDescription,
    amount: product.amount,
    callbackUrl: callbackUrl(deps.callback, id),
  });
  try {
    const record = await deps.store.insert({
      id,
      userId,
      product: request.product,
      subjectId: request.subjectId,
      amount: product.amount,
      description: product.invoiceDescription,
      qpayInvoiceId: invoice.invoiceId,
      checkout: {
        qrText: invoice.qrText,
        qrImage: invoice.qrImage,
        shortUrl: invoice.shortUrl,
        bankApps: invoice.bankApps,
      },
    });
    return ok(201, record);
  } catch (cause) {
    // Nobody could ever see this invoice; close it so it cannot be paid.
    await deps.qpay.cancelInvoice(invoice.invoiceId).catch(() => undefined);
    throw cause;
  }
}

async function reload(deps: PaymentDeps, id: string): Promise<PaymentRecord> {
  const record = await deps.store.find(id);
  if (!record) throw new Error(`payment ${id} disappeared`);
  return record;
}

async function deliver(deps: PaymentDeps, record: PaymentRecord): Promise<PaymentRecord> {
  if (record.status !== 'paid' || record.fulfilledAt) return record;
  try {
    await deps.fulfil[record.product]?.(record);
    await deps.store.markFulfilled(record.id, deps.now());
    return reload(deps, record.id);
  } catch (cause) {
    await deps.report?.(cause, { payment_id: record.id, step: 'fulfil' });
    return record;
  }
}

/**
 * Brings a payment up to date with QPay: paid (and delivered), expired, or still pending.
 * Without `force`, a payment checked in the last few seconds is returned as stored.
 */
export async function settlePayment(
  deps: PaymentDeps,
  record: PaymentRecord,
  options: { force?: boolean } = {},
): Promise<PaymentRecord> {
  if (record.status === 'paid') return deliver(deps, record);
  if (record.status !== 'pending' || !deps.qpay) return record;

  const now = deps.now();
  const checkedAt = record.checkedAt ? Date.parse(record.checkedAt) : null;
  if (
    !options.force &&
    checkedAt !== null &&
    now.getTime() - checkedAt < PAYMENT_LIMITS.minCheckSeconds * 1000
  ) {
    return record;
  }

  const check = await deps.qpay.checkInvoice(record.qpayInvoiceId);
  await deps.store.markChecked(record.id, now);

  if (check.paidAmount >= record.amount) {
    const paid = check.rows.find((row) => row.status === 'PAID') ?? null;
    const qpayTime = paid?.date ? new Date(paid.date) : null;
    await deps.store.markPaid(record.id, {
      paidAmount: check.paidAmount,
      qpayPaymentId: paid?.paymentId || null,
      paidAt: qpayTime && !Number.isNaN(qpayTime.getTime()) ? qpayTime : now,
    });
    return deliver(deps, await reload(deps, record.id));
  }

  if (now >= expiresAt(record)) {
    try {
      await deps.qpay.cancelInvoice(record.qpayInvoiceId);
    } catch {
      // Paid at this moment, or QPay is down: stay pending, the next check decides.
      return reload(deps, record.id);
    }
    await deps.store.markClosed(record.id, 'expired', now);
  }
  return reload(deps, record.id);
}

async function ownPayment(
  deps: PaymentDeps,
  userId: string,
  paymentId: string,
): Promise<PaymentRecord | null> {
  if (!isUuid(paymentId)) return null;
  const record = await deps.store.find(paymentId);
  return record && record.userId === userId ? record : null;
}

export async function getPayment(
  deps: PaymentDeps,
  userId: string,
  paymentId: string,
  options: { check: boolean },
): Promise<PaymentOutcome> {
  const record = await ownPayment(deps, userId, paymentId);
  if (!record) return fail(404, 'payment_not_found');
  return ok(200, options.check ? await settlePayment(deps, record) : await deliver(deps, record));
}

export async function cancelPayment(
  deps: PaymentDeps,
  userId: string,
  paymentId: string,
): Promise<PaymentOutcome> {
  let record = await ownPayment(deps, userId, paymentId);
  if (!record) return fail(404, 'payment_not_found');
  if (record.status !== 'pending') return ok(200, record);
  if (!deps.qpay) return fail(503, 'payment_unavailable');

  // Paid just now? Then there is nothing to cancel.
  record = await settlePayment(deps, record, { force: true });
  if (record.status !== 'pending') return ok(200, record);

  await deps.qpay.cancelInvoice(record.qpayInvoiceId);
  await deps.store.markClosed(record.id, 'cancelled', deps.now());
  return ok(200, await reload(deps, record.id));
}

/** QPay's callback: verify the signature, then check the payment with QPay. */
export async function handleCallback(
  deps: PaymentDeps,
  paymentId: string | null,
  signature: string | null,
): Promise<{ ok: boolean; status?: PaymentStatus }> {
  if (!isUuid(paymentId) || !verifyCallbackSignature(deps.callback.secret, paymentId, signature)) {
    return { ok: false };
  }
  const record = await deps.store.find(paymentId);
  if (!record) return { ok: false };
  const settled = await settlePayment(deps, record, { force: true });
  return { ok: true, status: settled.status };
}
