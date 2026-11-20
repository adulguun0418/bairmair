import { describe, expect, it } from 'vitest';
import { fetchScanPlan, formatProUntil, localDay, scanFits, type ScanPlan } from '../src/scan-plan';

const free: ScanPlan = { limit: 2, kept: 1, proUntil: null };

describe('scan plan', () => {
  it('counts scans not yet on the server toward the limit', () => {
    expect(scanFits(free)).toBe(true);
    expect(scanFits(free, 1)).toBe(false);
    expect(scanFits({ ...free, kept: 2 })).toBe(false);
    expect(scanFits({ limit: 100, kept: 2, proUntil: '2026-12-20T00:00:00Z' }, 1)).toBe(true);
  });

  it('shows the day Pro ends in local time', () => {
    const iso = new Date(2026, 11, 20, 23, 30).toISOString();
    expect(localDay(iso)).toBe('2026-12-20');
    expect(formatProUntil(iso, 'mn')).toBe('2026 оны 12 сарын 20');
    expect(formatProUntil(iso, 'en')).toBe('20 December 2026');
    expect(localDay('not a date')).toBe('not a date');
  });

  it('reads the RPC row', async () => {
    const client = {
      rpc: async () => ({
        data: [{ scan_limit: 100, scans_kept: 3, pro_until: '2026-12-20T00:00:00+00:00' }],
        error: null,
      }),
    } as unknown as Parameters<typeof fetchScanPlan>[0];
    expect(await fetchScanPlan(client)).toEqual({
      limit: 100,
      kept: 3,
      proUntil: '2026-12-20T00:00:00+00:00',
    });
  });
});
