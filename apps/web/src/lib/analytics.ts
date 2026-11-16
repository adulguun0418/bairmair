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

/**
 * The listing page's layout, sent with `listing_viewed` to compare before and after a redesign.
 * 1: media tabs with 3D first (until 2026-11-16). 2: photos first, 3D in "Орон зай" below.
 */
export const LISTING_PAGE_VERSION = 2;

/** The events we send, with their properties. */
export interface AnalyticsEvents {
  listing_viewed: {
    listing_id: string;
    listing_type: 'sale' | 'rent';
    status: string;
    has_3d: boolean;
    photo_count: number;
    district: string | null;
    page_version: number;
  };
  /**
   * The visitor asked for the 3D model or the plan: from the photo hero's buttons, or by
   * switching the "Орон зай" tabs (not the view the section opens on). Version 1 also had
   * a `photos` tab and no `from`.
   */
  listing_media_tab: { listing_id: string; tab: '3d' | 'plan'; from: 'hero' | 'tabs' };
  /** The first swipe past the cover in the phone photo strip, once per page. */
  listing_photos_swiped: { listing_id: string };
  /** The first drag, pinch or wheel on the 3D model, once per page. */
  listing_3d_interacted: { listing_id: string };
  listing_photo_opened: { listing_id: string; from: 'gallery' | 'hotspot' };
  phone_revealed: { listing_id: string; placement: Placement };
  contact_call: { listing_id: string; placement: Placement };
  contact_sms: { listing_id: string; placement: Placement };
  phone_copied: { listing_id: string };
  listing_shared: { listing_id: string; channel: ShareChannel };
  favorite_added: { listing_id: string };
  /** A card in "Ижил төстэй зарууд" opened; `position` counts from 1. */
  similar_listing_clicked: { listing_id: string; target_id: string; position: number };
  /** "Зар нэмэх" in the navy seller band. */
  sell_band_clicked: { placement: 'home' | 'listing' };
  /** The photo gallery: from "N зураг", the phone counter, or the "+N" tile. */
  listing_gallery_opened: { listing_id: string; from: 'button' | 'counter' | 'more' };
  /** A room picked in the gallery, on the plan or as a chip. */
  gallery_room_selected: { listing_id: string; via: 'plan' | 'chip' };
  /** The note behind a badge's ⓘ. */
  badge_info_opened: { badge: '3d' | 'verified' };
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
