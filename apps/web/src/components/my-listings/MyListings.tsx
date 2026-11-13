'use client';

import { createTranslator, formatListingPrice, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/HeaderAuthLinks';
import { fetchMyListings, type MyListingSummary } from '@/lib/my-listings';

type State = { kind: 'loading' } | { kind: 'ready'; rows: MyListingSummary[] } | { kind: 'error' };

/** "My listings": every listing of the signed-in user, any status, with a link to edit. */
export function MyListings({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (ready && !userId) router.replace(signInHref(locale, localePath(locale, '/my-listings')));
  }, [ready, userId, locale, router]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchMyListings(userId)
      .then((rows) => active && setState({ kind: 'ready', rows }))
      .catch(() => active && setState({ kind: 'error' }));
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('listings.title')}</h1>
        <Link
          href={localePath(locale, '/my-listings/new')}
          className="rounded-full bg-stone-900 px-4 py-2 font-medium text-white hover:bg-stone-700"
        >
          + {t('listings.new')}
        </Link>
      </div>
      {state.kind === 'loading' && <div className="h-40 animate-pulse rounded-2xl bg-stone-200" />}
      {state.kind === 'error' && <p className="text-red-700">{t('browse.loadFailed')}</p>}
      {state.kind === 'ready' && state.rows.length === 0 && (
        <p className="text-stone-600">{t('listings.empty')}</p>
      )}
      {state.kind === 'ready' && state.rows.length > 0 && (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-2xl bg-white shadow-sm">
          {state.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={localePath(locale, `/my-listings/${row.id}`)}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-stone-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {row.title || t('listings.untitled')}
                  </span>
                  <span className="text-sm text-stone-600">
                    {t(`listingForm.types.${row.type}`)}
                    {row.price !== null &&
                      ` · ${formatListingPrice(row.price, row.currency, row.type, locale)}`}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs font-medium">
                  {row.has_3d && (
                    <span className="rounded-full bg-amber-300 px-2 py-0.5 text-stone-900">3D</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      row.status === 'published'
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {t(`listings.statuses.${row.status}`)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
