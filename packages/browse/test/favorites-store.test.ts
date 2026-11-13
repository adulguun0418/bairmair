import { describe, expect, it } from 'vitest';
import { createFavoritesStore, SignedOutError, type FavoritesRemote } from '../src/favorites-store';

/** A remote whose calls wait until the test settles them. */
function controlledRemote(saved: string[] = []) {
  const pending: { op: string; id: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  const remote: FavoritesRemote = {
    list: () => Promise.resolve([...saved]),
    add: (id) => new Promise((resolve, reject) => pending.push({ op: 'add', id, resolve, reject })),
    remove: (id) =>
      new Promise((resolve, reject) => pending.push({ op: 'remove', id, resolve, reject })),
  };
  return { remote, pending };
}

describe('favorites store', () => {
  it('loads the saved ids of the signed-in user and clears them on sign-out', async () => {
    const { remote } = controlledRemote(['a', 'b']);
    const store = createFavoritesStore(remote);
    expect(store.getState().status).toBe('signed-out');

    await store.setUser('user-1');
    expect(store.getState()).toMatchObject({ userId: 'user-1', status: 'ready' });
    expect([...store.getState().ids]).toEqual(['a', 'b']);

    await store.setUser(null);
    expect(store.getState()).toMatchObject({ userId: null, status: 'signed-out' });
    expect(store.getState().ids.size).toBe(0);
  });

  it('refuses toggles while signed out', async () => {
    const store = createFavoritesStore(controlledRemote().remote);
    await expect(store.toggle('a')).rejects.toBeInstanceOf(SignedOutError);
  });

  it('shows a toggle at once and keeps it when the server accepts', async () => {
    const { remote, pending } = controlledRemote();
    const store = createFavoritesStore(remote);
    await store.setUser('user-1');

    const adding = store.toggle('a');
    expect(store.getState().ids.has('a')).toBe(true);
    pending[0]?.resolve();
    await expect(adding).resolves.toBe(true);
    expect(store.getState().ids.has('a')).toBe(true);
  });

  it('undoes a refused toggle', async () => {
    const { remote, pending } = controlledRemote(['a']);
    const store = createFavoritesStore(remote);
    await store.setUser('user-1');

    const removing = store.toggle('a');
    expect(store.getState().ids.has('a')).toBe(false);
    pending[0]?.reject(new Error('offline'));
    await expect(removing).rejects.toThrow('offline');
    expect(store.getState().ids.has('a')).toBe(true);
  });

  it('lets only the latest toggle of a listing undo itself', async () => {
    const { remote, pending } = controlledRemote();
    const store = createFavoritesStore(remote);
    await store.setUser('user-1');

    const add = store.toggle('a');
    const remove = store.toggle('a');
    expect(pending.map((call) => call.op)).toEqual(['add', 'remove']);
    // The first call fails after the second toggle: the second decides the state.
    pending[0]?.reject(new Error('timeout'));
    await expect(add).rejects.toThrow('timeout');
    expect(store.getState().ids.has('a')).toBe(false);
    pending[1]?.resolve();
    await expect(remove).resolves.toBe(false);
    expect(store.getState().ids.has('a')).toBe(false);
  });

  it('notifies subscribers and ignores a list that arrives after a sign-out', async () => {
    let resolveList: (ids: string[]) => void = () => undefined;
    const remote: FavoritesRemote = {
      list: () => new Promise((resolve) => (resolveList = resolve)),
      add: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const store = createFavoritesStore(remote);
    let notified = 0;
    store.subscribe(() => notified++);

    const loading = store.setUser('user-1');
    expect(store.getState().status).toBe('loading');
    await store.setUser(null);
    resolveList(['a']);
    await loading;
    expect(store.getState()).toMatchObject({ userId: null, status: 'signed-out' });
    expect(store.getState().ids.size).toBe(0);
    expect(notified).toBeGreaterThan(0);
  });
});
