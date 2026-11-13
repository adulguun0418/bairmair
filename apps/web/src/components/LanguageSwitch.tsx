'use client';

import { LOCALES, localePath, stripLocale, type Locale } from '@bairmair/i18n/locales';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface LanguageSwitchProps {
  current: Locale;
  label: string;
  names: Record<Locale, string>;
}

/**
 * Links to the current page in each language, with its query (search filters). Reads the URL,
 * so it renders inside `<Suspense>` with `LanguageLinks` as the fallback.
 */
export function LanguageSwitch(props: LanguageSwitchProps) {
  // Without its locale prefix, whether the path is the address bar URL or the rewritten one.
  const path = stripLocale(usePathname() ?? '/');
  const query = useSearchParams()?.toString() ?? '';
  return <LanguageLinks {...props} path={query ? `${path}?${query}` : path} />;
}

/** Links to `path` (without a locale prefix) in each language. */
export function LanguageLinks({
  current,
  label,
  names,
  path,
}: LanguageSwitchProps & { path: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-stone-100 p-0.5">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={localePath(locale, path)}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? 'true' : undefined}
          className={`rounded-full px-2.5 py-1 text-xs ${
            locale === current
              ? 'bg-white font-medium shadow-sm'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          {names[locale]}
        </Link>
      ))}
    </div>
  );
}
