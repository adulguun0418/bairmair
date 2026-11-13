import { DEFAULT_FILTERS, type SearchFilters } from '@bairmair/browse';
import { useSyncExternalStore } from 'react';

/**
 * The Search tab's filters, shared with the filters sheet. Same model as the web's URL filters
 * (`page` is unused: the list loads more as it scrolls). Kept for the app session only.
 */
let filters: SearchFilters = DEFAULT_FILTERS;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSearchFilters(): SearchFilters {
  return useSyncExternalStore(subscribe, () => filters);
}

export function getSearchFilters(): SearchFilters {
  return filters;
}

export function setSearchFilters(changes: Partial<SearchFilters>): void {
  const next = { ...filters, ...changes, page: 1 };
  // A sale is always priced in tögrög.
  if (next.type === 'sale') next.currency = 'MNT';
  filters = next;
  for (const listener of listeners) listener();
}

/** Clears the filter sheet's fields; keeps type, text, sort and view. */
export function clearSearchFilters(): void {
  setSearchFilters({
    districts: [],
    rooms: [],
    currency: 'MNT',
    priceMin: null,
    priceMax: null,
    areaMin: null,
    areaMax: null,
    has3d: false,
  });
}
