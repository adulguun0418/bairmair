import { SHARE_PARAM, type ShareChannel } from '@bairmair/browse';
import type { PostHog } from 'posthog-js';

/**
 * Product analytics (PostHog, EU cloud), to see where visitors of shared listings come from
 * and what they do on the listing page.
 *
 * - Off unless `NEXT_PUBLIC_POSTHOG_KEY` is set (local development and Vercel previews send
 *   nothing).
 * - Cookieless: no cookies, no local or session storage; PostHog counts visitors with a daily
 *   server-side hash. Never identified: no user ids, phone numbers or names are sent.
 * - Only page views, page leaves (with scroll depth) and the events below. No autocapture,
 *   session recordings, surveys, heatmaps or feature flags.
 * - Loaded after the page (a separate chunk), so it never delays the first paint; events
 *   tracked before it loads are queued.
 * - Sent through our own origin (`/bmr`, rewritten in `next.config.ts`), so tracker blocklists
 *   do not drop them.
 */

/** Proxy path for PostHog requests; also excluded from the locale proxy. */
export const ANALYTICS_PATH = '/bmr';

type Placement = 'card' | 'bar';

/** The events we send, with their properties. */
export interface AnalyticsEvents {
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
}

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const QUEUE_LIMIT = 50;

let client: PostHog | null = null;
let started = false;
const queue: [string, Record<string, unknown>][] = [];

/** Loads and starts PostHog in the browser. Called once from `instrumentation-client.ts`. */
export function startAnalytics(): void {
  if (!key || started || typeof window === 'undefined') return;
  started = true;
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: ANALYTICS_PATH,
        ui_host: 'https://eu.posthog.com',
        defaults: '2026-08-30',
        // Page views on client-side navigations too (App Router), and page leaves with scroll
        // depth.
        capture_pageview: 'history_change',
        capture_pageleave: true,
        cookieless_mode: 'always',
        // Never identified (no user ids are sent), so no person profiles.
        person_profiles: 'never',
        custom_campaign_params: [SHARE_PARAM],
        autocapture: false,
        rageclick: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_product_tours: true,
        disable_conversations: true,
        disable_web_experiments: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
      });
      client = posthog;
      for (const [event, properties] of queue.splice(0)) posthog.capture(event, properties);
    })
    .catch(() => {
      // Blocked or offline: analytics stays off for this page.
      queue.length = 0;
    });
}

/** Sends one event. Does nothing without a PostHog key. */
export function track<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!key || typeof window === 'undefined') return;
  if (client) {
    client.capture(event, properties);
  } else if (queue.length < QUEUE_LIMIT) {
    queue.push([event, properties]);
  }
}
