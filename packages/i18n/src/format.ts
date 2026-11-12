import type { Locale } from './locales';

// Formatting is done by hand instead of with Intl so that the server, every browser, and
// React Native (Hermes, whose locale data varies by platform) produce identical strings.
// Identical strings also avoid hydration mismatches between server and client.

/** No-break space, so a number never wraps away from its unit. */
const NBSP = ' ';

/**
 * Formats a number with `,` between thousands and `.` before decimals, the convention in
 * both Mongolian and English. Trailing zeros after the decimal point are dropped.
 */
export function formatDecimal(value: number, maxFractionDigits = 1): string {
  if (!Number.isFinite(value)) return '–';
  // Round the scaled value first: `toFixed` alone turns 6.55 into "6.5", because 6.55 is
  // stored as 6.5499999...
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const fixed = rounded.toFixed(maxFractionDigits);
  const [whole = '0', fraction = ''] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.replace(/0+$/, '');
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${grouped}${trimmed ? `.${trimmed}` : ''}`;
}

/** An area such as `12.5 м²` (Mongolian, Cyrillic м) or `12.5 m²` (English). */
export function formatArea(squareMeters: number, locale: Locale): string {
  const unit = locale === 'mn' ? 'м²' : 'm²';
  return `${formatDecimal(squareMeters, 1)}${NBSP}${unit}`;
}
