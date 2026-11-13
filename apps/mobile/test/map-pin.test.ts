import { describe, expect, it } from 'vitest';
import { mapPin } from '../src/listings/model';

const now = '2026-11-14T10:00:00.000Z';

describe('mapPin', () => {
  it('rounds to six decimals and carries no accuracy', () => {
    expect(mapPin(47.918612345, 106.917698765, now)).toEqual({
      lat: 47.918612,
      lng: 106.917699,
      accuracyM: null,
      capturedAt: now,
    });
  });

  it('refuses points outside Mongolia', () => {
    expect(mapPin(39.9042, 116.4074, now)).toBeNull(); // Beijing
    expect(mapPin(52.2869, 104.305, now)).toBeNull(); // Irkutsk
  });
});
