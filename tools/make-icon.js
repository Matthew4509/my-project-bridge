// Draws the Bridge icon (a white bridge on a Windows-blue rounded square) and writes public/bridge.ico with
// 16, 24, 32, 48, 64 and 256 px images. No packages: shapes are drawn with 4x4 supersampling, stored as 32-bit BMPs.
// Run: node tools/make-icon.js   (the .ico is committed, so this only needs running if the design changes)
'use strict';
const fs = require('fs');
const path = require('path');

const BLUE = [0x00, 0x5f, 0xb8], WHITE = [255, 255, 255];

// Shapes in a 64x64 design space (the same drawing as the page's SVG icon).
function coverage(x, y) {
  // rounded square, radius 14
  const r = 14, cx = Math.min(Math.max(x, r), 64 - r), cy = Math.min(Math.max(y, r), 64 - r);
  const inBox = x >= 0 && x <= 64 && y >= 0 && y <= 64 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (!inBox) return null;
  const seg = (ax, ay, bx, by, w) => { // distance to a segment <= w/2
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= w / 2;
  };
  // deck, two towers, the arch (a quadratic curve from (8,30) over (32,18) to (56,30)), three hangers
  if (seg(8, 44, 56, 44, 5) || seg(14, 44, 14, 30, 5) || seg(50, 44, 50, 30, 5)) return WHITE;
  for (let i = 0; i < 24; i++) {
    const q = (t) => [(1 - t) ** 2 * 8 + 2 * (1 - t) * t * 32 + t * t * 56, (1 - t) ** 2 * 30 + 2 * (1 - t) * t * 12 + t * t * 30];
    const [ax, ay] = q(i / 24), [bx, by] = q((i + 1) / 24);
    if (seg(ax, ay, bx, by, 5)) return WHITE;
  }
  if (seg(24, 44, 24, 26, 3.5) || seg(32, 44, 32, 24, 3.5) || seg(40, 44, 40, 26, 3.5)) return WHITE;
  return BLUE;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4); // BGRA, bottom-up rows (BMP order)
  const S = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = coverage((x + (sx + 0.5) / S) * 64 / size, (y + (sy + 0.5) / S) * 64 / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const o = ((size - 1 - y) * size + x) * 4;
    if (a) { px[o] = Math.round(b / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(r / a); }
    px[o + 3] = Math.round(255 * a / (S * S));
  }
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14); header.writeUInt32LE(0, 16);
  header.writeUInt32LE(px.length, 20);
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, px, Buffer.alloc(maskRow * size)]); // AND mask all zero: alpha does the work
}

const sizes = [16, 24, 32, 48, 64, 256];
const images = sizes.map(render);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  dir.writeUInt8(s === 256 ? 0 : s, e); dir.writeUInt8(s === 256 ? 0 : s, e + 1);
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(images[i].length, e + 8); dir.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
const out = path.join(__dirname, '..', 'public', 'bridge.ico');
fs.writeFileSync(out, Buffer.concat([dir, ...images]));
console.log('wrote ' + out + ' (' + Math.round(offset / 1024) + ' KB, ' + sizes.join('/') + ' px)');
