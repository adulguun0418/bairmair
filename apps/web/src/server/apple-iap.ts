import {
  isAppleScanProProduct,
  SCAN_APP_BUNDLE_ID,
  type ApiErrorKey,
  type AppleTransactionResponse,
} from '@bairmair/db';

/**
 * bairmair scan Pro bought with Apple In-App Purchase: verified App Store data → the user's
 * `scan_subscriptions` row (`apply_apple_subscription`). Two entry points:
 * - the app, after a purchase or a restore, posts StoreKit's signed transaction for the signed-in
 *   user (`handleAppTransaction`);
 * - Apple posts App Store Server Notifications v2: renewals, expiry, auto-renew changes, refunds,
 *   revocations (`handleNotification`).
 *
 * Ownership: the app passes the user id to StoreKit as `appAccountToken`, so every transaction
 * names its account. A subscription is never moved to another account: another bairmair account
 * signed in on the same Apple ID gets `iap_other_account`.
 *
 * The Apple library stays behind `AppleVerifier` (see `apple-verifier.ts`), so this module is
 * tested with plain objects.
 */

/** The fields we use from Apple's decoded JWSTransaction. */
export interface AppleTransactionPayload {
  originalTransactionId?: string;
  transactionId?: string;
  bundleId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment?: string;
  signedDate?: number;
}

/** The fields we use from Apple's decoded JWSRenewalInfo. */
export interface AppleRenewalPayload {
  originalTransactionId?: string;
  autoRenewStatus?: number;
  appAccountToken?: string;
  environment?: string;
  signedDate?: number;
}

/** The fields we use from a decoded notification (ResponseBodyV2DecodedPayload). */
export interface AppleNotificationPayload {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: { bundleId?: string; signedTransactionInfo?: string; signedRenewalInfo?: string };
}

/** Apple's signature, chain, bundle or environment did not check out: refuse, do not retry. */
export class AppleVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleVerificationError';
  }
}

export interface AppleVerifier {
  transaction(jws: string): Promise<AppleTransactionPayload>;
  renewal(jws: string): Promise<AppleRenewalPayload>;
  notification(jws: string): Promise<AppleNotificationPayload>;
}

export type AppleEnvironment = 'Production' | 'Sandbox';
export type AppleSubscriptionStatus = 'active' | 'refunded' | 'revoked';

export interface AppleSubscriptionUpdate {
  /** The account (appAccountToken, or the signed-in caller); null = keep the row's owner. */
  userId: string | null;
  originalTransactionId: string;
  environment: AppleEnvironment;
  transaction: {
    transactionId: string;
    productId: string;
    startsAt: Date;
    expiresAt: Date;
    status: AppleSubscriptionStatus;
    signedAt: Date;
  } | null;
  renewal: { autoRenew: boolean; signedAt: Date } | null;
}

export type ApplyOutcome = 'applied' | 'stale' | 'other_account' | 'unknown_user';

export interface AppleSubscriptionStore {
  apply(update: AppleSubscriptionUpdate): Promise<ApplyOutcome>;
}

export interface AppleIapDeps {
  verifier: AppleVerifier;
  store: AppleSubscriptionStore;
  log?: (event: string, fields: Record<string, unknown>) => void;
}

export type AppTransactionOutcome =
  | { ok: true; status: 200; body: AppleTransactionResponse }
  | { ok: false; status: 400 | 409; error: ApiErrorKey };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A signed transaction is a few kilobytes; anything far larger is not one. */
const MAX_JWS_LENGTH = 30_000;

function environmentOf(value: unknown): AppleEnvironment | null {
  return value === 'Production' || value === 'Sandbox' ? value : null;
}

function accountOf(token: unknown): string | null {
  return typeof token === 'string' && UUID.test(token) ? token.toLowerCase() : null;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * A scan Pro transaction as an update, or null when it is not one of ours (another bundle or
 * product, an environment we do not take, missing fields). `revoked`: Apple took it back from a
 * family member (a REVOKE notification); any other revocation is a refund.
 */
export function transactionUpdate(
  tx: AppleTransactionPayload,
  options: { revoked?: boolean } = {},
): Omit<AppleSubscriptionUpdate, 'userId' | 'renewal'> | null {
  const environment = environmentOf(tx.environment);
  if (
    tx.bundleId !== SCAN_APP_BUNDLE_ID ||
    !isAppleScanProProduct(tx.productId) ||
    !environment ||
    !tx.originalTransactionId ||
    !tx.transactionId ||
    !isTime(tx.purchaseDate) ||
    !isTime(tx.expiresDate) ||
    !isTime(tx.signedDate) ||
    tx.expiresDate <= tx.purchaseDate
  ) {
    return null;
  }
  const status: AppleSubscriptionStatus = isTime(tx.revocationDate)
    ? options.revoked
      ? 'revoked'
      : 'refunded'
    : 'active';
  return {
    originalTransactionId: tx.originalTransactionId,
    environment,
    transaction: {
      transactionId: tx.transactionId,
      productId: tx.productId,
      startsAt: new Date(tx.purchaseDate),
      expiresAt: new Date(tx.expiresDate),
      status,
      signedAt: new Date(tx.signedDate),
    },
  };
}

function renewalUpdate(info: AppleRenewalPayload): AppleSubscriptionUpdate['renewal'] {
  if (!isTime(info.signedDate) || (info.autoRenewStatus !== 0 && info.autoRenewStatus !== 1)) {
    return null;
  }
  return { autoRenew: info.autoRenewStatus === 1, signedAt: new Date(info.signedDate) };
}

function signedTransactionOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { signedTransaction?: unknown }).signedTransaction;
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_JWS_LENGTH
    ? value
    : null;
}

/** The app hands over a signed transaction for the signed-in user. */
export async function handleAppTransaction(
  deps: AppleIapDeps,
  userId: string,
  body: unknown,
): Promise<AppTransactionOutcome> {
  const jws = signedTransactionOf(body);
  if (!jws) return { ok: false, status: 400, error: 'iap_invalid' };

  let tx: AppleTransactionPayload;
  try {
    tx = await deps.verifier.transaction(jws);
  } catch (cause) {
    if (cause instanceof AppleVerificationError) {
      deps.log?.('iap_unverified', { source: 'app', message: cause.message });
      return { ok: false, status: 400, error: 'iap_invalid' };
    }
    throw cause;
  }

  const update = transactionUpdate(tx);
  if (!update) return { ok: false, status: 400, error: 'iap_invalid' };

  const caller = userId.toLowerCase();
  const token = accountOf(tx.appAccountToken);
  if (token && token !== caller) {
    deps.log?.('iap_other_account', {
      source: 'app',
      originalTransactionId: update.originalTransactionId,
    });
    return { ok: false, status: 409, error: 'iap_other_account' };
  }

  const outcome = await deps.store.apply({ ...update, userId: caller, renewal: null });
  deps.log?.('iap_transaction', {
    source: 'app',
    outcome,
    originalTransactionId: update.originalTransactionId,
    environment: update.environment,
  });
  if (outcome === 'other_account') return { ok: false, status: 409, error: 'iap_other_account' };
  if (outcome === 'unknown_user') throw new Error('signed-in user has no profile');
  return { ok: true, status: 200, body: { outcome } };
}

export type NotificationOutcome =
  { status: 200; handled: ApplyOutcome | 'ignored' | 'test' } | { status: 400 };

/**
 * An App Store Server Notification. 200 for everything we verified (applied or deliberately
 * ignored), 400 for data that does not verify; other errors throw (500), so Apple retries.
 */
export async function handleNotification(
  deps: AppleIapDeps,
  body: unknown,
): Promise<NotificationOutcome> {
  const signedPayload =
    typeof body === 'object' && body !== null
      ? (body as { signedPayload?: unknown }).signedPayload
      : undefined;
  if (typeof signedPayload !== 'string' || signedPayload.length > 4 * MAX_JWS_LENGTH) {
    return { status: 400 };
  }

  try {
    const notification = await deps.verifier.notification(signedPayload);
    const type = notification.notificationType ?? 'unknown';
    const fields = {
      type,
      subtype: notification.subtype,
      uuid: notification.notificationUUID,
    };
    if (type === 'TEST') {
      deps.log?.('iap_notification', { ...fields, handled: 'test' });
      return { status: 200, handled: 'test' };
    }

    const data = notification.data;
    const tx = data?.signedTransactionInfo
      ? await deps.verifier.transaction(data.signedTransactionInfo)
      : null;
    const info = data?.signedRenewalInfo
      ? await deps.verifier.renewal(data.signedRenewalInfo)
      : null;

    const fromTx = tx ? transactionUpdate(tx, { revoked: type === 'REVOKE' }) : null;
    // A transaction that is not scan Pro (another product, one day) is not ours to track.
    if (tx && !fromTx) {
      deps.log?.('iap_notification', { ...fields, handled: 'ignored' });
      return { status: 200, handled: 'ignored' };
    }
    const renewal = info ? renewalUpdate(info) : null;
    const originalTransactionId = fromTx?.originalTransactionId ?? info?.originalTransactionId;
    const environment = fromTx?.environment ?? environmentOf(info?.environment);
    if (!originalTransactionId || !environment || (!fromTx && !renewal)) {
      deps.log?.('iap_notification', { ...fields, handled: 'ignored' });
      return { status: 200, handled: 'ignored' };
    }

    const outcome = await deps.store.apply({
      userId: accountOf(tx?.appAccountToken) ?? accountOf(info?.appAccountToken),
      originalTransactionId,
      environment,
      transaction: fromTx?.transaction ?? null,
      renewal,
    });
    deps.log?.('iap_notification', { ...fields, handled: outcome, originalTransactionId });
    return { status: 200, handled: outcome };
  } catch (cause) {
    if (cause instanceof AppleVerificationError) {
      deps.log?.('iap_unverified', { source: 'notification', message: cause.message });
      return { status: 400 };
    }
    throw cause;
  }
}
