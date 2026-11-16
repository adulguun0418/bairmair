import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import PostHog from 'posthog-react-native';

/**
 * Error tracking for the app: PostHog (EU), the same project as the website's analytics and
 * errors. Errors only: no screen views, taps or app open/close events.
 *
 * - Off unless `EXPO_PUBLIC_POSTHOG_KEY` is set. Only the EAS `preview` (and later `production`)
 *   environment has it, so development builds send nothing.
 * - Uncaught JavaScript errors (crashes too: PostHog keeps them in its file queue and sends them
 *   on the next launch) and unhandled promise rejections, plus `captureError` from the root
 *   error boundary. `console.error` is not captured.
 * - Anonymous: a random id per install (in PostHog's file in the app's Documents), no person
 *   profile, no IP lookup, never identified (no user id or phone number is sent).
 * - PostHog's project setting "Exception autocapture" (Error tracking settings) switches the
 *   automatic capture on and off for the app: the SDK always reads it at start.
 * - Plain JavaScript: the optional native modules it looks for (expo-application, the
 *   PostHog native plugin) are not in the builds and are skipped, so this ships as an update.
 */

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;

function createClient(projectKey: string): PostHog {
  return new PostHog(projectKey, {
    host: 'https://eu.i.posthog.com',
    // A file queue, so a crash that kills the app is still sent on the next launch.
    persistence: 'file',
    personProfiles: 'never',
    disableGeoip: true,
    captureAppLifecycleEvents: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    errorTracking: {
      autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false },
    },
    // expo-application is not in the builds, so PostHog cannot read the version itself. The
    // version is what Бүртгэл shows; the build is the running update (or the embedded bundle).
    customAppProperties: (properties) => ({
      ...properties,
      $app_version: Constants.expoConfig?.version ?? null,
      $app_build: Updates.updateId ?? 'embedded',
    }),
  });
}

let client: PostHog | null = null;
try {
  client = key ? createClient(key) : null;
} catch {
  // Error tracking must never keep the app from starting.
  client = null;
}

/** Reports an error that the app caught itself (the root error boundary). */
export function captureError(error: unknown, properties?: Record<string, string>): void {
  try {
    client?.captureException(error, properties);
  } catch {
    // Reporting must never turn into a second failure.
  }
}
