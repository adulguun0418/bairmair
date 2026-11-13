'use client';

import { useEffect } from 'react';
import { publicClient } from '@/lib/supabase-public';

const counted = new Set<string>();

/**
 * Counts one view of the listing per browser tab session (`record_listing_view` skips the
 * owner's own views). Renders nothing.
 */
export function ViewCounter({ listingId }: { listingId: string }) {
  useEffect(() => {
    // Development runs effects twice; a reload in the same tab does not count again.
    const key = `viewed:${listingId}`;
    if (counted.has(listingId)) return;
    counted.add(listingId);
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: count anyway.
    }
    void publicClient()
      .rpc('record_listing_view', { p_listing_id: listingId })
      .then(({ error }) => {
        if (error) console.warn('view not counted:', error.message);
      });
  }, [listingId]);
  return null;
}
