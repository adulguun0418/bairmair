import { Directory, File, Paths } from 'expo-file-system';
import type { LocalListing } from './model';
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
        if (listing.version === 1 && listing.id === entry.name) listings.push(listing);
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
  if (!file) return;
  const photo = new File(listingDir(listingId), file);
  if (photo.exists) photo.delete();
}
