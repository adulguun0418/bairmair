// Generates the map's price pin backgrounds (assets/map/pin*.png at 1x, 2x and 3x): rounded
// pills like the web map's, which draws them on a canvas at runtime. MapLibre stretches them
// around the label (`icon-text-fit`), so the base size is close to a typical label to keep the
// corners round. Run: node apps/mobile/scripts/pin-images.mjs
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'map');

/** Size in points, corner radius and border width. */
const WIDTH = 64;
const HEIGHT = 24;
const RADIUS = 10;
const BORDER = 1;

const PINS = {
  pin: { fill: '#ffffff', stroke: '#cfd6e3' },
  'pin-3d': { fill: '#1a2b60', stroke: '#1a2b60' },
};

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** Signed distance from (x, y) to a rounded rectangle centred at (cx, cy). */
function roundedRectDistance(x, y, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(x - cx) - (halfW - r);
  const qy = Math.abs(y - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(scale, fillHex, strokeHex) {
  const width = WIDTH * scale;
  const height = HEIGHT * scale;
  const fill = rgb(fillHex);
  const stroke = rgb(strokeHex);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = roundedRectDistance(
        x + 0.5,
        y + 0.5,
        width / 2,
        height / 2,
        width / 2,
        height / 2,
        RADIUS * scale,
      );
      const outer = Math.min(1, Math.max(0, 0.5 - d));
      const inner = Math.min(1, Math.max(0, 0.5 - (d + BORDER * scale)));
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(stroke[c] * (1 - inner) + fill[c] * inner);
      }
      rgba[i + 3] = Math.round(outer * 255);
    }
  }
  return png(width, height, rgba);
}

mkdirSync(out, { recursive: true });
for (const [name, { fill, stroke }] of Object.entries(PINS)) {
  for (const scale of [1, 2, 3]) {
    const file = join(out, `${name}${scale === 1 ? '' : `@${scale}x`}.png`);
    writeFileSync(file, draw(scale, fill, stroke));
    console.log(file);
  }
}
