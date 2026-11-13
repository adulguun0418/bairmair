/** What the favorites store needs from the server (Supabase in the app, a fake in tests). */
export interface FavoritesRemote {
  /** The user's saved listing ids. */
  list(userId: string): Promise<string[]>;
  /** Saves a listing; saving it again succeeds. */
  add(listingId: string): Promise<void>;
  /** Removes a listing; removing one that is not saved succeeds. */
  remove(listingId: string): Promise<void>;
}

export interface FavoritesState {
  userId: string | null;
  ids: ReadonlySet<string>;
  /** `signed-out` without a user; `error` when the list could not be loaded (toggles still work). */
  status: 'signed-out' | 'loading' | 'ready' | 'error';
}

export class SignedOutError extends Error {
  constructor() {
    super('signed_out');
  }
}

/**
 * Saved listings of the signed-in user. Toggles show at once and are undone if the server
 * refuses them. Kept outside React so every screen (cards, the listing page, the Saved tab)
 * shows the same hearts.
 */
export function createFavoritesStore(remote: FavoritesRemote) {
  let state: FavoritesState = { userId: null, ids: new Set(), status: 'signed-out' };
  const listeners = new Set<() => void>();
  /** Bumped per toggle of a listing, so only the latest toggle may undo itself. */
  const versions = new Map<string, number>();

  const set = (next: FavoritesState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const withId = (ids: ReadonlySet<string>, id: string, saved: boolean) => {
    const next = new Set(ids);
    if (saved) next.add(id);
    else next.delete(id);
    return next;
  };

  return {
    getState: () => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Loads the user's saved listings (null: signed out). Reloads when called again. */
    async setUser(userId: string | null): Promise<void> {
      if (!userId) {
        versions.clear();
        set({ userId: null, ids: new Set(), status: 'signed-out' });
        return;
      }
      const sameUser = state.userId === userId;
      set({ userId, ids: sameUser ? state.ids : new Set(), status: 'loading' });
      try {
        const ids = await remote.list(userId);
        if (state.userId !== userId) return;
        set({ userId, ids: new Set(ids), status: 'ready' });
      } catch {
        if (state.userId !== userId) return;
        set({ ...state, status: 'error' });
      }
    },

    /** Saves or unsaves a listing; resolves to the new saved state, throws if refused. */
    async toggle(listingId: string): Promise<boolean> {
      const { userId } = state;
      if (!userId) throw new SignedOutError();
      const saved = !state.ids.has(listingId);
      const version = (versions.get(listingId) ?? 0) + 1;
      versions.set(listingId, version);
      set({ ...state, ids: withId(state.ids, listingId, saved) });
      try {
        await (saved ? remote.add(listingId) : remote.remove(listingId));
        return saved;
      } catch (error) {
        // Undo, unless the user switched accounts or toggled again since.
        if (state.userId === userId && versions.get(listingId) === version) {
          set({ ...state, ids: withId(state.ids, listingId, !saved) });
        }
        throw error;
      }
    },
  };
}

export type FavoritesStore = ReturnType<typeof createFavoritesStore>;
