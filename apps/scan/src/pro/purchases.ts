import { APPLE_SCAN_PRO_PRODUCTS, type AppleScanProProductId } from '@bairmair/db';
import {
  deepLinkToSubscriptions,
  fetchProducts,
  getAvailablePurchases,
  initConnection,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  finishTransaction,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import {
  finishesTransaction,
  isDeliverable,
  sendTransaction,
  type DeliveryResult,
} from './delivery';

/**
 * bairmair scan Pro through StoreKit (expo-iap, in development build 1): one store connection
 * for the app's life, every completed Pro transaction handed to our server, which verifies it
 * with Apple and updates the account's plan. The app passes the user id as `appAccountToken`, so
 * the server knows which account bought it.
 *
 * App Store rule 3.1.3: this is the only way to buy Pro inside the app; the app never mentions
 * another one.
 */

export const PRO_PRODUCT_IDS = Object.keys(APPLE_SCAN_PRO_PRODUCTS) as AppleScanProProductId[];

let connection: Promise<void> | null = null;

/** Connects to the App Store once; a failed attempt is retried on the next call. */
export function connectStore(): Promise<void> {
  connection ??= initConnection().then(
    (connected) => {
      if (!connected) throw new Error('StoreKit did not connect');
    },
    (cause: unknown) => {
      connection = null;
      throw cause;
    },
  );
  return connection;
}

export async function loadProProducts(): Promise<ProductSubscription[]> {
  await connectStore();
  const products = await fetchProducts({ skus: PRO_PRODUCT_IDS, type: 'subs' });
  return (products ?? []) as ProductSubscription[];
}

export type PurchaseEvent = DeliveryResult | 'pending';
const listeners = new Set<(event: PurchaseEvent) => void>();

/** What happens to purchases (also ones completed outside the paywall: Ask to Buy, renewals). */
export function onPurchaseEvent(listener: (event: PurchaseEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: PurchaseEvent): void {
  for (const listener of listeners) listener(event);
}

// One delivery per transaction at a time; a successful or final one is remembered for the session.
const deliveries = new Map<string, Promise<DeliveryResult>>();

/** Sends a Pro transaction to the server, and finishes it unless it must be sent again later. */
export function deliver(purchase: Purchase): Promise<DeliveryResult> | null {
  if (!isDeliverable(purchase)) return null;
  const existing = deliveries.get(purchase.id);
  if (existing) return existing;
  const delivery = (async (): Promise<DeliveryResult> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 'retry';
    const result = await sendTransaction(fetch, env.apiUrl, token, purchase.purchaseToken);
    if (finishesTransaction(result)) {
      // Already finished elsewhere, or StoreKit busy: the server has it either way.
      await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
    }
    return result;
  })().catch((): DeliveryResult => 'retry');
  deliveries.set(purchase.id, delivery);
  void delivery.then((result) => {
    if (result === 'retry') deliveries.delete(purchase.id);
  });
  return delivery;
}

/**
 * Listens for transactions for the app's life: new purchases, Ask to Buy approvals, and the
 * unfinished ones StoreKit hands over at launch. Returns the cleanup.
 */
export function startPurchases(): () => void {
  const subscription = purchaseUpdatedListener((purchase) => {
    if (purchase.purchaseState === 'pending') {
      emit('pending');
      return;
    }
    void deliver(purchase)?.then(emit);
  });
  void connectStore().catch(() => undefined);
  return () => subscription.remove();
}

/**
 * Sends this Apple ID's current Pro subscription to the server for the signed-in account (after
 * sign-in, or with "restore"). No App Store prompt: it reads StoreKit's current entitlements.
 */
export async function syncEntitlements(): Promise<DeliveryResult[]> {
  await connectStore();
  const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  const results = await Promise.all(purchases.map((purchase) => deliver(purchase)));
  return results.filter((result): result is DeliveryResult => result !== null);
}

/** "Restore purchases": asks the App Store to sync (may ask for the Apple ID password), then sends. */
export async function restorePro(): Promise<DeliveryResult[]> {
  await connectStore();
  await restorePurchases();
  return syncEntitlements();
}

export type BuyOutcome = DeliveryResult | 'pending' | 'cancelled' | 'failed';

/** Buys a Pro subscription for `userId`; the server's answer decides the outcome. */
export async function buyPro(
  productId: AppleScanProProductId,
  userId: string,
): Promise<BuyOutcome> {
  try {
    await connectStore();
    const result = await requestPurchase({
      request: { apple: { sku: productId, appAccountToken: userId } },
      type: 'subs',
    });
    const purchases = (Array.isArray(result) ? result : result ? [result] : []) as Purchase[];
    const purchase = purchases.find((candidate) => candidate.productId === productId);
    if (!purchase) return 'pending';
    if (purchase.purchaseState === 'pending') return 'pending';
    return (await deliver(purchase)) ?? 'failed';
  } catch (cause) {
    const code = (cause as { code?: unknown } | null)?.code;
    if (code === 'user-cancelled') return 'cancelled';
    if (code === 'deferred-payment' || code === 'pending') return 'pending';
    return 'failed';
  }
}

/** The App Store's subscription management screen. */
export function manageSubscriptions(): Promise<void> {
  return deepLinkToSubscriptions();
}
