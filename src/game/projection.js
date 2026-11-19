// Proyección y cámara: la ÚNICA parte que sabe cómo se pasa de coordenadas de casilla a pantalla.
// La vista es isométrica «2:1»: cada cuadro es un rombo de TILE_W × TILE_H píxeles (a zoom 1).
//   x crece hacia abajo-derecha, y hacia abajo-izquierda.  El cuadro (0, 0) es el de más arriba.
//   centro del cuadro (x, y) = view + ((x − y) · TILE_W/2, (x + y + 1) · TILE_H/2) · zoom
// Los edificios ocupan varios cuadros; el terreno (césped, estanques…) se dibuja en bloques de 2×2 cuadros.
// La cámara se puede girar de 90° en 90° (`view.rot` = 0–3): el mapa se ve desde otro lado.
// La lógica del juego, el guardado y la economía solo hablan en cuadros (x, y) y no saben nada de esto.
//
// El mapa se ve por una «ventana» rectangular (LAYOUT.viewHeight de alto, entre el HUD y la
// barra de abajo). `view` dice dónde cae en pantalla el vértice de arriba de la casilla (0, 0).
import { ART_SCALE, CAMERA, GRID, LAYOUT, TERRAIN } from '../data/config.js';
import { TOWN_HALL_CELL, inBounds } from './logic.js';

export const TILE_W = 48;
export const TILE_H = 24;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** Largo (px, a zoom 1) de «un cuadro» recorrido en línea recta: sirve para tamaños de efectos y alcances. */
export const TILE_LEN = Math.hypot(HW, HH);

/** El arte viene dibujado a ART_SCALE veces el tamaño de pantalla a zoom 1. */
export const SPRITE_SCALE = 1 / ART_SCALE;

/** Alto (a zoom 1) del borde de tierra que se ve bajo la isla. */
export const CLIFF = 34;

/** Margen (px) que se deja ver fuera del mapa al desplazarse. */
const MARGIN = 28;

/** Estado de la cámara. Se modifica solo con las funciones de abajo. `rot`: cuartos de vuelta de la vista (0–3). */
export const view = { zoom: CAMERA.startZoom, x: 0, y: LAYOUT.gridTop, rot: 0 };

/* ---------- giro de la vista ---------- */

const SIDE = GRID.cols; // el mapa es cuadrado

/** Dónde cae un punto del mapa (x, y, continuo) al girar la vista `rot` cuartos de vuelta. */
function turn(x, y, rot = view.rot) {
  if (rot === 1) return { x: SIDE - y, y: x };
  if (rot === 2) return { x: SIDE - x, y: SIDE - y };
  if (rot === 3) return { x: y, y: SIDE - x };
  return { x, y };
}

/** Lo contrario de `turn`: de un punto de la vista al punto del mapa. */
function unturn(x, y, rot = view.rot) {
  if (rot === 1) return { x: y, y: SIDE - x };
  if (rot === 2) return { x: SIDE - x, y: SIDE - y };
  if (rot === 3) return { x: SIDE - y, y: x };
  return { x, y };
}

/** Gira una dirección (dx, dy del mapa) a como se ve con la vista actual: sirve para elegir hacia dónde mira un personaje. */
export function rotateVec(dx, dy, rot = view.rot) {
  if (rot === 1) return { dx: -dy || 0, dy: dx }; // «|| 0» evita el −0
  if (rot === 2) return { dx: -dx || 0, dy: -dy || 0 };
  if (rot === 3) return { dx: dy, dy: -dx || 0 };
  return { dx, dy };
}

/** Qué giro del dibujo de un edificio (el sufijo `_rN` de su imagen) hace falta con la vista actual. */
export const artTurn = (rot = view.rot) => (4 - rot) % 4;

const viewport = () => ({ left: 0, top: LAYOUT.gridTop, width: LAYOUT.width, height: LAYOUT.viewHeight });

export const tileSize = () => TILE_LEN * view.zoom;
export const spriteScale = () => SPRITE_SCALE * view.zoom;

/** Pantalla ↔ mundo: punto (px) del mapa en píxeles de pantalla, dado su (x, y) en casillas (puede ser fraccionario). */
function toScreen(x, y) {
  const q = turn(x, y);
  return { x: view.x + (q.x - q.y) * HW * view.zoom, y: view.y + (q.x + q.y) * HH * view.zoom };
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
  return unturn((u + v) / 2, (v - u) / 2);
}

/** Cambia el zoom manteniendo fijo el punto de pantalla (px, py), como al acercar con el dedo o la rueda. */
export function zoomAt(px, py, zoom) {
  const next = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
  const w = turn(screenToWorld(px, py).x, screenToWorld(px, py).y);
  view.zoom = next;
  view.x = px - (w.x - w.y) * HW * next;
  view.y = py - (w.x + w.y) * HH * next;
  clampView();
}

/** Gira la cámara `quarters` cuartos de vuelta (1 = a la derecha, −1 = a la izquierda) dejando quieto lo que está en el centro de la ventana. */
export function rotateView(quarters) {
  const vp = viewport();
  const cx = vp.left + vp.width / 2;
  const cy = vp.top + vp.height / 2;
  const w = screenToWorld(cx, cy);
  view.rot = (((view.rot + quarters) % 4) + 4) % 4;
  const q = turn(w.x, w.y);
  view.x = cx - (q.x - q.y) * HW * view.zoom;
  view.y = cy - (q.x + q.y) * HH * view.zoom;
  clampView();
}

/** Centra la ventana en una casilla. */
export function centerOnTile(x, y) {
  const vp = viewport();
  const q = turn(x + 0.5, y + 0.5);
  view.x = vp.left + vp.width / 2 - (q.x - q.y) * HW * view.zoom;
  view.y = vp.top + vp.height / 2 - (q.x + q.y) * HH * view.zoom;
  clampView();
}

/** Vista inicial: zoom por defecto y centrada en `cell` (por defecto, el Ayuntamiento de una partida nueva). */
export function resetView(cell = TOWN_HALL_CELL, zoom = CAMERA.startZoom) {
  view.zoom = zoom;
  centerOnTile(cell.x, cell.y);
}

/** Centro del rombo de un cuadro (x, y pueden ser fraccionarios: sirve para unidades que se mueven). */
export function tileCenter(x, y) {
  return toScreen(x + 0.5, y + 0.5);
}

/** Centro del bloque de terreno (tx, ty), de 2×2 cuadros: el punto donde se apoya su césped, agua o adorno. */
export function terrainCenter(tx, ty) {
  return toScreen(tx * TERRAIN.cells + TERRAIN.cells / 2, ty * TERRAIN.cells + TERRAIN.cells / 2);
}

/** Centro en pantalla de un rectángulo de cuadros { x, y, w, h } (el punto donde se apoya un edificio). */
export function rectCenter(x, y, w, h) {
  return toScreen(x + w / 2, y + h / 2);
}

/** Punto donde «pisa» un edificio o una unidad: el centro del rombo. */
export function tileBase(x, y) {
  return tileCenter(x, y);
}

/**
 * Los cuatro vértices del rombo de un cuadro, en pantalla, en el orden en que se recorren: con la vista sin girar
 * son [arriba, derecha, abajo, izquierda]; al girarla cada uno cambia de lado.
 */
export function tileCorners(x, y) {
  return [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)];
}

/** Los vértices de un rectángulo de cuadros { x, y, w, h } ordenados por su lugar en pantalla: { top, right, bottom, left }. */
export function rectCorners(x, y, w, h) {
  const pts = [toScreen(x, y), toScreen(x + w, y), toScreen(x + w, y + h), toScreen(x, y + h)];
  const by = (f) => pts.reduce((best, p) => (f(p) < f(best) ? p : best));
  return { top: by((p) => p.y), bottom: by((p) => -p.y), left: by((p) => p.x), right: by((p) => -p.x) };
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

const SLACK = 96; // px de holgura por cada «unidad» de `slack` (el ancho de un bloque de terreno)

/**
 * ¿El cuadro se ve dentro de la ventana? Sirve para no dibujar lo que no se ve.
 * `slack` agrega holgura alrededor (1 = un bloque de terreno de 2×2 cuadros), porque los dibujos altos o anchos
 * sobresalen de su cuadro.
 */
export function isTileVisible(x, y, slack = 1) {
  const vp = viewport();
  const c = tileCenter(x, y);
  const padX = (HW + slack * SLACK * 0.5) * view.zoom;
  const padUp = (HH + slack * SLACK * 1.1) * view.zoom; // los dibujos altos sobresalen hacia arriba
  const padDown = (HH + slack * SLACK * 0.3) * view.zoom;
  return c.x + padX > vp.left && c.x - padX < vp.left + vp.width && c.y + padDown > vp.top && c.y - padUp < vp.top + vp.height;
}

/** Orden de dibujado: lo que está más abajo en pantalla (x + y mayor, ya con la vista girada) se pinta encima. */
export function depthOf(x, y) {
  const q = turn(x + 0.5, y + 0.5);
  const a = q.x - 0.5;
  const b = q.y - 0.5;
  return a + b + (a - b) / 1000;
}
