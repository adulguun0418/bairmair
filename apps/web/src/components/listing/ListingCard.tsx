import { districtById, type ListingTier } from '@bairmair/db';
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
import { Photo } from '@/components/Photo';
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
  const tier = card.promotion_tier ?? null;

  const photo = cover ? (
    <Photo
      src={cover}
      alt=""
      sizes={
        compact
          ? '128px'
          : '(min-width: 1536px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 48vw, 94vw'
      }
      className="group-hover/card:scale-[1.04]"
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
        className={`group/card flex w-full overflow-hidden rounded-2xl bg-surface shadow-sm transition hover:shadow-md ${tier ? TIER_RING[tier] : 'ring-1 ring-line'}`}
      >
        <div className="relative w-32 shrink-0 overflow-hidden bg-surface-3">
          {photo}
          {(card.has_3d || tier) && (
            <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
              {tier && <TierBadge tier={tier} label={t(`listingCard.${tier}`)} />}
              {card.has_3d && <Badge3d label={t('listingCard.has3d')} />}
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
        className={`flex w-full flex-col rounded-3xl p-2 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 ${
          tier
            ? `${TIER_RING[tier]} ${TIER_SURFACE[tier]}`
            : 'bg-surface ring-1 ring-line hover:ring-line-2'
        }`}
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
          {(card.has_3d || tier) && (
            <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
              {tier && <TierBadge tier={tier} label={t(`listingCard.${tier}`)} />}
              {card.has_3d && <Badge3d label={t('listingCard.has3d')} />}
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

/** Paid placement: a metal-coloured ring, and a faint wash of the same colour on wide cards. */
const TIER_RING: Record<ListingTier, string> = {
  gold: 'ring-2 ring-[#d9a21b]',
  silver: 'ring-2 ring-[#9aa5b5]',
};
const TIER_SURFACE: Record<ListingTier, string> = {
  gold: 'bg-[linear-gradient(180deg,rgba(245,200,76,0.14),transparent_45%)] bg-surface',
  silver: 'bg-[linear-gradient(180deg,rgba(154,165,181,0.16),transparent_45%)] bg-surface',
};

function TierBadge({ tier, label }: { tier: ListingTier; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold shadow-sm ${
        tier === 'gold'
          ? 'bg-gradient-to-r from-[#f8d66d] to-[#d9a21b] text-[#3b2a05]'
          : 'bg-gradient-to-r from-[#f1f4f8] to-[#b4bdca] text-[#1f2937]'
      }`}
    >
      <span aria-hidden>★</span>
      {label}
    </span>
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
