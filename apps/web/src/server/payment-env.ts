import { randomUUID } from 'node:crypto';
import { reportServerError } from './error-reporting';
import type { PaymentDeps } from './payments';
import { qpayFromEnv } from './qpay';
import { scanProFulfilments } from './scan-pro';
import { adminClient, supabaseAddScanProPeriod, supabasePaymentStore } from './supabase';

/**
 * The payment flow wired to this server: Supabase (secret key), QPay from `QPAY_*`, the callback
 * origin and secret, and the testers. Payments are off (`qpay: null` → 503) unless QPay and
 * `QPAY_CALLBACK_SECRET` are all set: Production only, so previews and local builds never create
 * real invoices by accident.
 */
export function paymentDeps(): PaymentDeps {
  const secret = process.env.QPAY_CALLBACK_SECRET ?? '';
  const qpay = secret ? qpayFromEnv() : null;
  const admin = adminClient();
  return {
    store: supabasePaymentStore(admin),
    qpay,
    callback: {
      origin: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
      secret,
    },
    testers: new Set(
      (process.env.PAYMENT_TESTERS ?? '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    ),
    // What each product delivers once paid: scan Pro products add a Pro period; `test` nothing.
    fulfil: scanProFulfilments(supabaseAddScanProPeriod(admin)),
    now: () => new Date(),
    newId: randomUUID,
    report: (error, context) => reportServerError(error, { route: 'payments', ...context }),
  };
}
