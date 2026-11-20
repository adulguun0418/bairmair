import {
  apiErrorKey,
  APPLE_TRANSACTIONS_PATH,
  isAppleScanProProduct,
  type AppleTransactionRequest,
} from '@bairmair/db';

/**
 * Handing an App Store transaction to our server (pure, so it is tested without StoreKit).
 *
 * StoreKit keeps a transaction until the app finishes it, and hands unfinished ones over again
 * at every launch. So a transaction is finished only when the server has it (200) or can never
 * take it (400 not ours / 409 another account); on network errors, an expired session or a
 * server error it stays, and the next launch or "restore" sends it again.
 */

export type DeliveryResult = 'delivered' | 'other_account' | 'invalid' | 'retry';

export function deliveryResult(status: number, body: unknown): DeliveryResult {
  if (status === 200) return 'delivered';
  const key = apiErrorKey(body);
  if (status === 409 && key === 'iap_other_account') return 'other_account';
  if (status === 400 && key === 'iap_invalid') return 'invalid';
  return 'retry';
}

/** Whether the transaction can be finished after this result. */
export function finishesTransaction(result: DeliveryResult): boolean {
  return result !== 'retry';
}

/** The fields of an expo-iap `Purchase` that matter here. */
export interface PurchaseLike {
  id: string;
  productId: string;
  purchaseState: string;
  /** iOS: StoreKit's signed transaction (JWS). */
  purchaseToken?: string | null;
}

/** A completed scan Pro purchase that the server can check (not pending, not another product). */
export function isDeliverable(purchase: PurchaseLike): purchase is PurchaseLike & {
  purchaseToken: string;
} {
  return (
    isAppleScanProProduct(purchase.productId) &&
    purchase.purchaseState === 'purchased' &&
    typeof purchase.purchaseToken === 'string' &&
    purchase.purchaseToken.length > 0
  );
}

export async function sendTransaction(
  fetcher: typeof fetch,
  apiUrl: string,
  accessToken: string,
  signedTransaction: string,
): Promise<DeliveryResult> {
  try {
    const request: AppleTransactionRequest = { signedTransaction };
    const response = await fetcher(`${apiUrl}${APPLE_TRANSACTIONS_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json().catch(() => null);
    return deliveryResult(response.status, body);
  } catch {
    return 'retry';
  }
}

/**
 * How much cheaper the yearly plan is than twelve months, in whole percent, or null when the
 * prices are missing, in different currencies, or the yearly plan saves nothing.
 */
export function yearlySavingPercent(
  monthly: { price?: number | null; currency?: string } | undefined,
  yearly: { price?: number | null; currency?: string } | undefined,
): number | null {
  const month = monthly?.price;
  const year = yearly?.price;
  if (!month || !year || month <= 0 || monthly?.currency !== yearly?.currency) return null;
  const percent = Math.floor((1 - year / (12 * month)) * 100);
  return percent >= 5 ? percent : null;
}
