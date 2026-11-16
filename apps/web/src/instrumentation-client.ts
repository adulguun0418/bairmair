import { startAnalytics } from '@/lib/analytics';

// Runs in the browser before the app hydrates; PostHog itself loads afterwards (see analytics.ts).
startAnalytics();
