// Locale constants and URL helpers. No i18next import, so this is cheap to load anywhere
// (including the Next.js proxy).

export const LOCALES = ['mn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Mongolian is the primary language. */
export const DEFAULT_LOCALE: Locale = 'mn';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * URL path of a page in a locale. Mongolian pages have no prefix (`/samples`), so the links
 * people share stay short; other locales are prefixed (`/en/samples`).
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** Removes a leading locale segment: `/en/samples` becomes `/samples`. */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first)) return `/${rest.join('/')}`;
  return pathname === '' ? '/' : pathname;
}
