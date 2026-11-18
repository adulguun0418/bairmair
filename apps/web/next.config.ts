import type { NextConfig } from 'next';

/** Listing photos in Supabase Storage (public bucket), the only remote images we optimize. */
const photoPattern = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? [new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/**`)]
  : [];

/**
 * Security headers on every response (Vercel adds HSTS itself).
 * - No site may frame our pages (clickjacking of /account, /my-listings). The app's 3D screen
 *   loads the embed page as its own page in a WebView, not in a frame, so it is unaffected.
 * - The CSP only sets directives that do not limit scripts, styles or connections (framing,
 *   `<base>`, plugins); a script policy needs per-request nonces, which would make the cached
 *   pages dynamic. React's escaping is the XSS defence for now.
 * - Geolocation stays on for our own pages: the pin picker's "use my location".
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Floor-plan SVGs (seller-typed room names inside): the route's own strict policy, which
      // the line above would otherwise replace. A later match wins for the same header.
      {
        source: '/api/plan/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  images: {
    // Vercel resizes on its own image service (5,000 transformations a month on Hobby). Local
    // builds serve the originals: the repo does not build `sharp` (see PROGRESS).
    unoptimized: !process.env.VERCEL,
    remotePatterns: photoPattern,
    // Few widths, so one photo costs few transformations: cards (~400 px, 2x), the listing
    // mosaic and the full-screen viewer.
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [256, 384],
    // A photo's file never changes (a new photo gets a new id), so keep each size for 30 days.
    minimumCacheTTL: 2_592_000,
  },
  // `pnpm dev:web` is opened from the iPhone on the same Wi-Fi (the app's WebView embed, scan
  // processing). Next.js blocks its dev resources (HMR socket, chunks) for hosts other than
  // localhost unless listed. Development only; private LAN ranges.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  partialPrefetching: true,
  // PostHog (EU) through our own origin, so tracker blocklists do not drop analytics
  // (`src/lib/analytics.ts`, `ANALYTICS_PATH`; the locale proxy skips the path). Before the
  // pages, so `[lang]` never sees it.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/bmr/static/:path*',
          destination: 'https://eu-assets.i.posthog.com/static/:path*',
        },
        {
          source: '/bmr/array/:path*',
          destination: 'https://eu-assets.i.posthog.com/array/:path*',
        },
        { source: '/bmr/:path*', destination: 'https://eu.i.posthog.com/:path*' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // PostHog's endpoints end with a slash (`/e/`, `/flags/`); without this, each request would
  // first get a 308 to the slashless URL.
  skipTrailingSlashRedirect: true,
  // The Open Graph image reads these fonts with a computed file name, which file tracing cannot
  // follow; without this, the deployed route would not have them.
  outputFileTracingIncludes: {
    '/api/og/listings/[id]': ['./assets/og-fonts/*.woff'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
