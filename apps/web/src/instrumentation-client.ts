import { SHARE_PARAM } from '@bairmair/browse';
import posthog from 'posthog-js';
import { ANALYTICS_PATH } from '@/lib/analytics';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (key && host) {
  posthog.init(key, {
    api_host: ANALYTICS_PATH,
    ui_host: host.replace('.i.posthog.com', '.posthog.com'),
    defaults: '2026-08-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    capture_pageview: 'history_change',
    capture_pageleave: true,
    cookieless_mode: 'always',
    person_profiles: 'never',
    custom_campaign_params: [SHARE_PARAM],
  });
} else if (process.env.NODE_ENV === 'development') {
  const missingVariable = key ? 'NEXT_PUBLIC_POSTHOG_HOST' : 'NEXT_PUBLIC_POSTHOG_KEY';
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}
