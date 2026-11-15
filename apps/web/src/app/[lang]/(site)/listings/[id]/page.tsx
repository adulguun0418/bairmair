import {
  cityName,
  DEFAULT_FILTERS,
  listingFacts,
  listingSummary,
  locationLine,
  placeName,
  searchQuery,
  updatedText,
  type ListingPageData,
  type ListingRow,
  type ListingSeller,
} from '@bairmair/browse';
import { districtById, LISTING_FRESHNESS } from '@bairmair/db';
import {
  formatArea,
  formatListingPost,
  formatListingPrice,
  formatMoney,
  formatPricePerArea,
  type Locale,
  type Translator,
} from '@bairmair/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import {
  AreaIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronRightIcon,
  CubeIcon,
  DoorIcon,
  PinIcon,
  StairsIcon,
  VerifiedIcon,
} from '@/components/icons';
import { ContactButtons } from '@/components/listing/ContactButtons';
import { FavoriteButton } from '@/components/listing/FavoriteButton';
import { ListingMedia } from '@/components/listing/ListingMedia';
import { ReportListing } from '@/components/listing/ReportListing';
import { ShareActions } from '@/components/listing/ShareActions';
import { ViewCounter } from '@/components/listing/ViewCounter';
import { LocationMap } from '@/components/map/maps';
import { getI18n, localePath } from '@/lib/i18n';
import { comparePrice } from '@/lib/price-compare';
import { publicEnv } from '@/lib/public-env';
import { getListingPage } from '@/server/listing-page';

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/listings/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const page = await getListingPage(id);
  if (!page) return {};
  const { locale, t } = await getI18n();
  const description = listingSummary(page.listing, locale, t);
  return {
    title: page.listing.title,
    description,
    alternates: { canonical: listingUrl(locale, id) },
    openGraph: {
      type: 'website',
      title: page.listing.title,
      description,
      url: listingUrl(locale, id),
      // A route under /api (see its file): no locale prefix, so crawlers get no redirect.
      images: [
        {
          url: `/api/og/listings/${id}${locale === 'mn' ? '' : `?lang=${locale}`}`,
          width: 1200,
          height: 630,
          alt: page.listing.title,
        },
      ],
    },
  };
}

/**
 * The public page of a live listing: title, then photos / 3D / floor plan in one frame, the key
 * facts, a price comparison with the district, description, location; the price and the
 * seller's contact stay beside them (wide screens) or in a bar at the bottom (phones).
 * Server-rendered, so links shared on Facebook show the title and preview.
 *
 * The id is read inside `<Suspense>` (Partial Prefetching shares one App Shell across listing
 * URLs). A missing or hidden listing therefore streams the not-found page with HTTP 200 and a
 * `noindex` tag, as Next.js documents for Cache Components; a true 404 would need a database
 * lookup in the proxy on every request.
 */
export default function ListingPage(props: PageProps<'/[lang]/listings/[id]'>) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-10 w-2/3 animate-pulse rounded-xl bg-surface-3" />
            <div className="h-[min(62vh,34rem)] animate-pulse rounded-3xl bg-surface-3" />
          </div>
        }
      >
        <ListingContent params={props.params} />
      </Suspense>
    </div>
  );
}

async function ListingContent({ params }: Pick<PageProps<'/[lang]/listings/[id]'>, 'params'>) {
  const { id } = await params;
  const page = await getListingPage(id);
  if (!page) notFound();
  const { locale, t } = await getI18n();
  const { listing, photos, model, seller } = page;

  const url = listingUrl(locale, listing.id);
  const district = districtById(listing.district_id);
  const post = formatListingPost(
    {
      type: listing.type,
      price: listing.price,
      currency: listing.currency,
      rooms: listing.rooms,
      areaM2: listing.area_official_m2 ?? listing.area_scanned_m2,
      pricePerM2: page.pricePerM2,
      districtName: district ? placeName(district, locale) : null,
      cityName: cityName(listing.city_id, locale),
      complexName: listing.complex_name,
      has3d: model !== null,
      url,
    },
    locale,
  );
  const live = listing.status === 'published';
  const search = (changes: Parameters<typeof searchQuery>[1]) =>
    `${localePath(locale, '/search')}${searchQuery(DEFAULT_FILTERS, changes)}`;

  return (
    <article className="space-y-6">
      <ViewCounter listingId={listing.id} />

      {!live && (
        <p className="rounded-2xl bg-primary px-5 py-4 font-medium text-on-primary">
          {listing.type === 'sale' ? t('listingPage.sold') : t('listingPage.rented')}
        </p>
      )}
      {live && !page.freshness.fresh && (
        <p className="rounded-2xl bg-accent-subtle px-5 py-4 text-on-accent-soft">
          {t('listingPage.stale', { days: LISTING_FRESHNESS.confirmEveryDays })}
        </p>
      )}

      <header className="space-y-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
          <Link href={search({ type: listing.type })} className="hover:text-fg hover:underline">
            {t(`search.titles.${listing.type}`)}
          </Link>
          {district && (
            <>
              <ChevronRightIcon className="size-3.5 text-fg-subtle" />
              <Link
                href={search({ type: listing.type, districts: [district.slug] })}
                className="hover:text-fg hover:underline"
              >
                {placeName(district, locale)}
              </Link>
            </>
          )}
        </nav>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>{t(`listingPage.types.${listing.type}`)}</Badge>
          {model && (
            <Badge tone="navy">
              <CubeIcon className="size-4" />
              {t('listingPage.has3d')}
            </Badge>
          )}
          {listing.scan_verified && (
            <Badge tone="accent" title={t('listingPage.scanVerifiedHint')}>
              <VerifiedIcon className="size-4" />
              {t('listingPage.scanVerified')}
            </Badge>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {listing.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <PinIcon className="size-4" />
            {locationLine(listing, locale, t)}
          </span>
          {page.freshness.daysAgo !== null && (
            <span className="text-sm text-fg-subtle">{updatedText(page.freshness.daysAgo, t)}</span>
          )}
        </p>
      </header>

      <ListingMedia locale={locale} photos={photos} model={model} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* First on phones (right under the photos), beside the content on wide screens. */}
        <aside className="lg:order-last">
          <div className="space-y-5 rounded-3xl bg-surface p-5 ring-1 ring-line lg:sticky lg:top-20 lg:shadow-xl lg:shadow-primary/5">
            <PriceBlock page={page} locale={locale} t={t} />
            <div className="border-t border-line pt-5">
              <SellerSummary seller={seller} ownerId={listing.owner_id} locale={locale} t={t} />
            </div>
            {live && <ContactButtons listingId={listing.id} locale={locale} />}
            <div className="grid grid-cols-2 gap-2">
              <FavoriteButton listingId={listing.id} locale={locale} variant="labeled" />
              <ShareActions post={post} url={url} locale={locale} />
            </div>
            {live && (
              <div className="border-t border-line pt-4 text-center">
                <ReportListing listingId={listing.id} ownerId={listing.owner_id} locale={locale} />
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <KeyFacts listing={listing} locale={locale} t={t} />
          <PriceComparisonCard page={page} locale={locale} t={t} />

          {listing.description && (
            <Card title={t('listingPage.sections.description')}>
              <p className="whitespace-pre-line leading-relaxed text-fg-2">{listing.description}</p>
            </Card>
          )}

          <Card title={t('listingPage.sections.details')}>
            <dl className="grid gap-x-8 sm:grid-cols-2">
              {listingFacts(listing, locale, t).map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4 border-b border-line py-2.5">
                  <dt className="text-fg-muted">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title={t('listingPage.sections.location')}>
            <div className="space-y-1.5 text-fg-2">
              <p className="font-medium">{locationLine(listing, locale, t)}</p>
              {listing.complex_name && <p>{listing.complex_name}</p>}
              {listing.address_text && (
                <p className="whitespace-pre-line text-fg-muted">{listing.address_text}</p>
              )}
            </div>
            {listing.public_lat !== null && listing.public_lng !== null && (
              <div className="mt-4 h-72 overflow-hidden rounded-2xl bg-surface-3">
                <LocationMap
                  lat={listing.public_lat}
                  lng={listing.public_lng}
                  exact={listing.show_exact_location}
                  locale={locale}
                />
              </div>
            )}
            {!listing.show_exact_location && (
              <p className="mt-2 text-sm text-fg-subtle">{t('listingPage.approximateLocation')}</p>
            )}
          </Card>
        </div>
      </div>

      {/* Phones: price and the call button always at hand. */}
      {live && listing.price !== null && (
        <div
          data-bottom-bar
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold tracking-tight">
                {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
              </p>
              <p className="truncate text-xs text-fg-muted">
                {page.pricePerM2 !== null
                  ? formatPricePerArea(page.pricePerM2, listing.currency, locale)
                  : listingSummary(listing, locale, t)}
              </p>
            </div>
            <div className="w-[min(55%,15rem)]">
              <ContactButtons listingId={listing.id} locale={locale} variant="bar" />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function PriceBlock({ page, locale, t }: { page: ListingPageData; locale: Locale; t: Translator }) {
  const { listing } = page;
  if (listing.price === null) return null;
  return (
    <div className="space-y-1">
      <p className="text-3xl font-semibold tracking-tight">
        {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
      </p>
      <p className="text-sm text-fg-subtle">{formatMoney(listing.price, listing.currency)}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
        {listing.negotiable && (
          <span className="rounded-full bg-success-soft px-2.5 py-0.5 font-medium text-on-success-soft">
            {t('listingPage.negotiable')}
          </span>
        )}
        {page.pricePerM2 !== null && (
          <span className="text-fg-2">
            {t('listingPage.pricePerArea')}:{' '}
            <span className="font-medium">
              {formatPricePerArea(page.pricePerM2, listing.currency, locale)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** The few facts buyers compare first, as tiles. */
function KeyFacts({ listing, locale, t }: { listing: ListingRow; locale: Locale; t: Translator }) {
  const area = listing.area_official_m2 ?? listing.area_scanned_m2;
  const tiles: { icon: ReactNode; value: string; label: string }[] = [];
  if (listing.rooms !== null) {
    tiles.push({
      icon: <DoorIcon />,
      value: t('listingPage.roomsCount', { count: listing.rooms }),
      label: t('listingPage.facts.rooms'),
    });
  }
  if (area !== null) {
    tiles.push({
      icon: <AreaIcon />,
      value: formatArea(area, locale),
      label:
        listing.area_official_m2 !== null
          ? t('listingPage.facts.areaOfficial')
          : t('listingPage.facts.areaScanned'),
    });
  }
  if (listing.floor !== null) {
    tiles.push({
      icon: <StairsIcon />,
      value:
        listing.total_floors === null
          ? String(listing.floor)
          : t('listingPage.facts.floorOf', { floor: listing.floor, total: listing.total_floors }),
      label: t('listingPage.facts.floor'),
    });
  }
  if (listing.building_year !== null) {
    tiles.push({
      icon: <CalendarIcon />,
      value: String(listing.building_year),
      label: t('listingPage.facts.buildingYear'),
    });
  }
  if (listing.building_material) {
    tiles.push({
      icon: <BuildingIcon />,
      value: t(`listingForm.materials.${listing.building_material}`),
      label: t('listingPage.facts.material'),
    });
  }
  if (tiles.length === 0) return null;

  return (
    <section aria-label={t('listingPage.keyFacts')}>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent-subtle text-accent [&>svg]:size-5">
              {tile.icon}
            </span>
            <p className="mt-3 text-lg font-semibold tracking-tight">{tile.value}</p>
            <p className="text-xs text-fg-muted">{tile.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Price per m² against the district median, as two bars; only when the median exists. */
function PriceComparisonCard({
  page,
  locale,
  t,
}: {
  page: ListingPageData;
  locale: Locale;
  t: Translator;
}) {
  const district = districtById(page.listing.district_id);
  if (page.pricePerM2 === null || !page.districtMedian || !district) return null;
  const median = page.districtMedian.pricePerM2;
  const comparison = comparePrice(page.pricePerM2, median);
  const currency = page.listing.currency;
  const verdict =
    comparison.direction === 'same'
      ? t('listingPage.compareSame')
      : t(
          comparison.direction === 'below'
            ? 'listingPage.compareBelow'
            : 'listingPage.compareAbove',
          {
            percent: comparison.percent,
          },
        );
  const tone =
    comparison.direction === 'below'
      ? 'bg-success-soft text-on-success-soft'
      : comparison.direction === 'above'
        ? 'bg-accent-subtle text-on-accent-soft'
        : 'bg-surface-2 text-fg-2';

  const bar = (label: string, value: number, share: number, highlight: boolean) => (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={highlight ? 'font-medium' : 'text-fg-muted'}>{label}</span>
        <span className={highlight ? 'font-semibold' : 'text-fg-2'}>
          {formatPricePerArea(value, currency, locale)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${highlight ? 'bg-primary' : 'bg-line-2'}`}
          style={{ width: `${Math.max(4, share * 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <Card
      title={t('listingPage.compareTitle')}
      action={
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${tone}`}>{verdict}</span>
      }
    >
      <div className="space-y-4">
        {bar(t('listingPage.compareThis'), page.pricePerM2, comparison.listingShare, true)}
        {bar(
          t('listingPage.compareDistrict', { district: placeName(district, locale) }),
          median,
          comparison.medianShare,
          false,
        )}
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        {t('listingPage.compareBasis', { count: page.districtMedian.listingCount })}
      </p>
    </Card>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone = 'plain',
  title,
}: {
  children: ReactNode;
  tone?: 'plain' | 'accent' | 'navy';
  title?: string;
}) {
  const tones = {
    plain: 'bg-surface-3 text-fg-2',
    accent: 'bg-accent-subtle text-on-accent-soft',
    navy: 'bg-[#1a2b60] text-white [&>svg]:text-[#7fd0f3]',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function listingUrl(locale: Locale, id: string): string {
  return `${publicEnv.siteUrl}${localePath(locale, `/listings/${id}`)}`;
}

/** Who listed the apartment: initials, name, owner or (verified) agent, link to the agent page. */
function SellerSummary({
  seller,
  ownerId,
  locale,
  t,
}: {
  seller: ListingSeller;
  ownerId: string;
  locale: Locale;
  t: Translator;
}) {
  const name = seller.agencyName ?? seller.displayName ?? t('listingPage.seller.unnamed');
  const role = seller.isAgent
    ? seller.verifiedAgent
      ? t('listingPage.seller.verifiedAgent')
      : t('listingPage.seller.agent')
    : t('listingPage.seller.owner');
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  const body = (
    <>
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-on-accent-soft"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg-subtle">{t('listingPage.sections.seller')}</span>
        <span className="flex items-center gap-1 truncate font-semibold">
          {name}
          {seller.verifiedAgent && <VerifiedIcon className="size-4 shrink-0 text-accent" />}
        </span>
        <span className="block truncate text-sm text-fg-muted">
          {role}
          {seller.isAgent && seller.displayName && ` · ${seller.displayName}`}
        </span>
      </span>
    </>
  );
  if (!seller.isAgent) return <div className="flex items-center gap-3">{body}</div>;
  return (
    <Link
      href={localePath(locale, `/agents/${ownerId}`)}
      title={t('listingPage.seller.profile')}
      className="-m-2 flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-surface-2"
    >
      {body}
      <ChevronRightIcon className="size-4 shrink-0 text-fg-subtle" />
    </Link>
  );
}
