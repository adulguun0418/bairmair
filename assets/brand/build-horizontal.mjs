// Builds the horizontal logo (building mark left, "bairmair" wordmark right) from logo.svg's own
// paths, for places too short for the stacked logo (the web header). Each path in logo.svg mixes
// mark and wordmark subpaths; wordmark subpaths are the ones entirely below y = 340.
// Run: node assets/brand/build-horizontal.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUTS = ['assets/brand/logo-horizontal.svg', 'apps/web/public/brand/logo-horizontal.svg'];

/** Wordmark size relative to the stacked logo, and the gap between mark and wordmark. */
const WORD_SCALE = 1.4;
const GAP = 50;

// Bounding boxes in logo.svg's coordinates.
const MARK = { x0: 93.08, y0: 67.2, x1: 417.92, y1: 341.95 };
const WORD = { x0: 35.84, y0: 341.45, x1: 476.16, y1: 442.87 };

const source = readFileSync(join(root, 'assets/brand/logo.svg'), 'utf8');
const paths = [...source.matchAll(/<path fill="(#[0-9A-Fa-f]+)" d="([^"]+)"/g)].map((m) => {
  const mark = [];
  const word = [];
  for (const sub of m[2].split(/(?=M)/).map((s) => s.trim())) {
    const ys = sub
      .match(/-?\d+(\.\d+)?/g)
      .map(Number)
      .filter((_, i) => i % 2 === 1);
    (Math.min(...ys) >= 340 ? word : mark).push(sub);
  }
  return { fill: m[1], mark: mark.join(''), word: word.join('') };
});
if (paths.length !== 2) throw new Error(`expected 2 paths in logo.svg, found ${paths.length}`);

const r = (n) => Number(n.toFixed(2));
const markW = MARK.x1 - MARK.x0;
const height = MARK.y1 - MARK.y0;
const wordW = (WORD.x1 - WORD.x0) * WORD_SCALE;
const wordH = (WORD.y1 - WORD.y0) * WORD_SCALE;
const width = markW + GAP + wordW;

const group = (transform, key) =>
  `<g transform="${transform}">${paths.map((p) => `<path fill="${p.fill}" d="${p[key]}"/>`).join('')}</g>`;

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(width)} ${r(height)}" width="${r(width)}" height="${r(height)}">`,
  '<title>bairmair</title>',
  group(`translate(${-MARK.x0} ${-MARK.y0})`, 'mark'),
  group(
    `translate(${r(markW + GAP)} ${r((height - wordH) / 2)}) scale(${WORD_SCALE}) translate(${-WORD.x0} ${-WORD.y0})`,
    'word',
  ),
  '</svg>',
  '',
].join('\n');

for (const out of OUTPUTS) {
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), svg);
}
console.log(`${r(width)} x ${r(height)} (aspect ${(width / height).toFixed(3)})`);
