import { describe, expect, it } from 'vitest';
import { comparePrice } from '../src/lib/price-compare';

describe('comparePrice', () => {
  it('finds a cheaper listing and scales the bars to the larger price', () => {
    expect(comparePrice(3_600_000, 4_000_000)).toEqual({
      listingShare: 0.9,
      medianShare: 1,
      percent: 10,
      direction: 'below',
    });
  });

  it('finds a dearer listing', () => {
    const result = comparePrice(5_000_000, 4_000_000);
    expect(result).toMatchObject({ percent: 25, direction: 'above', listingShare: 1 });
    expect(result.medianShare).toBeCloseTo(0.8);
  });

  it('calls prices within 3% of the median close to it', () => {
    expect(comparePrice(4_100_000, 4_000_000).direction).toBe('same');
    expect(comparePrice(3_890_000, 4_000_000).direction).toBe('same');
    expect(comparePrice(3_870_000, 4_000_000).direction).toBe('below');
  });
});
