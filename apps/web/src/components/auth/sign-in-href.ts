import { localePath, type Locale } from '@bairmair/i18n';

/** The page being shown (path and query), to come back to after signing in. Browser only. */
export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/** The sign-in path that comes back to `path` afterwards. */
export function signInHref(locale: Locale, path: string): string {
  return `${localePath(locale, '/sign-in')}?next=${encodeURIComponent(path)}`;
}
