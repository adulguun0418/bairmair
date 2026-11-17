import { DEFAULT_LOCALE, createTranslator } from '@bairmair/i18n';
import type { MetadataRoute } from 'next';

/**
 * Web app manifest (`/manifest.webmanifest`), for "Add to Home Screen". One per site, so it is in
 * Mongolian, the primary language. Opens standalone (no browser UI); `PullToRefresh` makes up for
 * the missing reload gesture there.
 *
 * Icons in `public/icons/` are the logo mark on white, made from `assets/brand/logo-mark.svg`
 * (the maskable one keeps the mark inside the 80% safe circle Android crops to).
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = createTranslator(DEFAULT_LOCALE);
  return {
    id: '/',
    name: t('app.name'),
    short_name: t('app.name'),
    description: t('app.tagline'),
    lang: DEFAULT_LOCALE,
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The light page background (`--page`); the theme-color meta tags switch it for dark mode.
    background_color: '#f7f8fb',
    theme_color: '#f7f8fb',
    categories: ['lifestyle', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
