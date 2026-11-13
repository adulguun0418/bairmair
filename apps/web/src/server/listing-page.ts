import { BUCKETS, publicObjectUrl, scanModelPaths } from '@bairmair/db';
import { cacheLife, cacheTag } from 'next/cache';
import {
  buildListingPage,
  LISTING_COLUMNS,
  type ListingPageData,
  type ListingRow,
} from '@/lib/listing-view';
import { publicEnv } from '@/lib/public-env';
import { publicClient } from '@/lib/supabase-public';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

  if (!UUID_RE.test(id)) return null;
  const client = publicClient();

  const [listing, photos, scans] = await Promise.all([
    client.from('listings').select(LISTING_COLUMNS).eq('id', id).maybeSingle<ListingRow>(),
    client
      .from('listing_photos')
      .select('id, width, height, sort_order, scan_id, room_id')
      .eq('listing_id', id)
      .order('sort_order')
      .order('created_at'),
    // RLS shows only the current ready scan of a live listing.
    client
      .from('room_scans')
      .select('id, room_labels')
      .eq('listing_id', id)
      .eq('is_current', true)
      .eq('status', 'ready')
      .limit(1),
  ]);
  for (const result of [listing, photos, scans]) {
    if (result.error) throw new Error(`listing ${id}: ${result.error.message}`);
  }
  const row = listing.data;
  if (!row) return null;
  const scan = scans.data?.[0] ?? null;

  const [seller, stats, modelJson] = await Promise.all([
    client
      .from('profiles')
      .select('display_name, role, agent_profiles(agency_name, verified)')
      .eq('id', row.owner_id)
      .maybeSingle(),
    row.district_id === null
      ? null
      : client
          .from('district_price_stats')
          .select('listing_count, median_price_per_m2')
          .eq('type', row.type)
          .eq('district_id', row.district_id)
          .eq('currency', row.currency)
          .maybeSingle(),
    scan ? fetchModel(row.id, scan.id) : null,
  ]);
  if (seller.error) throw new Error(`seller of ${id}: ${seller.error.message}`);
  // The median is a nice-to-have; the page works without it.
  if (stats?.error) console.warn(`price stats for ${id}: ${stats.error.message}`);

  return buildListingPage({
    listing: row,
    photos: photos.data ?? [],
    seller: seller.data,
    scan,
    modelJson,
    stats: stats?.data ?? null,
    supabaseUrl: publicEnv.supabaseUrl,
    now: new Date(),
  });
}

/** The scan's `model.json` (public, written by the scan processing route), or null. */
async function fetchModel(listingId: string, scanId: string): Promise<unknown> {
  const url = publicObjectUrl(
    publicEnv.supabaseUrl,
    BUCKETS.scanModels,
    scanModelPaths(listingId, scanId).model,
  );
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } catch (error) {
    // Without the model the page still shows photos and details.
    console.warn(`model of scan ${scanId}:`, error);
    return null;
  }
}
