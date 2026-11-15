// Proyección y cámara: la ÚNICA parte que sabe cómo se pasa de coordenadas de casilla a pantalla.
// Hoy es ortogonal (vista cenital, cada casilla es un cuadrado) con desplazamiento y zoom.
// Para pasar a isométrico bastará con reescribir estas funciones y cambiar el arte; la lógica
// del juego, el guardado y la economía solo hablan en casillas (x, y) y no cambian.
//
// El mapa se ve por una «ventana» rectangular (LAYOUT.viewHeight de alto, entre el HUD y la
// barra de abajo). `view` dice dónde cae en pantalla la esquina superior izquierda del mapa.
import { ART_SIZE, CAMERA, GRID, LAYOUT } from '../data/config.js';
import { TOWN_HALL_CELL, inBounds } from './logic.js';

const T = GRID.tile;

/** Escala base de los sprites (sin zoom): ART_SIZE px → una casilla. */
export const SPRITE_SCALE = T / ART_SIZE;

/** Margen entre el pie de un dibujo y el borde inferior de su casilla (en px sin zoom). */
export const GROUND_MARGIN = 4;

/** Estado de la cámara. Se modifica solo con las funciones de abajo. */
export const view = { zoom: CAMERA.startZoom, x: 0, y: LAYOUT.gridTop };

const viewport = () => ({ left: 0, top: LAYOUT.gridTop, width: LAYOUT.width, height: LAYOUT.viewHeight });

export const tileSize = () => T * view.zoom;
export const spriteScale = () => SPRITE_SCALE * view.zoom;

/** Coloca el mapa dentro de la ventana: si es más chico que ella, lo centra; si no, no deja huecos. */
export function clampView() {
  const vp = viewport();
  const ww = GRID.cols * tileSize();
  const wh = GRID.rows * tileSize();
  view.x = ww <= vp.width ? vp.left + (vp.width - ww) / 2 : Math.min(vp.left, Math.max(vp.left + vp.width - ww, view.x));
  view.y = wh <= vp.height ? vp.top + (vp.height - wh) / 2 : Math.min(vp.top, Math.max(vp.top + vp.height - wh, view.y));
}

/** Desplaza el mapa `dx, dy` píxeles de pantalla. */
export function panBy(dx, dy) {
  view.x += dx;
  view.y += dy;
  clampView();
}

/** Cambia el zoom manteniendo fijo el punto de pantalla (px, py), como al acercar con el dedo o la rueda. */
export function zoomAt(px, py, zoom) {
  const next = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
  const ts = tileSize();
  const worldX = (px - view.x) / ts; // punto del mapa bajo (px, py), en casillas
  const worldY = (py - view.y) / ts;
  view.zoom = next;
  view.x = px - worldX * tileSize();
  view.y = py - worldY * tileSize();
  clampView();
}

/** Centra la ventana en una casilla. */
export function centerOnTile(x, y) {
  const vp = viewport();
  view.x = vp.left + vp.width / 2 - (x + 0.5) * tileSize();
  view.y = vp.top + vp.height / 2 - (y + 0.5) * tileSize();
  clampView();
}

/** Vista inicial: zoom por defecto y centrada en `cell` (por defecto, el Ayuntamiento de una partida nueva). */
export function resetView(cell = TOWN_HALL_CELL) {
  view.zoom = CAMERA.startZoom;
  centerOnTile(cell.x, cell.y);
}

/** Centro de una casilla en pantalla. */
export function tileCenter(x, y) {
  const ts = tileSize();
  return { x: view.x + (x + 0.5) * ts, y: view.y + (y + 0.5) * ts };
}

/** Esquina superior izquierda de una casilla en pantalla. */
export function tileTopLeft(x, y) {
  const ts = tileSize();
  return { x: view.x + x * ts, y: view.y + y * ts };
}

/** Punto donde «pisa» un edificio o adorno: centro horizontal, cerca del borde inferior de la casilla. */
export function tileBase(x, y) {
  const c = tileCenter(x, y);
  return { x: c.x, y: c.y + tileSize() / 2 - GROUND_MARGIN * view.zoom };
}

/** ¿El punto de pantalla cae dentro de la ventana del mapa (y no sobre el HUD o la barra)? */
export function inViewport(px, py) {
  const vp = viewport();
  return px >= vp.left && px < vp.left + vp.width && py >= vp.top && py < vp.top + vp.height;
}

/** Casilla bajo un punto de la pantalla, o null si cae fuera de la ventana o del mapa. */
export function screenToTile(px, py) {
  if (!inViewport(px, py)) return null;
  const ts = tileSize();
  const x = Math.floor((px - view.x) / ts);
  const y = Math.floor((py - view.y) / ts);
  return inBounds(x, y) ? { x, y } : null;
}

/**
 * ¿La casilla se ve dentro de la ventana? Sirve para no dibujar lo que no se ve.
 * `slack` agrega casillas de holgura alrededor, porque los dibujos altos sobresalen de su casilla.
 */
export function isTileVisible(x, y, slack = 1) {
  const vp = viewport();
  const ts = tileSize();
  const pad = slack * ts;
  const left = view.x + x * ts;
  const top = view.y + y * ts;
  return (
    left + ts > vp.left - pad &&
    left < vp.left + vp.width + pad &&
    top + ts > vp.top - pad &&
    top < vp.top + vp.height + pad
  );
}

/** Orden de dibujado: lo que está más abajo se pinta encima. */
export function depthOf(x, y) {
  return y + x / 100;
}
