// Paisaje de la base: caminos de tierra entre tus edificios, estanques y flores. Es solo aspecto: se calcula
// siempre igual a partir de la partida (caminos) o de una semilla fija (estanques y flores), y no se guarda.
import { GRID } from '../data/config.js';
import { mulberry32 } from './decor.js';

export const LANDSCAPE_SEED = 77031;

const key = (x, y) => `${x},${y}`;
const inMap = (x, y) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;
const SKIP = new Set(['wall', 'gate']); // los muros no necesitan camino

/**
 * Casillas de tierra que unen tus edificios con el Ayuntamiento. Cada edificio se conecta con lo más cercano que
 * ya está conectado (un árbol, no una estrella), con tramos en «L». Devuelve un Set de "x,y" que NO incluye las
 * casillas ocupadas por edificios.
 */
export function pathTiles(buildings) {
  const hall = buildings.find((b) => b.type === 'townhall');
  if (!hall) return new Set();
  const occupied = new Set(buildings.map((b) => key(b.x, b.y)));
  const path = new Set();
  const nodes = [{ x: hall.x, y: hall.y }];
  const rest = buildings
    .filter((b) => b !== hall && !SKIP.has(b.type))
    .sort((a, b) => Math.abs(a.x - hall.x) + Math.abs(a.y - hall.y) - (Math.abs(b.x - hall.x) + Math.abs(b.y - hall.y)) || a.id - b.id);

  for (const b of rest) {
    let best = nodes[0];
    let bestD = Infinity;
    for (const n of nodes) {
      const d = Math.abs(n.x - b.x) + Math.abs(n.y - b.y);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    // Recorre de `best` a `b`: primero el eje con más distancia (queda un camino más natural).
    let x = best.x;
    let y = best.y;
    const horizontalFirst = Math.abs(b.x - x) >= Math.abs(b.y - y);
    const walk = (axis) => {
      while (axis === 'x' ? x !== b.x : y !== b.y) {
        if (axis === 'x') x += Math.sign(b.x - x);
        else y += Math.sign(b.y - y);
        if (!(x === b.x && y === b.y) && inMap(x, y) && !occupied.has(key(x, y))) path.add(key(x, y));
      }
    };
    if (horizontalFirst) {
      walk('x');
      walk('y');
    } else {
      walk('y');
      walk('x');
    }
    nodes.push({ x: b.x, y: b.y });
  }
  return path;
}

/**
 * Estanques: manchas de agua en los bordes del mapa (lejos del centro, donde se construye). Devuelve
 * [{ x, y }] de las casillas de agua. Siempre salen los mismos.
 */
export function pondTiles(seed = LANDSCAPE_SEED) {
  const rand = mulberry32(seed);
  const spots = [
    { x: 3, y: 4 },
    { x: 20, y: 19 },
    { x: 19, y: 3 },
  ];
  const tiles = new Map();
  for (const spot of spots) {
    const size = 4 + Math.floor(rand() * 4); // 4-7 casillas
    const cells = [{ x: spot.x, y: spot.y }];
    tiles.set(key(spot.x, spot.y), cells[0]);
    for (let guard = 0; cells.length < size && guard < 80; guard++) {
      const from = cells[Math.floor(rand() * cells.length)];
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
      const c = { x: from.x + dx, y: from.y + dy };
      if (!inMap(c.x, c.y) || tiles.has(key(c.x, c.y))) continue;
      tiles.set(key(c.x, c.y), c);
      cells.push(c);
    }
  }
  return [...tiles.values()];
}

/**
 * Flores y matas pequeñas repartidas por el césped: [{ x, y (casilla), ox, oy (desplazamiento 0-1 dentro de la
 * casilla), kind }]. No caen en los estanques.
 */
export function flowerSpots(seed = LANDSCAPE_SEED) {
  const rand = mulberry32(seed + 1);
  const water = new Set(pondTiles(seed).map((t) => key(t.x, t.y)));
  const out = [];
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      const roll = rand();
      const kind = Math.floor(rand() * 4); // 0-2 flores de colores, 3 mata de hierba
      const ox = 0.15 + rand() * 0.7;
      const oy = 0.2 + rand() * 0.65;
      if (roll < 0.24 && !water.has(key(x, y))) out.push({ x, y, ox, oy, kind });
    }
  }
  return out;
}
