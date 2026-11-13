'use client';

import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useAuth } from './AuthProvider';

/** The page being shown (path and query), to come back to after signing in. Browser only. */
export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/** The sign-in path that comes back to `path` afterwards. */
export function signInHref(locale: Locale, path: string): string {
  return `${localePath(locale, '/sign-in')}?next=${encodeURIComponent(path)}`;
}

/** Header: "Sign in" for visitors; "Saved" and "Account" once signed in. */
export function HeaderAuthLinks({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // Nothing until the stored session is read, so a signed-in visitor never sees "Sign in" flash.
  if (!ready) return <span className="w-16" aria-hidden />;

  if (!session) {
    return (
      <Link
        href={signInHref(locale, pathname)}
        className="rounded-full bg-stone-900 px-3 py-1.5 font-medium text-white hover:bg-stone-700"
      >
        {t('nav.signIn')}
      </Link>
    );
  }
  return (
    <>
      <Link href={localePath(locale, '/saved')} className="hover:underline">
        ♡ {t('nav.saved')}
      </Link>
      <Link href={localePath(locale, '/account')} className="font-medium hover:underline">
        {t('nav.account')}
      </Link>
    </>
  );
}
