import { localePath, type Locale } from '@bairmair/i18n';
import * as WebBrowser from 'expo-web-browser';
import { env } from '@/lib/env';

/** Pages of the website the app links to (the legal texts live only there). */
export const SITE_PAGES = {
  terms: '/terms',
  privacy: '/privacy',
} as const;

export type SitePage = keyof typeof SITE_PAGES;

/** Opens a website page in the in-app browser (Safari view / Custom Tab), in the app's language. */
export function openSitePage(page: SitePage, locale: Locale): void {
  void WebBrowser.openBrowserAsync(`${env.siteUrl}${localePath(locale, SITE_PAGES[page])}`);
}
