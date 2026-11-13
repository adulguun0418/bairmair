import { districtById } from '@bairmair/db';
import {
  createTranslator,
  formatArea,
  formatListingPrice,
  isLocale,
  type Locale,
} from '@bairmair/i18n';
import { renderFloorPlanSvg } from '@bairmair/room-model';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getListingPage } from '@/server/listing-page';

// The preview Facebook and messengers show for a shared listing link: the floor plan (or the
// cover photo when there is no scan) beside the price and the basics. Facebook does not accept
// SVG, so the plan is rasterized here.
//
// A route handler under /api rather than an `opengraph-image` file: the locale proxy skips
// /api, so the image URL has no `/mn` prefix (which the proxy would answer with a redirect).
// `?lang=en` picks English; Mongolian is the default.

/** Size Facebook recommends for link previews. */
const OG_SIZE = { width: 1200, height: 630 };
const PLAN = { width: 630, height: 630 };

/**
 * Noto Sans from @fontsource, one family per subset: Latin, Latin Extended (₮), Cyrillic and
 * Cyrillic Extended (Ө, Ү). Satori keeps one font per name and weight, so subsets sharing a
 * name would replace each other; with distinct names, the font stack falls back per glyph.
 */
const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'] as const;
const FONT_STACK = SUBSETS.map((subset) => `Noto Sans ${subset}`).join(', ');

async function loadFonts() {
  const dir = join(process.cwd(), 'node_modules', '@fontsource', 'noto-sans', 'files');
  const weights = [400, 700] as const;
  return Promise.all(
    weights.flatMap((weight) =>
      SUBSETS.map(async (subset) => ({
        name: `Noto Sans ${subset}`,
        data: await readFile(join(dir, `noto-sans-${subset}-${weight}-normal.woff`)),
        weight,
        style: 'normal' as const,
      })),
    ),
  );
}

/** Crawlers fetch the image once per share; a CDN may keep it for an hour. */
const HEADERS = { 'Cache-Control': 'public, max-age=300, s-maxage=3600' };

export async function GET(request: Request, { params }: RouteContext<'/api/og/listings/[id]'>) {
  const { id } = await params;
  const lang = new URL(request.url).searchParams.get('lang');
  const locale: Locale = isLocale(lang) ? lang : 'mn';
  const t = createTranslator(locale);
  const [page, fonts] = await Promise.all([getListingPage(id), loadFonts()]);
  const options = { ...OG_SIZE, fonts, headers: HEADERS };

  if (!page) {
    return new ImageResponse(
      <div style={{ ...fill, alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>
        {t('app.name')}
      </div>,
      { ...options, status: 404 },
    );
  }

  const { listing, model, photos } = page;
  const district = districtById(listing.district_id);
  const area = listing.area_official_m2 ?? listing.area_scanned_m2;
  const facts = [
    listing.rooms !== null && t('listingPage.roomsCount', { count: listing.rooms }),
    area !== null && formatArea(area, locale),
  ].filter(Boolean);
  const place = district
    ? t('listingPage.district', { district: locale === 'mn' ? district.nameMn : district.nameEn })
    : null;

  // Without labels: room names would need fonts inside the nested SVG. The text sits beside it.
  const plan = model
    ? `data:image/svg+xml;base64,${Buffer.from(
        renderFloorPlanSvg(model, { size: PLAN, showHotspots: false, paddingM: 0.6 }),
      ).toString('base64')}`
    : null;
  const cover = photos[0]?.src ?? null;

  return new ImageResponse(
    <div style={fill}>
      <div
        style={{
          display: 'flex',
          width: PLAN.width,
          height: PLAN.height,
          background: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {plan ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser
          <img src={plan} width={PLAN.width} height={PLAN.height} alt="" />
        ) : cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser
          <img
            src={cover}
            width={PLAN.width}
            height={PLAN.height}
            alt=""
            style={{ objectFit: 'cover' }}
          />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 52px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 26 }}>
            <span style={badge}>{t(`listingPage.types.${listing.type}`)}</span>
            {model && <span style={{ ...badge, background: '#fde68a' }}>3D</span>}
          </div>
          {listing.price !== null && (
            <div style={{ fontSize: 64, fontWeight: 700 }}>
              {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
            </div>
          )}
          {facts.length > 0 && <div style={{ fontSize: 36 }}>{facts.join(' · ')}</div>}
          {place && <div style={{ fontSize: 32, color: '#57534e' }}>{place}</div>}
          {listing.complex_name && (
            <div style={{ fontSize: 28, color: '#57534e' }}>{listing.complex_name}</div>
          )}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700 }}>{t('app.name')}</div>
      </div>
    </div>,
    options,
  );
}

const fill = {
  display: 'flex',
  width: '100%',
  height: '100%',
  background: '#f5f5f4',
  color: '#1c1917',
  fontFamily: FONT_STACK,
} as const;

const badge = {
  display: 'flex',
  padding: '6px 18px',
  borderRadius: 999,
  background: '#e7e5e4',
} as const;
