'use client';

import { formatMongolianPhone } from '@bairmair/browse';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { HeartIcon, PlusIcon, UserIcon } from '@/components/icons';
import { browserClient } from '@/lib/supabase-browser';
import { useDismiss } from './use-dismiss';

export const primaryButton =
  'inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover';
const iconButton =
  'flex size-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg';

/** Where "Post a listing" goes: the new-listing editor, through sign-in for visitors. */
export function postListingHref(locale: Locale, signedIn: boolean): string {
  const editor = localePath(locale, '/my-listings/new');
  return signedIn ? editor : signInHref(locale, editor);
}

/**
 * Desktop header, right side: "Sign in" + "Post a listing" for visitors; "Post a listing",
 * saved listings and an account menu once signed in. Reads the URL: render inside `<Suspense>`.
 */
export function HeaderAccount({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session, ready } = useAuth();
  const pathname = usePathname() ?? '/';

  // Nothing until the stored session is read, so a signed-in visitor never sees "Sign in" flash.
  if (!ready) return <span className="hidden w-40 md:block" aria-hidden />;

  if (!session) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        <Link
          href={signInHref(locale, pathname)}
          className="rounded-full px-3 py-2 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {t('nav.signIn')}
        </Link>
        <Link href={postListingHref(locale, false)} className={primaryButton}>
          <PlusIcon className="size-4" />
          {t('nav.postListing')}
        </Link>
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-1 md:flex">
      <Link href={postListingHref(locale, true)} className={`${primaryButton} mr-1`}>
        <PlusIcon className="size-4" />
        {t('nav.postListing')}
      </Link>
      <Link
        href={localePath(locale, '/saved')}
        aria-label={t('nav.saved')}
        title={t('nav.saved')}
        className={iconButton}
      >
        <HeartIcon className="size-[18px]" />
      </Link>
      <AccountMenu locale={locale} phone={session.user.phone} />
    </div>
  );
}

function AccountMenu({ locale, phone }: { locale: Locale; phone: string | undefined }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  const signOut = async () => {
    close();
    await browserClient().auth.signOut({ scope: 'local' });
    router.push(localePath(locale, '/'));
  };

  const item =
    'block w-full rounded-lg px-3 py-2 text-left text-sm text-fg-2 hover:bg-surface-2 hover:text-fg';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t('nav.accountMenu')}
        className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-2 transition-colors hover:border-line-2 hover:text-fg"
      >
        <UserIcon className="size-[18px]" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {phone && (
            <p className="truncate px-3 pb-2 pt-1.5 text-xs text-fg-subtle">
              {formatMongolianPhone(phone)}
            </p>
          )}
          <Link href={localePath(locale, '/my-listings')} onClick={close} className={item}>
            {t('nav.myListings')}
          </Link>
          <Link href={localePath(locale, '/saved')} onClick={close} className={item}>
            {t('nav.saved')}
          </Link>
          <Link href={localePath(locale, '/account')} onClick={close} className={item}>
            {t('nav.account')}
          </Link>
          <div className="my-1 border-t border-line" />
          <button type="button" onClick={() => void signOut()} className={item}>
            {t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
