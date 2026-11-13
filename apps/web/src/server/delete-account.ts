import { BUCKETS, type BucketName, type DeleteAccountResponse } from '@bairmair/db';

/**
 * Deletes a user's account for good: first their Storage files, then the Auth user. Deleting the
 * Auth user cascades in the database: profile → agent profile, favorites, reports they filed,
 * listings → private location, photos, scans, views, reports and reveals of those listings.
 * Phone reveals they made on other listings stay (rate-limit counts), with the viewer cleared.
 *
 * Storage objects have no foreign keys, so they are removed here, before the user: once the
 * user is gone, nothing records which listing folders were theirs. Every step can be repeated,
 * so a request that failed half way is finished by the next one.
 *
 * Storage and Auth are injected so this is unit-tested without a network
 * (test/delete-account.test.ts); `supabaseAccountStore` in `supabase.ts` is the real one.
 */

export interface AccountStore {
  /** Ids of every listing the user owns, whatever its status. */
  ownedListingIds(userId: string): Promise<string[]>;
  /** Paths of all objects under `prefix/` in `bucket`, including nested folders. */
  listFiles(bucket: BucketName, prefix: string): Promise<string[]>;
  /** Removes these objects; missing ones are not an error. */
  removeFiles(bucket: BucketName, paths: string[]): Promise<void>;
  /** Deletes the Auth user (the database cascades from there). */
  deleteUser(userId: string): Promise<void>;
}

/** Storage removes at most this many objects per request. */
export const REMOVE_BATCH = 1000;

/** Buckets whose first path segment is a listing id. */
const LISTING_BUCKETS = [BUCKETS.listingPhotos, BUCKETS.scanRaw, BUCKETS.scanModels] as const;

export async function deleteAccount(
  store: AccountStore,
  userId: string,
): Promise<DeleteAccountResponse> {
  const listingIds = await store.ownedListingIds(userId);

  const folders: { bucket: BucketName; prefix: string }[] = [
    ...LISTING_BUCKETS.flatMap((bucket) => listingIds.map((prefix) => ({ bucket, prefix }))),
    { bucket: BUCKETS.avatars, prefix: userId },
  ];

  let removedFiles = 0;
  for (const { bucket, prefix } of folders) {
    const paths = await store.listFiles(bucket, prefix);
    for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
      await store.removeFiles(bucket, paths.slice(start, start + REMOVE_BATCH));
    }
    removedFiles += paths.length;
  }

  await store.deleteUser(userId);
  return { deleted: true, removedFiles };
}
