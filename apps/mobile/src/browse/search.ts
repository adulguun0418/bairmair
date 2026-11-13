import { searchArgs, type SearchFilters, type Viewport } from '@bairmair/browse';
import {
  MAP_PIN_COLUMNS,
  SEARCH_LIMITS,
  type MapPinRow,
  type SearchListingRow,
} from '@bairmair/db';
import { supabase } from '@/lib/supabase';

export interface SearchPage {
  rows: SearchListingRow[];
  /** Matches before paging. */
  total: number;
}

/** One page of search results; `offset` counts rows already loaded. */
export async function searchPage(
  filters: SearchFilters,
  offset: number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  let query = supabase.rpc('search_listings', {
    ...searchArgs(filters),
    p_limit: SEARCH_LIMITS.pageSize,
    p_offset: offset,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data as unknown as SearchListingRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Whether more pages can be loaded after `loaded` rows. */
export function hasMorePages(loaded: number, total: number): boolean {
  return loaded < total && loaded < SEARCH_LIMITS.maxOffset;
}

/** Map pins inside `area` with the search's filters (at most `SEARCH_LIMITS.mapPins`). */
export async function searchPins(
  filters: SearchFilters,
  area: Viewport,
  signal?: AbortSignal,
): Promise<MapPinRow[]> {
  let query = supabase
    .rpc('search_listings', {
      ...searchArgs(filters),
      p_west: area.west,
      p_south: area.south,
      p_east: area.east,
      p_north: area.north,
      p_limit: SEARCH_LIMITS.mapPins,
      p_offset: 0,
    })
    .select(MAP_PIN_COLUMNS);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as unknown as MapPinRow[];
}
