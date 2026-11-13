import { LOCALES } from '@bairmair/i18n/locales';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { LanguageLinks, LanguageSwitch } from '@/components/LanguageSwitch';
import { getI18n, localePath } from '@/lib/i18n';
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

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale, t } = await getI18n();
  const languageProps = {
    current: locale,
    label: t('language.label'),
    names: { mn: t('language.mn'), en: t('language.en') },
  };
  return (
    <html lang={locale} className={`${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href={localePath(locale, '/')} className="shrink-0">
              {/* Built from assets/brand/logo.svg by assets/brand/build-horizontal.mjs (aspect 3.608). */}
              <Image
                src="/brand/logo-horizontal.svg"
                alt={t('app.name')}
                width={130}
                height={36}
                preload
                unoptimized
                className="h-8 w-auto sm:h-9"
              />
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 text-sm">
              <Link href={localePath(locale, '/search?type=sale')} className="hover:underline">
                {t('nav.sale')}
              </Link>
              <Link href={localePath(locale, '/search?type=rent')} className="hover:underline">
                {t('nav.rent')}
              </Link>
              <Link
                href={localePath(locale, '/search?view=map')}
                className="hidden hover:underline sm:inline"
              >
                {t('nav.map')}
              </Link>
              <Link
                href={localePath(locale, '/samples')}
                className="hidden hover:underline sm:inline"
              >
                {t('nav.samples')}
              </Link>
              <Suspense fallback={<LanguageLinks {...languageProps} path="/" />}>
                <LanguageSwitch {...languageProps} />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
