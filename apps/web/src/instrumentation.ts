import type { Instrumentation } from 'next';

/**
 * Uncaught server errors (page rendering, server components, route handlers, server actions) go
 * to PostHog error tracking. See `src/server/error-reporting.ts`. Request headers stay out of
 * the report (cookies, tokens); only the path, route and kind of request are sent.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // posthog-node needs Node.js APIs; nothing in this app runs on the edge runtime today.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { pathOnly, reportServerError } = await import('./server/error-reporting');
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  await reportServerError(error, {
    path: pathOnly(request.path),
    method: request.method,
    route: context.routePath,
    route_type: context.routeType,
    render_source: context.renderSource,
    // Shown on the error page as the error's reference, so a visitor's report can be matched.
    digest,
  });
};
