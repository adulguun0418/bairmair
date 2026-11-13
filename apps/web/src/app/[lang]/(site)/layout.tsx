import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { HeaderAuthLinks } from '@/components/auth/HeaderAuthLinks';
import { LanguageLinks, LanguageSwitch } from '@/components/LanguageSwitch';
import { getI18n, localePath } from '@/lib/i18n';

/** The website's pages: header with the logo, navigation and language switch. */
export default async function SiteLayout({ children }: LayoutProps<'/[lang]'>) {
  const { locale, t } = await getI18n();
  const languageProps = {
    current: locale,
    label: t('language.label'),
    names: { mn: t('language.mn'), en: t('language.en') },
  };
  return (
    <AuthProvider>
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
            {/* Reads the current URL (for ?next=), so it renders inside Suspense. */}
            <Suspense fallback={<span className="w-16" aria-hidden />}>
              <HeaderAuthLinks locale={locale} />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </AuthProvider>
  );
}
