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
  /**
   * What `subjectId` must name: `listing` = one of the payer's published listings (checked
   * before the invoice is made). Absent: no subject.
   */
  subject?: 'listing';
}

export const PAYMENT_PRODUCTS = {
  /** A small real payment to check the whole QPay flow on production. */
  test: { amount: 50, invoiceDescription: 'bairmair: туршилтын төлбөр', testersOnly: true },
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
  // Listing package: 30 days with up to 20 live listings (LISTING_PACKAGE_PLANS). Testers only
  // until the limit is switched on for everyone (private.settings `listing_limit`).
  // TEMPORARY test prices (2026-11-21: 50₮ / 100₮, QPay payments under ~50₮ are refused by the
  // banks): real prices 29,900₮ and 79,900₮. Restore before launch.
  listing_pack_30d: {
    amount: 50,
    invoiceDescription: 'bairmair: 20 зарын багц, 30 хоног',
    testersOnly: true,
  },
  listing_pack_90d: {
    amount: 100,
    invoiceDescription: 'bairmair: 20 зарын багц, 90 хоног',
    testersOnly: true,
  },
  /** A real payment for one day of the package, to check the whole flow cheaply. */
  listing_pack_test: {
    amount: 100,
    invoiceDescription: 'bairmair: зарын багц, туршилт, 1 өдөр',
    testersOnly: true,
  },
  // Gold / Silver listings (LISTING_PROMOTION_PLANS): one published listing first in search.
  // TEMPORARY test prices (2026-11-21: 50₮ / 100₮): real prices Gold 15,000₮ / 25,000₮ (7 / 14 days),
  // Silver 8,000₮ / 13,000₮. Restore before anyone but testers can buy.
  listing_gold_7d: {
    amount: 50,
    invoiceDescription: 'bairmair: Алтан зар, 7 хоног',
    testersOnly: true,
    subject: 'listing',
  },
  listing_gold_14d: {
    amount: 100,
    invoiceDescription: 'bairmair: Алтан зар, 14 хоног',
    testersOnly: true,
    subject: 'listing',
  },
  listing_silver_7d: {
    amount: 50,
    invoiceDescription: 'bairmair: Мөнгөн зар, 7 хоног',
    testersOnly: true,
    subject: 'listing',
  },
  listing_silver_14d: {
    amount: 100,
    invoiceDescription: 'bairmair: Мөнгөн зар, 14 хоног',
    testersOnly: true,
    subject: 'listing',
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

/** The products that buy a listing package, and for how long. */
export const LISTING_PACKAGE_PLANS = {
  listing_pack_30d: { days: 30 },
  listing_pack_90d: { days: 90 },
  listing_pack_test: { days: 1 },
} as const satisfies Partial<Record<PaymentProductKey, { days: number }>>;

export type ListingPackageProductKey = keyof typeof LISTING_PACKAGE_PLANS;

export function isListingPackageProduct(value: unknown): value is ListingPackageProductKey {
  return typeof value === 'string' && Object.hasOwn(LISTING_PACKAGE_PLANS, value);
}

export type ListingTier = 'gold' | 'silver';

export const LISTING_TIERS = ['gold', 'silver'] as const satisfies readonly ListingTier[];

/** The products that promote a listing, the tier and for how long. */
export const LISTING_PROMOTION_PLANS = {
  listing_gold_7d: { tier: 'gold', days: 7 },
  listing_gold_14d: { tier: 'gold', days: 14 },
  listing_silver_7d: { tier: 'silver', days: 7 },
  listing_silver_14d: { tier: 'silver', days: 14 },
} as const satisfies Partial<Record<PaymentProductKey, { tier: ListingTier; days: number }>>;

export type ListingPromotionProductKey = keyof typeof LISTING_PROMOTION_PLANS;

export function isListingPromotionProduct(value: unknown): value is ListingPromotionProductKey {
  return typeof value === 'string' && Object.hasOwn(LISTING_PROMOTION_PLANS, value);
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
