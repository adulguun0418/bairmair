'use client';

import {
  createFavoritesStore,
  supabaseFavoritesRemote,
  type FavoritesState,
  type FavoritesStore,
} from '@bairmair/browse';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { browserClient } from '@/lib/supabase-browser';

interface AuthValue {
  session: Session | null;
  /** False until the stored session has been read (avoids flashing "Sign in"). */
  ready: boolean;
}

const AuthContext = createContext<AuthValue>({ session: null, ready: false });

let favorites: FavoritesStore | null = null;

/** The visitor's saved listings, shared by every ♡ on the page. Created in the browser only. */
function favoritesStore(): FavoritesStore {
  favorites ??= createFavoritesStore(supabaseFavoritesRemote(browserClient()));
  return favorites;
}

const SIGNED_OUT: FavoritesState = { userId: null, ids: new Set(), status: 'signed-out' };

/** Session of the visitor, and their favorites loaded whenever the user changes. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<AuthValue>({ session: null, ready: false });

  useEffect(() => {
    const client = browserClient();
    let current: string | null | undefined;
    const apply = (session: Session | null) => {
      setValue({ session, ready: true });
      const userId = session?.user.id ?? null;
      if (userId !== current) {
        current = userId;
        void favoritesStore().setUser(userId);
      }
    };
    void client.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

export function useFavorites(): FavoritesState {
  return useSyncExternalStore(
    (listener) => favoritesStore().subscribe(listener),
    () => favoritesStore().getState(),
    () => SIGNED_OUT,
  );
}

/** Saves or unsaves; throws `SignedOutError` without a user, or the server's refusal. */
export function toggleFavorite(listingId: string): Promise<boolean> {
  return favoritesStore().toggle(listingId);
}
