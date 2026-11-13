import {
  formatArea,
  formatListingPrice,
  formatPricePerArea,
  type CurrencyCode,
  type ListingType,
} from './format';
import type { Locale } from './locales';
import { createTranslator } from './translator';

/** What a share post says about a listing. Names are already localized. */
export interface ListingPostInput {
  type: ListingType;
  price: number | null;
  currency: CurrencyCode;
  rooms: number | null;
  /** Official area if known, else the scanned one. */
  areaM2: number | null;
  /** Price per official m²; shown for sales only. */
  pricePerM2: number | null;
  districtName: string | null;
  cityName: string;
  complexName: string | null;
  has3d: boolean;
  url: string;
}

/**
 * The text of a one-tap share, formatted the way apartments are posted in Facebook groups and on
 * unegui.mn: a headline, price, area, building, and the link last (Facebook turns it into the
 * floor-plan preview).
 */
export function formatListingPost(input: ListingPostInput, locale: Locale): string {
  const t = createTranslator(locale);
  const type = t(`listingPage.types.${input.type}`);
  const place = input.districtName
    ? t('listingPage.district', { district: input.districtName })
    : input.cityName;
  const lines = [
    input.rooms === null
      ? t('listingPage.share.post.headlineNoRooms', { type, place })
      : t('listingPage.share.post.headline', {
          type,
          place,
          rooms: t('listingPage.roomsCount', { count: input.rooms }),
        }),
  ];

  if (input.price !== null) {
    const price = formatListingPrice(input.price, input.currency, input.type, locale);
    const withArea =
      input.type === 'sale' && input.pricePerM2 !== null
        ? t('listingPage.share.post.pricePerArea', {
            price,
            perArea: formatPricePerArea(input.pricePerM2, input.currency, locale),
          })
        : price;
    lines.push(t('listingPage.share.post.price', { price: withArea }));
  }
  if (input.areaM2 !== null) {
    lines.push(t('listingPage.share.post.area', { area: formatArea(input.areaM2, locale) }));
  }
  const complex = input.complexName?.trim();
  if (complex) lines.push(t('listingPage.share.post.complex', { name: complex }));
  if (input.has3d) lines.push(t('listingPage.share.post.has3d'));

  return `${lines.join('\n')}\n\n${input.url}`;
}
