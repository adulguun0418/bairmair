import { LOCALES } from '@bairmair/i18n/locales';
import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import { getI18n } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import { THEME_SCRIPT } from '@/lib/theme';
import '../globals.css';

// Onest was drawn for Cyrillic. Mongolian needs Ө and Ү, which are in the extended subset.
const onest = Onest({
  variable: '--font-onest',
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

// Browser UI (address bar on phones) follows the page background in each theme.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fb' },
    { media: '(prefers-color-scheme: dark)', color: '#070b16' },
  ],
};

/**
 * The document shell. The site's header lives in `(site)/layout.tsx`, so `embed/` pages (shown
 * inside the mobile app's WebView) get the bare viewport.
 */
export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale } = await getI18n();
  return (
    // The theme script sets `data-theme` before React hydrates; that attribute is expected to differ.
    <html lang={locale} className={`${onest.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-page text-fg">{children}</body>
    </html>
  );
}
