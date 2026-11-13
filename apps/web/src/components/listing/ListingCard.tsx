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
import { AreaIcon, CubeIcon, DoorIcon, PinIcon, VerifiedIcon } from '@/components/icons';
import { listingPlanSrc } from '@/lib/listing-plan';
import { FavoriteButton } from './FavoriteButton';

/**
 * One listing in a grid or on the map: cover photo, badges, price, rooms, area and district.
 * Has no hooks, so server pages and the (client) map both render it. The ♡ sits over the photo,
 * beside the link rather than inside it (a button inside a link is invalid HTML).
 *
 * Scanned listings show their floor plan: a small inset over the photo, and over the whole
 * photo while the pointer is on the card.
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
  const districtName = district ? (locale === 'mn' ? district.nameMn : district.nameEn) : null;
  const area = card.area_official_m2 ?? card.area_scanned_m2;
  const perArea =
    card.area_official_m2 && card.price > 0
      ? formatPricePerArea(card.price / card.area_official_m2, card.currency, locale)
      : null;
  const price = formatListingPrice(card.price, card.currency, card.type, locale);
  const href = localePath(locale, `/listings/${card.id}`);

  const photo = cover ? (
    // Photos are 2048 px JPEGs; there is no image optimizer yet (see PROGRESS).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cover}
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-[1.04]"
    />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center text-sm text-fg-subtle">
      {t('listingCard.noPhoto')}
    </span>
  );

  if (compact) {
    const summary = [
      t('listingPage.roomsCount', { count: card.rooms }),
      area !== null && formatArea(area, locale),
      districtName,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <Link
        href={href}
        className="group/card flex w-full overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line transition hover:shadow-md"
      >
        <div className="relative w-32 shrink-0 overflow-hidden bg-surface-3">
          {photo}
          {card.has_3d && (
            <div className="absolute left-1.5 top-1.5">
              <Badge3d label={t('listingCard.has3d')} />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1 p-3">
          <p className="text-lg font-semibold tracking-tight">{price}</p>
          <p className="text-sm text-fg-2">{summary}</p>
          <p className="line-clamp-2 text-sm text-fg-muted group-hover/card:underline">
            {card.title}
          </p>
        </div>
      </Link>
    );
  }

  const plan = card.has_3d
    ? {
        full: listingPlanSrc(card.id, locale),
        thumb: listingPlanSrc(card.id, locale, { thumb: true }),
      }
    : null;

  return (
    <div className="group/card relative flex w-full" data-listing-id={card.id}>
      <Link
        href={href}
        className="flex w-full flex-col rounded-3xl bg-surface p-2 ring-1 ring-line transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-line-2"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-3">
          {photo}
          {plan && (
            <>
              {/* The whole plan, over the photo while hovered. */}
              <div className="absolute inset-0 bg-[#eef3fa] text-[#1a2b60] opacity-0 transition-opacity duration-300 bg-blueprint group-hover/card:opacity-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from our API */}
                <img
                  src={plan.full}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain p-4"
                />
              </div>
              {/* A small inset, so scanned listings stand out at a glance. */}
              <div className="absolute bottom-2 right-2 size-[4.5rem] rounded-xl bg-white/95 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur transition-opacity duration-300 group-hover/card:opacity-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from our API */}
                <img
                  src={plan.thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              </div>
            </>
          )}
          {card.has_3d && (
            <div className="absolute left-2 top-2">
              <Badge3d label={t('listingCard.has3d')} />
            </div>
          )}
        </div>
        <div className="space-y-2 px-2.5 pb-2 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="whitespace-nowrap text-xl font-semibold tracking-tight">{price}</p>
            {perArea && (
              <p className="whitespace-nowrap text-xs text-fg-subtle">
                {t('listingCard.perArea', { price: perArea })}
              </p>
            )}
          </div>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
            <li className="inline-flex items-center gap-1.5">
              <DoorIcon className="size-4 text-fg-subtle" />
              {t('listingPage.roomsCount', { count: card.rooms })}
            </li>
            {area !== null && (
              <li className="inline-flex items-center gap-1.5">
                <AreaIcon className="size-4 text-fg-subtle" />
                {formatArea(area, locale)}
              </li>
            )}
            {districtName && (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <PinIcon className="size-4 shrink-0 text-fg-subtle" />
                <span className="truncate">{districtName}</span>
              </li>
            )}
          </ul>
          <p className="line-clamp-1 text-sm text-fg-muted">
            {card.complex_name ? `${card.complex_name} · ${card.title}` : card.title}
          </p>
          {card.scan_verified && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <VerifiedIcon className="size-3.5" />
              {t('listingCard.scanVerified')}
            </p>
          )}
        </div>
      </Link>
      <FavoriteButton listingId={card.id} locale={locale} className="absolute right-4 top-4" />
    </div>
  );
}

function Badge3d({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#1a2b60]/90 px-2 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur">
      <CubeIcon className="size-3.5 text-[#7fd0f3]" />
      {label}
    </span>
  );
}

/** Cards in a responsive grid: full width, or beside the search map (`split`). */
export function ListingGrid({
  cards,
  locale,
  supabaseUrl,
  layout = 'wide',
}: {
  cards: readonly ListingCardData[];
  locale: Locale;
  supabaseUrl: string;
  layout?: 'wide' | 'split';
}) {
  const columns =
    layout === 'split'
      ? 'sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3'
      : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  return (
    <ul className={`grid gap-5 ${columns}`}>
      {cards.map((card) => (
        <li key={card.id} className="flex">
          <ListingCard card={card} locale={locale} supabaseUrl={supabaseUrl} />
        </li>
      ))}
    </ul>
  );
}
