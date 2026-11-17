// Aspecto del terreno: variación suave de color y de dibujo por casilla. Solo visual (no se guarda)
// y determinista: cada casilla sale siempre igual. Lógica pura, sin Phaser.
import { GRID } from '../data/config.js';

/** Número pseudoaleatorio estable en [0, 1) para un punto de la malla. */
function lattice(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Ruido de valores suave en [0, 1]: `scale` es el tamaño (en casillas) de cada «mancha». */
export function valueNoise(x, y, scale, seed = 1) {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const a = lattice(ix, iy, seed);
  const b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed);
  const d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const channel = (v) => Math.max(0, Math.min(255, Math.round(v)));
const pack = (r, g, b) => (channel(r) << 16) | (channel(g) << 8) | channel(b);

/**
 * Cómo se pinta el césped de una casilla: qué dibujo, si va volteado y qué tinte lleva.
 * Mezcla manchas grandes (zonas más claras u oscuras) con una variación fina entre casillas vecinas,
 * y un tono más cálido o más fresco según la zona.
 */
export function grassLook(x, y) {
  const big = valueNoise(x, y, 7, 11); // zonas amplias
  const mid = valueNoise(x, y, 3, 23); // manchas medianas
  const fine = lattice(x, y, 5); // casilla a casilla
  const light = 0.84 + 0.14 * big + 0.1 * mid + 0.03 * fine; // 0.84 – 1.11 (por encima de 1 no aclara: solo hay zonas «sin tinte»)
  const warm = valueNoise(x, y, 9, 37); // 0 = fresco, 1 = cálido (más amarillo)
  const r = 255 * light * (0.9 + 0.12 * warm);
  const g = 255 * light * (1 - 0.02 * warm);
  const b = 255 * light * (0.96 - 0.18 * warm);
  return {
    key: lattice(x, y, 9) < 0.34 ? 'grass_b' : 'grass_a',
    flipX: lattice(x, y, 13) < 0.5,
    flipY: lattice(x, y, 17) < 0.5,
    tint: pack(r, g, b),
  };
}

/** ¿La casilla está fuera del mapa? Sirve para el borde decorativo. */
export const isOutside = (x, y) => x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows;
