/** Within this many percent of the district median, the price counts as "close to it". */
export const SAME_PRICE_PERCENT = 3;

export interface PriceComparison {
  /** Bar lengths, 0–1, relative to the larger of the two. */
  listingShare: number;
  medianShare: number;
  /** How far from the median, in whole percent (always positive). */
  percent: number;
  direction: 'below' | 'above' | 'same';
}

/** A listing's price per m² against its district's median, for the comparison bars. */
export function comparePrice(pricePerM2: number, medianPerM2: number): PriceComparison {
  const larger = Math.max(pricePerM2, medianPerM2);
  const difference = ((pricePerM2 - medianPerM2) / medianPerM2) * 100;
  const percent = Math.round(Math.abs(difference));
  return {
    listingShare: larger > 0 ? pricePerM2 / larger : 0,
    medianShare: larger > 0 ? medianPerM2 / larger : 0,
    percent,
    direction:
      Math.abs(difference) < SAME_PRICE_PERCENT ? 'same' : difference < 0 ? 'below' : 'above',
  };
}
