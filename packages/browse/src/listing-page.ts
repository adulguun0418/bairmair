import {
  BUCKETS,
  DISTRICT_STATS_MIN_LISTINGS,
  daysSince,
  isListingFresh,
  listingPhotoPath,
  publicObjectUrl,
  scanModelPaths,
  type Tables,
  type TypedSupabaseClient,
} from '@bairmair/db';
import {
  applyAnnotations,
  parseRoomLabelOverrides,
  safeParseRoomModel,
  type RoomModelV1,
} from '@bairmair/room-model';

/** The columns of a live listing that its public page shows. */
export const LISTING_COLUMNS =
  'id, owner_id, type, status, title, description, price, currency, negotiable, ' +
  'area_official_m2, area_scanned_m2, rooms, floor, total_floors, building_year, ' +
  'building_material, new_building, heating, balconies, parking, furnishing, ' +
  'mortgage_eligible, deposit, min_term_months, utilities_included, city_id, district_id, ' +
  'khoroo, complex_name, address_text, show_exact_location, public_lat, public_lng, has_3d, ' +
  'scan_verified, last_confirmed_at, published_at';

export type ListingRow = Pick<
  Tables<'listings'>,
  | 'id'
  | 'owner_id'
  | 'type'
  | 'status'
  | 'title'
  | 'description'
  | 'price'
  | 'currency'
  | 'negotiable'
  | 'area_official_m2'
  | 'area_scanned_m2'
  | 'rooms'
  | 'floor'
  | 'total_floors'
  | 'building_year'
  | 'building_material'
  | 'new_building'
  | 'heating'
  | 'balconies'
  | 'parking'
  | 'furnishing'
  | 'mortgage_eligible'
  | 'deposit'
  | 'min_term_months'
  | 'utilities_included'
  | 'city_id'
  | 'district_id'
  | 'khoroo'
  | 'complex_name'
  | 'address_text'
  | 'show_exact_location'
  | 'public_lat'
  | 'public_lng'
  | 'has_3d'
  | 'scan_verified'
  | 'last_confirmed_at'
  | 'published_at'
>;

export type PhotoRow = Pick<
  Tables<'listing_photos'>,
  'id' | 'width' | 'height' | 'sort_order' | 'scan_id' | 'room_id'
>;

export type ScanRow = Pick<Tables<'room_scans'>, 'id' | 'room_labels'>;

export interface SellerRow {
  display_name: string | null;
  role: Tables<'profiles'>['role'];
  agent_profiles: Pick<Tables<'agent_profiles'>, 'agency_name' | 'verified'> | null;
}

export type StatsRow = Pick<
  Tables<'district_price_stats'>,
  'listing_count' | 'median_price_per_m2'
>;

export interface ListingPhoto {
  id: string;
  src: string;
  width: number | null;
  height: number | null;
  /** The room of the current scan the seller put this photo in. */
  roomId: string | null;
}

export interface ListingSeller {
  displayName: string | null;
  isAgent: boolean;
  agencyName: string | null;
  verifiedAgent: boolean;
}

export interface ListingPageData {
  listing: ListingRow;
  photos: ListingPhoto[];
  seller: ListingSeller;
  /** The current scan with the seller's room labels and photo rooms applied. */
  model: RoomModelV1 | null;
  /** From the official area (the certificate), never the scanned one. */
  pricePerM2: number | null;
  districtMedian: { pricePerM2: number; listingCount: number } | null;
  /** Whether the listing is in search, and days since the seller last confirmed it. */
  freshness: { fresh: boolean; daysAgo: number | null };
}

export interface ListingPageInput {
  listing: ListingRow;
  photos: readonly PhotoRow[];
  seller: SellerRow | null;
  scan: ScanRow | null;
  /** The scan's `model.json`, as fetched; null when it could not be loaded. */
  modelJson: unknown;
  stats: StatsRow | null;
  supabaseUrl: string;
  now: Date;
}

/** Turns the rows behind a listing page into what the page shows. Pure. */
export function buildListingPage(input: ListingPageInput): ListingPageData {
  const { listing, scan, supabaseUrl, now } = input;

  const photos = input.photos.map((photo): ListingPhoto => ({
    id: photo.id,
    src: publicObjectUrl(
      supabaseUrl,
      BUCKETS.listingPhotos,
      listingPhotoPath(listing.id, photo.id),
    ),
    width: photo.width,
    height: photo.height,
    // A room id only means something within its own scan.
    roomId: scan && photo.scan_id === scan.id ? photo.room_id : null,
  }));

  let model: RoomModelV1 | null = null;
  if (scan && input.modelJson !== null && input.modelJson !== undefined) {
    const parsed = safeParseRoomModel(input.modelJson);
    if (parsed.success) {
      model = applyAnnotations(parsed.data, {
        roomLabels: parseRoomLabelOverrides(scan.room_labels),
        photos: photos.map(({ id, roomId }) => ({ id, roomId })),
      });
    }
  }
  // A photo whose room is not in the model (an older scan's room) belongs to no room.
  const roomIds = new Set(model?.rooms.map((room) => room.id));
  for (const photo of photos) {
    if (photo.roomId !== null && !roomIds.has(photo.roomId)) photo.roomId = null;
  }

  const pricePerM2 =
    listing.price !== null && listing.price > 0 && listing.area_official_m2
      ? listing.price / listing.area_official_m2
      : null;

  const stats = input.stats;
  const districtMedian =
    stats?.median_price_per_m2 != null &&
    stats.listing_count != null &&
    stats.listing_count >= DISTRICT_STATS_MIN_LISTINGS
      ? { pricePerM2: stats.median_price_per_m2, listingCount: stats.listing_count }
      : null;

  const agent = input.seller?.agent_profiles ?? null;
  return {
    listing,
    photos,
    seller: {
      displayName: input.seller?.display_name ?? null,
      isAgent: input.seller?.role === 'agent' && agent !== null,
      agencyName: agent?.agency_name ?? null,
      verifiedAgent: agent?.verified ?? false,
    },
    model,
    pricePerM2,
    districtMedian,
    freshness: {
      fresh: listing.status === 'published' && isListingFresh(listing.last_confirmed_at, now),
      daysAgo: listing.last_confirmed_at ? daysSince(listing.last_confirmed_at, now) : null,
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether a URL segment is a (lowercase) UUID, before it reaches a uuid column. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Everything a public listing page shows, or null when the listing does not exist or the caller
 * may not see it (RLS decides). Web reads as `anon` and caches the result; the app reads with
 * its own session.
 */
export async function loadListingPage(
  client: TypedSupabaseClient,
  supabaseUrl: string,
  id: string,
  now: Date = new Date(),
): Promise<ListingPageData | null> {
  if (!isUuid(id)) return null;

  const [listing, photos, scans] = await Promise.all([
    client.from('listings').select(LISTING_COLUMNS).eq('id', id).maybeSingle<ListingRow>(),
    client
      .from('listing_photos')
      .select('id, width, height, sort_order, scan_id, room_id')
      .eq('listing_id', id)
      .order('sort_order')
      .order('created_at'),
    // RLS shows only the current ready scan of a live listing.
    client
      .from('room_scans')
      .select('id, room_labels')
      .eq('listing_id', id)
      .eq('is_current', true)
      .eq('status', 'ready')
      .limit(1),
  ]);
  for (const result of [listing, photos, scans]) {
    if (result.error) throw new Error(`listing ${id}: ${result.error.message}`);
  }
  const row = listing.data;
  if (!row) return null;
  const scan = scans.data?.[0] ?? null;

  const [seller, stats, modelJson] = await Promise.all([
    client
      .from('profiles')
      .select('display_name, role, agent_profiles(agency_name, verified)')
      .eq('id', row.owner_id)
      .maybeSingle(),
    row.district_id === null
      ? null
      : client
          .from('district_price_stats')
          .select('listing_count, median_price_per_m2')
          .eq('type', row.type)
          .eq('district_id', row.district_id)
          .eq('currency', row.currency)
          .maybeSingle(),
    scan ? fetchScanModel(supabaseUrl, row.id, scan.id) : null,
  ]);
  if (seller.error) throw new Error(`seller of ${id}: ${seller.error.message}`);
  // The median is a nice-to-have; the page works without it.
  if (stats?.error) console.warn(`price stats for ${id}: ${stats.error.message}`);

  return buildListingPage({
    listing: row,
    photos: photos.data ?? [],
    seller: seller.data,
    scan,
    modelJson,
    stats: stats?.data ?? null,
    supabaseUrl,
    now,
  });
}

/** A scan's public `model.json` (written by the scan processing route), or null. */
async function fetchScanModel(
  supabaseUrl: string,
  listingId: string,
  scanId: string,
): Promise<unknown> {
  const url = publicObjectUrl(
    supabaseUrl,
    BUCKETS.scanModels,
    scanModelPaths(listingId, scanId).model,
  );
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } catch (error) {
    // Without the model the page still shows photos and details.
    console.warn(`model of scan ${scanId}:`, error);
    return null;
  }
}
