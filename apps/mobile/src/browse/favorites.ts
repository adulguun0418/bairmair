import {
  createFavoritesStore,
  fetchFavoriteCards as fetchCards,
  supabaseFavoritesRemote,
  type FavoriteCard,
  type FavoritesState,
} from '@bairmair/browse';
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

export { SignedOutError, type FavoriteCard } from '@bairmair/browse';

const store = createFavoritesStore(supabaseFavoritesRemote(supabase));

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

/** The user's saved listings as cards, newest saved first. */
export function fetchFavoriteCards(): Promise<FavoriteCard[]> {
  return fetchCards(supabase);
}
