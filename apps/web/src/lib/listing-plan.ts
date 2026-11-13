import type { FloorPlanTheme } from '@bairmair/room-model';
import type { Locale } from '@bairmair/i18n';

/**
 * Floor plans drawn over listing cards and on the home page: white rooms and navy walls on a
 * transparent background (the card's pale blue panel shows through), in the brand's colours.
 * Always light, like maps, whatever the site theme.
 */
export const CARD_PLAN_THEME: Partial<FloorPlanTheme> = {
  background: null,
  floor: '#ffffff',
  floorSelected: '#d7eefa',
  wall: '#1a2b60',
  windowFill: '#9bd5f0',
  door: '#7d8aa8',
  text: '#1a2b60',
  textMuted: '#55607a',
};

/**
 * The floor-plan image of a listing with a 3D scan (`app/api/plan/listings/[id]`): labelled in
 * the given language, or without labels as a thumbnail.
 */
export function listingPlanSrc(
  listingId: string,
  locale: Locale,
  { thumb = false }: { thumb?: boolean } = {},
): string {
  const query = thumb ? '?thumb=1' : locale === 'mn' ? '' : `?lang=${locale}`;
  return `/api/plan/listings/${listingId}${query}`;
}
