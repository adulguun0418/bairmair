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
