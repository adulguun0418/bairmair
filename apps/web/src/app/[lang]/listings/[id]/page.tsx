import { CITIES, districtById, LISTING_FRESHNESS } from '@bairmair/db';
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
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { ContactButtons } from '@/components/listing/ContactButtons';
import { ListingGallery } from '@/components/listing/ListingGallery';
import { ShareActions } from '@/components/listing/ShareActions';
import { ViewCounter } from '@/components/listing/ViewCounter';
import { ListingScene } from '@/components/ListingScene';
import { getI18n, localePath } from '@/lib/i18n';
import type { ListingPageData, ListingRow } from '@/lib/listing-view';
import { publicEnv } from '@/lib/public-env';
import { getListingPage } from '@/server/listing-page';

export async function generateMetadata({
  params,
}: PageProps<'/[lang]/listings/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const page = await getListingPage(id);
  if (!page) return {};
  const { locale, t } = await getI18n();
  const description = summaryLine(page.listing, locale, t);
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
 * The public page of a live listing: photos, the 3D model and floor plan, details, and the
 * seller's contact. Server-rendered, so links shared on Facebook show the title and preview.
 *
 * The id is read inside `<Suspense>` (Partial Prefetching shares one App Shell across listing
 * URLs). A missing or hidden listing therefore streams the not-found page with HTTP 200 and a
 * `noindex` tag, as Next.js documents for Cache Components; a true 404 would need a database
 * lookup in the proxy on every request.
 */
export default function ListingPage(props: PageProps<'/[lang]/listings/[id]'>) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-stone-200" />}>
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
      districtName: district ? districtName(district, locale) : null,
      cityName: cityName(listing.city_id, locale),
      complexName: listing.complex_name,
      has3d: model !== null,
      url,
    },
    locale,
  );
  const live = listing.status === 'published';
  const scenePhotos = photos.flatMap((photo) =>
    photo.roomId ? [{ id: photo.id, roomId: photo.roomId, src: photo.src }] : [],
  );

  return (
    <article className="space-y-8">
      <ViewCounter listingId={listing.id} />

      {!live && (
        <p className="rounded-2xl bg-stone-900 px-5 py-4 font-medium text-white">
          {listing.type === 'sale' ? t('listingPage.sold') : t('listingPage.rented')}
        </p>
      )}
      {live && !page.freshness.fresh && (
        <p className="rounded-2xl bg-amber-100 px-5 py-4 text-amber-950">
          {t('listingPage.stale', { days: LISTING_FRESHNESS.confirmEveryDays })}
        </p>
      )}

      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{t(`listingPage.types.${listing.type}`)}</Badge>
            {model && <Badge tone="accent">{t('listingPage.has3d')}</Badge>}
            {listing.scan_verified && (
              <Badge tone="accent" title={t('listingPage.scanVerifiedHint')}>
                {t('listingPage.scanVerified')}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{listing.title}</h1>
          <p className="text-stone-700">{summaryLine(listing, locale, t)}</p>
          <PriceBlock page={page} locale={locale} t={t} />
          {page.freshness.daysAgo !== null && (
            <p className="text-sm text-stone-500">{updatedText(page.freshness.daysAgo, t)}</p>
          )}
        </div>

        <aside className="space-y-4 self-start rounded-2xl bg-white p-5 shadow-sm">
          {live && <ContactButtons listingId={listing.id} locale={locale} />}
          <ShareActions post={post} url={url} locale={locale} />
          <div className="border-t border-stone-100 pt-4">
            <h2 className="text-sm text-stone-500">{t('listingPage.sections.seller')}</h2>
            <p className="mt-1 font-medium">
              {seller.agencyName ?? seller.displayName ?? t('listingPage.seller.unnamed')}
            </p>
            <p className="text-sm text-stone-600">
              {seller.isAgent
                ? seller.verifiedAgent
                  ? t('listingPage.seller.verifiedAgent')
                  : t('listingPage.seller.agent')
                : t('listingPage.seller.owner')}
              {seller.isAgent && seller.displayName && ` · ${seller.displayName}`}
            </p>
          </div>
        </aside>
      </header>

      <section aria-label={t('listingPage.sections.photos')}>
        <ListingGallery photos={photos} locale={locale} />
      </section>

      {model && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{t('listingPage.sections.model')}</h2>
          <ListingScene locale={locale} model={model} photos={scenePhotos} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {listing.description && (
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">
                {t('listingPage.sections.description')}
              </h2>
              <p className="whitespace-pre-line text-stone-800">{listing.description}</p>
            </section>
          )}
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">{t('listingPage.sections.location')}</h2>
            <LocationText listing={listing} locale={locale} t={t} />
          </section>
        </div>
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">{t('listingPage.sections.details')}</h2>
          <Facts listing={listing} locale={locale} t={t} />
        </section>
      </div>
    </article>
  );
}

function PriceBlock({ page, locale, t }: { page: ListingPageData; locale: Locale; t: Translator }) {
  const { listing } = page;
  if (listing.price === null) return null;
  const district = districtById(listing.district_id);
  return (
    <div className="space-y-1">
      <p className="text-3xl font-semibold">
        {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
        {listing.negotiable && (
          <span className="ml-3 align-middle text-base font-normal text-stone-600">
            {t('listingPage.negotiable')}
          </span>
        )}
      </p>
      <p className="text-sm text-stone-500">{formatMoney(listing.price, listing.currency)}</p>
      {page.pricePerM2 !== null && (
        <p className="text-sm text-stone-700">
          {t('listingPage.pricePerArea')}:{' '}
          {formatPricePerArea(page.pricePerM2, listing.currency, locale)}
          {page.districtMedian && district && (
            <span className="block text-stone-500">
              {t('listingPage.districtMedian', {
                district: districtName(district, locale),
                price: formatPricePerArea(page.districtMedian.pricePerM2, listing.currency, locale),
                count: page.districtMedian.listingCount,
              })}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function LocationText({
  listing,
  locale,
  t,
}: {
  listing: ListingRow;
  locale: Locale;
  t: Translator;
}) {
  const district = districtById(listing.district_id);
  const parts = [
    cityName(listing.city_id, locale),
    district && t('listingPage.district', { district: districtName(district, locale) }),
    listing.khoroo !== null && t('listingPage.khoroo', { khoroo: listing.khoroo }),
  ].filter(Boolean);
  return (
    <div className="space-y-2 text-stone-800">
      <p>{parts.join(', ')}</p>
      {listing.complex_name && <p className="font-medium">{listing.complex_name}</p>}
      {listing.address_text && <p className="whitespace-pre-line">{listing.address_text}</p>}
      {!listing.show_exact_location && (
        <p className="text-sm text-stone-500">{t('listingPage.approximateLocation')}</p>
      )}
    </div>
  );
}

function Facts({ listing, locale, t }: { listing: ListingRow; locale: Locale; t: Translator }) {
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
  return (
    <dl className="divide-y divide-stone-100">
      {rows
        .filter((row): row is [string, string] => Boolean(row[1]))
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-stone-600">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function Badge({
  children,
  tone = 'plain',
  title,
}: {
  children: ReactNode;
  tone?: 'plain' | 'accent';
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`rounded-full px-3 py-1 ${
        tone === 'accent' ? 'bg-amber-200 text-amber-950' : 'bg-stone-200 text-stone-800'
      }`}
    >
      {children}
    </span>
  );
}

/** "2 өрөө · 65 м² · Хан-Уул дүүрэг", for the header and the page description. */
function summaryLine(listing: ListingRow, locale: Locale, t: Translator): string {
  const district = districtById(listing.district_id);
  const area = listing.area_official_m2 ?? listing.area_scanned_m2;
  return [
    listing.rooms !== null && t('listingPage.roomsCount', { count: listing.rooms }),
    area !== null && formatArea(area, locale),
    district && t('listingPage.district', { district: districtName(district, locale) }),
    listing.complex_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

function updatedText(days: number, t: Translator): string {
  if (days === 0) return t('listingPage.updatedToday');
  if (days === 1) return t('listingPage.updatedYesterday');
  return t('listingPage.updatedDaysAgo', { count: days });
}

function districtName(district: { nameMn: string; nameEn: string }, locale: Locale): string {
  return locale === 'mn' ? district.nameMn : district.nameEn;
}

function cityName(cityId: number, locale: Locale): string {
  const city = CITIES.find((candidate) => candidate.id === cityId);
  if (!city) return '';
  return locale === 'mn' ? city.nameMn : city.nameEn;
}

function listingUrl(locale: Locale, id: string): string {
  return `${publicEnv.siteUrl}${localePath(locale, `/listings/${id}`)}`;
}
