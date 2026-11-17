import { cacheLife } from 'next/cache';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { SiteHeader } from '@/components/header/SiteHeader';
import { PullToRefresh } from '@/components/PullToRefresh';
import { SiteFooter } from '@/components/SiteFooter';
import { getI18n } from '@/lib/i18n';

/** The website's pages: sticky header, the page, footer (+ pull-to-refresh in the home-screen app). */
export default async function SiteLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale, t } = await getI18n();
  const language = {
    current: locale,
    label: t('language.label'),
    names: { mn: t('language.mn'), en: t('language.en') },
  };
  const year = await currentYear();
  return (
    <AuthProvider>
      <SiteHeader locale={locale} t={t} language={language} />
      <main className="flex-1">{children}</main>
      <SiteFooter locale={locale} t={t} language={language} year={year} />
      <PullToRefresh refreshingLabel={t('pullToRefresh.refreshing')} />
    </AuthProvider>
  );
}

/** The year for the copyright line. Cached: a prerendered layout cannot read the clock directly. */
async function currentYear(): Promise<number> {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}
