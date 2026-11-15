import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID } from '../src/data/config.js';
import { findPath } from '../src/game/pathfinding.js';

const set = (...cells) => new Set(cells.map(([x, y]) => `${x},${y}`));
const blockedBy = (cells) => (x, y) => cells.has(`${x},${y}`);

test('en línea recta devuelve las casillas hasta el destino, sin la de salida', () => {
  const p = findPath({ x: 2, y: 2 }, { x: 6, y: 2 });
  assert.deepEqual(p, [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }]);
});

test('si ya está en el destino, el camino es vacío', () => {
  assert.deepEqual(findPath({ x: 4, y: 4 }, { x: 4, y: 4 }), []);
});

test('usa diagonales cuando ahorran camino', () => {
  const p = findPath({ x: 0, y: 0 }, { x: 3, y: 3 });
  assert.equal(p.length, 3);
  assert.deepEqual(p.at(-1), { x: 3, y: 3 });
});

test('rodea un obstáculo y nunca pisa una casilla bloqueada', () => {
  const wall = set([4, 1], [4, 2], [4, 3], [4, 4]);
  const p = findPath({ x: 2, y: 2 }, { x: 6, y: 2 }, { blocked: blockedBy(wall) });
  assert.ok(p, 'hay camino');
  assert.deepEqual(p.at(-1), { x: 6, y: 2 });
  for (const c of p) assert.ok(!wall.has(`${c.x},${c.y}`), `pisó ${c.x},${c.y}`);
  assert.ok(p.length > 4, 'da un rodeo');
});

test('no corta la esquina de un bloque en diagonal', () => {
  const wall = set([3, 2]);
  const p = findPath({ x: 2, y: 2 }, { x: 3, y: 3 }, { blocked: blockedBy(wall) });
  assert.ok(p);
  // ir de (2,2) a (3,3) en diagonal pasaría rozando (3,2) bloqueada: debe dar la vuelta por (2,3)
  assert.deepEqual(p[0], { x: 2, y: 3 });
});

test('devuelve null si el destino está encerrado', () => {
  const ring = new Set();
  for (let x = 5; x <= 9; x++) for (let y = 5; y <= 9; y++) if (x === 5 || x === 9 || y === 5 || y === 9) ring.add(`${x},${y}`);
  assert.equal(findPath({ x: 0, y: 0 }, { x: 7, y: 7 }, { blocked: blockedBy(ring) }), null);
});

test('la casilla de destino cuenta como transitable aunque esté bloqueada (ahí está el objetivo)', () => {
  const target = set([6, 2]);
  const p = findPath({ x: 2, y: 2 }, { x: 6, y: 2 }, { blocked: blockedBy(target) });
  assert.deepEqual(p.at(-1), { x: 6, y: 2 });
});

test('un muro con costo se rodea si el rodeo es corto, y se atraviesa si es larguísimo', () => {
  // Muro de 3 casillas con huecos a ambos lados: rodear cuesta poco → no atraviesa.
  const short = set([4, 1], [4, 2], [4, 3]);
  const cost = (x, y) => (short.has(`${x},${y}`) ? 6 : 0);
  const around = findPath({ x: 2, y: 2 }, { x: 6, y: 2 }, { extraCost: cost });
  assert.ok(around.every((c) => !short.has(`${c.x},${c.y}`)), 'rodea');

  // Muro que ocupa toda la columna: no hay rodeo; con costo se atraviesa (y se rompe).
  const full = new Set();
  for (let y = 0; y < GRID.rows; y++) full.add(`4,${y}`);
  const through = findPath({ x: 2, y: 2 }, { x: 6, y: 2 }, { extraCost: (x, y) => (full.has(`${x},${y}`) ? 6 : 0) });
  assert.ok(through, 'hay camino atravesando');
  assert.ok(through.some((c) => full.has(`${c.x},${c.y}`)), 'pasa por el muro');
});

test('fuera del mapa no hay camino y el límite de nodos corta la búsqueda', () => {
  assert.equal(findPath({ x: -1, y: 0 }, { x: 3, y: 3 }), null);
  assert.equal(findPath({ x: 0, y: 0 }, { x: GRID.cols, y: 0 }), null);
  const all = () => true;
  assert.equal(findPath({ x: 0, y: 0 }, { x: 20, y: 20 }, { blocked: all, maxNodes: 5 }), null);
});
