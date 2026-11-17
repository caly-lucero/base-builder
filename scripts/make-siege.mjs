// Genera los sprites de las armas de asedio (el pack Kenney Medieval RTS no trae ninguna):
// la catapulta y el ariete. Mismo método que make-walls.mjs: dibuja a 4× y reduce para suavizar bordes.
// Uso: npm run siege
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';

const SIZE = 64; // igual que los sprites del pack (ART_SIZE)
const S = 4; // factor de supermuestreo
const W = SIZE * S;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

class Canvas {
  constructor() {
    this.px = new Uint8Array(W * W * 4);
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
  box(x, y, w, h, fill, line, t = 1.4) {
    this.rect(x, y, w, h, line);
    this.rect(x + t, y + t, w - 2 * t, h - 2 * t, fill);
  }
  circle(cx, cy, r, color) {
    const pts = [];
    for (let i = 0; i < 24; i++) pts.push([cx + Math.cos((i / 24) * Math.PI * 2) * r, cy + Math.sin((i / 24) * Math.PI * 2) * r]);
    this.fillPoly(pts, color);
  }
  /** Rueda: aro oscuro, madera y buje. */
  wheel(cx, cy, r) {
    this.circle(cx, cy, r, 0x3a2a1a);
    this.circle(cx, cy, r - 1.5, 0x9a6a3a);
    this.circle(cx, cy, r * 0.35, 0x3a2a1a);
  }
  /** Viga entre dos puntos, con contorno. */
  beam(x1, y1, x2, y2, width, fill, line) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    const quad = (k) => [[x1 + nx * k, y1 + ny * k], [x2 + nx * k, y2 + ny * k], [x2 - nx * k, y2 - ny * k], [x1 - nx * k, y1 - ny * k]];
    this.fillPoly(quad(1), line);
    this.fillPoly(quad(0.6), fill);
  }
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

const wood = 0xc88a4a;
const woodDark = 0x7a4a22;
const iron = 0xa9b1b5;
const ironDark = 0x5f6a6f;

/* ---- catapulta: bastidor con ruedas, brazo largo y una piedra en la cuchara ---- */
function catapult() {
  const c = new Canvas();
  c.box(10, 43, 44, 6, wood, woodDark); // base
  c.beam(22, 44, 28, 26, 5, wood, woodDark); // montantes
  c.beam(42, 44, 36, 26, 5, wood, woodDark);
  c.box(25, 24, 14, 4, 0xa3693a, woodDark, 1.2); // travesaño donde pivota el brazo
  c.beam(31, 30, 50, 12, 4.4, wood, woodDark); // brazo
  c.box(46, 8, 10, 6, 0x8a5a2a, woodDark, 1.2); // cuchara
  c.circle(51, 7, 4.4, ironDark); // piedra
  c.circle(51, 7, 3.2, 0xc4cbce);
  c.beam(31, 30, 14, 40, 1.8, 0xe0c8a0, 0x6a5a40); // soga
  c.wheel(19, 51, 6.5);
  c.wheel(45, 51, 6.5);
  return c;
}

/* ---- ariete: tronco con cabeza de hierro bajo un tejadillo de tablas, sobre ruedas ---- */
function ram() {
  const c = new Canvas();
  c.fillPoly([[8, 30], [32, 16], [56, 30]], woodDark); // tejadillo
  c.fillPoly([[11, 30], [32, 19], [53, 30]], 0xa3693a);
  c.rect(30.8, 19, 2.4, 11, woodDark); // cumbrera
  c.rect(12, 30, 3, 14, woodDark); // postes
  c.rect(49, 30, 3, 14, woodDark);
  c.box(7, 37, 48, 8, 0x8a5a2a, woodDark, 1.4); // tronco
  c.rect(18, 37, 2.4, 8, ironDark); // refuerzos de hierro
  c.rect(34, 37, 2.4, 8, ironDark);
  c.fillPoly([[55, 35], [63, 41], [55, 47]], ironDark); // cabeza
  c.fillPoly([[55.6, 36.6], [61, 41], [55.6, 45.4]], iron);
  c.box(10, 44, 42, 4, wood, woodDark, 1.2); // chasis
  c.wheel(17, 52, 5.5);
  c.wheel(46, 52, 5.5);
  return c;
}

mkdirSync('public/assets/art', { recursive: true });
for (const [name, make] of [['unit_catapult', catapult], ['unit_ram', ram]]) {
  writeFileSync(`public/assets/art/${name}.png`, encodePng(SIZE, SIZE, make().toRgba()));
  console.log(`public/assets/art/${name}.png`);
}
