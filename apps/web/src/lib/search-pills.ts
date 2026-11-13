import { DISTRICTS, SEARCH_LIMITS } from '@bairmair/db';
import type { Locale, Translator } from '@bairmair/i18n';
import type { SearchFilters } from '@bairmair/browse';

// What a filter pill says once its filter is set ("Хан-Уул +1", "2, 3 өрөө", "≤ 300 сая ₮").
// Null means "not set": the pill shows its plain name.

export function districtsLabel(filters: SearchFilters, locale: Locale): string | null {
  const [first, ...rest] = filters.districts;
  const district = DISTRICTS.find((candidate) => candidate.slug === first);
  if (!district) return null;
  const name = locale === 'mn' ? district.nameMn : district.nameEn;
  return rest.length > 0 ? `${name} +${rest.length}` : name;
}

export function roomsLabel(filters: SearchFilters, t: Translator): string | null {
  if (filters.rooms.length === 0) return null;
  const list = filters.rooms
    .map((count) => (count >= SEARCH_LIMITS.roomsPlus ? `${count}+` : String(count)))
    .join(', ');
  return t('search.roomsPill', { list });
}

/** "100–300 сая ₮", "≤ 300 сая ₮", "≥ 100 сая ₮". */
export function rangeLabel(min: number | null, max: number | null, unit: string): string | null {
  if (min !== null && max !== null) return `${min}–${max} ${unit}`;
  if (max !== null) return `≤ ${max} ${unit}`;
  if (min !== null) return `≥ ${min} ${unit}`;
  return null;
}

export function priceLabel(filters: SearchFilters, t: Translator): string | null {
  const unit = filters.currency === 'USD' ? '$' : t('search.unitMillionMnt');
  return rangeLabel(filters.priceMin, filters.priceMax, unit);
}

export function areaLabel(filters: SearchFilters): string | null {
  return rangeLabel(filters.areaMin, filters.areaMax, 'м²');
}
