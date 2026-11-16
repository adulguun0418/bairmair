/**
 * Where a shared listing link came from. Added to the link as `?via=<channel>`, so analytics
 * can tell shares apart where the referrer says nothing (Messenger, Viber, a copied link):
 *
 * - `link`: "copy link" on the website
 * - `post`: the copied listing text (pasted into Facebook groups, unegui.mn, chats)
 * - `facebook`: Facebook's share dialog. Facebook links its preview card to the page's
 *   canonical `og:url` (no `via`), so clicks on the card arrive with only the referrer.
 * - `sheet`: the browser's share sheet
 * - `app`: the app's share button
 */
export const SHARE_CHANNELS = ['link', 'post', 'facebook', 'sheet', 'app'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** The query parameter carrying the channel; analytics reads it like a UTM parameter. */
export const SHARE_PARAM = 'via';

/** `url` with `?via=<channel>` (replacing an earlier one); other parameters are kept. */
export function shareLink(url: string, channel: ShareChannel): string {
  const hashAt = url.indexOf('#');
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : withoutHash.slice(queryAt + 1));
  params.set(SHARE_PARAM, channel);
  return `${path}?${params.toString()}${hash}`;
}
