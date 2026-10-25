// Генерирует build/icon.png (512x512) без внешних зависимостей.
// electron-builder сам превращает его в .ico (Windows) и .icns (macOS).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 512;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const cover = (d) => clamp(0.5 - d); // d — знаковое расстояние в пикселях, <0 внутри
const mix = (a, b, t) => a + (b - a) * t;

function sdRoundBox(x, y, half, r) {
  const qx = Math.abs(x - N / 2) - (half - r);
  const qy = Math.abs(y - N / 2) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0; // фильтр строки: none
  for (let x = 0; x < N; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = (px + py) / (2 * N);
    let r = mix(0x8b, 0x2f, t), g = mix(0x6c, 0x7b, t), b = 0xff;
    const base = cover(sdRoundBox(px, py, 240, 112));
    const dist = Math.hypot(px - N / 2, py - N / 2);
    const ring = cover(Math.abs(dist - 118) - 17);
    const dot = cover(dist - 40);
    const white = Math.max(ring, dot);
    r = mix(r, 255, white); g = mix(g, 255, white); b = mix(b, 255, white);
    const o = y * (N * 4 + 1) + 1 + x * 4;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = Math.round(base * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('icon written:', out, png.length, 'bytes');
