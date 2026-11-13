import type { Enums, TypedSupabaseClient } from '@bairmair/db';
import type { FavoritesRemote } from './favorites-store';
import {
  CARD_COLUMNS,
  cardFromRow,
  type CardListingRow,
  type ListingCardData,
} from './listing-card';

/** A duplicate key: the listing is already saved (or reported). */
export const UNIQUE_VIOLATION = '23505';

/** Favorites in Supabase for the signed-in user of `client` (the app's and the website's). */
export function supabaseFavoritesRemote(client: TypedSupabaseClient): FavoritesRemote {
  return {
    async list(userId) {
      const { data, error } = await client
        .from('favorites')
        .select('listing_id')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data.map((row) => row.listing_id);
    },
    async add(listingId) {
      const { error } = await client.from('favorites').insert({ listing_id: listingId });
      if (error && error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
    },
    async remove(listingId) {
      // RLS limits the delete to the caller's own row.
      const { error } = await client.from('favorites').delete().eq('listing_id', listingId);
      if (error) throw new Error(error.message);
    },
  };
}

export interface FavoriteCard {
  listingId: string;
  /** Null when the listing is no longer visible (hidden, deleted) or incomplete. */
  card: ListingCardData | null;
  status: Enums<'listing_status'> | null;
}

/** The signed-in user's saved listings as cards, newest saved first. */
export async function fetchFavoriteCards(client: TypedSupabaseClient): Promise<FavoriteCard[]> {
  const { data, error } = await client
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
