import type { ListingTier, TypedSupabaseClient } from '@bairmair/db';

/**
 * Gold / Silver listings, the seller's side: what a listing has now and until when, from its
 * paid periods (`listing_promotions`, readable by the payer only). The database decides the order
 * in search (`search_listings`); this is only for showing it.
 *
 * A Silver period may span Gold time (Gold bought during Silver moves the Silver time after it),
 * so the tier at a moment is Gold if a Gold period covers it, else Silver if one does.
 */

export interface PromotionPeriod {
  tier: ListingTier;
  startsAt: string;
  expiresAt: string;
}

export interface PromotionStatus {
  /** The tier now, or null. */
  tier: ListingTier | null;
  /** When the last bought Gold period ends, if after now. */
  goldUntil: string | null;
  /** When the last bought Silver period ends, if after now (shown after Gold, if any). */
  silverUntil: string | null;
}

export const NO_PROMOTION: PromotionStatus = { tier: null, goldUntil: null, silverUntil: null };

export function promotionStatus(
  periods: readonly PromotionPeriod[],
  now: Date = new Date(),
): PromotionStatus {
  const at = now.getTime();
  const covers = (p: PromotionPeriod) =>
    Date.parse(p.startsAt) <= at && Date.parse(p.expiresAt) > at;
  const lastEnd = (tier: ListingTier) => {
    let end: string | null = null;
    for (const p of periods) {
      if (p.tier !== tier || Date.parse(p.expiresAt) <= at) continue;
      if (end === null || Date.parse(p.expiresAt) > Date.parse(end)) end = p.expiresAt;
    }
    return end;
  };
  const tier = periods.some((p) => p.tier === 'gold' && covers(p))
    ? 'gold'
    : periods.some((p) => p.tier === 'silver' && covers(p))
      ? 'silver'
      : null;
  return { tier, goldUntil: lastEnd('gold'), silverUntil: lastEnd('silver') };
}

/** Whether anything is bought for now or later. */
export function hasPromotion(status: PromotionStatus): boolean {
  return status.goldUntil !== null || status.silverUntil !== null;
}

/**
 * The signed-in seller's active periods of these listings, by listing id (listings without any
 * are missing). Ended periods are left out by the query.
 */
export async function fetchListingPromotions(
  client: TypedSupabaseClient,
  listingIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, PromotionStatus>> {
  const result = new Map<string, PromotionStatus>();
  if (listingIds.length === 0) return result;
  const { data, error } = await client
    .from('listing_promotions')
    .select('listing_id, tier, starts_at, expires_at')
    .in('listing_id', [...listingIds])
    .eq('status', 'active')
    .gt('expires_at', now.toISOString());
  if (error) throw error;
  const byListing = new Map<string, PromotionPeriod[]>();
  for (const row of data) {
    if (row.tier !== 'gold' && row.tier !== 'silver') continue;
    const list = byListing.get(row.listing_id) ?? [];
    list.push({ tier: row.tier, startsAt: row.starts_at, expiresAt: row.expires_at });
    byListing.set(row.listing_id, list);
  }
  for (const [id, periods] of byListing) result.set(id, promotionStatus(periods, now));
  return result;
}
