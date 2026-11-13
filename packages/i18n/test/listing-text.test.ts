import { describe, expect, it } from 'vitest';
import {
  formatListingPost,
  formatListingPrice,
  formatPricePerArea,
  type ListingPostInput,
} from '../src/index';

/** The no-break space the formatters put between a number and its unit. */
const NB = ' ';

describe('formatListingPrice', () => {
  it('shows sales as a compact price', () => {
    expect(formatListingPrice(250_000_000, 'MNT', 'sale', 'mn')).toBe(`250${NB}сая${NB}₮`);
    expect(formatListingPrice(250_000_000, 'MNT', 'sale', 'en')).toBe(`250M${NB}₮`);
  });

  it('adds "per month" to rents', () => {
    expect(formatListingPrice(1_800_000, 'MNT', 'rent', 'mn')).toBe(`1.8${NB}сая${NB}₮/сар`);
    expect(formatListingPrice(1200, 'USD', 'rent', 'mn')).toBe('$1,200/сар');
    expect(formatListingPrice(1200, 'USD', 'rent', 'en')).toBe('$1,200/mo');
  });
});

describe('formatPricePerArea', () => {
  it('adds the area unit of the language', () => {
    expect(formatPricePerArea(3_846_153.85, 'MNT', 'mn')).toBe(`3.8${NB}сая${NB}₮/м²`);
    expect(formatPricePerArea(15.4, 'USD', 'en')).toBe('$15/m²');
  });
});

const SALE: ListingPostInput = {
  type: 'sale',
  price: 250_000_000,
  currency: 'MNT',
  rooms: 2,
  areaM2: 65,
  pricePerM2: 3_846_153.85,
  districtName: 'Хан-Уул',
  cityName: 'Улаанбаатар',
  complexName: ' Зайсан хотхон ',
  has3d: true,
  url: 'https://example.mn/listings/1',
};

describe('formatListingPost', () => {
  it('writes a Mongolian post with the link last', () => {
    expect(formatListingPost(SALE, 'mn')).toBe(
      [
        'Зарна: 2 өрөө байр, Хан-Уул дүүрэг',
        `Үнэ: 250${NB}сая${NB}₮ (3.8${NB}сая${NB}₮/м²)`,
        `Талбай: 65${NB}м²`,
        'Байр: Зайсан хотхон',
        '3D загвар, төлөвлөлтийг нь холбоосоор үзнэ үү.',
        '',
        'https://example.mn/listings/1',
      ].join('\n'),
    );
  });

  it('writes an English post', () => {
    expect(formatListingPost(SALE, 'en').split('\n').slice(0, 2)).toEqual([
      'For sale: 2-room apartment, Хан-Уул district',
      `Price: 250M${NB}₮ (3.8M${NB}₮/m²)`,
    ]);
  });

  it('leaves out what a listing does not have, and price per m² for rents', () => {
    const rent: ListingPostInput = {
      ...SALE,
      type: 'rent',
      price: 1200,
      currency: 'USD',
      rooms: null,
      areaM2: null,
      districtName: null,
      complexName: '',
      has3d: false,
    };
    expect(formatListingPost(rent, 'mn')).toBe(
      ['Түрээслүүлнэ: байр, Улаанбаатар', 'Үнэ: $1,200/сар', '', SALE.url].join('\n'),
    );
  });
});
