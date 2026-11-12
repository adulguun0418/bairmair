/** Rounds to a fixed number of decimals and never returns negative zero. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Lengths and coordinates are stored to the millimeter. */
export const roundLength = (value: number): number => roundTo(value, 3);

/** Angles are stored to 1e-4 radians (about 0.006 degrees). */
export const roundAngle = (value: number): number => roundTo(value, 4);
