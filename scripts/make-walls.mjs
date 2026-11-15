// Genera los sprites de los muros (el pack Kenney Medieval RTS no trae muros).
// Dibuja a 4× y reduce, para que los bordes salgan suavizados. Estilo plano con contorno,
// como el resto del arte. Uso: npm run walls
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';

const SIZE = 64; // igual que los sprites del pack (ART_SIZE)
const S = 4; // factor de supermuestreo
const W = SIZE * S;

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

class Canvas {
  constructor() {
    this.px = new Uint8Array(W * W * 4); // RGBA a 4×, transparente
  }
  fillPoly(points, color) {
    const pts = points.map(([x, y]) => [x * S, y * S]);
    const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
    const maxY = Math.min(W - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    const [r, g, b] = hex(color);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!inside(x + 0.5, y + 0.5, pts)) continue;
        const i = (y * W + x) * 4;
        this.px[i] = r;
        this.px[i + 1] = g;
        this.px[i + 2] = b;
        this.px[i + 3] = 255;
      }
    }
  }
  rect(x, y, w, h, color) {
    this.fillPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color);
  }
  /** Rectángulo con contorno de grosor t (en unidades de 64 px). */
  box(x, y, w, h, fill, line, t = 1.6) {
    this.rect(x, y, w, h, line);
    this.rect(x + t, y + t, w - 2 * t, h - 2 * t, fill);
  }
  /** Poste con punta: contorno y relleno. */
  post(x, top, w, bottom, fill, line, t = 1.6) {
    const shape = (dx, dy) => [[x + dx, top + 5 + dy], [x + w / 2, top + dy], [x + w - dx, top + 5 + dy], [x + w - dx, bottom - dy], [x + dx, bottom - dy]];
    this.fillPoly(shape(0, 0), line);
    this.fillPoly(shape(t, t), fill);
  }
  /** Reduce de 4× a 1× promediando (color ponderado por la opacidad). */
  toRgba() {
    const out = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let dy = 0; dy < S; dy++) {
          for (let dx = 0; dx < S; dx++) {
            const i = ((y * S + dy) * W + (x * S + dx)) * 4;
            const al = this.px[i + 3];
            r += this.px[i] * al;
            g += this.px[i + 1] * al;
            b += this.px[i + 2] * al;
            a += al;
          }
        }
        const o = (y * SIZE + x) * 4;
        if (a > 0) {
          out[o] = Math.round(r / a);
          out[o + 1] = Math.round(g / a);
          out[o + 2] = Math.round(b / a);
        }
        out[o + 3] = Math.round(a / (S * S));
      }
    }
    return out;
  }
}

function inside(px, py, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* ---- nivel 1: empalizada de madera ---- */
function palisade() {
  const c = new Canvas();
  const line = 0x7a4a22;
  const fill = 0xc88a4a;
  const light = 0xe0a96a;
  const tops = [23, 19, 21, 24, 20];
  tops.forEach((top, i) => {
    const x = 9 + i * 9.2;
    c.post(x, top, 9, 51, fill, line);
    c.rect(x + 2.6, top + 8, 1.8, 51 - top - 11, light);
  });
  c.box(8, 33, 48, 5, 0xa3693a, line, 1.2); // travesaño
  return c;
}

/* ---- nivel 2: muro de piedra con almenas ---- */
function stoneWall() {
  const c = new Canvas();
  const line = 0x6f7a7e;
  const fill = 0xb4bbbd;
  const brick = 0x8f999d;
  for (const x of [8, 27, 46]) c.box(x, 17, 10, 11, fill, line); // almenas
  c.box(8, 25, 48, 27, fill, line);
  for (const y of [34, 43]) c.rect(10, y, 44, 1, brick);
  for (const x of [20, 36, 48]) c.rect(x, 26.5, 1, 7.5, brick);
  for (const x of [14, 28, 42]) c.rect(x, 35, 1, 8, brick);
  for (const x of [22, 34, 46]) c.rect(x, 44, 1, 7, brick);
  return c;
}

/* ---- nivel 3: muro de castillo con remate rojo ---- */
function castleWall() {
  const c = new Canvas();
  const line = 0x5f6a6f;
  const fill = 0xc9ced0;
  const brick = 0x9aa3a7;
  const redLine = 0x9c3f2a;
  const red = 0xd9674b;
  for (const x of [6, 26, 46]) {
    c.box(x, 12, 12, 14, fill, line);
    c.box(x - 0.5, 9, 13, 5, red, redLine, 1.2); // tejadillo de cada torreta
  }
  c.box(6, 24, 52, 29, fill, line);
  c.box(6, 22, 52, 6, red, redLine, 1.2); // cenefa roja
  for (const y of [37, 46]) c.rect(8, y, 48, 1, brick);
  for (const x of [18, 34, 50]) c.rect(x, 29, 1, 8, brick);
  for (const x of [12, 26, 42, 54]) c.rect(x, 38, 1, 8, brick);
  for (const x of [20, 34, 48]) c.rect(x, 47, 1, 6, brick);
  return c;
}

mkdirSync('public/assets/art', { recursive: true });
for (const [name, make] of [['wall_1', palisade], ['wall_2', stoneWall], ['wall_3', castleWall]]) {
  writeFileSync(`public/assets/art/${name}.png`, encodePng(SIZE, SIZE, make().toRgba()));
  console.log(`public/assets/art/${name}.png`);
}
