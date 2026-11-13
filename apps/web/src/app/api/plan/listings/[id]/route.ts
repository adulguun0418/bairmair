import { createTranslator, formatArea, isLocale, roomDisplayName, type Locale } from '@bairmair/i18n';
import { renderFloorPlanSvg } from '@bairmair/room-model';
import { CARD_PLAN_THEME } from '@/lib/listing-plan';
import { getListingPage } from '@/server/listing-page';

// A listing's floor plan as an SVG image, for listing cards (shown over the cover photo).
// Under /api so the locale proxy leaves it alone; `?lang=en` labels rooms in English and
// `?thumb=1` leaves the labels out (for small insets, where they would be unreadable).

const HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  // Cards ask for it on every page view; the plan changes only with a new scan or room labels.
  'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  // Opened directly, the SVG is a document: no scripts, no outside requests.
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: Request, { params }: RouteContext<'/api/plan/listings/[id]'>) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const lang = query.get('lang');
  const thumb = query.get('thumb') === '1';
  const locale: Locale = isLocale(lang) ? lang : 'mn';
  const page = await getListingPage(id);
  if (!page?.model) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  }
  const t = createTranslator(locale);
  const svg = renderFloorPlanSvg(page.model, {
    theme: CARD_PLAN_THEME,
    showHotspots: false,
    showObjects: false,
    paddingM: 0.3,
    wallThicknessM: 0.14,
    text: thumb
      ? undefined
      : {
          roomName: (room) => roomDisplayName(t, room),
          area: (squareMeters) => formatArea(squareMeters, locale),
        },
  });
  return new Response(svg, { headers: HEADERS });
}
