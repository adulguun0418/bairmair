import { districtById } from '@bairmair/db';
import {
  createTranslator,
  formatArea,
  formatListingPrice,
  isLocale,
  type Locale,
} from '@bairmair/i18n';
import { ImageResponse } from 'next/og';
import {
  badge,
  fill,
  HEADERS,
  loadFonts,
  MUTED,
  NAVY,
  OG_SIZE,
  planImage,
  Wordmark,
} from '@/lib/og-image';
import { getListingPage } from '@/server/listing-page';

// The preview Facebook and messengers show for a shared listing link. The cover photo leads
// (what the apartment looks like), with the floor plan as an inset for a scanned listing, and
// the price and basics in a panel beside it. Without photos, the plan takes the photo's place.
// Facebook does not accept SVG, so the plan is rasterized here.
//
// A route handler under /api rather than an `opengraph-image` file: the locale proxy skips
// /api, so the image URL has no `/mn` prefix (which the proxy would answer with a redirect).
// `?lang=en` picks English; Mongolian is the default.

const MEDIA = { width: 720, height: 630 };
const INSET = 250;
const INSET_PADDING = 16;

/**
 * The cover photo as a data URL, or null when it cannot be loaded in time. Fetched here rather
 * than by Satori, so a slow or missing photo falls back to the plan instead of failing the
 * whole image.
 */
async function loadPhoto(src: string): Promise<string | null> {
  try {
    const response = await fetch(src, { signal: AbortSignal.timeout(6000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request, { params }: RouteContext<'/api/og/listings/[id]'>) {
  const { id } = await params;
  const lang = new URL(request.url).searchParams.get('lang');
  const locale: Locale = isLocale(lang) ? lang : 'mn';
  const t = createTranslator(locale);
  const [page, fonts] = await Promise.all([getListingPage(id), loadFonts()]);
  const options = { ...OG_SIZE, fonts, headers: HEADERS };

  if (!page) {
    return new ImageResponse(
      <div style={{ ...fill, alignItems: 'center', justifyContent: 'center' }}>
        <Wordmark size={96} />
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
  const price =
    listing.price === null
      ? null
      : formatListingPrice(listing.price, listing.currency, listing.type, locale);
  const cover = photos[0] ? await loadPhoto(photos[0].src) : null;

  return new ImageResponse(
    <div style={fill}>
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: MEDIA.width,
          height: MEDIA.height,
          alignItems: 'center',
          justifyContent: 'center',
          background: cover ? '#dfe5ee' : '#eef3fa',
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser
          <img
            src={cover}
            width={MEDIA.width}
            height={MEDIA.height}
            alt=""
            style={{ objectFit: 'cover' }}
          />
        ) : model ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser
          <img
            src={planImage(model, MEDIA.height - 60)}
            width={MEDIA.height - 60}
            height={MEDIA.height - 60}
            alt=""
          />
        ) : (
          <Wordmark size={88} />
        )}
        {cover && model && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              left: 28,
              bottom: 28,
              width: INSET,
              height: INSET,
              padding: INSET_PADDING,
              borderRadius: 28,
              background: '#ffffff',
              boxShadow: '0 12px 32px rgba(14, 23, 51, 0.35)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser */}
            <img
              src={planImage(model, INSET - INSET_PADDING * 2)}
              width={INSET - INSET_PADDING * 2}
              height={INSET - INSET_PADDING * 2}
              alt=""
            />
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '44px 44px 40px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 24 }}>
            <span style={{ ...badge, background: '#e6ebf4', color: NAVY }}>
              {t(`listingPage.types.${listing.type}`)}
            </span>
            {model && (
              <span style={{ ...badge, background: NAVY, color: '#ffffff', fontWeight: 700 }}>
                3D
              </span>
            )}
          </div>
          {price && (
            <div
              style={{
                fontSize: price.length > 10 ? 50 : 60,
                fontWeight: 700,
                color: NAVY,
                lineHeight: 1.1,
              }}
            >
              {price}
            </div>
          )}
          {facts.length > 0 && <div style={{ fontSize: 34 }}>{facts.join(' · ')}</div>}
          {place && <div style={{ fontSize: 28, color: MUTED }}>{place}</div>}
          {listing.complex_name && (
            <div style={{ fontSize: 24, color: MUTED }}>{listing.complex_name}</div>
          )}
        </div>
        <Wordmark size={34} />
      </div>
    </div>,
    options,
  );
}
