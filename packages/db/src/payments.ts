/**
 * Payments (QPay): the contract between the web server's payment routes and the apps, and the
 * product list. Prices live here, so the apps can show them, but only the server's copy counts:
 * a request names a product, never an amount.
 */

/** `POST` with `Authorization: Bearer <access token>` and a `CreatePaymentRequest` body. */
export const PAYMENTS_PATH = '/api/payments';

/**
 * `GET` (add `?check=1` to ask QPay first while the payment is pending) or `DELETE` (cancel a
 * pending payment), with `Authorization: Bearer <access token>`.
 */
export function paymentPath(paymentId: string, options: { check?: boolean } = {}): string {
  const path = `${PAYMENTS_PATH}/${encodeURIComponent(paymentId)}`;
  return options.check ? `${path}?check=1` : path;
}

export interface PaymentProduct {
  /** Price in tögrög. */
  amount: number;
  /** Shown to the payer in the bank app (QPay's invoice description). */
  invoiceDescription: string;
  /** Only for the user ids in the server's `PAYMENT_TESTERS` (e.g. a real-money test). */
  testersOnly: boolean;
}

export const PAYMENT_PRODUCTS = {
  /** A small real payment to check the whole QPay flow on production. */
  test: { amount: 100, invoiceDescription: 'bairmair: туршилтын төлбөр', testersOnly: true },
  // bairmair scan Pro, prepaid periods (QPay has no automatic renewal; see SCAN_PRO_PLANS).
  // Testers only until the release step: terms, privacy and hosting are not ready for sales.
  scan_pro_30d: {
    amount: 19_900,
    invoiceDescription: 'bairmair scan Pro: 30 хоног',
    testersOnly: true,
  },
  scan_pro_365d: {
    amount: 199_000,
    invoiceDescription: 'bairmair scan Pro: 1 жил',
    testersOnly: true,
  },
  /** A real payment for one day of Pro, to check the whole Pro flow cheaply. */
  scan_pro_test: {
    amount: 100,
    invoiceDescription: 'bairmair scan Pro: туршилт, 1 өдөр',
    testersOnly: true,
  },
} as const satisfies Record<string, PaymentProduct>;

export type PaymentProductKey = keyof typeof PAYMENT_PRODUCTS;

export function isPaymentProduct(value: unknown): value is PaymentProductKey {
  return typeof value === 'string' && Object.hasOwn(PAYMENT_PRODUCTS, value);
}

/** The products that make a user bairmair scan Pro, and for how long. */
export const SCAN_PRO_PLANS = {
  scan_pro_30d: { days: 30, period: 'month' },
  scan_pro_365d: { days: 365, period: 'year' },
  scan_pro_test: { days: 1, period: 'test' },
} as const satisfies Partial<
  Record<PaymentProductKey, { days: number; period: 'month' | 'year' | 'test' }>
>;

export type ScanProProductKey = keyof typeof SCAN_PRO_PLANS;

export function isScanProProduct(value: unknown): value is ScanProProductKey {
  return typeof value === 'string' && Object.hasOwn(SCAN_PRO_PLANS, value);
}

export const PAYMENT_LIMITS = {
  /** An unpaid invoice is cancelled at QPay and the payment `expired` after this long. */
  ttlMinutes: 60,
  /** Asking again for the same product (and subject) within this time returns the open invoice. */
  reuseMinutes: 15,
  /** New invoices per user per hour. */
  perHour: 10,
  /** How often a waiting page asks for the status (`?check=1`). */
  pollSeconds: 4,
  /** The server asks QPay at most this often per payment; quicker requests get the stored state. */
  minCheckSeconds: 3,
} as const;

export type PaymentStatus = 'pending' | 'paid' | 'cancelled' | 'expired';

export interface CreatePaymentRequest {
  product: PaymentProductKey;
  /** What the product applies to (a listing id, say); none for `test`. */
  subjectId?: string;
}

/** A bank or wallet app that can pay the invoice (QPay's `urls`). */
export interface PaymentBankApp {
  name: string;
  /** Mongolian name. */
  description: string;
  logo: string;
  /** Deep link into the app, used exactly as QPay returned it. */
  link: string;
}

/** What the payer needs while the invoice is open. */
export interface PaymentCheckout {
  /** The QR code's content (for drawing it ourselves). */
  qrText: string;
  /** PNG, base64 without the `data:` prefix. */
  qrImage: string;
  /** QPay's payment page (`https://s.qpay.mn/…`). */
  shortUrl: string;
  bankApps: PaymentBankApp[];
}

/** Body of every successful payment response. */
export interface PaymentResponse {
  id: string;
  product: string;
  subjectId: string | null;
  amount: number;
  currency: 'MNT';
  description: string;
  status: PaymentStatus;
  /** Only while `pending`. */
  checkout: PaymentCheckout | null;
  createdAt: string;
  /** When an unpaid invoice expires. */
  expiresAt: string;
  paidAt: string | null;
}

// Apple In-App Purchase (bairmair scan Pro) ---------------------------------------------------

/**
 * The App Store auto-renewing subscriptions (one subscription group, "bairmair scan Pro"), as
 * created in App Store Connect. Prices come from StoreKit at runtime, never from here.
 */
export const APPLE_SCAN_PRO_PRODUCTS = {
  'mn.bairmair.scan.pro.monthly': { period: 'month' },
  'mn.bairmair.scan.pro.yearly': { period: 'year' },
} as const satisfies Record<string, { period: 'month' | 'year' }>;

export type AppleScanProProductId = keyof typeof APPLE_SCAN_PRO_PRODUCTS;

export function isAppleScanProProduct(value: unknown): value is AppleScanProProductId {
  return typeof value === 'string' && Object.hasOwn(APPLE_SCAN_PRO_PRODUCTS, value);
}

/** The scan app's bundle id: Apple's signed data must name it. */
export const SCAN_APP_BUNDLE_ID = 'mn.bairmair.scan';

/**
 * `POST` with `Authorization: Bearer <access token>` and an `AppleTransactionRequest` body: after
 * a purchase or a restore, the app hands over StoreKit's signed transaction. Finish the
 * transaction only after a 200 (or a 4xx: nothing to retry); keep it on network errors and 5xx.
 */
export const APPLE_TRANSACTIONS_PATH = '/api/iap/apple/transactions';

/** App Store Server Notifications v2 (`POST { signedPayload }`), set in App Store Connect. */
export const APPLE_NOTIFICATIONS_PATH = '/api/iap/apple/notifications';

export interface AppleTransactionRequest {
  /** StoreKit 2 `jwsRepresentation` (expo-iap: `purchase.purchaseToken` on iOS). */
  signedTransaction: string;
}

export interface AppleTransactionResponse {
  /** `applied`: the subscription is up to date now; `stale`: the server already had newer data. */
  outcome: 'applied' | 'stale';
}
