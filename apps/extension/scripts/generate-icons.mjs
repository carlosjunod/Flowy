#!/usr/bin/env node
// Generate Flowy extension PNG icons using only Node built-ins.
// Produces a rounded-corner indigo square with a white "F" glyph at 16/32/48/128.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'icons');
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// RGBA pixel grid helpers.
function makeCanvas(size) {
  const pixels = new Uint8Array(size * size * 4); // transparent by default
  const at = (x, y) => (y * size + x) * 4;
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = at(x, y);
    pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = a;
  };
  return { pixels, set };
}

// Draw a rounded-rectangle background.
function drawRoundedRect({ set }, size, radius, rgb) {
  const r2 = radius * radius;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      // Corner carve-out
      if (x < radius && y < radius) {
        const dx = radius - 1 - x, dy = radius - 1 - y;
        if (dx * dx + dy * dy > r2) inside = false;
      } else if (x >= size - radius && y < radius) {
        const dx = x - (size - radius), dy = radius - 1 - y;
        if (dx * dx + dy * dy > r2) inside = false;
      } else if (x < radius && y >= size - radius) {
        const dx = radius - 1 - x, dy = y - (size - radius);
        if (dx * dx + dy * dy > r2) inside = false;
      } else if (x >= size - radius && y >= size - radius) {
        const dx = x - (size - radius), dy = y - (size - radius);
        if (dx * dx + dy * dy > r2) inside = false;
      }
      if (inside) set(x, y, rgb[0], rgb[1], rgb[2], 255);
    }
  }
}

// Draw a simple "F" letter as a white pixel block.
function drawF({ set }, size, rgb) {
  // Letter layout as fraction of size.
  const left = Math.round(size * 0.28);
  const right = Math.round(size * 0.72);
  const top = Math.round(size * 0.22);
  const bottom = Math.round(size * 0.78);
  const stroke = Math.max(1, Math.round(size * 0.13));
  const midY = Math.round(size * 0.48);

  // Vertical stem (left column).
  for (let y = top; y < bottom; y++)
    for (let x = left; x < left + stroke; x++)
      set(x, y, rgb[0], rgb[1], rgb[2], 255);

  // Top horizontal bar.
  for (let y = top; y < top + stroke; y++)
    for (let x = left; x < right; x++)
      set(x, y, rgb[0], rgb[1], rgb[2], 255);

  // Middle horizontal bar (shorter).
  const midRight = Math.round(size * 0.64);
  for (let y = midY; y < midY + stroke; y++)
    for (let x = left; x < midRight; x++)
      set(x, y, rgb[0], rgb[1], rgb[2], 255);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = chunk('IHDR', ihdr);

  // Prepend a filter byte (0 = None) to each scanline.
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.subarray(y * stride, (y + 1) * stride).forEach((v, i) => {
      raw[y * (stride + 1) + 1 + i] = v;
    });
  }
  const idat = chunk('IDAT', deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idat, iend]);
}

function renderIcon(size) {
  const canvas = makeCanvas(size);
  const radius = Math.max(2, Math.round(size * 0.22));
  drawRoundedRect(canvas, size, radius, [79, 70, 229]); // indigo-600
  drawF(canvas, size, [255, 255, 255]);
  return encodePng(size, canvas.pixels);
}

const SIZES = [16, 32, 48, 128];
for (const s of SIZES) {
  const png = renderIcon(s);
  const file = join(OUT, `icon-${s}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
