import { CITIES, districtById } from '@bairmair/db';
import { formatArea, formatMoney, type Locale, type Translator } from '@bairmair/i18n';
import type { ListingRow } from './listing-page';

// Text shown about a listing, identical on the web page and in the app.

type Named = { nameMn: string; nameEn: string };

/** A district or city name in the UI language. */
export function placeName(place: Named, locale: Locale): string {
  return locale === 'mn' ? place.nameMn : place.nameEn;
}

export function cityName(cityId: number, locale: Locale): string {
  const city = CITIES.find((candidate) => candidate.id === cityId);
  return city ? placeName(city, locale) : '';
}

/** "Хан-Уул дүүрэг", or null without a district. */
export function districtLabel(
  districtId: number | null,
  locale: Locale,
  t: Translator,
): string | null {
  const district = districtById(districtId);
  return district ? t('listingPage.district', { district: placeName(district, locale) }) : null;
}

/** "2 өрөө · 65 м² · Хан-Уул дүүрэг · Зайсан хотхон", for headers, cards and descriptions. */
export function listingSummary(
  listing: Pick<
    ListingRow,
    'rooms' | 'area_official_m2' | 'area_scanned_m2' | 'district_id' | 'complex_name'
  >,
  locale: Locale,
  t: Translator,
  { complex = true }: { complex?: boolean } = {},
): string {
  const area = listing.area_official_m2 ?? listing.area_scanned_m2;
  return [
    listing.rooms !== null && t('listingPage.roomsCount', { count: listing.rooms }),
    area !== null && formatArea(area, locale),
    districtLabel(listing.district_id, locale, t),
    complex && listing.complex_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Шинэчилсэн: өнөөдөр" and so on, from days since the seller last confirmed. */
export function updatedText(days: number, t: Translator): string {
  if (days === 0) return t('listingPage.updatedToday');
  if (days === 1) return t('listingPage.updatedYesterday');
  return t('listingPage.updatedDaysAgo', { count: days });
}

/** "Улаанбаатар, Хан-Уул дүүрэг, 11-р хороо" */
export function locationLine(
  listing: Pick<ListingRow, 'city_id' | 'district_id' | 'khoroo'>,
  locale: Locale,
  t: Translator,
): string {
  return [
    cityName(listing.city_id, locale),
    districtLabel(listing.district_id, locale, t),
    listing.khoroo !== null && t('listingPage.khoroo', { khoroo: listing.khoroo }),
  ]
    .filter(Boolean)
    .join(', ');
}

/** The details table: label and value for every fact the listing has, in display order. */
export function listingFacts(
  listing: ListingRow,
  locale: Locale,
  t: Translator,
): { label: string; value: string }[] {
  const yesNo = (value: boolean) =>
    value ? t('listingPage.facts.yes') : t('listingPage.facts.no');
  const rows: [string, string | null][] = [
    [
      t('listingPage.facts.areaOfficial'),
      listing.area_official_m2 === null ? null : formatArea(listing.area_official_m2, locale),
    ],
    [
      t('listingPage.facts.areaScanned'),
      listing.area_scanned_m2 === null ? null : formatArea(listing.area_scanned_m2, locale),
    ],
    [t('listingPage.facts.rooms'), listing.rooms === null ? null : String(listing.rooms)],
    [
      t('listingPage.facts.floor'),
      listing.floor === null
        ? null
        : listing.total_floors === null
          ? String(listing.floor)
          : t('listingPage.facts.floorOf', { floor: listing.floor, total: listing.total_floors }),
    ],
    [
      t('listingPage.facts.buildingYear'),
      listing.building_year === null ? null : String(listing.building_year),
    ],
    [
      t('listingPage.facts.material'),
      listing.building_material && t(`listingForm.materials.${listing.building_material}`),
    ],
    [t('listingPage.facts.newBuilding'), listing.new_building ? yesNo(true) : null],
    [
      t('listingPage.facts.heating'),
      listing.heating && t(`listingForm.heatings.${listing.heating}`),
    ],
    [t('listingPage.facts.balconies'), listing.balconies > 0 ? String(listing.balconies) : null],
    [
      t('listingPage.facts.parking'),
      listing.parking && t(`listingForm.parkings.${listing.parking}`),
    ],
    [
      t('listingPage.facts.furnishing'),
      listing.furnishing && t(`listingForm.furnishings.${listing.furnishing}`),
    ],
    [
      t('listingPage.facts.mortgage'),
      listing.mortgage_eligible === null ? null : yesNo(listing.mortgage_eligible),
    ],
    [
      t('listingPage.facts.deposit'),
      listing.deposit === null ? null : formatMoney(listing.deposit, listing.currency),
    ],
    [
      t('listingPage.facts.minTerm'),
      listing.min_term_months
        ? t('listingPage.facts.minTermMonths', { count: listing.min_term_months })
        : null,
    ],
    [
      t('listingPage.facts.utilities'),
      listing.utilities_included === null
        ? null
        : listing.utilities_included
          ? t('listingPage.facts.utilitiesIncluded')
          : t('listingPage.facts.utilitiesExtra'),
    ],
  ];
  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}
