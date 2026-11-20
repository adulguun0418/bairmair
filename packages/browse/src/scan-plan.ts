import type { TypedSupabaseClient } from '@bairmair/db';
import { formatDate, type Locale } from '@bairmair/i18n';

/**
 * bairmair scan: the signed-in user's plan (`scan_plan` RPC), for the website and the app. The
 * database enforces the limit; this is only for showing it.
 */
export interface ScanPlan {
  /** Scans the user may keep: 2 free, 100 while Pro. */
  limit: number;
  /** Scans kept now (not turned into listings). */
  kept: number;
  /** When Pro ends (ISO time), or null when the user is not Pro. */
  proUntil: string | null;
}

export async function fetchScanPlan(client: TypedSupabaseClient): Promise<ScanPlan> {
  const { data, error } = await client.rpc('scan_plan');
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error('scan_plan returned no row (not signed in?)');
  return { limit: row.scan_limit, kept: row.scans_kept, proUntil: row.pro_until };
}

/** Whether `extra` more scans (drafts and uploads the server does not know yet) still fit. */
export function scanFits(plan: ScanPlan, extra = 0): boolean {
  return plan.kept + extra < plan.limit;
}

/** `YYYY-MM-DD` of an ISO time in the device's time zone (Pro ends at a moment, shown as a day). */
export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026 оны 12 сарын 20" / "20 December 2026": the day Pro ends, in local time. */
export function formatProUntil(iso: string, locale: Locale): string {
  return formatDate(localDay(iso), locale);
}

/** The user's current App Store subscription (bairmair scan Pro), from their own rows (RLS). */
export interface AppleProSubscription {
  productId: string;
  expiresAt: string;
  /** Renews at `expiresAt` (null when Apple has not told us yet). */
  autoRenew: boolean | null;
}

/**
 * The signed-in user's active App Store subscription, or null. Used for "manage subscription",
 * the account-deletion warning (deleting the account does not cancel Apple billing) and the
 * website's note before paying with QPay on top of an auto-renewing subscription.
 */
export async function fetchAppleSubscription(
  client: TypedSupabaseClient,
): Promise<AppleProSubscription | null> {
  const { data, error } = await client
    .from('scan_subscriptions')
    .select('product_id, expires_at, apple_auto_renew')
    .eq('source', 'apple')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { productId: data.product_id, expiresAt: data.expires_at, autoRenew: data.apple_auto_renew }
    : null;
}
