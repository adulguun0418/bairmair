import type { Locale, Translator } from '@bairmair/i18n';
import Link from 'next/link';
import { Suspense } from 'react';
import { LanguageMenu, LanguageMenuView, type LanguageProps } from '@/components/LanguageSwitch';
import { ThemeToggleButton } from '@/components/ThemeSwitch';
import { localePath } from '@/lib/i18n';
import { HeaderAccount } from './HeaderAccount';
import { Logo } from './Logo';
import { HeaderNav, HeaderNavView } from './HeaderNav';
import { MobileMenu } from './MobileMenu';

/**
 * Sticky header: logo and main sections on the left; language, theme and account on the right.
 * Below `md` the sections, account, language and theme move into the menu panel.
 * Parts that read the URL render inside `<Suspense>` with a static fallback.
 */
export function SiteHeader({
  locale,
  t,
  language,
}: {
  locale: Locale;
  t: Translator;
  language: LanguageProps;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href={localePath(locale, '/')} className="shrink-0">
          <Logo alt={t('app.name')} className="h-8 w-auto" preload />
        </Link>

        <Suspense fallback={<HeaderNavView locale={locale} active={null} />}>
          <HeaderNav locale={locale} />
        </Suspense>

        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center md:flex">
            <Suspense fallback={<LanguageMenuView {...language} path="/" />}>
              <LanguageMenu {...language} />
            </Suspense>
            <ThemeToggleButton locale={locale} />
          </div>
          <span className="mx-2 hidden h-5 w-px bg-line md:block" aria-hidden />
          <Suspense fallback={<span className="hidden w-40 md:block" aria-hidden />}>
            <HeaderAccount locale={locale} />
          </Suspense>
          <Suspense fallback={<span className="size-10 md:hidden" aria-hidden />}>
            <MobileMenu language={language} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
