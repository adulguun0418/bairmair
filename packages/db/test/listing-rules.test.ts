import { describe, expect, it } from 'vitest';
import { daysLeftInSearch, daysSince, isListingFresh } from '../src/listing-rules';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-16T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

describe('freshness', () => {
  it('keeps a listing in search for 14 days after a confirmation', () => {
    expect(isListingFresh(ago(0), now)).toBe(true);
    expect(isListingFresh(ago(14), now)).toBe(true);
    expect(isListingFresh(ago(14.01), now)).toBe(false);
    expect(isListingFresh(null, now)).toBe(false);
    expect(isListingFresh('not a date', now)).toBe(false);
  });

  it('counts the whole days left in search', () => {
    expect(daysLeftInSearch(ago(0), now)).toBe(14);
    expect(daysLeftInSearch(ago(0.5), now)).toBe(13);
    expect(daysLeftInSearch(ago(13.5), now)).toBe(0);
    expect(daysLeftInSearch(ago(14), now)).toBe(0);
    expect(daysLeftInSearch(ago(15), now)).toBeNull();
    expect(daysLeftInSearch(null, now)).toBeNull();
  });

  it('counts whole days since a date', () => {
    expect(daysSince(ago(0.9), now)).toBe(0);
    expect(daysSince(ago(3.2), now)).toBe(3);
    expect(daysSince(new Date(now.getTime() + DAY).toISOString(), now)).toBe(0);
  });
});
