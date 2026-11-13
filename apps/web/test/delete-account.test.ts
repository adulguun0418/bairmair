import { BUCKETS, type BucketName } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import { deleteAccount, REMOVE_BATCH, type AccountStore } from '@/server/delete-account';

const USER = '6f1b0c2e-0000-4000-8000-000000000001';
const LISTING_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const LISTING_B = 'bbbbbbbb-0000-4000-8000-000000000002';

/** Storage as `bucket → paths`, plus a record of every call in order. */
function fakeStore(files: Partial<Record<BucketName, string[]>>, listings: string[]) {
  const buckets = new Map<BucketName, Set<string>>(
    Object.entries(files).map(([bucket, paths]) => [bucket as BucketName, new Set(paths)]),
  );
  const calls: string[] = [];
  let userDeleted = false;
  const store: AccountStore = {
    async ownedListingIds(userId) {
      calls.push(`listings ${userId}`);
      return userDeleted ? [] : listings;
    },
    async listFiles(bucket, prefix) {
      return [...(buckets.get(bucket) ?? [])].filter((path) => path.startsWith(`${prefix}/`));
    },
    async removeFiles(bucket, paths) {
      calls.push(`remove ${bucket} ${paths.length}`);
      for (const path of paths) buckets.get(bucket)?.delete(path);
    },
    async deleteUser(userId) {
      calls.push(`delete ${userId}`);
      userDeleted = true;
    },
  };
  const remaining = () => [...buckets.values()].reduce((sum, set) => sum + set.size, 0);
  return { store, calls, remaining };
}

describe('deleteAccount', () => {
  it('removes every file of the user’s listings and avatar, then the user', async () => {
    const { store, calls, remaining } = fakeStore(
      {
        [BUCKETS.listingPhotos]: [
          `${LISTING_A}/p1.jpg`,
          `${LISTING_A}/p2.jpg`,
          `${LISTING_B}/p3.jpg`,
        ],
        [BUCKETS.scanRaw]: [`${LISTING_A}/s1/capture.json`, `${LISTING_A}/s1/capture.usdz`],
        [BUCKETS.scanModels]: [`${LISTING_A}/s1/model.json`],
        [BUCKETS.avatars]: [`${USER}/avatar.jpg`],
      },
      [LISTING_A, LISTING_B],
    );

    const result = await deleteAccount(store, USER);

    expect(result).toEqual({ deleted: true, removedFiles: 7 });
    expect(remaining()).toBe(0);
    // The user goes last: until then, the listings say which folders are theirs.
    expect(calls.at(-1)).toBe(`delete ${USER}`);
  });

  it('leaves other users’ files alone', async () => {
    const other = 'cccccccc-0000-4000-8000-000000000003';
    const { store, remaining } = fakeStore(
      {
        [BUCKETS.listingPhotos]: [`${LISTING_A}/p1.jpg`, `${other}/p9.jpg`],
        [BUCKETS.avatars]: [`${other}/avatar.jpg`],
      },
      [LISTING_A],
    );
    await deleteAccount(store, USER);
    expect(remaining()).toBe(2);
  });

  it('deletes a user with no listings or files', async () => {
    const { store, calls } = fakeStore({}, []);
    expect(await deleteAccount(store, USER)).toEqual({ deleted: true, removedFiles: 0 });
    expect(calls).toEqual([`listings ${USER}`, `delete ${USER}`]);
  });

  it('removes files in batches Storage accepts', async () => {
    const photos = Array.from({ length: REMOVE_BATCH + 5 }, (_, i) => `${LISTING_A}/p${i}.jpg`);
    const { store, calls } = fakeStore({ [BUCKETS.listingPhotos]: photos }, [LISTING_A]);
    await deleteAccount(store, USER);
    expect(calls.filter((call) => call.startsWith('remove'))).toEqual([
      `remove ${BUCKETS.listingPhotos} ${REMOVE_BATCH}`,
      `remove ${BUCKETS.listingPhotos} 5`,
    ]);
  });

  it('keeps the user when removing files fails, so a retry can finish', async () => {
    const { store, calls } = fakeStore({ [BUCKETS.listingPhotos]: [`${LISTING_A}/p1.jpg`] }, [
      LISTING_A,
    ]);
    store.removeFiles = () => Promise.reject(new Error('storage down'));
    await expect(deleteAccount(store, USER)).rejects.toThrow('storage down');
    expect(calls).not.toContain(`delete ${USER}`);
  });
});
