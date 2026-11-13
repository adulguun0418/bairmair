'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toggleFavorite, useAuth, useFavorites } from '@/components/auth/AuthProvider';
import { currentPath, signInHref } from '@/components/auth/sign-in-href';

/**
 * ♡ for a listing. Shows the change at once and undoes it if the server refuses. A visitor who
 * is not signed in is taken to sign-in and comes back to this page.
 */
export function FavoriteButton({
  listingId,
  locale,
  className = '',
}: {
  listingId: string;
  locale: Locale;
  className?: string;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session } = useAuth();
  const saved = useFavorites().ids.has(listingId);
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const onClick = () => {
    if (!session) {
      router.push(signInHref(locale, currentPath()));
      return;
    }
    setFailed(false);
    toggleFavorite(listingId).catch(() => setFailed(true));
  };

  const label = saved ? t('favorites.remove') : t('favorites.save');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={failed ? t('favorites.failed') : label}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-xl leading-none shadow-sm ring-1 ring-line hover:bg-surface ${
        saved ? 'text-favorite' : 'text-fg-2'
      } ${failed ? 'ring-danger' : ''} ${className}`}
    >
      <span aria-hidden>{saved ? '♥' : '♡'}</span>
    </button>
  );
}
