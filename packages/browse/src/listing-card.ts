import {
  BUCKETS,
  listingPhotoPath,
  publicObjectUrl,
  type SearchListingRow,
  type Tables,
  type TypedSupabaseClient,
} from '@bairmair/db';

/** What a listing card shows: a search result, or a listing picked on the map. */
export type ListingCardData = Pick<
  SearchListingRow,
  | 'id'
  | 'type'
  | 'title'
  | 'price'
  | 'currency'
  | 'rooms'
  | 'area_official_m2'
  | 'area_scanned_m2'
  | 'district_id'
  | 'complex_name'
  | 'has_3d'
  | 'scan_verified'
  | 'cover_photo_id'
>;

/** The cover photo's public URL, or null. */
export function coverUrl(supabaseUrl: string, card: ListingCardData): string | null {
  return card.cover_photo_id
    ? publicObjectUrl(
        supabaseUrl,
        BUCKETS.listingPhotos,
        listingPhotoPath(card.id, card.cover_photo_id),
      )
    : null;
}

/** The `listings` columns (with photos) that make a card; see `cardFromRow`. */
export const CARD_COLUMNS =
  'id, type, title, price, currency, rooms, area_official_m2, area_scanned_m2, district_id, ' +
  'complex_name, has_3d, scan_verified, listing_photos(id, sort_order, created_at)';

export type CardListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'type'
  | 'title'
  | 'price'
  | 'currency'
  | 'rooms'
  | 'area_official_m2'
  | 'area_scanned_m2'
  | 'district_id'
  | 'complex_name'
  | 'has_3d'
  | 'scan_verified'
> & {
  listing_photos: Pick<Tables<'listing_photos'>, 'id' | 'sort_order' | 'created_at'>[];
};

/** A card from a `listings` row with its photos; null if the row lacks what a live listing has. */
export function cardFromRow(row: CardListingRow): ListingCardData | null {
  if (row.price === null || row.rooms === null || row.district_id === null) return null;
  const [cover] = [...row.listing_photos].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    price: row.price,
    currency: row.currency,
    rooms: row.rooms,
    area_official_m2: row.area_official_m2,
    area_scanned_m2: row.area_scanned_m2,
    district_id: row.district_id,
    complex_name: row.complex_name,
    has_3d: row.has_3d,
    scan_verified: row.scan_verified,
    cover_photo_id: cover?.id ?? null,
  };
}

/**
 * Cards for listings picked on the map, in the order of `ids`. Read as `anon`: RLS returns live
 * listings only.
 */
export async function fetchListingCards(
  client: TypedSupabaseClient,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<ListingCardData[]> {
  if (ids.length === 0) return [];
  let query = client
    .from('listings')
    .select(CARD_COLUMNS)
    .in('id', [...ids])
    .eq('status', 'published');
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.overrideTypes<CardListingRow[], { merge: false }>();
  if (error) throw new Error(error.message);
  const byId = new Map(data.map((row) => [row.id, cardFromRow(row)]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}
