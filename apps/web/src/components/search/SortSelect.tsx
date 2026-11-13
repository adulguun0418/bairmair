'use client';

import { SEARCH_SORTS, type SearchSort } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { searchQuery, type SearchFilters } from '@/lib/search-params';

/** The result order; changing it reloads the search at page 1. */
export function SortSelect({
  locale,
  filters,
  action,
}: {
  locale: Locale;
  filters: SearchFilters;
  action: string;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-stone-600">{t('search.sort')}</span>
      <select
        value={filters.sort}
        onChange={(event) =>
          router.push(
            `${action}${searchQuery(filters, { sort: event.target.value as SearchSort })}`,
          )
        }
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5"
      >
        {SEARCH_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(`search.sorts.${sort}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
