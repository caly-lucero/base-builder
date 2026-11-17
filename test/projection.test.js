import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA, GRID, LAYOUT } from '../src/data/config.js';
import { TOWN_HALL_CELL } from '../src/game/logic.js';
import {
  CLIFF,
  TILE_H,
  TILE_LEN,
  TILE_W,
  centerOnTile,
  clampView,
  depthOf,
  inViewport,
  isTileVisible,
  panBy,
  resetView,
  screenToTile,
  screenToWorld,
  tileBase,
  tileCenter,
  tileCorners,
  tileSize,
  view,
  zoomAt,
} from '../src/game/projection.js';

beforeEach(() => resetView());

const viewBottom = () => LAYOUT.gridTop + LAYOUT.viewHeight;

test('la casilla es un rombo 2:1', () => {
  assert.equal(TILE_W, 2 * TILE_H);
  const [top, right, bottom, left] = tileCorners(5, 7);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(right.x - left.x, TILE_W * view.zoom));
  assert.ok(near(bottom.y - top.y, TILE_H * view.zoom));
  assert.ok(near(top.x, bottom.x));
  assert.ok(near(left.y, right.y));
  const c = tileCenter(5, 7);
  assert.ok(Math.abs(c.x - top.x) < 1e-9 && Math.abs(c.y - (top.y + bottom.y) / 2) < 1e-9, 'el centro está en medio del rombo');
});

test('x crece hacia abajo-derecha e y hacia abajo-izquierda', () => {
  const a = tileCenter(4, 4);
  const sx = tileCenter(5, 4);
  const sy = tileCenter(4, 5);
  assert.ok(sx.x > a.x && sx.y > a.y);
  assert.ok(sy.x < a.x && sy.y > a.y);
  assert.equal(sx.y - a.y, sy.y - a.y, 'bajan lo mismo');
});

test('el centro de cada casilla visible vuelve a esa misma casilla', () => {
  let checked = 0;
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      const c = tileCenter(x, y);
      if (!inViewport(c.x, c.y)) continue;
      assert.deepEqual(screenToTile(c.x, c.y), { x, y });
      checked++;
    }
  }
  assert.ok(checked > 40, `se probaron ${checked} casillas visibles`);
});

test('screenToWorld es la inversa de tileCenter (también con fracciones)', () => {
  for (const [x, y] of [[3, 4], [10.5, 7.25], [0.3, 20.8]]) {
    const c = tileCenter(x, y);
    const w = screenToWorld(c.x, c.y);
    assert.ok(Math.abs(w.x - (x + 0.5)) < 1e-9 && Math.abs(w.y - (y + 0.5)) < 1e-9);
  }
});

test('las esquinas del rombo caen en la casilla vecina o fuera de ella, y el centro dentro', () => {
  const [top, right, bottom, left] = tileCorners(8, 8);
  const inside = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
  // un pelín hacia dentro desde cada vértice sigue siendo la casilla
  assert.deepEqual(screenToTile(...Object.values(inside(top, 0, 2))), { x: 8, y: 8 });
  assert.deepEqual(screenToTile(...Object.values(inside(right, -3, 0))), { x: 8, y: 8 });
  assert.deepEqual(screenToTile(...Object.values(inside(bottom, 0, -2))), { x: 8, y: 8 });
  assert.deepEqual(screenToTile(...Object.values(inside(left, 3, 0))), { x: 8, y: 8 });
  // y un pelín hacia fuera ya es otra
  assert.notDeepEqual(screenToTile(...Object.values(inside(right, 4, 0))), { x: 8, y: 8 });
});

test('puntos fuera de la ventana (HUD, barra inferior, bordes) no dan casilla', () => {
  assert.equal(screenToTile(10, LAYOUT.gridTop - 1), null);
  assert.equal(screenToTile(10, viewBottom()), null);
  assert.equal(screenToTile(-1, LAYOUT.gridTop + 5), null);
  assert.equal(screenToTile(LAYOUT.width, LAYOUT.gridTop + 5), null);
});

test('un punto fuera del mapa (el cielo, la esquina del rombo) no da casilla', () => {
  zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, CAMERA.minZoom);
  assert.equal(screenToTile(2, LAYOUT.gridTop + 2), null);
});

test('la vista inicial está centrada en el Ayuntamiento', () => {
  const c = tileCenter(TOWN_HALL_CELL.x, TOWN_HALL_CELL.y);
  assert.ok(Math.abs(c.x - LAYOUT.width / 2) < 1);
  assert.ok(Math.abs(c.y - (LAYOUT.gridTop + LAYOUT.viewHeight / 2)) < 1);
  assert.equal(view.zoom, CAMERA.startZoom);
});

test('el zoom se limita a los valores permitidos', () => {
  zoomAt(300, 300, 99);
  assert.equal(view.zoom, CAMERA.maxZoom);
  zoomAt(300, 300, 0.01);
  assert.equal(view.zoom, CAMERA.minZoom);
});

test('al hacer zoom el punto bajo el dedo (o el cursor) se queda quieto', () => {
  zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, 0.9);
  const px = 220;
  const py = LAYOUT.gridTop + 300;
  const before = screenToWorld(px, py);
  zoomAt(px, py, 1.3);
  const after = screenToWorld(px, py);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6, 'el mismo punto del mapa sigue bajo el dedo');
  assert.deepEqual(screenToTile(px, py), { x: Math.floor(before.x), y: Math.floor(before.y) });
});

test('al desplazar nunca se ve más allá del margen del mapa', () => {
  panBy(-1e6, -1e6);
  const z = view.zoom;
  const right = view.x + GRID.cols * (TILE_W / 2) * z; // vértice derecho del rombo
  const bottom = view.y + (GRID.cols + GRID.rows) * (TILE_H / 2) * z + CLIFF * z;
  assert.ok(Math.abs(right - LAYOUT.width) <= 30, 'el borde derecho queda a lo sumo un margen dentro de la ventana');
  assert.ok(Math.abs(bottom - viewBottom()) <= 30, 'el borde inferior queda a lo sumo un margen dentro de la ventana');
  panBy(1e6, 1e6);
  const left = view.x - GRID.rows * (TILE_W / 2) * z;
  assert.ok(left >= 0 && left <= 30, 'el borde izquierdo queda a lo sumo un margen dentro de la ventana');
  assert.ok(view.y >= LAYOUT.gridTop && view.y - LAYOUT.gridTop <= 30, 'el vértice de arriba queda a lo sumo un margen dentro de la ventana');
});

test('con el zoom mínimo el mapa cabe casi entero y queda centrado', () => {
  zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, CAMERA.minZoom);
  const mapW = GRID.cols * TILE_W * view.zoom; // ancho del rombo entero (cols = rows)
  assert.ok(mapW < LAYOUT.width * 1.5, 'no es mucho más ancho que la pantalla');
  const mapH = (GRID.cols + GRID.rows) * (TILE_H / 2) * view.zoom + CLIFF * view.zoom;
  assert.ok(mapH <= LAYOUT.viewHeight, 'cabe a lo alto');
  const centerY = view.y + mapH / 2;
  assert.ok(Math.abs(centerY - (LAYOUT.gridTop + LAYOUT.viewHeight / 2)) < 1, 'centrado a lo alto');
});

test('centrar en una casilla del borde no deja huecos y la casilla se ve', () => {
  centerOnTile(0, 0);
  assert.ok(isTileVisible(0, 0, 0));
  centerOnTile(GRID.cols - 1, GRID.rows - 1);
  assert.ok(isTileVisible(GRID.cols - 1, GRID.rows - 1, 0));
});

test('clampView es idempotente', () => {
  panBy(-37, 12);
  const { x, y } = view;
  clampView();
  assert.deepEqual([view.x, view.y], [x, y]);
});

test('el punto de apoyo es el centro del rombo y está dentro de su casilla (con cualquier zoom)', () => {
  for (const zoom of [CAMERA.minZoom, 1, CAMERA.maxZoom]) {
    resetView();
    zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, zoom);
    const cell = { x: TOWN_HALL_CELL.x, y: TOWN_HALL_CELL.y };
    const base = tileBase(cell.x, cell.y);
    const c = tileCenter(cell.x, cell.y);
    assert.equal(base.x, c.x);
    assert.equal(base.y, c.y);
    assert.deepEqual(screenToTile(base.x, base.y), cell, `zoom ${zoom}: sigue dentro de su casilla`);
  }
});

test('tileSize mide una casilla recorrida en línea recta', () => {
  assert.ok(Math.abs(tileSize() - TILE_LEN * view.zoom) < 1e-9);
  const a = tileCenter(5, 5);
  const b = tileCenter(6, 5);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - tileSize()) < 1e-9);
});

test('culling: las casillas lejanas no se consideran visibles y las cercanas sí', () => {
  centerOnTile(0, 0);
  assert.ok(isTileVisible(0, 0));
  assert.ok(!isTileVisible(GRID.cols - 1, GRID.rows - 1));
});

test('lo que está más abajo en pantalla (x + y mayor) se dibuja encima', () => {
  assert.ok(depthOf(3, 5) > depthOf(3, 4));
  assert.ok(depthOf(4, 5) > depthOf(3, 5));
  assert.ok(depthOf(0, 6) > depthOf(4, 1), 'manda la suma x + y');
  assert.ok(depthOf(5, 3) !== depthOf(3, 5), 'las diagonales no empatan');
  const sorted = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) sorted.push(depthOf(x, y));
  assert.equal(new Set(sorted).size, sorted.length, 'cada casilla tiene su propia capa');
});

test('fitLayout adapta el alto del lienzo a la proporción de la pantalla (con topes)', async () => {
  const { fitLayout } = await import('../src/data/config.js');
  const before = LAYOUT.viewHeight;
  fitLayout(390, 844); // un celular alto
  const tall = LAYOUT.viewHeight;
  assert.ok(tall > 700, `un celular alto aprovecha el alto (${tall})`);
  assert.equal(LAYOUT.height, LAYOUT.hudHeight + tall + LAYOUT.barHeight);
  fitLayout(1280, 720); // una pantalla ancha: no se achata de más
  assert.equal(LAYOUT.viewHeight, 520);
  fitLayout(100, 5000); // algo absurdo: tiene tope
  assert.equal(LAYOUT.viewHeight, 900);
  fitLayout(0, 0); // medidas inválidas: no cambia nada
  assert.equal(LAYOUT.viewHeight, 900);
  LAYOUT.viewHeight = before;
});
