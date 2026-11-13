import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // `pnpm dev:web` is opened from the iPhone on the same Wi-Fi (the app's WebView embed, scan
  // processing). Next.js blocks its dev resources (HMR socket, chunks) for hosts other than
  // localhost unless listed. Development only; private LAN ranges.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  partialPrefetching: true,
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
