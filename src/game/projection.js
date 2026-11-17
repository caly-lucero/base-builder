// Proyección y cámara: la ÚNICA parte que sabe cómo se pasa de coordenadas de casilla a pantalla.
// La vista es isométrica «2:1»: cada casilla es un rombo de TILE_W × TILE_H píxeles (a zoom 1).
//   x crece hacia abajo-derecha, y hacia abajo-izquierda.  La casilla (0, 0) es la de más arriba.
//   centro de la casilla (x, y) = view + ((x − y) · TILE_W/2, (x + y + 1) · TILE_H/2) · zoom
// La lógica del juego, el guardado y la economía solo hablan en casillas (x, y) y no saben nada de esto.
//
// El mapa se ve por una «ventana» rectangular (LAYOUT.viewHeight de alto, entre el HUD y la
// barra de abajo). `view` dice dónde cae en pantalla el vértice de arriba de la casilla (0, 0).
import { CAMERA, GRID, LAYOUT } from '../data/config.js';
import { TOWN_HALL_CELL, inBounds } from './logic.js';

export const TILE_W = 96;
export const TILE_H = 48;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Largo (px, a zoom 1) de «una casilla» recorrida en línea recta: sirve para tamaños de efectos y alcances. */
export const TILE_LEN = Math.hypot(HW, HH);

/** El arte ya viene dibujado al tamaño de pantalla a zoom 1. */
export const SPRITE_SCALE = 1;

/** Alto (a zoom 1) del borde de tierra que se ve bajo la isla. */
export const CLIFF = 34;

/** Margen (px) que se deja ver fuera del mapa al desplazarse. */
const MARGIN = 28;

/** Estado de la cámara. Se modifica solo con las funciones de abajo. */
export const view = { zoom: CAMERA.startZoom, x: 0, y: LAYOUT.gridTop };

const viewport = () => ({ left: 0, top: LAYOUT.gridTop, width: LAYOUT.width, height: LAYOUT.viewHeight });

export const tileSize = () => TILE_LEN * view.zoom;
export const spriteScale = () => SPRITE_SCALE * view.zoom;

/** Pantalla ↔ mundo: punto (px) del mapa en píxeles de pantalla, dado su (x, y) en casillas (puede ser fraccionario). */
function toScreen(x, y) {
  return { x: view.x + (x - y) * HW * view.zoom, y: view.y + (x + y) * HH * view.zoom };
}

/** Coloca el mapa dentro de la ventana: si es más chico que ella, lo centra; si no, no deja huecos. */
export function clampView() {
  const vp = viewport();
  const z = view.zoom;
  const leftSpan = GRID.rows * HW * z; // del vértice de arriba al borde izquierdo del rombo
  const rightSpan = GRID.cols * HW * z;
  const height = (GRID.cols + GRID.rows) * HH * z + CLIFF * z;
  const minX = vp.left + vp.width - rightSpan - MARGIN;
  const maxX = vp.left + leftSpan + MARGIN;
  view.x = minX > maxX ? (minX + maxX) / 2 : Math.min(maxX, Math.max(minX, view.x));
  const minY = vp.top + vp.height - height - MARGIN;
  const maxY = vp.top + MARGIN;
  view.y = minY > maxY ? (minY + maxY) / 2 : Math.min(maxY, Math.max(minY, view.y));
}

/** Desplaza el mapa `dx, dy` píxeles de pantalla. */
export function panBy(dx, dy) {
  view.x += dx;
  view.y += dy;
  clampView();
}

/** Punto del mapa (casillas, fraccionario) bajo un punto de pantalla. */
export function screenToWorld(px, py) {
  const u = (px - view.x) / (HW * view.zoom);
  const v = (py - view.y) / (HH * view.zoom);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

/** Cambia el zoom manteniendo fijo el punto de pantalla (px, py), como al acercar con el dedo o la rueda. */
export function zoomAt(px, py, zoom) {
  const next = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
  const w = screenToWorld(px, py);
  view.zoom = next;
  view.x = px - (w.x - w.y) * HW * next;
  view.y = py - (w.x + w.y) * HH * next;
  clampView();
}

/** Centra la ventana en una casilla. */
export function centerOnTile(x, y) {
  const vp = viewport();
  view.x = vp.left + vp.width / 2 - (x - y) * HW * view.zoom;
  view.y = vp.top + vp.height / 2 - (x + y + 1) * HH * view.zoom;
  clampView();
}

/** Vista inicial: zoom por defecto y centrada en `cell` (por defecto, el Ayuntamiento de una partida nueva). */
export function resetView(cell = TOWN_HALL_CELL) {
  view.zoom = CAMERA.startZoom;
  centerOnTile(cell.x, cell.y);
}

/** Centro del rombo de una casilla (x, y pueden ser fraccionarios: sirve para unidades que se mueven). */
export function tileCenter(x, y) {
  return toScreen(x + 0.5, y + 0.5);
}

/** Punto donde «pisa» un edificio o una unidad: el centro del rombo. */
export function tileBase(x, y) {
  return tileCenter(x, y);
}

/** Los cuatro vértices del rombo de una casilla, en pantalla: [arriba, derecha, abajo, izquierda]. */
export function tileCorners(x, y) {
  return [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)];
}

/** ¿El punto de pantalla cae dentro de la ventana del mapa (y no sobre el HUD o la barra)? */
export function inViewport(px, py) {
  const vp = viewport();
  return px >= vp.left && px < vp.left + vp.width && py >= vp.top && py < vp.top + vp.height;
}

/** Casilla bajo un punto de la pantalla, o null si cae fuera de la ventana o del mapa. */
export function screenToTile(px, py) {
  if (!inViewport(px, py)) return null;
  const w = screenToWorld(px, py);
  const x = Math.floor(w.x);
  const y = Math.floor(w.y);
  return inBounds(x, y) ? { x, y } : null;
}

/**
 * ¿La casilla se ve dentro de la ventana? Sirve para no dibujar lo que no se ve.
 * `slack` agrega casillas de holgura alrededor, porque los dibujos altos sobresalen de su casilla.
 */
export function isTileVisible(x, y, slack = 1) {
  const vp = viewport();
  const c = tileCenter(x, y);
  const padX = (HW + slack * TILE_W * 0.5) * view.zoom;
  const padUp = (HH + slack * TILE_H * 2.2) * view.zoom; // los dibujos altos sobresalen hacia arriba
  const padDown = (HH + slack * TILE_H * 0.6) * view.zoom;
  return c.x + padX > vp.left && c.x - padX < vp.left + vp.width && c.y + padDown > vp.top && c.y - padUp < vp.top + vp.height;
}

/** Orden de dibujado: lo que está más abajo en pantalla (x + y mayor) se pinta encima. */
export function depthOf(x, y) {
  return x + y + (x - y) / 1000;
}
