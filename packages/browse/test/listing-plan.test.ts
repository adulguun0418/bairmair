import { describe, expect, it } from 'vitest';
import { canPublishAnother, fetchListingPlan, type ListingPlan } from '../src/listing-plan';

const free: ListingPlan = { enforced: true, limit: 1, live: 0, paused: 0, packageUntil: null };

describe('listing plan', () => {
  it('allows another publish only under the limit, or when the limit is off', () => {
    expect(canPublishAnother(free)).toBe(true);
    expect(canPublishAnother({ ...free, live: 1 })).toBe(false);
    expect(canPublishAnother({ ...free, live: 1, enforced: false })).toBe(true);
    expect(
      canPublishAnother({ ...free, limit: 20, live: 19, packageUntil: '2026-12-21T00:00:00Z' }),
    ).toBe(true);
    expect(canPublishAnother({ ...free, limit: 20, live: 20 })).toBe(false);
  });

  it('reads the RPC row', async () => {
    const client = {
      rpc: async () => ({
        data: [
          {
            enforced: true,
            listing_limit: 20,
            live_listings: 3,
            paused_listings: 1,
            package_until: '2026-12-21T00:00:00+00:00',
          },
        ],
        error: null,
      }),
    } as unknown as Parameters<typeof fetchListingPlan>[0];
    expect(await fetchListingPlan(client)).toEqual({
      enforced: true,
      limit: 20,
      live: 3,
      paused: 1,
      packageUntil: '2026-12-21T00:00:00+00:00',
    });
  });

  it('fails without a row', async () => {
    const client = {
      rpc: async () => ({ data: [], error: null }),
    } as unknown as Parameters<typeof fetchListingPlan>[0];
    await expect(fetchListingPlan(client)).rejects.toThrow('no row');
  });
});
