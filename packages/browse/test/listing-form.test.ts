import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  formFromRow,
  formToFields,
  missingForPublish,
  parseNumberInput,
  type ListingForm,
} from '../src/listing-form';

const form = (patch: Partial<ListingForm>): ListingForm => ({ ...EMPTY_FORM, ...patch });

describe('parseNumberInput', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['250000000', 250_000_000],
    ['250 000 000', 250_000_000],
    ['250 000 000', 250_000_000],
    ['250,000,000', 250_000_000],
    ['250.000.000', 250_000_000],
    ['1,250', 1250],
    ['65.5', 65.5],
    ['65,5', 65.5],
    ['65,55', 65.55],
    ['1,250,000.50', 1_250_000.5],
    ['-2', -2],
  ])('%j → %s', (input, expected) => {
    expect(parseNumberInput(input)).toBe(expected);
  });

  it.each(['abc', '12a', '1.2.3', '--1', '.5'])('rejects %j', (input) => {
    expect(parseNumberInput(input)).toBeNaN();
  });
});

describe('formToFields', () => {
  it('needs only a title for a draft', () => {
    const result = formToFields(form({ title: '  2 өрөө байр  ' }));
    expect(result.ok).toBe(true);
    expect(result.fields).toMatchObject({
      type: 'sale',
      title: '2 өрөө байр',
      description: null,
      price: null,
      currency: 'MNT',
      balconies: 0,
      city_id: 1,
      district_id: null,
      show_exact_location: false,
    });
  });

  it('reports a missing or short title', () => {
    expect(formToFields(form({})).errors).toEqual({ title: 'required' });
    expect(formToFields(form({ title: 'ab' })).errors).toEqual({ title: 'tooShort' });
    expect(formToFields(form({ title: 'x'.repeat(121) })).errors).toEqual({ title: 'tooLong' });
  });

  it('parses and range-checks numbers', () => {
    const result = formToFields(
      form({
        title: 'Зайсан',
        price: '450 000 000',
        areaOfficial: '85,5',
        rooms: '3',
        floor: '7',
        totalFloors: '12',
        buildingYear: '2015',
        balconies: '2',
        khoroo: '11',
        districtId: 5,
      }),
    );
    expect(result.fields).toMatchObject({
      price: 450_000_000,
      area_official_m2: 85.5,
      rooms: 3,
      floor: 7,
      total_floors: 12,
      building_year: 2015,
      balconies: 2,
      khoroo: 11,
      district_id: 5,
      city_id: 1,
    });
  });

  it('rejects values the database would refuse', () => {
    const { ok, errors } = formToFields(
      form({
        title: 'Байр',
        price: 'abc',
        areaOfficial: '0',
        rooms: '2.5',
        floor: '13',
        totalFloors: '12',
        buildingYear: '1850',
        balconies: '21',
        khoroo: '100',
        unitNumber: 'x'.repeat(21),
      }),
    );
    expect(ok).toBe(false);
    expect(errors).toEqual({
      price: 'notANumber',
      areaOfficial: 'tooSmall',
      rooms: 'notWhole',
      floor: 'aboveTotalFloors',
      buildingYear: 'tooSmall',
      balconies: 'tooLarge',
      khoroo: 'tooLarge',
      unitNumber: 'tooLong',
    });
  });

  it('rounds decimals to what the column stores', () => {
    expect(formToFields(form({ title: 'Байр', areaOfficial: '65.555' })).fields).toMatchObject({
      area_official_m2: 65.56,
    });
  });

  it('keeps only the fields of the listing type', () => {
    const both = {
      title: 'Байр',
      currency: 'USD' as const,
      mortgageEligible: true,
      deposit: '1000',
      minTermMonths: '6',
      utilitiesIncluded: true,
    };
    expect(formToFields(form({ ...both, type: 'sale' })).fields).toMatchObject({
      currency: 'MNT',
      mortgage_eligible: true,
      deposit: null,
      min_term_months: null,
      utilities_included: null,
    });
    expect(formToFields(form({ ...both, type: 'rent' })).fields).toMatchObject({
      currency: 'USD',
      mortgage_eligible: null,
      deposit: 1000,
      min_term_months: 6,
      utilities_included: true,
    });
  });

  it('ignores an unknown district id', () => {
    expect(formToFields(form({ title: 'Байр', districtId: 99 })).fields?.district_id).toBeNull();
  });
});

describe('formFromRow', () => {
  it('round-trips through the row', () => {
    const original = form({
      type: 'rent',
      title: 'Түрээсийн байр',
      description: 'Тавилгатай',
      price: '1800000',
      currency: 'MNT',
      negotiable: true,
      rooms: '2',
      areaOfficial: '48.3',
      floor: '-1',
      totalFloors: '9',
      buildingYear: '1985',
      buildingMaterial: 'panel',
      heating: 'central',
      balconies: '1',
      parking: 'outdoor',
      furnishing: 'full',
      deposit: '1800000',
      minTermMonths: '6',
      utilitiesIncluded: false,
      districtId: 3,
      khoroo: '4',
      complexName: '10-р хороолол',
      addressText: 'Их дэлгүүрийн ард',
      showExactLocation: true,
      unitNumber: '45',
    });
    const fields = formToFields(original).fields!;
    expect(formFromRow(fields, '45')).toEqual(original);
  });
});

describe('missingForPublish', () => {
  const complete = form({
    title: 'Зайсан, 3 өрөө',
    price: '450000000',
    rooms: '3',
    areaOfficial: '85',
    districtId: 5,
  });

  it('is empty for a complete listing', () => {
    expect(missingForPublish({ form: complete, hasLocation: true, photoCount: 1 })).toEqual([]);
  });

  it('lists what is missing', () => {
    expect(missingForPublish({ form: EMPTY_FORM, hasLocation: false, photoCount: 0 })).toEqual([
      'title',
      'price',
      'rooms',
      'area',
      'district',
      'location',
      'photo',
    ]);
  });

  it('accepts the scanned area instead of the official one', () => {
    const noArea = { ...complete, areaOfficial: '' };
    expect(missingForPublish({ form: noArea, hasLocation: true, photoCount: 1 })).toEqual(['area']);
    expect(
      missingForPublish({ form: noArea, hasLocation: true, photoCount: 1, hasScannedArea: true }),
    ).toEqual([]);
  });

  it('flags invalid values', () => {
    expect(
      missingForPublish({
        form: { ...complete, buildingYear: '3000' },
        hasLocation: true,
        photoCount: 1,
      }),
    ).toEqual(['validFields']);
  });
});
