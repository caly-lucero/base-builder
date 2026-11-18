// Búsqueda de caminos (A*) sobre la cuadrícula del mapa. Lógica pura: no sabe de Phaser ni de edificios,
// solo de cuadros. Las unidades se mueven en 8 direcciones; una diagonal solo se permite si los dos
// cuadros laterales están libres, para que nadie «corte» la esquina de un edificio.
import { GRID } from '../data/config.js';

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;

/** Cola de prioridad mínima (montículo binario) por el campo `f`. */
class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Camino de `from` a `to` (cuadros enteros). Devuelve [{x,y}] SIN el cuadro de salida y CON el de
 * llegada, [] si ya está allí, o null si no hay camino.
 *  - blocked(x, y): true si el cuadro es intransitable. El cuadro de llegada siempre cuenta como
 *    transitable (es donde está el objetivo).
 *  - extraCost(x, y): costo adicional por pisar el cuadro (los muros cuestan más: se prefiere
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
  const open = new MinHeap();
  open.push({ x: from.x, y: from.y, f: h(from.x, from.y) });
  const closed = new Set();

  for (let expanded = 0; open.size && expanded < maxNodes; expanded++) {
    const cur = open.pop();
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
