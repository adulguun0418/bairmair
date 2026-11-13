import { LISTING_FRESHNESS } from '@bairmair/db';
import type { Locale, Translator } from '@bairmair/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ListingGrid } from '@/components/listing/ListingCard';
import { SearchMap } from '@/components/map/maps';
import { SearchForm } from '@/components/search/SearchForm';
import { SortSelect } from '@/components/search/SortSelect';
import { getI18n, localePath } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import {
  pageArgs,
  pageCount,
  parseSearchParams,
  searchArgs,
  searchQuery,
  type SearchFilters,
} from '@/lib/search-params';
import { searchListings } from '@/server/search';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('search.title') };
}

/**
 * Search: filters on the side, results as a list or on a map. Everything is in the URL, so a
 * search can be shared. Only listings confirmed within the last 14 days appear.
 */
export default function SearchPage(props: PageProps<'/[lang]/search'>) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-stone-200" />}>
        <SearchContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchContent({ searchParams }: Pick<PageProps<'/[lang]/search'>, 'searchParams'>) {
  const filters = parseSearchParams(await searchParams);
  const { locale, t } = await getI18n();
  const action = localePath(locale, '/search');
  const href = (changes: Partial<SearchFilters>) => `${action}${searchQuery(filters, changes)}`;
  const title = t(`search.titles.${filters.type ?? 'all'}`);

  const tab = (type: SearchFilters['type'], label: string) => (
    <Link
      href={href({ type, currency: type === 'sale' ? 'MNT' : filters.currency })}
      aria-current={filters.type === type ? 'page' : undefined}
      className={`rounded-full px-4 py-1.5 text-sm ${
        filters.type === type ? 'bg-white font-medium shadow-sm' : 'text-stone-600'
      }`}
    >
      {label}
    </Link>
  );
  const viewTab = (view: SearchFilters['view'], label: string) => (
    <Link
      href={href({ view, page: filters.page })}
      aria-current={filters.view === view ? 'page' : undefined}
      className={`rounded-full px-4 py-1.5 text-sm ${
        filters.view === view ? 'bg-stone-900 font-medium text-white' : 'text-stone-700'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="flex flex-wrap gap-3">
          <nav className="inline-flex rounded-full bg-stone-200 p-1">
            {tab(null, t('search.types.all'))}
            {tab('sale', t('search.types.sale'))}
            {tab('rent', t('search.types.rent'))}
          </nav>
          <nav className="inline-flex rounded-full border border-stone-300 bg-white p-1">
            {viewTab('list', t('search.views.list'))}
            {viewTab('map', t('search.views.map'))}
          </nav>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <SearchForm
            key={searchQuery(filters, { page: filters.page })}
            locale={locale}
            filters={filters}
            action={action}
          />
        </aside>

        {filters.view === 'map' ? (
          <section className="h-[calc(100svh-11rem)] min-h-[26rem] overflow-hidden rounded-2xl bg-stone-200 shadow-sm">
            <SearchMap
              locale={locale}
              args={searchArgs(filters)}
              supabaseUrl={publicEnv.supabaseUrl}
            />
          </section>
        ) : (
          <Results filters={filters} locale={locale} t={t} action={action} />
        )}
      </div>

      <p className="text-sm text-stone-500">
        {t('search.freshNote', { days: LISTING_FRESHNESS.confirmEveryDays })}
      </p>
    </div>
  );
}

async function Results({
  filters,
  locale,
  t,
  action,
}: {
  filters: SearchFilters;
  locale: Locale;
  t: Translator;
  action: string;
}) {
  const { rows, total } = await searchListings({
    ...searchArgs(filters),
    ...pageArgs(filters.page),
  });
  const pages = pageCount(total);
  const pageHref = (page: number) => `${action}${searchQuery(filters, { page })}`;

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{t('search.results', { count: total })}</p>
        <SortSelect locale={locale} filters={filters} action={action} />
      </div>
      {filters.sort === 'recommended' && total > 0 && (
        <p className="-mt-2 text-sm text-stone-500">{t('search.recommendedHint')}</p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-stone-600 shadow-sm">
          {t('search.noResults')}
        </p>
      ) : (
        <ListingGrid cards={rows} locale={locale} supabaseUrl={publicEnv.supabaseUrl} />
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-4 pt-2 text-sm">
          {filters.page > 1 ? (
            <Link href={pageHref(filters.page - 1)} className={pagerClass}>
              {t('search.previous')}
            </Link>
          ) : (
            <span className={`${pagerClass} opacity-40`}>{t('search.previous')}</span>
          )}
          <span className="text-stone-600">{t('search.page', { page: filters.page, pages })}</span>
          {filters.page < pages ? (
            <Link href={pageHref(filters.page + 1)} className={pagerClass}>
              {t('search.next')}
            </Link>
          ) : (
            <span className={`${pagerClass} opacity-40`}>{t('search.next')}</span>
          )}
        </nav>
      )}
    </section>
  );
}

const pagerClass = 'rounded-full border border-stone-300 bg-white px-4 py-2';
