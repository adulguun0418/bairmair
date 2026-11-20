import { createTranslator, formatArea, formatDate, isLocale, type Locale } from '@bairmair/i18n';
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
import { getSharedScan } from '@/server/shared-scan-page';

// The preview messengers show for a shared bairmair scan link: the floor plan on white, and the
// total area beside it. Nothing about the owner. Under /api for the same reason as the listing
// image (no locale redirect); `?lang=en` picks English, `?v=` is ignored.

const PLAN = 630;

export async function GET(request: Request, { params }: RouteContext<'/api/og/s/[slug]'>) {
  const { slug } = await params;
  const lang = new URL(request.url).searchParams.get('lang');
  const locale: Locale = isLocale(lang) ? lang : 'mn';
  const t = createTranslator(locale);
  const [scan, fonts] = await Promise.all([getSharedScan(slug), loadFonts()]);
  const options = { ...OG_SIZE, fonts, headers: HEADERS };

  if (!scan) {
    return new ImageResponse(
      <div style={{ ...fill, alignItems: 'center', justifyContent: 'center' }}>
        <Wordmark size={96} />
      </div>,
      { ...options, status: 404 },
    );
  }

  const area = formatArea(scan.metrics.totalAreaM2, locale);
  return new ImageResponse(
    <div style={fill}>
      <div
        style={{
          display: 'flex',
          width: PLAN,
          height: PLAN,
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not a browser */}
        <img src={planImage(scan.model, PLAN - 60)} width={PLAN - 60} height={PLAN - 60} alt="" />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 48px 40px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 24 }}>
            <span style={{ ...badge, background: NAVY, color: '#ffffff', fontWeight: 700 }}>
              {t('sharedScan.title')}
            </span>
          </div>
          {scan.title && (
            <div style={{ fontSize: 40, fontWeight: 700, color: NAVY, lineHeight: 1.15 }}>
              {scan.title}
            </div>
          )}
          <div style={{ fontSize: scan.title ? 52 : 68, fontWeight: 700, color: NAVY }}>{area}</div>
          <div style={{ fontSize: 26, color: MUTED }}>{t('viewer.approximateScanned')}</div>
          <div style={{ fontSize: 24, color: MUTED }}>
            {t('sharedScan.scannedOn', { date: formatDate(scan.createdAt, locale) })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Wordmark size={34} />
          <span style={{ fontSize: 30, color: MUTED }}>scan</span>
        </div>
      </div>
    </div>,
    options,
  );
}
