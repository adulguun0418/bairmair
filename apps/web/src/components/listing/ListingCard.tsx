import { districtById } from '@bairmair/db';
import {
  createTranslator,
  formatArea,
  formatListingPrice,
  formatPricePerArea,
  localePath,
  type Locale,
} from '@bairmair/i18n';
import Link from 'next/link';
import { coverUrl, type ListingCardData } from '@bairmair/browse';

/**
 * One listing in a grid or on the map: cover photo, badges, price, rooms, area and district.
 * Has no hooks, so server pages and the (client) map both render it.
 */
export function ListingCard({
  card,
  locale,
  supabaseUrl,
  compact = false,
}: {
  card: ListingCardData;
  locale: Locale;
  supabaseUrl: string;
  /** A short horizontal card (map popups). */
  compact?: boolean;
}) {
  const t = createTranslator(locale);
  const cover = coverUrl(supabaseUrl, card);
  const district = districtById(card.district_id);
  const area = card.area_official_m2 ?? card.area_scanned_m2;
  const perArea =
    card.area_official_m2 && card.price > 0
      ? formatPricePerArea(card.price / card.area_official_m2, card.currency, locale)
      : null;
  const summary = [
    t('listingPage.roomsCount', { count: card.rooms }),
    area !== null && formatArea(area, locale),
    district &&
      t('listingPage.district', { district: locale === 'mn' ? district.nameMn : district.nameEn }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={localePath(locale, `/listings/${card.id}`)}
      className={`group flex w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70 transition hover:shadow-md ${
        compact ? 'flex-row' : 'flex-col'
      }`}
    >
      <div className={`relative shrink-0 bg-stone-200 ${compact ? 'w-32' : 'aspect-[4/3] w-full'}`}>
        {cover ? (
          // Photos are 2048 px JPEGs; there is no image optimizer yet (see PROGRESS).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-stone-500">
            {t('listingCard.noPhoto')}
          </span>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1 text-xs font-medium">
          {card.has_3d && (
            <span className="rounded-full bg-amber-300 px-2 py-0.5 text-amber-950">
              {t('listingCard.has3d')}
            </span>
          )}
          {card.scan_verified && !compact && (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-stone-800">
              {t('listingCard.scanVerified')}
            </span>
          )}
        </div>
      </div>
      <div className={`min-w-0 space-y-1 ${compact ? 'p-3' : 'p-4'}`}>
        <p className="text-lg font-semibold">
          {formatListingPrice(card.price, card.currency, card.type, locale)}
        </p>
        {perArea && !compact && (
          <p className="text-xs text-stone-500">{t('listingCard.perArea', { price: perArea })}</p>
        )}
        <p className="text-sm text-stone-700">{summary}</p>
        <p className="line-clamp-2 text-sm text-stone-600 group-hover:underline">{card.title}</p>
        {card.complex_name && !compact && (
          <p className="truncate text-xs text-stone-500">{card.complex_name}</p>
        )}
      </div>
    </Link>
  );
}

/** Cards in a responsive grid. */
export function ListingGrid({
  cards,
  locale,
  supabaseUrl,
}: {
  cards: readonly ListingCardData[];
  locale: Locale;
  supabaseUrl: string;
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((card) => (
        <li key={card.id} className="flex">
          <ListingCard card={card} locale={locale} supabaseUrl={supabaseUrl} />
        </li>
      ))}
    </ul>
  );
}
