import type { SearchListingRow, SearchListingsArgs } from '@bairmair/db';
import { cacheLife, cacheTag } from 'next/cache';
import { publicClient } from '@/lib/supabase-public';

export interface SearchResult {
  rows: SearchListingRow[];
  /** Matches before paging (0 when the page is past the end). */
  total: number;
}

/** Cache tag of every search result, for `revalidateTag`. */
export const SEARCH_TAG = 'search';

/**
 * One page of `search_listings`, read as `anon`. Cached for a minute per set of arguments:
 * a new or changed listing shows up in search within that.
 */
export async function searchListings(args: SearchListingsArgs): Promise<SearchResult> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 60, expire: 600 });
  cacheTag(SEARCH_TAG);

  const { data, error } = await publicClient().rpc('search_listings', args);
  if (error) throw new Error(`search_listings: ${error.message}`);
  const rows = data as unknown as SearchListingRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}
