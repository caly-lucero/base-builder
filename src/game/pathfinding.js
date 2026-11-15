// Búsqueda de caminos (A*) sobre la cuadrícula del mapa. Lógica pura: no sabe de Phaser ni de edificios,
// solo de casillas. Las unidades se mueven en 8 direcciones; una diagonal solo se permite si las dos
// casillas laterales están libres, para que nadie «corte» la esquina de un edificio.
import { GRID } from '../data/config.js';

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;

/**
 * Camino de `from` a `to` (casillas enteras). Devuelve [{x,y}] SIN la casilla de salida y CON la de
 * llegada, [] si ya está allí, o null si no hay camino.
 *  - blocked(x, y): true si la casilla es intransitable. La casilla de llegada siempre cuenta como
 *    transitable (es donde está el objetivo).
 *  - extraCost(x, y): costo adicional por pisar la casilla (los muros cuestan más: se prefiere
 *    rodearlos, pero se pueden atravesar rompiéndolos).
 */
export function findPath(from, to, { blocked = () => false, extraCost = () => 0, maxNodes = 1200 } = {}) {
  if (!inGrid(from.x, from.y) || !inGrid(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];

  const key = (x, y) => y * GRID.cols + x;
  const h = (x, y) => {
    const dx = Math.abs(x - to.x);
    const dy = Math.abs(y - to.y);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); // distancia octil
  };
  const isBlocked = (x, y) => !(x === to.x && y === to.y) && blocked(x, y);

  const g = new Map([[key(from.x, from.y), 0]]);
  const parent = new Map();
  const open = [{ x: from.x, y: from.y, f: h(from.x, from.y) }];
  const closed = new Set();

  for (let expanded = 0; open.length && expanded < maxNodes; expanded++) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      for (let k = ck; k !== key(from.x, from.y); k = parent.get(k)) path.push({ x: k % GRID.cols, y: Math.floor(k / GRID.cols) });
      return path.reverse();
    }

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inGrid(nx, ny) || isBlocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isBlocked(cur.x + dx, cur.y) || isBlocked(cur.x, cur.y + dy))) continue; // no cortar esquinas
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const cost = g.get(ck) + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) + extraCost(nx, ny);
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost);
        parent.set(nk, ck);
        open.push({ x: nx, y: ny, f: cost + h(nx, ny) });
      }
    }
  }
  return null;
}
