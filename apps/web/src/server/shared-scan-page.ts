import { cacheLife, cacheTag } from 'next/cache';
import { loadSharedScan, type SharedScan } from './shared-scan';
import { adminClient, supabaseSharedScanSource } from './supabase';

/**
 * A bairmair scan behind its private link, or null (no such slug, link off, not processed yet).
 *
 * Cached for a minute, shared by the page, the embed, metadata and the preview image: turning
 * the link off or deleting the scan in the app takes effect within that minute (the app writes
 * to the database directly, so the website cannot drop the cache entry itself).
 */
export async function getSharedScan(slug: string): Promise<SharedScan | null> {
  'use cache';
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  cacheTag(`user-scan:${slug}`);
  return loadSharedScan(supabaseSharedScanSource(adminClient()), slug);
}
