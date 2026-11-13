import { localePath, type Locale } from '@bairmair/i18n';

/**
 * The 3D embed of a listing: the web's `/embed/listings/[id]` page, which the mobile app shows in
 * a WebView so the 3D experience is built once. The page tells the app how it went through
 * `window.ReactNativeWebView.postMessage` with the messages below.
 */

/** Path of a listing's embed page, e.g. `/embed/listings/<id>` or `/en/embed/listings/<id>`. */
export function listingEmbedPath(locale: Locale, listingId: string): string {
  return localePath(locale, `/embed/listings/${listingId}`);
}

export const EMBED_EVENTS = [
  /** The 3D view is on screen (WebGL may still turn out to be unavailable; the page says so). */
  'ready',
  /** The listing does not exist or is not public. */
  'missing',
  /** The listing is public but has no processed scan. */
  'no-model',
] as const;
export type EmbedEvent = (typeof EMBED_EVENTS)[number];

export interface EmbedMessage {
  source: 'bairmair-embed';
  version: 1;
  event: EmbedEvent;
  listingId: string;
}

/** The string the embed page posts. */
export function embedMessage(event: EmbedEvent, listingId: string): string {
  const message: EmbedMessage = { source: 'bairmair-embed', version: 1, event, listingId };
  return JSON.stringify(message);
}

/** Reads a posted string; null for anything that is not an embed message. */
export function parseEmbedMessage(data: string): EmbedMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { source, version, event, listingId } = value as Record<string, unknown>;
  if (source !== 'bairmair-embed' || version !== 1 || typeof listingId !== 'string') return null;
  if (!EMBED_EVENTS.includes(event as EmbedEvent)) return null;
  return { source, version, event: event as EmbedEvent, listingId };
}

/**
 * Whether a navigation inside the WebView stays on the embed page (`embedUrl` without query or
 * fragment). Anything else, such as a link the page might gain later, belongs in the browser.
 */
export function isEmbedNavigation(url: string, embedUrl: string): boolean {
  return url.split(/[?#]/, 1)[0] === embedUrl;
}
