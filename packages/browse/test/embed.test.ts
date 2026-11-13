import { describe, expect, it } from 'vitest';
import { embedMessage, isEmbedNavigation, listingEmbedPath, parseEmbedMessage } from '../src/embed';

const ID = '3f0c8a52-6b1e-4d7a-9c2f-1a2b3c4d5e6f';

describe('listingEmbedPath', () => {
  it('has no prefix in Mongolian and /en in English', () => {
    expect(listingEmbedPath('mn', ID)).toBe(`/embed/listings/${ID}`);
    expect(listingEmbedPath('en', ID)).toBe(`/en/embed/listings/${ID}`);
  });
});

describe('embed messages', () => {
  it('round-trips every event', () => {
    for (const event of ['ready', 'missing', 'no-model'] as const) {
      expect(parseEmbedMessage(embedMessage(event, ID))).toEqual({
        source: 'bairmair-embed',
        version: 1,
        event,
        listingId: ID,
      });
    }
  });

  it('ignores anything else', () => {
    expect(parseEmbedMessage('not json')).toBeNull();
    expect(parseEmbedMessage('null')).toBeNull();
    expect(parseEmbedMessage('"ready"')).toBeNull();
    expect(
      parseEmbedMessage(
        JSON.stringify({ source: 'other', version: 1, event: 'ready', listingId: ID }),
      ),
    ).toBeNull();
    expect(
      parseEmbedMessage(
        JSON.stringify({ source: 'bairmair-embed', version: 2, event: 'ready', listingId: ID }),
      ),
    ).toBeNull();
    expect(
      parseEmbedMessage(
        JSON.stringify({ source: 'bairmair-embed', version: 1, event: 'boom', listingId: ID }),
      ),
    ).toBeNull();
    expect(
      parseEmbedMessage(JSON.stringify({ source: 'bairmair-embed', version: 1, event: 'ready' })),
    ).toBeNull();
  });
});

describe('isEmbedNavigation', () => {
  const embedUrl = `http://192.168.1.20:3000/embed/listings/${ID}`;

  it('accepts the embed page itself, with or without query and fragment', () => {
    expect(isEmbedNavigation(embedUrl, embedUrl)).toBe(true);
    expect(isEmbedNavigation(`${embedUrl}?x=1`, embedUrl)).toBe(true);
    expect(isEmbedNavigation(`${embedUrl}#photo`, embedUrl)).toBe(true);
  });

  it('rejects other pages and hosts', () => {
    expect(isEmbedNavigation(`http://192.168.1.20:3000/listings/${ID}`, embedUrl)).toBe(false);
    expect(isEmbedNavigation(`${embedUrl}/more`, embedUrl)).toBe(false);
    expect(isEmbedNavigation(`https://example.com/embed/listings/${ID}`, embedUrl)).toBe(false);
  });
});
