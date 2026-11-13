// Genera los iconos PNG de la PWA sin dependencias externas.
// Uso: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [27, 42, 27];
const CELL = [47, 74, 47];
const GOLD = [212, 160, 23];
const BROWN = [139, 90, 43];
const BLUE = [74, 111, 165];

// Mini cuadrícula de 3x3 centrada (dentro de la zona segura de iconos "maskable").
function pixel(u, v) {
  const start = 0.2;
  const cell = 0.2;
  const gap = 0.0133;
  const gx = (u - start) / cell;
  const gy = (v - start) / cell;
  if (gx < 0 || gy < 0 || gx >= 3 || gy >= 3) return BG;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  const fx = gx - cx;
  const fy = gy - cy;
  if (fx < gap / cell || fy < gap / cell) return BG;
  if (cx === 1 && cy === 1) return GOLD;
  if (cx === 0 && cy === 0) return BROWN;
  if (cx === 2 && cy === 2) return BLUE;
  return CELL;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, encodePng(size, pixel));
  console.log(`public/icons/icon-${size}.png`);
}
