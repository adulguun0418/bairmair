import type { SearchListingRow } from '@bairmair/db';

/** What "similar" compares against: the listing being viewed. */
export interface SimilarTarget {
  id: string;
  type: 'sale' | 'rent';
  price: number | null;
  currency: string;
  rooms: number | null;
  district_id: number | null;
}

export const SIMILAR_LIMIT = 4;

/** Fewer same-district matches than this and the listing page also searches the whole city. */
export const SIMILAR_MIN_IN_DISTRICT = 4;

/**
 * Ranks search results by how close they are to the listing being viewed and keeps the best
 * `limit`. Same type only; the listing itself is skipped.
 *
 * Points: same room count 3 (one off: 1); price within 15% 3, within 40% 2, within a factor
 * of two 1 (same currency only); same district 2; a 3D scan 1. Ties keep the search order
 * (3D first, then newest), so the result is stable.
 */
export function pickSimilar(
  target: SimilarTarget,
  candidates: readonly SearchListingRow[],
  limit = SIMILAR_LIMIT,
): SearchListingRow[] {
  const seen = new Set<string>([target.id]);
  const scored: { row: SearchListingRow; score: number; order: number }[] = [];
  candidates.forEach((row, order) => {
    if (seen.has(row.id) || row.type !== target.type) return;
    seen.add(row.id);
    scored.push({ row, score: similarity(target, row), order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ row }) => row);
}

function similarity(target: SimilarTarget, row: SearchListingRow): number {
  let score = 0;
  if (target.rooms !== null) {
    const difference = Math.abs(row.rooms - target.rooms);
    score += difference === 0 ? 3 : difference === 1 ? 1 : 0;
  }
  if (target.price !== null && target.price > 0 && row.currency === target.currency) {
    const ratio = Math.abs(Math.log(row.price / target.price));
    score +=
      ratio <= Math.log(1.15) ? 3 : ratio <= Math.log(1.4) ? 2 : ratio <= Math.log(2) ? 1 : 0;
  }
  if (target.district_id !== null && row.district_id === target.district_id) score += 2;
  if (row.has_3d) score += 1;
  return score;
}
