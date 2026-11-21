'use client';

import { fetchListingPlan, type ListingPlan } from '@bairmair/browse';
import { useCallback, useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

/**
 * The signed-in seller's listing plan, loaded once per user and reloadable (after a payment or a
 * status change). `failed` when the RPC failed; the pages then fall back to the database's
 * refusal, which stays the judge.
 */
export function useListingPlan(userId: string | null): {
  plan: ListingPlan | null;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const [plan, setPlan] = useState<ListingPlan | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPlan(await fetchListingPlan(browserClient()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchListingPlan(browserClient())
      .then((next) => {
        if (!active) return;
        setPlan(next);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [userId]);

  return { plan, failed, reload };
}
