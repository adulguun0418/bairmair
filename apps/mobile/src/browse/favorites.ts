import {
  CARD_COLUMNS,
  cardFromRow,
  type CardListingRow,
  type ListingCardData,
} from '@bairmair/browse';
import type { Enums } from '@bairmair/db';
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { createFavoritesStore, type FavoritesState } from './favorites-store';

export { SignedOutError } from './favorites-store';

/** A duplicate key: the listing is already saved. */
const UNIQUE_VIOLATION = '23505';

const store = createFavoritesStore({
  async list(userId) {
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return data.map((row) => row.listing_id);
  },
  async add(listingId) {
    const { error } = await supabase.from('favorites').insert({ listing_id: listingId });
    if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
  },
  async remove(listingId) {
    // RLS limits the delete to the caller's own row.
    const { error } = await supabase.from('favorites').delete().eq('listing_id', listingId);
    if (error) throw new Error(error.message);
  },
});

/** Loads saved listings for whoever is signed in, now and after every sign-in or sign-out. */
export function startFavorites(): () => void {
  let current: string | null | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id ?? null;
    if (userId === current) return;
    current = userId;
    void store.setUser(userId);
  });
  return () => data.subscription.unsubscribe();
}

export function useFavorites(): FavoritesState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useIsFavorite(listingId: string): boolean {
  return useFavorites().ids.has(listingId);
}

/** Saves or unsaves; throws `SignedOutError` without a user, or the server's refusal. */
export function toggleFavorite(listingId: string): Promise<boolean> {
  return store.toggle(listingId);
}

/** Reloads the saved ids (pull to refresh on the Saved tab). */
export function reloadFavorites(): Promise<void> {
  return store.setUser(store.getState().userId);
}

export interface FavoriteCard {
  listingId: string;
  /** Null when the listing is no longer visible (hidden, deleted) or incomplete. */
  card: ListingCardData | null;
  status: Enums<'listing_status'> | null;
}

/** The user's saved listings as cards, newest saved first. */
export async function fetchFavoriteCards(): Promise<FavoriteCard[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(`listing_id, created_at, listings(status, ${CARD_COLUMNS})`)
    .order('created_at', { ascending: false })
    .overrideTypes<
      {
        listing_id: string;
        listings: (CardListingRow & { status: Enums<'listing_status'> }) | null;
      }[],
      { merge: false }
    >();
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    listingId: row.listing_id,
    card: row.listings ? cardFromRow(row.listings) : null,
    status: row.listings?.status ?? null,
  }));
}
