'use client';

import { fetchFavoriteCards, type FavoriteCard } from '@bairmair/browse';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toggleFavorite, useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { ListingCard } from '@/components/listing/ListingCard';
import { publicEnv } from '@/lib/public-env';
import { browserClient } from '@/lib/supabase-browser';

type State = { kind: 'loading' } | { kind: 'ready'; items: FavoriteCard[] } | { kind: 'error' };

/** The visitor's saved listings, newest saved first; ones no longer active can be removed. */
export function SavedListings({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (ready && !userId) router.replace(signInHref(locale, localePath(locale, '/saved')));
  }, [ready, userId, locale, router]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchFavoriteCards(browserClient())
      .then((items) => active && setState({ kind: 'ready', items }))
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [userId]);

  if (state.kind === 'loading') {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-3" />;
  }
  if (state.kind === 'error') return <p className="text-danger">{t('browse.loadFailed')}</p>;
  if (state.items.length === 0) return <p className="text-fg-muted">{t('favorites.empty')}</p>;

  const remove = async (listingId: string) => {
    await toggleFavorite(listingId).catch(() => undefined);
    setState((current) =>
      current.kind === 'ready'
        ? { kind: 'ready', items: current.items.filter((item) => item.listingId !== listingId) }
        : current,
    );
  };

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {state.items.map((item) => (
        <li key={item.listingId} className="flex flex-col gap-2">
          {item.card && item.status === 'published' ? (
            <ListingCard card={item.card} locale={locale} supabaseUrl={publicEnv.supabaseUrl} />
          ) : (
            <div className="flex flex-1 flex-col justify-between gap-3 rounded-2xl bg-surface-2 p-4 text-fg-muted">
              <span>{item.card?.title ?? t('favorites.unavailable')}</span>
              <span className="text-sm">{t('favorites.unavailable')}</span>
              <button
                type="button"
                onClick={() => void remove(item.listingId)}
                className="self-start text-sm underline"
              >
                {t('favorites.remove')}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
