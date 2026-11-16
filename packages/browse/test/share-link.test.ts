import { describe, expect, it } from 'vitest';
import { shareLink } from '../src/share-link';

describe('shareLink', () => {
  it('adds the channel', () => {
    expect(shareLink('https://bairmair.mn/listings/abc', 'post')).toBe(
      'https://bairmair.mn/listings/abc?via=post',
    );
  });

  it('keeps other parameters and replaces an earlier channel', () => {
    expect(shareLink('https://bairmair.mn/en/listings/abc?lang=en&via=link', 'app')).toBe(
      'https://bairmair.mn/en/listings/abc?lang=en&via=app',
    );
  });

  it('keeps the fragment last', () => {
    expect(shareLink('https://bairmair.mn/listings/abc#plan', 'sheet')).toBe(
      'https://bairmair.mn/listings/abc?via=sheet#plan',
    );
  });
});
