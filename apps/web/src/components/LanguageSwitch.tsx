'use client';

import { LOCALES, localePath, stripLocale, type Locale } from '@bairmair/i18n/locales';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { CheckIcon, GlobeIcon } from './icons';
import { useDismiss } from './header/use-dismiss';

export interface LanguageProps {
  current: Locale;
  label: string;
  names: Record<Locale, string>;
}

/**
 * The current page (path and query, e.g. search filters) without its locale prefix, whether the
 * path is the address bar URL or the rewritten one. Reads the URL: render inside `<Suspense>`.
 */
function useLocalizablePath(): string {
  const path = stripLocale(usePathname() ?? '/');
  const query = useSearchParams()?.toString() ?? '';
  return query ? `${path}?${query}` : path;
}

/** Header: a globe with the current language code, opening a small menu. */
export function LanguageMenu(props: LanguageProps) {
  return <LanguageMenuView {...props} path={useLocalizablePath()} />;
}

/** `LanguageMenu` for a known path (its Suspense fallback uses "/"). */
export function LanguageMenuView({
  current,
  label,
  names,
  path,
}: LanguageProps & { path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${label}: ${names[current]}`}
        className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tracking-wide text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <GlobeIcon className="size-4" />
        {current.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-lg">
          {LOCALES.map((locale) => (
            <Link
              key={locale}
              href={localePath(locale, path)}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? 'true' : undefined}
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-fg-2 hover:bg-surface-2"
            >
              {names[locale]}
              {locale === current && <CheckIcon className="size-4" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Footer and mobile menu: the languages as plain links ("Монгол · English"). */
export function LanguageLinks(props: LanguageProps) {
  return <LanguageLinksView {...props} path={useLocalizablePath()} />;
}

export function LanguageLinksView({
  current,
  label,
  names,
  path,
}: LanguageProps & { path: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 text-sm">
      <GlobeIcon className="mr-1 size-4 text-fg-subtle" />
      {LOCALES.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 && <span className="text-fg-subtle">·</span>}
          <Link
            href={localePath(locale, path)}
            hrefLang={locale}
            lang={locale}
            aria-current={locale === current ? 'true' : undefined}
            className={locale === current ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg'}
          >
            {names[locale]}
          </Link>
        </span>
      ))}
    </div>
  );
}
