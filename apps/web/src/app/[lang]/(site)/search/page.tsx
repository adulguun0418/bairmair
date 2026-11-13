import { LISTING_FRESHNESS } from '@bairmair/db';
import type { Locale, Translator } from '@bairmair/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRightIcon, SearchIcon } from '@/components/icons';
import { ListingGrid } from '@/components/listing/ListingCard';
import { SearchMap } from '@/components/map/maps';
import { FilterBar } from '@/components/search/FilterBar';
import { ResultsMap } from '@/components/search/ResultsMap';
import {
  HoverReporter,
  PendingResults,
  SearchNavigationProvider,
  StickyBar,
} from '@/components/search/search-navigation';
import { getI18n, localePath } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';
import {
  DEFAULT_FILTERS,
  hasFilters,
  pageArgs,
  pageCount,
  parseSearchParams,
  searchArgs,
  searchQuery,
  type SearchFilters,
} from '@bairmair/browse';
import { searchListings } from '@/server/search';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('search.title') };
}

/**
 * Search: a sticky filter bar, then the results beside a map (wide screens), or a full map.
 * Everything is in the URL, so a search can be shared. Only listings confirmed within the last
 * 14 days appear.
 */
export default function SearchPage(props: PageProps<'/[lang]/search'>) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[100rem] space-y-6 px-4 py-6">
          <div className="h-10 animate-pulse rounded-full bg-surface-3" />
          <div className="h-96 animate-pulse rounded-3xl bg-surface-3" />
        </div>
      }
    >
      <SearchContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SearchContent({ searchParams }: Pick<PageProps<'/[lang]/search'>, 'searchParams'>) {
  const filters = parseSearchParams(await searchParams);
  const { locale, t } = await getI18n();
  const action = localePath(locale, '/search');

  return (
    <SearchNavigationProvider>
      <StickyBar>
        <div className="mx-auto max-w-[100rem] px-4 py-3">
          <FilterBar locale={locale} filters={filters} action={action} />
        </div>
      </StickyBar>

      {filters.view === 'map' ? (
        <section className="h-[calc(100svh-4rem-var(--search-bar-h,7rem))] min-h-[26rem]">
          <SearchMap
            locale={locale}
            args={searchArgs(filters)}
            supabaseUrl={publicEnv.supabaseUrl}
            bounds={filters.bounds}
          />
        </section>
      ) : (
        <div className="mx-auto grid max-w-[100rem] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <PendingResults>
            <Results filters={filters} locale={locale} t={t} action={action} />
          </PendingResults>
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(4rem+var(--search-bar-h,7rem)+1.5rem)] h-[calc(100svh-4rem-var(--search-bar-h,7rem)-3rem)] overflow-hidden rounded-3xl bg-surface-3 ring-1 ring-line">
              <ResultsMap
                locale={locale}
                filters={filters}
                action={action}
                supabaseUrl={publicEnv.supabaseUrl}
              />
            </div>
          </aside>
        </div>
      )}
    </SearchNavigationProvider>
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
  const title = t(`search.titles.${filters.type ?? 'all'}`);
  const cleared = searchQuery({
    ...DEFAULT_FILTERS,
    type: filters.type,
    sort: filters.sort,
    view: filters.view,
  });

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-fg-muted">
          {t('search.results', { count: total })}
          {filters.sort === 'recommended' && total > 0 && ` · ${t('search.recommendedHint')}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-6 py-14 text-center ring-1 ring-line">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
            <SearchIcon className="size-7" />
          </span>
          <h2 className="text-lg font-semibold">{t('search.noResultsTitle')}</h2>
          <p className="max-w-sm text-sm text-fg-muted">{t('search.noResults')}</p>
          {hasFilters(filters) && (
            <Link
              href={`${action}${cleared}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              {t('search.clearAll')}
              <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </div>
      ) : (
        <HoverReporter>
          <ListingGrid
            cards={rows}
            locale={locale}
            supabaseUrl={publicEnv.supabaseUrl}
            layout="split"
          />
        </HoverReporter>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 pt-2 text-sm">
          {filters.page > 1 ? (
            <Link href={pageHref(filters.page - 1)} className={pagerClass}>
              {t('search.previous')}
            </Link>
          ) : (
            <span className={`${pagerClass} opacity-40`}>{t('search.previous')}</span>
          )}
          <span className="px-2 text-fg-muted">
            {t('search.page', { page: filters.page, pages })}
          </span>
          {filters.page < pages ? (
            <Link href={pageHref(filters.page + 1)} className={pagerClass}>
              {t('search.next')}
            </Link>
          ) : (
            <span className={`${pagerClass} opacity-40`}>{t('search.next')}</span>
          )}
        </nav>
      )}

      <p className="text-xs text-fg-subtle">
        {t('search.freshNote', { days: LISTING_FRESHNESS.confirmEveryDays })}
      </p>
    </section>
  );
}

const pagerClass =
  'rounded-full bg-surface px-4 py-2 font-medium ring-1 ring-line transition hover:ring-line-2';
