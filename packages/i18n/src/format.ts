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

export type CurrencyCode = 'MNT' | 'USD';

/** A full price: `250,000,000 ₮` or `$1,200.5`. MNT has no minor unit in practice. */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  if (currency === 'USD') return `$${formatDecimal(amount, 2)}`;
  return `${formatDecimal(amount, 0)}${NBSP}₮`;
}

const COMPACT_UNITS: Record<Locale, readonly [string, string, string]> = {
  // тэрбум = billion, сая = million, мянга = thousand; written as words, as in local listings.
  mn: [`${NBSP}тэрбум`, `${NBSP}сая`, `${NBSP}мянга`],
  en: ['B', 'M', 'K'],
};

/**
 * A short price, as in local listings: `250 сая ₮`, `1.8 сая ₮` (English: `250M ₮`). Dollar
 * amounts (rents) are small, so they stay whole: `$1,200`.
 */
export function formatMoneyCompact(amount: number, currency: CurrencyCode, locale: Locale): string {
  if (currency === 'USD') return `$${formatDecimal(amount, 0)}`;
  const [billion, million, thousand] = COMPACT_UNITS[locale];
  const abs = Math.abs(amount);
  const [value, unit] =
    abs >= 1e9
      ? [amount / 1e9, billion]
      : abs >= 1e6
        ? [amount / 1e6, million]
        : abs >= 1e3
          ? [amount / 1e3, thousand]
          : [amount, ''];
  return `${formatDecimal(value, 1)}${unit}${NBSP}₮`;
}

const FILE_SIZE_UNITS: Record<Locale, readonly [string, string, string]> = {
  mn: ['Б', 'КБ', 'МБ'],
  en: ['B', 'KB', 'MB'],
};

/** A file size such as `840 КБ` or `2.4 MB`, in decimal units like the iOS Files app. */
export function formatFileSize(bytes: number, locale: Locale): string {
  const [b, kb, mb] = FILE_SIZE_UNITS[locale];
  if (bytes < 1000) return `${formatDecimal(bytes, 0)}${NBSP}${b}`;
  if (bytes < 1_000_000) return `${formatDecimal(bytes / 1000, 0)}${NBSP}${kb}`;
  return `${formatDecimal(bytes / 1_000_000, 1)}${NBSP}${mb}`;
}
