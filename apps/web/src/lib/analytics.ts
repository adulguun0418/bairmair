import type { ShareChannel } from '@bairmair/browse';
import posthog from 'posthog-js';

/**
 * Product analytics (PostHog, EU cloud), to see where visitors of shared listings come from
 * and what they do on the listing page. The browser SDK is initialized once by
 * `src/instrumentation-client.ts` and sends through `/bmr` to avoid tracker blocklists.
 */

/** Proxy path for PostHog requests; also excluded from the locale proxy. */
export const ANALYTICS_PATH = '/bmr';

type Placement = 'card' | 'bar';

/** The events we send, with their properties. */
export interface AnalyticsEvents {
  sign_in_completed: Record<string, never>;
  listing_viewed: {
    listing_id: string;
    listing_type: 'sale' | 'rent';
    status: string;
    has_3d: boolean;
    photo_count: number;
    district: string | null;
  };
  /** A media tab chosen by the visitor (not the one the page opens on). */
  listing_media_tab: { listing_id: string; tab: 'photos' | '3d' | 'plan' };
  /** The first drag, pinch or wheel on the 3D model, once per page. */
  listing_3d_interacted: { listing_id: string };
  listing_photo_opened: { listing_id: string; from: 'gallery' | 'hotspot' };
  phone_revealed: { listing_id: string; placement: Placement };
  contact_call: { listing_id: string; placement: Placement };
  contact_sms: { listing_id: string; placement: Placement };
  phone_copied: { listing_id: string };
  listing_shared: { listing_id: string; channel: ShareChannel };
  favorite_added: { listing_id: string };
  listing_reported: { listing_id: string; reason: string };
  listing_saved: { listing_id: string; listing_type: 'sale' | 'rent'; is_new: boolean };
  listing_deleted: { listing_id: string; listing_type: 'sale' | 'rent' };
  listing_status_changed: {
    listing_id: string;
    listing_type: 'sale' | 'rent';
    from_status: string;
    to_status: string;
  };
  listing_availability_confirmed: { listing_id: string; listing_type: 'sale' | 'rent' };
}

/** Sends one event. Does nothing without a PostHog key. */
export function track<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || typeof window === 'undefined') return;
  posthog.capture(event, properties);
}
