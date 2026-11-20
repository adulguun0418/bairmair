import { openSitePage as openPage, type SitePage } from '@bairmair/native-auth';
import type { Locale } from '@bairmair/i18n';
import { env } from '@/lib/env';

export { SITE_PAGES, type SitePage } from '@bairmair/native-auth';

/** Opens a website page in the in-app browser (Safari view / Custom Tab), in the app's language. */
export function openSitePage(page: SitePage, locale: Locale): void {
  openPage(env.siteUrl, page, locale);
}
