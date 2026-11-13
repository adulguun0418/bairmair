'use client';

import type { Locale } from '@bairmair/i18n';
import { searchArgs, searchQuery, type SearchFilters } from '@bairmair/browse';
import { useSyncExternalStore } from 'react';
import { SearchMap } from '@/components/map/maps';
import { useSearchNavigation } from './search-navigation';

const WIDE = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The map beside the results list, on wide screens only: phones never load MapLibre for the
 * list (they have the map view). "Search this area" puts the visible area into the URL.
 */
export function ResultsMap({
  locale,
  filters,
  action,
  supabaseUrl,
}: {
  locale: Locale;
  filters: SearchFilters;
  action: string;
  supabaseUrl: string;
}) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
  const { navigate } = useSearchNavigation();
  if (!wide) return null;
  return (
    <SearchMap
      locale={locale}
      args={searchArgs(filters)}
      supabaseUrl={supabaseUrl}
      bounds={filters.bounds}
      onSearchArea={(area) => navigate(`${action}${searchQuery(filters, { bounds: area })}`)}
    />
  );
}
