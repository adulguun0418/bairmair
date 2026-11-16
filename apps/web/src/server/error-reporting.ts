import { PostHog, type PostHogOptions } from 'posthog-node';

/**
 * Server errors to PostHog error tracking (EU), next to the browser's (`src/lib/analytics.ts`).
 *
 * - Off unless `NEXT_PUBLIC_POSTHOG_KEY` is set, like the browser side (Production only).
 * - Anonymous: no user id, phone number or request headers are sent. posthog-node then makes up a
 *   random id per event and creates no person profile. No IP lookup either (it would be
 *   Vercel's).
 * - Each report is sent before the function returns (`captureExceptionImmediate`), because a
 *   serverless function may be frozen right after the response. No retries, 3 s timeout.
 *
 * Sources: `onRequestError` in `src/instrumentation.ts` (uncaught errors while rendering pages
 * and in route handlers), and route handlers that catch an error and answer 500 themselves.
 */

const HOST = 'https://eu.i.posthog.com';

export type ErrorProperties = Record<string, string | number | boolean | null | undefined>;
export type ErrorReporter = (error: unknown, properties?: ErrorProperties) => Promise<void>;

/** A reporter for one PostHog project. `fetch` is replaceable for tests. */
export function createErrorReporter(
  key: string,
  options: { fetch?: PostHogOptions['fetch'] } = {},
): ErrorReporter {
  const client = new PostHog(key, {
    host: HOST,
    flushAt: 1,
    flushInterval: 0,
    disableGeoip: true,
    // A report holds back the visitor's response (it is awaited): give up after ~3 s rather
    // than retrying for ~10 s while PostHog is unreachable.
    requestTimeout: 3000,
    fetchRetryCount: 0,
    fetch: options.fetch,
  });
  return async (error, properties) => {
    try {
      await client.captureExceptionImmediate(error, undefined, {
        ...properties,
        runtime: 'server',
        vercel_env: process.env.VERCEL_ENV ?? 'local',
      });
    } catch {
      // Reporting must never turn into a second failure.
    }
  };
}

let reporter: ErrorReporter | null | undefined;

/** Reports a server error, or does nothing without a PostHog key. Never throws. */
export async function reportServerError(
  error: unknown,
  properties?: ErrorProperties,
): Promise<void> {
  if (reporter === undefined) {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    reporter = key ? createErrorReporter(key) : null;
  }
  await reporter?.(error, properties);
}

/** The request path without its query string (searches and `?next=` stay out of reports). */
export function pathOnly(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}
