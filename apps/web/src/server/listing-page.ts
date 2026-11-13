import { loadListingPage, type ListingPageData } from '@bairmair/browse';
import { cacheLife, cacheTag } from 'next/cache';
import { publicEnv } from '@/lib/public-env';
import { publicClient } from '@/lib/supabase-public';

/** Cache tag of one listing's page data, for `revalidateTag` after a change. */
export function listingTag(id: string): string {
  return `listing:${id}`;
}

/**
 * Everything a public listing page shows, or null when the listing does not exist or is not
 * live. Reads as `anon`, so RLS decides what is public.
 *
 * Cached for a minute: a seller's edit, a status change or a new scan shows up within that.
 * The page, its Open Graph image and its metadata share one fetch.
 */
export async function getListingPage(id: string): Promise<ListingPageData | null> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  cacheTag(listingTag(id));
  return loadListingPage(publicClient(), publicEnv.supabaseUrl, id);
}
