// Decoración del mapa (árboles, rocas, arbustos). Es puramente visual y NO se guarda:
// sale siempre igual porque se genera con una semilla fija. Los edificios la tapan
// al construirse y reaparece si se demuelen.
import { TERRAIN } from '../data/config.js';

export const DECOR_SEED = 20261115;

export const DECOR_KEYS = {
  tree: ['tree_a', 'tree_b', 'tree_c'],
  rock: ['rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e', 'rock_f'],
  bush: ['bush_a', 'bush_b'],
  misc: ['stump', 'log'],
};

// Generador pseudoaleatorio determinista (mulberry32). Se usa también para generar las bases enemigas.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clave de un adorno del mapa ("x,y" de su bloque de terreno): así se anota cuál quitó el jugador. */
export const decorKey = (d) => `${d.x},${d.y}`;

/**
 * Bosque y rocas fuera del mapa (hasta `outer` bloques de cada borde), siempre los mismos: el suelo no termina en un
 * borde vacío. No se pueden quitar.
 */
export function generateOuterDecor(outer = 6) {
  const rand = mulberry32(5150);
  const items = [];
  for (let y = -outer; y < TERRAIN.rows + outer; y++) {
    for (let x = -outer; x < TERRAIN.cols + outer; x++) {
      if (x >= 0 && y >= 0 && x < TERRAIN.cols && y < TERRAIN.rows) continue;
      const roll = rand();
      const pick = rand();
      if (roll < 0.45) items.push({ x, y, key: pick < 0.55 ? 'tree_a' : pick < 0.8 ? 'tree_b' : pick < 0.9 ? 'rock_a' : 'bush_a', outer: true });
    }
  }
  return items;
}

/** Devuelve [{ x, y, key }] (x, y = bloque de terreno de 2×2 cuadros). Hay más decoración hacia los bordes y el centro queda despejado. */
export function generateDecor(seed = DECOR_SEED) {
  const rand = mulberry32(seed);
  const cx = (TERRAIN.cols - 1) / 2;
  const cy = (TERRAIN.rows - 1) / 2;
  const maxDist = Math.hypot(cx, cy);
  const items = [];

  for (let y = 0; y < TERRAIN.rows; y++) {
    for (let x = 0; x < TERRAIN.cols; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxDist; // 0 en el centro, 1 en las esquinas
      const chance = 0.05 + 0.5 * d * d;
      const roll = rand();
      const pick = rand();
      const variant = rand();
      if (roll >= chance) continue;

      const kind = pick < 0.5 ? 'tree' : pick < 0.75 ? 'rock' : pick < 0.9 ? 'bush' : 'misc';
      const keys = DECOR_KEYS[kind];
      items.push({ x, y, key: keys[Math.floor(variant * keys.length)] });
    }
  }
  return items;
}
