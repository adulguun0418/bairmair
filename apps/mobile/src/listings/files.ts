import { Directory, File, Paths } from 'expo-file-system';
import { normalizeListing, type LocalListing } from './model';
import type { ListingPersistence } from './store';
import type { ListingFiles } from './sync-engine';

/**
 * Listings on the phone, one folder each: `Documents/listings/<id>/` with `listing.json` and
 * the resized photos (`<photoId>.jpg`). Documents survives restarts and is never cleared by iOS.
 */

const LISTING_JSON = 'listing.json';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const root = () => new Directory(Paths.document, 'listings');

export function listingDir(id: string): Directory {
  if (!UUID_RE.test(id)) throw new Error(`Invalid listing id: ${id}`);
  return new Directory(root(), id);
}

export const filePersistence: ListingPersistence = {
  loadAll() {
    const dir = root();
    if (!dir.exists) return [];
    const listings: LocalListing[] = [];
    for (const entry of dir.list()) {
      if (!(entry instanceof Directory) || !UUID_RE.test(entry.name)) continue;
      const file = new File(entry, LISTING_JSON);
      if (!file.exists) continue;
      try {
        const listing = JSON.parse(file.textSync()) as LocalListing;
        if (listing.version === 1 && listing.id === entry.name) {
          listings.push(normalizeListing(listing));
        }
      } catch (error) {
        console.warn(`Skipping unreadable listing ${entry.name}`, error);
      }
    }
    return listings;
  },

  async save(listing) {
    const dir = listingDir(listing.id);
    dir.create({ intermediates: true, idempotent: true });
    // Write a temporary file and move it into place, so a crash never leaves half a file.
    const temp = new File(dir, `${LISTING_JSON}.tmp`);
    temp.create({ overwrite: true });
    await temp.write(JSON.stringify(listing));
    await temp.move(new File(dir, LISTING_JSON), { overwrite: true });
  },

  async remove(id) {
    const file = new File(listingDir(id), LISTING_JSON);
    if (file.exists) file.delete();
  },
};

export const listingFiles: ListingFiles = {
  uri(listingId, file) {
    return new File(listingDir(listingId), file).uri;
  },
  exists(listingId, file) {
    return new File(listingDir(listingId), file).exists;
  },
  removeFolder(listingId) {
    const dir = listingDir(listingId);
    if (dir.exists) dir.delete();
  },
};

export function deletePhotoFile(listingId: string, file: string | null): void {
  deleteListingFile(listingId, file);
}

export function deleteListingFile(listingId: string, file: string | null): void {
  if (!file) return;
  const target = new File(listingDir(listingId), file);
  if (target.exists) target.delete();
}

/** File names of a scan's raw files in its listing folder. */
export function scanFileNames(scanId: string): { json: string; usdz: string } {
  if (!UUID_RE.test(scanId)) throw new Error(`Invalid scan id: ${scanId}`);
  return { json: `scan-${scanId}.json`, usdz: `scan-${scanId}.usdz` };
}

/**
 * Moves a scan's raw files (saved by the scanner) into the listing folder, so they live and
 * die with the listing. Returns their names there.
 */
export async function moveScanFiles(
  listingId: string,
  scanId: string,
  source: { json: File; usdz: File },
): Promise<{ json: string; usdz: string }> {
  const dir = listingDir(listingId);
  dir.create({ intermediates: true, idempotent: true });
  const names = scanFileNames(scanId);
  await source.json.move(new File(dir, names.json), { overwrite: true });
  await source.usdz.move(new File(dir, names.usdz), { overwrite: true });
  return names;
}

/** The text of a file in the listing folder, or null if it is not there. */
export function readListingText(listingId: string, file: string): string | null {
  const target = new File(listingDir(listingId), file);
  return target.exists ? target.textSync() : null;
}
