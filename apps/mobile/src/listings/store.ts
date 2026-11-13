import type { LocalListing } from './model';

/** Where listings are kept between launches (files on the phone, memory in tests). */
export interface ListingPersistence {
  loadAll(): LocalListing[];
  save(listing: LocalListing): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * All listings on the phone. Memory is the source of truth while the app runs; every change is
 * written through to persistence. Writes for one listing are chained, so the file always ends
 * up with the latest version even if two writes overlap.
 */
export class ListingStore {
  private readonly listings = new Map<string, LocalListing>();
  private readonly listeners = new Set<() => void>();
  private readonly writes = new Map<string, Promise<void>>();
  private snapshot: readonly LocalListing[] = [];

  constructor(private readonly persistence: ListingPersistence) {}

  load(): void {
    this.listings.clear();
    for (const listing of this.persistence.loadAll()) this.listings.set(listing.id, listing);
    this.emit();
  }

  get(id: string): LocalListing | undefined {
    return this.listings.get(id);
  }

  /** Every listing on the phone, including ones waiting to be deleted on the server. */
  all(): LocalListing[] {
    return [...this.listings.values()];
  }

  /** Listings to show, newest edit first. Stable between changes (for useSyncExternalStore). */
  visible(): readonly LocalListing[] {
    return this.snapshot;
  }

  put(listing: LocalListing): void {
    this.listings.set(listing.id, listing);
    this.persist(listing.id, () => this.persistence.save(listing));
    this.emit();
  }

  /** Applies `change` to the current version of a listing. Returns the result. */
  update(id: string, change: (listing: LocalListing) => LocalListing): LocalListing | undefined {
    const current = this.listings.get(id);
    if (!current) return undefined;
    const next = change(current);
    if (next !== current) this.put(next);
    return next;
  }

  remove(id: string): void {
    if (!this.listings.delete(id)) return;
    this.persist(id, () => this.persistence.remove(id));
    this.emit();
  }

  /** Resolves once every pending write has finished (tests, and before deleting files). */
  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(id: string, write: () => Promise<void>): void {
    const previous = this.writes.get(id) ?? Promise.resolve();
    const next = previous
      .then(write)
      .catch((error: unknown) => console.warn(`Could not save listing ${id}`, error));
    this.writes.set(id, next);
    void next.then(() => {
      if (this.writes.get(id) === next) this.writes.delete(id);
    });
  }

  private emit(): void {
    this.snapshot = [...this.listings.values()]
      .filter((listing) => !listing.deleted)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const listener of this.listeners) listener();
  }
}
