import type { TypedSupabaseClient } from '@bairmair/db';

/**
 * The signed-in seller's listing plan (`listing_plan` RPC), for the website and the app: one
 * published listing is free, a package allows 20 for 30 days. The database enforces the limit
 * (`listing_limit_reached`); this is only for showing it and offering a package in time.
 */
export interface ListingPlan {
  /** Whether the limit applies to this seller (switched on for everyone, or a tester). */
  enforced: boolean;
  /** Published listings allowed at once: 1 free, 20 with a package. */
  limit: number;
  /** Published listings now. */
  live: number;
  /** Listings hidden because a package ended (republished when a package is bought). */
  paused: number;
  /** When the package ends (ISO time), or null without one. */
  packageUntil: string | null;
}

export async function fetchListingPlan(client: TypedSupabaseClient): Promise<ListingPlan> {
  const { data, error } = await client.rpc('listing_plan');
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error('listing_plan returned no row (not signed in?)');
  return {
    enforced: row.enforced,
    limit: row.listing_limit,
    live: row.live_listings,
    paused: row.paused_listings,
    packageUntil: row.package_until,
  };
}

/** Whether one more listing can be published now (always, when the limit does not apply). */
export function canPublishAnother(plan: ListingPlan): boolean {
  return !plan.enforced || plan.live < plan.limit;
}
