'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toggleFavorite, useAuth, useFavorites } from '@/components/auth/AuthProvider';
import { currentPath, signInHref } from '@/components/auth/sign-in-href';
import { HeartIcon } from '@/components/icons';

/**
 * Save a listing: a round ♡ over a card photo (`icon`), or a labelled button ("Save" / "Saved")
 * on the listing page. Shows the change at once and undoes it if the server refuses. A visitor
 * who is not signed in is taken to sign-in and comes back to this page.
 */
export function FavoriteButton({
  listingId,
  locale,
  variant = 'icon',
  className = '',
}: {
  listingId: string;
  locale: Locale;
  variant?: 'icon' | 'labeled';
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
  const heart = (
    <HeartIcon
      className={variant === 'icon' ? 'size-[18px]' : 'size-4'}
      fill={saved ? 'currentColor' : 'none'}
    />
  );

  if (variant === 'labeled') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        title={failed ? t('favorites.failed') : label}
        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2 ${
          failed ? 'border-danger' : 'border-line-2'
        } ${saved ? 'text-favorite' : ''} ${className}`}
      >
        {heart}
        {saved ? t('favorites.saved') : t('favorites.save')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      title={failed ? t('favorites.failed') : label}
      className={`flex size-9 items-center justify-center rounded-full bg-surface/90 shadow-sm ring-1 backdrop-blur-sm transition-colors hover:bg-surface ${
        saved ? 'text-favorite' : 'text-fg-2'
      } ${failed ? 'ring-danger' : 'ring-line'} ${className}`}
    >
      {heart}
    </button>
  );
}
