'use client';

import { useEffect } from 'react';
import { track, type AnalyticsEvents } from '@/lib/analytics';

/**
 * Sends `listing_viewed` with the listing's facts, so page views can be split by type, 3D and
 * district without parsing URLs. Once per mount (unlike `ViewCounter`, every visit counts).
 * Renders nothing.
 */
export function TrackListingView(props: AnalyticsEvents['listing_viewed']) {
  const { listing_id, listing_type, status, has_3d, photo_count, district } = props;
  useEffect(() => {
    track('listing_viewed', { listing_id, listing_type, status, has_3d, photo_count, district });
  }, [listing_id, listing_type, status, has_3d, photo_count, district]);
  return null;
}
