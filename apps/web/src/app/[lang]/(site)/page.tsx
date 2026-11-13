import { districtById, DISTRICTS } from '@bairmair/db';
import { formatArea, formatListingPrice, type Locale, type Translator } from '@bairmair/i18n';
import { computeMetrics, renderFloorPlanSvg, type RoomModelV1 } from '@bairmair/room-model';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { HeroSearch } from '@/components/home/HeroSearch';
import { HeroShowcase, type ShowcaseListing } from '@/components/home/HeroShowcase';
import {
  AreaIcon,
  ArrowRightIcon,
  CubeIcon,
  PlanIcon,
  PlusIcon,
  ScanIcon,
  SparkleIcon,
} from '@/components/icons';
import { ListingGrid } from '@/components/listing/ListingCard';
import { getI18n, localePath } from '@/lib/i18n';
import { CARD_PLAN_THEME } from '@/lib/listing-plan';
import { publicEnv } from '@/lib/public-env';
import { getSample } from '@/lib/samples';
import { DEFAULT_FILTERS, searchQuery } from '@bairmair/browse';
import { getListingPage } from '@/server/listing-page';
import { searchListings } from '@/server/search';

/** Main districts offered as shortcuts (the outlying ones are in the search filters). */
const CENTRAL_DISTRICTS = DISTRICTS.slice(0, 6);

/** The newest 3D listings: one query for the hero and the "new 3D listings" row (one cache entry). */
const NEWEST_3D = { p_has_3d: true, p_sort: 'newest', p_limit: 4 } as const;

/** Shown in the hero when no live listing has a scan yet. */
const HERO_SAMPLE = 'two-room';
const HERO_MIN_ROOMS = 2;

/**
 * Home: a hero with the search box beside a scanned apartment turning in 3D, how scanning
 * works, the newest listings, districts, and a call to sellers. The parts that read listings
 * stream in (search results are cached for a minute only, so they are not part of the
 * prerendered shell); everything else shows at once.
 */
export default async function HomePage() {
  const { locale, t } = await getI18n();
  const search = (query: string) => `${localePath(locale, '/search')}${query}`;

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        {/* Background: a fading blueprint grid and two soft glows in the brand blue. */}
        <div
          aria-hidden
          className="absolute inset-0 text-primary bg-blueprint [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute -right-40 -top-40 size-[36rem] rounded-full bg-brand/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-48 -left-32 size-[28rem] rounded-full bg-brand/10 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pb-24 lg:pt-20">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full bg-surface/80 px-3 py-1.5 text-sm font-medium text-fg-2 shadow-sm ring-1 ring-line backdrop-blur">
              <SparkleIcon className="size-4 text-brand" />
              {t('home.heroBadge')}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t('home.heroTitleBefore')}
              <span className="whitespace-nowrap bg-gradient-to-r from-brand to-primary bg-clip-text text-transparent">
                {t('home.heroTitleAccent')}
              </span>
              {t('home.heroTitleAfter')}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-fg-muted">{t('home.heroBody')}</p>
            <HeroSearch locale={locale} t={t} />
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
              <Perk icon={<AreaIcon />}>{t('home.perkAreas')}</Perk>
              <Perk icon={<PlanIcon />}>{t('home.perkPlan')}</Perk>
              <Perk icon={<CubeIcon />}>{t('home.perkAnyDevice')}</Perk>
            </ul>
          </div>

          <Suspense fallback={<ShowcaseSkeleton />}>
            <HeroFeature locale={locale} t={t} />
          </Suspense>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16">
        <HowItWorks t={t} />

        <Suspense fallback={<ListingsSkeleton />}>
          <HomeListings locale={locale} t={t} />
        </Suspense>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight">{t('home.districtsTitle')}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CENTRAL_DISTRICTS.map((district, index) => (
              <li key={district.slug}>
                <Link
                  href={search(searchQuery({ ...DEFAULT_FILTERS, districts: [district.slug] }))}
                  className="group relative flex h-28 flex-col justify-between overflow-hidden rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 hover:ring-accent"
                >
                  <span
                    aria-hidden
                    className="absolute -right-6 -top-6 size-24 rounded-full bg-brand/10 transition group-hover:scale-125 group-hover:bg-brand/20"
                    style={{ opacity: 0.6 + (index % 3) * 0.2 }}
                  />
                  <span className="relative font-semibold">
                    {locale === 'mn' ? district.nameMn : district.nameEn}
                  </span>
                  <span className="relative inline-flex items-center gap-1 text-sm text-fg-muted group-hover:text-accent">
                    {t('home.districtCta')}
                    <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <SellBand locale={locale} t={t} />
      </div>
    </>
  );
}

function Perk({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className="text-accent [&>svg]:size-[18px]">{icon}</span>
      {children}
    </li>
  );
}

/**
 * The hero's 3D model: the most complete of the newest scanned listings (most rooms, then the
 * largest), or a sample when none has at least two rooms (a single partial room looks broken).
 */
async function HeroFeature({ locale, t }: { locale: Locale; t: Translator }) {
  const { rows } = await searchListings(NEWEST_3D);
  const pages = await Promise.all(rows.map((row) => getListingPage(row.id)));
  const best = rows
    .map((row, index) => ({ row, model: pages[index]?.model ?? null }))
    .filter((entry): entry is { row: typeof entry.row; model: RoomModelV1 } =>
      Boolean(entry.model && entry.model.rooms.length >= HERO_MIN_ROOMS),
    )
    .sort(
      (a, b) =>
        b.model.rooms.length - a.model.rooms.length ||
        computeMetrics(b.model).totalAreaM2 - computeMetrics(a.model).totalAreaM2,
    )[0];

  if (best) {
    const { row, model } = best;
    const district = districtById(row.district_id);
    const area = row.area_official_m2 ?? row.area_scanned_m2;
    const facts = [
      t('listingPage.roomsCount', { count: row.rooms }),
      area !== null && formatArea(area, locale),
      district && (locale === 'mn' ? district.nameMn : district.nameEn),
    ]
      .filter(Boolean)
      .join(' · ');
    const listing: ShowcaseListing = {
      href: localePath(locale, `/listings/${row.id}`),
      price: formatListingPrice(row.price, row.currency, row.type, locale),
      facts,
    };
    return <Showcase locale={locale} model={model} listing={listing} />;
  }
  return <Showcase locale={locale} model={getSample(HERO_SAMPLE).model} listing={null} />;
}

function Showcase({
  locale,
  model,
  listing,
}: {
  locale: Locale;
  model: RoomModelV1;
  listing: ShowcaseListing | null;
}) {
  // Photo markers belong on the listing page; the hero shows rooms only.
  const bare: RoomModelV1 = { ...model, hotspots: [] };
  const planSvg = renderFloorPlanSvg(bare, {
    theme: CARD_PLAN_THEME,
    showHotspots: false,
    showObjects: false,
    paddingM: 0.3,
    wallThicknessM: 0.16,
  });
  return (
    <HeroShowcase
      locale={locale}
      model={bare}
      planSvg={planSvg}
      listing={listing}
      sampleHref={localePath(locale, `/samples/${HERO_SAMPLE}`)}
    />
  );
}

function ShowcaseSkeleton() {
  return (
    <div className="h-[24rem] animate-pulse rounded-[2rem] bg-surface-3 sm:h-[30rem] lg:h-[34rem]" />
  );
}

function HowItWorks({ t }: { t: Translator }) {
  const steps = [
    { icon: <ScanIcon />, title: t('home.stepScanTitle'), body: t('home.stepScanBody') },
    { icon: <PlanIcon />, title: t('home.stepPlanTitle'), body: t('home.stepPlanBody') },
    { icon: <CubeIcon />, title: t('home.step3dTitle'), body: t('home.step3dBody') },
  ];
  return (
    <section className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('home.howTitle')}</h2>
        <p className="text-fg-muted">{t('home.howBody')}</p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="relative overflow-hidden rounded-3xl bg-surface p-6 ring-1 ring-line"
          >
            <span
              aria-hidden
              className="absolute -right-2 -top-6 text-[7rem] font-bold leading-none text-surface-2 select-none"
            >
              {index + 1}
            </span>
            <span className="relative flex size-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent [&>svg]:size-6">
              {step.icon}
            </span>
            <h3 className="relative mt-5 text-lg font-semibold">{step.title}</h3>
            <p className="relative mt-1.5 text-sm leading-relaxed text-fg-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

async function HomeListings({ locale, t }: { locale: Locale; t: Translator }) {
  const search = (query: string) => `${localePath(locale, '/search')}${query}`;
  const [with3d, newest] = await Promise.all([
    searchListings(NEWEST_3D),
    searchListings({ p_sort: 'newest', p_limit: 8 }),
  ]);
  const supabaseUrl = publicEnv.supabaseUrl;
  return (
    <>
      {with3d.rows.length > 0 && (
        <section className="space-y-6">
          <Heading
            title={t('home.latest3d')}
            href={search(searchQuery({ ...DEFAULT_FILTERS, has3d: true, sort: 'newest' }))}
            more={t('home.seeAll')}
            icon={<CubeIcon />}
          />
          <ListingGrid cards={with3d.rows} locale={locale} supabaseUrl={supabaseUrl} />
        </section>
      )}

      <section className="space-y-6">
        <Heading
          title={t('home.latest')}
          href={search(searchQuery({ ...DEFAULT_FILTERS, sort: 'newest' }))}
          more={t('home.seeAll')}
        />
        {newest.rows.length === 0 ? (
          <p className="text-fg-muted">{t('home.empty')}</p>
        ) : (
          <ListingGrid cards={newest.rows} locale={locale} supabaseUrl={supabaseUrl} />
        )}
      </section>
    </>
  );
}

/** Card-shaped placeholders while the listings load. */
function ListingsSkeleton() {
  return (
    <section className="space-y-6" aria-hidden>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-3" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-3xl bg-surface-3" />
        ))}
      </div>
    </section>
  );
}

function Heading({
  title,
  href,
  more,
  icon,
}: {
  title: string;
  href: string;
  more: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight sm:text-2xl">
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-subtle text-accent [&>svg]:size-5">
            {icon}
          </span>
        )}
        {title}
      </h2>
      <Link
        href={href}
        className="group inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-line transition hover:bg-surface hover:ring-line-2"
      >
        {more}
        <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** For sellers: a navy band with the call to add a listing. */
function SellBand({ locale, t }: { locale: Locale; t: Translator }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-[#1a2b60] px-6 py-10 text-white sm:px-10 sm:py-14">
      <div
        aria-hidden
        className="absolute inset-0 text-white opacity-40 bg-blueprint [mask-image:linear-gradient(to_left,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute -right-24 -top-24 size-80 rounded-full bg-[#199ed6]/40 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('home.sellTitle')}
          </h2>
          <p className="text-white/75">{t('home.sellBody')}</p>
        </div>
        <Link
          href={localePath(locale, '/my-listings/new')}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-[#1a2b60] transition hover:bg-[#eaf6fd]"
        >
          <PlusIcon className="size-5" />
          {t('home.sellCta')}
        </Link>
      </div>
    </section>
  );
}
