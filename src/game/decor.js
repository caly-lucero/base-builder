// Decoración del mapa (árboles, rocas, arbustos). Es puramente visual y NO se guarda:
// sale siempre igual porque se genera con una semilla fija. Los edificios la tapan
// al construirse y reaparece si se demuelen.
import { GRID } from '../data/config.js';

export const DECOR_SEED = 20261115;

export const DECOR_KEYS = {
  tree: ['tree_a', 'tree_b', 'tree_c'],
  rock: ['rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e', 'rock_f'],
  bush: ['bush_a', 'bush_b'],
  misc: ['stump', 'log'],
};

// Generador pseudoaleatorio determinista (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Devuelve [{ x, y, key }]. Hay más decoración hacia los bordes y el centro queda despejado. */
export function generateDecor(seed = DECOR_SEED) {
  const rand = mulberry32(seed);
  const cx = (GRID.cols - 1) / 2;
  const cy = (GRID.rows - 1) / 2;
  const maxDist = Math.hypot(cx, cy);
  const items = [];

  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
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
