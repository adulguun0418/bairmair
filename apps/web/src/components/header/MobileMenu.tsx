'use client';

import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { CloseIcon, MenuIcon, PlusIcon } from '@/components/icons';
import { LanguageLinks, type LanguageProps } from '@/components/LanguageSwitch';
import { ThemeSelect } from '@/components/ThemeSwitch';
import { browserClient } from '@/lib/supabase-browser';
import { postListingHref, primaryButton } from './HeaderAccount';
import { activeNav, navItems } from './nav-items';

/**
 * Below the `md` breakpoint: a menu button opening a full-width panel with the sections,
 * account links, language and theme. Reads the URL: render inside `<Suspense>`.
 */
export function MobileMenu({ language }: { language: LanguageProps }) {
  const locale: Locale = language.current;
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const active = activeNav(pathname, new URLSearchParams(params?.toString()));

  // Escape closes; the page behind does not scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const signOut = async () => {
    close();
    await browserClient().auth.signOut({ scope: 'local' });
    router.push(localePath(locale, '/'));
  };

  const row =
    'flex w-full items-center rounded-xl px-3 py-3 text-left text-base font-medium text-fg-2 hover:bg-surface-2';
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? t('nav.closeMenu') : t('nav.menu')}
        className="flex size-10 items-center justify-center rounded-full text-fg-2 hover:bg-surface-2"
      >
        {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>
      {/* Portaled: the header's backdrop-filter would make it the containing block of a fixed
          panel, squeezing the panel into the header's own 64 px. */}
      {open &&
        createPortal(
          <div
            id="mobile-menu"
            className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-line bg-page px-4 pb-10 pt-4"
          >
            <nav aria-label={t('nav.main')} className="space-y-1">
              {navItems(locale).map(({ key, href }) => (
                <Link
                  key={key}
                  href={href}
                  onClick={close}
                  aria-current={active === key ? 'page' : undefined}
                  className={`${row} ${active === key ? 'bg-surface-2 text-fg' : ''}`}
                >
                  {t(`nav.${key}`)}
                </Link>
              ))}
            </nav>

            <div className="mt-4 border-t border-line pt-4">
              {ready && (
                <Link
                  href={postListingHref(locale, Boolean(session))}
                  onClick={close}
                  className={`${primaryButton} w-full justify-center py-3 text-base`}
                >
                  <PlusIcon className="size-5" />
                  {t('nav.postListing')}
                </Link>
              )}
              <div className="mt-3 space-y-1">
                {ready && !session && (
                  <Link href={signInHref(locale, pathname)} onClick={close} className={row}>
                    {t('nav.signIn')}
                  </Link>
                )}
                {session && (
                  <>
                    <Link href={localePath(locale, '/my-listings')} onClick={close} className={row}>
                      {t('nav.myListings')}
                    </Link>
                    <Link href={localePath(locale, '/saved')} onClick={close} className={row}>
                      {t('nav.saved')}
                    </Link>
                    <Link href={localePath(locale, '/account')} onClick={close} className={row}>
                      {t('nav.account')}
                    </Link>
                    <button type="button" onClick={() => void signOut()} className={row}>
                      {t('nav.signOut')}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
              <div onClickCapture={close}>
                <LanguageLinks {...language} />
              </div>
              <ThemeSelect locale={locale} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
