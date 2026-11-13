import { LOCALES } from '@bairmair/i18n/locales';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { getI18n } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import '../globals.css';

// Mongolian needs Ө and Ү, which are in the extended Cyrillic subset.
const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
});

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    // Open Graph and canonical URLs are absolute; shared links must point at the public site.
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: t('app.name'), template: `%s · ${t('app.name')}` },
    description: t('app.tagline'),
  };
}

/**
 * The document shell. The site's header lives in `(site)/layout.tsx`, so `embed/` pages (shown
 * inside the mobile app's WebView) get the bare viewport.
 */
export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">{children}</body>
    </html>
  );
}
