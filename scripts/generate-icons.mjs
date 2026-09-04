/**
 * Generates the Reading Log icon set as real PNGs with no image dependencies.
 *
 * The mark is the app's motif in miniature: a stamp ring enclosing an index
 * card with a marigold spine strip. Shapes are evaluated analytically and
 * supersampled 4x4, so edges stay clean at 192px.
 *
 * Run: npm run icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const INK = [0x1b, 0x2a, 0x41];
const PAPER = [0xf1, 0xec, 0xdf];
const MARIGOLD = [0xc9, 0x8a, 0x2b];

const SAMPLES = 4;

/** Rounded-rect hit test in normalized (0..1) space. */
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Colour of the mark at a normalized point, painted back to front. */
function sample(x, y) {
  const d = Math.hypot(x - 0.5, y - 0.5);

  // Stamp ring.
  if (d <= 0.402 && d >= 0.365) return MARIGOLD;

  // Index card.
  const card = [0.28, 0.335, 0.72, 0.665];
  if (inRoundedRect(x, y, card[0], card[1], card[2], card[3], 0.022)) {
    // Spine strip down the left edge.
    if (x <= 0.337) return MARIGOLD;
    // Two ruled lines of unequal length, like a filled-in catalogue card.
    const line = (y0, xEnd) => y >= y0 && y <= y0 + 0.024 && x >= 0.375 && x <= xEnd;
    if (line(0.428, 0.675) || line(0.518, 0.6)) return INK;
    return PAPER;
  }

  return INK;
}

function renderRGB(size) {
  const rows = [];
  const step = 1 / (size * SAMPLES);
  for (let py = 0; py < size; py++) {
    // One byte of filter type (0 = none) per scanline, then RGB triplets.
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const c = sample(
            (px * SAMPLES + sx + 0.5) * step,
            (py * SAMPLES + sy + 0.5) * step
          );
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SAMPLES * SAMPLES;
      const o = 1 + px * 3;
      row[o] = Math.round(r / n);
      row[o + 1] = Math.round(g / n);
      row[o + 2] = Math.round(b / n);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(renderRGB(size), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-maskable-192.png", 192],
  ["public/icons/icon-maskable-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
  ["app/icon.png", 64],
];

const cache = new Map();
for (const [file, size] of targets) {
  if (!cache.has(size)) cache.set(size, encodePNG(size));
  const out = resolve(process.cwd(), file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, cache.get(size));
  console.log(`wrote ${file} (${size}x${size}, ${cache.get(size).length} bytes)`);
}
