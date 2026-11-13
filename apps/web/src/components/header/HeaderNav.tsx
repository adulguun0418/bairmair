'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { activeNav, navItems, type NavKey } from './nav-items';

/** Main sections with the current one highlighted. Reads the URL: render inside `<Suspense>`. */
export function HeaderNav({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  return (
    <HeaderNavView
      locale={locale}
      active={activeNav(pathname, new URLSearchParams(params?.toString()))}
    />
  );
}

/** `HeaderNav` with a known active section (`null` while the URL is not read yet). */
export function HeaderNavView({ locale, active }: { locale: Locale; active: NavKey | null }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return (
    <nav aria-label={t('nav.main')} className="hidden items-center gap-1 md:flex">
      {navItems(locale).map(({ key, href }) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? 'page' : undefined}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            active === key
              ? 'bg-surface-2 text-fg'
              : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
          }`}
        >
          {t(`nav.${key}`)}
        </Link>
      ))}
    </nav>
  );
}
