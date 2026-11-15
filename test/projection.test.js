import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ART_SIZE, CAMERA, GRID, LAYOUT } from '../src/data/config.js';
import { TOWN_HALL_CELL } from '../src/game/logic.js';
import {
  GROUND_MARGIN,
  SPRITE_SCALE,
  centerOnTile,
  clampView,
  depthOf,
  inViewport,
  isTileVisible,
  panBy,
  resetView,
  screenToTile,
  tileBase,
  tileCenter,
  tileSize,
  tileTopLeft,
  view,
  zoomAt,
} from '../src/game/projection.js';

beforeEach(() => resetView());

const viewBottom = () => LAYOUT.gridTop + LAYOUT.viewHeight;

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
  assert.ok(checked > 50, `se probaron ${checked} casillas visibles`);
});

test('puntos fuera de la ventana (HUD, barra inferior, bordes) no dan casilla', () => {
  assert.equal(screenToTile(10, LAYOUT.gridTop - 1), null);
  assert.equal(screenToTile(10, viewBottom()), null);
  assert.equal(screenToTile(-1, LAYOUT.gridTop + 5), null);
  assert.equal(screenToTile(LAYOUT.width, LAYOUT.gridTop + 5), null);
});

test('la vista inicial está centrada en el Ayuntamiento', () => {
  const c = tileCenter(TOWN_HALL_CELL.x, TOWN_HALL_CELL.y);
  assert.ok(Math.abs(c.x - LAYOUT.width / 2) < 1);
  assert.ok(Math.abs(c.y - (LAYOUT.gridTop + LAYOUT.viewHeight / 2)) < 1);
  assert.equal(view.zoom, CAMERA.startZoom);
});

test('con zoom mínimo el mapa entero cabe en la ventana, centrado', () => {
  zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, CAMERA.minZoom);
  assert.equal(view.zoom, CAMERA.minZoom);
  assert.ok(GRID.cols * tileSize() <= LAYOUT.width + 1e-9);
  assert.ok(GRID.rows * tileSize() <= LAYOUT.viewHeight + 1e-9);
  const first = tileTopLeft(0, 0);
  const last = tileTopLeft(GRID.cols, GRID.rows);
  assert.ok(first.x >= 0 && first.y >= LAYOUT.gridTop);
  assert.ok(last.x <= LAYOUT.width && last.y <= viewBottom());
});

test('el zoom se limita a los valores permitidos', () => {
  zoomAt(300, 300, 99);
  assert.equal(view.zoom, CAMERA.maxZoom);
  zoomAt(300, 300, 0.01);
  assert.equal(view.zoom, CAMERA.minZoom);
});

test('al hacer zoom el punto bajo el dedo (o el cursor) se queda quieto', () => {
  // Con zoom intermedio el mapa es más grande que la ventana en ambos ejes, así que no hay recorte.
  zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, 1.2);
  const px = 400;
  const py = LAYOUT.gridTop + 200;
  const before = screenToTile(px, py);
  assert.ok(before);
  zoomAt(px, py, 1.5);
  assert.deepEqual(screenToTile(px, py), before, 'sigue siendo la misma casilla');
  zoomAt(px, py, 1.0);
  assert.deepEqual(screenToTile(px, py), before);
});

test('al desplazar nunca se ven huecos fuera del mapa', () => {
  panBy(-1e6, -1e6);
  assert.equal(view.x + GRID.cols * tileSize(), LAYOUT.width, 'borde derecho pegado a la ventana');
  assert.equal(view.y + GRID.rows * tileSize(), viewBottom(), 'borde inferior pegado a la ventana');
  panBy(1e6, 1e6);
  assert.equal(view.x, 0);
  assert.equal(view.y, LAYOUT.gridTop);
});

test('centrar en una casilla cercana al borde no deja huecos', () => {
  centerOnTile(0, 0);
  assert.equal(view.x, 0);
  assert.equal(view.y, LAYOUT.gridTop);
  centerOnTile(GRID.cols - 1, GRID.rows - 1);
  assert.ok(isTileVisible(GRID.cols - 1, GRID.rows - 1, 0));
});

test('clampView es idempotente', () => {
  panBy(-37, 12);
  const { x, y } = view;
  clampView();
  assert.deepEqual([view.x, view.y], [x, y]);
});

test('la base de apoyo está centrada, cerca del pie de la casilla y dentro de ella (con cualquier zoom)', () => {
  for (const zoom of [CAMERA.minZoom, 1, CAMERA.maxZoom]) {
    resetView();
    zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, zoom);
    const cell = { x: TOWN_HALL_CELL.x, y: TOWN_HALL_CELL.y };
    const base = tileBase(cell.x, cell.y);
    const c = tileCenter(cell.x, cell.y);
    assert.equal(base.x, c.x);
    assert.ok(Math.abs(base.y - (c.y + tileSize() / 2 - GROUND_MARGIN * view.zoom)) < 1e-9);
    assert.deepEqual(screenToTile(base.x, base.y), cell, `zoom ${zoom}: sigue dentro de su casilla`);
  }
});

test('culling: las casillas lejanas no se consideran visibles y las cercanas sí', () => {
  centerOnTile(0, 0);
  assert.ok(isTileVisible(0, 0));
  assert.ok(!isTileVisible(GRID.cols - 1, GRID.rows - 1));
});

test('lo que está más abajo (o más a la derecha en la misma fila) se dibuja encima', () => {
  assert.ok(depthOf(3, 5) > depthOf(3, 4));
  assert.ok(depthOf(4, 5) > depthOf(3, 5));
  assert.ok(depthOf(0, 6) > depthOf(GRID.cols - 1, 5), 'la fila manda sobre la columna');
});

test('los sprites se escalan para encajar exactamente en la casilla a zoom 1', () => {
  assert.equal(ART_SIZE * SPRITE_SCALE, GRID.tile);
});
