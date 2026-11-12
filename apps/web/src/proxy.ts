import { DEFAULT_LOCALE, isLocale } from '@bairmair/i18n/locales';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Locale routing.
 *
 * Mongolian is served without a prefix (`/samples`), so shared links stay short and always open
 * in Mongolian. The browser language is deliberately ignored: many Mongolian users run their
 * phones in English, and shared links must still open in Mongolian.
 *
 * - `/en/...`: served as is.
 * - `/mn/...`: redirected to the unprefixed URL, so each page has one canonical address.
 * - anything else: rewritten internally to `/mn/...`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];

  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || '/';
    return NextResponse.redirect(url, 308);
  }
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next.js internals, API routes, and files with an extension (images, favicon, ...).
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
