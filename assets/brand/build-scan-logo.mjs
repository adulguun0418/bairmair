// Builds the bairmair scan wordmark "scan" ("sc" navy, "an" sky blue, like "bair" / "mair") in
// the style of logo.svg's wordmark: the same x-height, stroke width, round ends and spacing.
// The blue "a" is logo.svg's own; s, c and n are drawn as strokes with the same measurements.
// Writes the SVG, the app icon (1024 px, white, no alpha) and the splash image (transparent).
// Run: node assets/brand/build-scan-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const NAVY = '#1A2B60';
const BLUE = '#199ED6';

// logo.svg's wordmark measurements (its own coordinates).
const TOP = 377.6; // x-height top (outer edge)
const BASE = 442.87; // baseline (outer edge)
const STROKE = 12.05; // stem width of i, r, a
const HALF = STROKE / 2;
const GAP = 7; // typical space between letters
const C_TOP = TOP + HALF; // stroke centre lines
const C_BASE = BASE - HALF;
const MID = (TOP + BASE) / 2; // 410.23, the bowl centre of "a"

// The blue "a" from logo.svg: outer shape + counter, x 346.62–409.38.
const source = readFileSync(join(root, 'assets/brand/logo.svg'), 'utf8');
const blue = source.match(new RegExp(`<path fill="${BLUE}" d="([^"]+)"`, 'i'))[1];
const A_X0 = 346.62;
const A_X1 = 409.38;
const aPath = blue
  .split(/(?=M)/)
  .map((s) => s.trim())
  .filter((sub) => {
    const n = sub.match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    return (
      Math.min(...xs) >= A_X0 - 0.1 && Math.max(...xs) <= A_X1 + 0.1 && Math.min(...ys) >= TOP - 0.1
    );
  })
  .join('');

const r = (n) => Number(n.toFixed(2));
const pt = (x, y) => `${r(x)} ${r(y)}`;
const polar = (cx, cy, rx, ry, deg) => {
  const t = (deg * Math.PI) / 180;
  return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
};

// Letters as centre-line strokes, each starting at x = 0 (outer edge); returns { d, width }.

/** "s": two stacked bowls, the lower one a little larger, like geometric rounded faces. */
function letterS() {
  const rx = 18.5;
  const ryTop = 12.6;
  const ryBottom = (C_BASE - C_TOP - 2 * ryTop) / 2; // the rest of the height, ~14.0
  const rxBottom = rx + 1.5;
  const cx = HALF + rxBottom;
  const cyTop = C_TOP + ryTop;
  const join = C_TOP + 2 * ryTop;
  const cyBottom = join + ryBottom;
  const start = polar(cx, cyTop, rx, ryTop, -30);
  const end = polar(cx, cyBottom, rxBottom, ryBottom, 150);
  const d = [
    `M${pt(...start)}`,
    `A${r(rx)} ${r(ryTop)} 0 1 0 ${pt(cx, join)}`,
    `A${r(rxBottom)} ${r(ryBottom)} 0 1 1 ${pt(...end)}`,
  ].join('');
  return { d, width: 2 * (rxBottom + HALF) };
}

/** "c": the bowl of "a" opened on the right, round ends. */
function letterC() {
  const rx = 25.2;
  const ry = MID - C_TOP;
  const cx = HALF + rx;
  const open = 42; // degrees above and below the horizontal left open
  const start = polar(cx, MID, rx, ry, -open);
  const end = polar(cx, MID, rx, ry, open);
  const d = `M${pt(...start)}A${r(rx)} ${r(ry)} 0 1 0 ${pt(...end)}`;
  // Width to the end caps' outer edge.
  return { d, width: end[0] + HALF };
}

/** "n": a stem and an arch, as the humps of "m" but as wide as the bowl of "a". */
function letterN() {
  const span = 50; // between the stems' centre lines
  const rx = span / 2;
  const ry = 23;
  const left = HALF;
  const right = left + span;
  const cy = C_TOP + ry;
  const d = [
    `M${pt(left, C_BASE)}`,
    `L${pt(left, cy)}`,
    `A${r(rx)} ${r(ry)} 0 0 1 ${pt(right, cy)}`,
    `L${pt(right, C_BASE)}`,
  ].join('');
  return { d, width: span + STROKE };
}

const s = letterS();
const c = letterC();
const n = letterN();
const aWidth = A_X1 - A_X0;

// Positions (outer left edges). Round letters sit a little closer, as in "bairmair".
const xS = 0;
const xC = xS + s.width + GAP - 1;
const xA = xC + c.width + GAP + 1;
const xN = xA + aWidth + GAP + 1;
const WIDTH = xN + n.width;
const HEIGHT = BASE - TOP;

const stroke = (color, d, x) =>
  `<path transform="translate(${r(x)} 0)" d="${d}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The wordmark as an SVG group in a WIDTH × HEIGHT box starting at (0, 0). */
const wordmark = [
  `<g transform="translate(0 ${-TOP})">`,
  stroke(NAVY, s.d, xS),
  stroke(NAVY, c.d, xC),
  `<path transform="translate(${r(xA - A_X0)} 0)" fill="${BLUE}" d="${aPath}"/>`,
  stroke(BLUE, n.d, xN),
  '</g>',
].join('');

function svgDoc({ size, background, scaleOf }) {
  if (!size) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(WIDTH)} ${r(HEIGHT)}" width="${r(WIDTH)}" height="${r(HEIGHT)}">`,
      '<title>bairmair scan</title>',
      wordmark,
      '</svg>',
      '',
    ].join('\n');
  }
  const scale = (size * scaleOf) / WIDTH;
  const x = (size - WIDTH * scale) / 2;
  const y = (size - HEIGHT * scale) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
    background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '',
    `<g transform="translate(${r(x)} ${r(y)}) scale(${scale.toFixed(4)})">${wordmark}</g>`,
    '</svg>',
    '',
  ].join('\n');
}

writeFileSync(join(root, 'assets/brand/scan-logo.svg'), svgDoc({}));

// sharp comes with Next.js (apps/web); it is not a direct dependency of the repo.
const requireFromWeb = createRequire(join(root, 'apps/web/package.json'));
const requireFromNext = createRequire(requireFromWeb.resolve('next/package.json'));
const sharp = requireFromNext('sharp');

// App icon: white, no transparency (App Store), the word across ~70% (iOS rounds the corners).
await sharp(Buffer.from(svgDoc({ size: 1024, background: '#FFFFFF', scaleOf: 0.7 })))
  .flatten({ background: '#FFFFFF' })
  .removeAlpha()
  .png()
  .toFile(join(root, 'apps/scan/assets/images/icon.png'));

// Splash: transparent over the white splash background; shown 200 pt wide (app.json).
await sharp(Buffer.from(svgDoc({ size: 1024, scaleOf: 0.92 })))
  .png()
  .toFile(join(root, 'apps/scan/assets/images/splash-icon.png'));

console.log(`${r(WIDTH)} x ${r(HEIGHT)} (aspect ${(WIDTH / HEIGHT).toFixed(3)})`);
