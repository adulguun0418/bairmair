import { createTranslator, formatArea } from '@bairmair/i18n';
import { describe, expect, it } from 'vitest';
import type { ListingRow } from '../src/listing-page';
import {
  listingFacts,
  listingShareTitle,
  listingSummary,
  locationLine,
  updatedText,
} from '../src/listing-text';

/** Non-breaking spaces (between numbers and units) as plain ones. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('listingShareTitle', () => {
  const sale = {
    type: 'sale',
    price: 350_000_000,
    currency: 'MNT',
    rooms: 2,
    area_official_m2: 55,
    area_scanned_m2: null,
    district_id: 2,
    complex_name: 'Зайсан хотхон',
  } as ListingRow;

  it('says type, rooms, area, district and price, without the complex', () => {
    expect(plain(listingShareTitle(sale, 'mn', createTranslator('mn')))).toMatch(
      /^Зарна: 2 өрөө · 55 м² · .+ дүүрэг — 350 сая ₮$/,
    );
  });

  it('shows rent per month and leaves out what is missing', () => {
    const rent = { ...sale, type: 'rent', price: 1_800_000, rooms: null, district_id: null };
    expect(plain(listingShareTitle(rent as ListingRow, 'mn', createTranslator('mn')))).toBe(
      'Түрээслүүлнэ: 55 м² — 1.8 сая ₮/сар',
    );
    const bare = { ...rent, price: null, area_official_m2: null };
    expect(listingShareTitle(bare as ListingRow, 'en', createTranslator('en'))).toBe('For rent');
  });
});

const mn = createTranslator('mn');
const en = createTranslator('en');

const listing = {
  type: 'rent',
  currency: 'USD',
  rooms: 2,
  area_official_m2: 65,
  area_scanned_m2: 61.2,
  floor: 7,
  total_floors: 12,
  building_year: null,
  building_material: 'monolithic',
  new_building: false,
  heating: null,
  balconies: 1,
  parking: null,
  furnishing: null,
  mortgage_eligible: null,
  deposit: 1200,
  min_term_months: 6,
  utilities_included: false,
  city_id: 1,
  district_id: 5,
  khoroo: 11,
  complex_name: 'Зайсан хотхон',
} as ListingRow;

describe('listing text', () => {
  it('summarises rooms, area, district and complex', () => {
    const summary = listingSummary(listing, 'mn', mn);
    expect(summary).toMatch(/^2 өрөө · 65.*м² · .+ дүүрэг · Зайсан хотхон$/);
    expect(listingSummary(listing, 'mn', mn, { complex: false })).not.toContain('Зайсан');
    // The scanned area stands in when there is no official one.
    expect(listingSummary({ ...listing, area_official_m2: null }, 'en', en)).toContain('61.2');
  });

  it('writes the location from city to khoroo', () => {
    expect(locationLine(listing, 'mn', mn)).toMatch(/^Улаанбаатар, .+ дүүрэг, 11-р хороо$/);
    expect(locationLine({ ...listing, khoroo: null }, 'en', en)).toMatch(/district$/);
  });

  it('says when the listing was confirmed', () => {
    expect(updatedText(0, mn)).toBe('Өнөөдөр шинэчилсэн');
    expect(updatedText(1, en)).toBe('Updated yesterday');
    expect(updatedText(5, en)).toBe('Updated 5 days ago');
  });

  it('lists only the facts the listing has, in order', () => {
    const facts = listingFacts(listing, 'en', en);
    expect(facts.map((fact) => fact.label)).toEqual([
      'Area (certificate)',
      'Area (scanned, approximate)',
      'Rooms',
      'Floor',
      'Building material',
      'Balconies',
      'Deposit',
      'Minimum term',
      'Utilities',
    ]);
    expect(facts.find((fact) => fact.label === 'Floor')?.value).toBe('7 of 12');
    expect(facts.find((fact) => fact.label === 'Deposit')?.value).toBe(`$1,200`);
    expect(facts.find((fact) => fact.label === 'Utilities')?.value).toBe('Paid separately');
    expect(facts.find((fact) => fact.label === 'Area (certificate)')?.value).toBe(
      formatArea(65, 'en'),
    );
  });
});
