/**
 * The cover photo a card showed when it was tapped, so the listing screen can show the same
 * (already downloaded) photo at once while the rest of the listing loads. In memory, per app run.
 */
const covers = new Map<string, string>();

/** At most this many are kept; older entries go first. */
const MAX = 50;

export function rememberCover(listingId: string, uri: string | null): void {
  if (!uri) return;
  covers.delete(listingId);
  covers.set(listingId, uri);
  if (covers.size > MAX) {
    const oldest = covers.keys().next().value;
    if (oldest !== undefined) covers.delete(oldest);
  }
}

export function rememberedCover(listingId: string): string | null {
  return covers.get(listingId) ?? null;
}
