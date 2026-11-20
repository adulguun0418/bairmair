import { renderFloorPlanSvg, type RoomModelV1 } from '@bairmair/room-model';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CARD_PLAN_THEME } from '@/lib/listing-plan';

// Shared by the Open Graph image routes (listings, shared scans): size, colours, fonts, the
// rasterizable floor plan and the wordmark. Rendered by Satori (next/og), not a browser.

/** Size Facebook recommends for link previews (1.91:1). */
export const OG_SIZE = { width: 1200, height: 630 };

export const NAVY = '#1a2b60';
export const SKY = '#199ed6';
export const MUTED = '#55607a';

/**
 * Noto Sans (from @fontsource/noto-sans 5.3.0, OFL), one family per subset: Latin, Latin
 * Extended (₮), Cyrillic and Cyrillic Extended (Ө, Ү). Satori keeps one font per name and
 * weight, so subsets sharing a name would replace each other; with distinct names, the font
 * stack falls back per glyph.
 *
 * The files live in the app (`assets/og-fonts`, listed in `outputFileTracingIncludes`), not in
 * node_modules: on Vercel the package is deployed under pnpm's `.pnpm` store path only, without
 * the `node_modules/@fontsource` link, so reading it there failed with ENOENT.
 */
export const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'] as const;
export const FONT_STACK = SUBSETS.map((subset) => `Noto Sans ${subset}`).join(', ');

export async function loadFonts() {
  const dir = join(process.cwd(), 'assets', 'og-fonts');
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

/** The floor plan without labels (room names would need fonts inside the nested SVG). */
export function planImage(model: RoomModelV1, size: number): string {
  const svg = renderFloorPlanSvg(model, {
    theme: CARD_PLAN_THEME,
    size: { width: size, height: size },
    showHotspots: false,
    showObjects: false,
    paddingM: 0.3,
    wallThicknessM: 0.16,
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** Crawlers fetch the image once per share; a CDN may keep it for an hour. */
export const HEADERS = { 'Cache-Control': 'public, max-age=300, s-maxage=3600' };

/** "bairmair" in the logo's two colours. */
export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', fontSize: size, fontWeight: 700, letterSpacing: -1 }}>
      <span style={{ color: NAVY }}>bair</span>
      <span style={{ color: SKY }}>mair</span>
    </div>
  );
}

export const fill = {
  display: 'flex',
  width: '100%',
  height: '100%',
  background: '#f7f8fb',
  color: '#0e1733',
  fontFamily: FONT_STACK,
} as const;

export const badge = {
  display: 'flex',
  padding: '6px 18px',
  borderRadius: 999,
} as const;
