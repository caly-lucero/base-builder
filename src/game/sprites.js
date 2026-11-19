// Medición y anclaje de sprites. Cada tipo de dibujo se apoya en su casilla por un punto distinto
// (los pone tools/iso): edificios y adornos por el centro del rombo que pisan, personajes por los pies.
import { IMAGES, SHEETS } from '../data/assets.js';
import { ART_BOXES } from '../data/artBoxes.js';
import { ART_BOXES as SYLVAN_BOXES } from '../data/artBoxesSylvan.js';
import { current } from '../data/races.js';
import { ART_SCALE } from '../data/config.js';
import { PORTRAIT_FRAME, SHEET } from './unitArt.js';

const ALPHA_THRESHOLD = 20;
const scaled = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * ART_SCALE]));
const cache = new Map();

// Punto de apoyo (en px del lienzo) y tamaño del lienzo de cada tipo de dibujo. Cada edificio tiene el suyo
// (ver ART_BOXES: el lienzo se recorta a lo que ocupa y el apoyo es el centro de su rectángulo).
const BUILDING = scaled({ w: 192, h: 256, x: 96, y: 196 });
const DECOR = scaled({ w: 160, h: 176, x: 80, y: 128 });
const FLOWER = scaled({ w: 32, h: 24, x: 16, y: 17 });

const BUILDING_KEY = /^(townhall|mine|sawmill|storage|tower|wall|gate|house|barracks|archery|atelier|stable|siege|forge|altar)_\d(_r\d)?$/;

/** ¿La clave es una hoja de personaje (varios cuadros)? */
export const isSheet = (key) => Object.hasOwn(SHEETS, key);

/** Origen (0-1) con el que se apoya un dibujo en su casilla: el punto de la imagen que cae en el centro del rombo. */
export function anchorOf(key) {
  if (isSheet(key)) return { x: SHEET.anchorX / SHEET.frameWidth, y: SHEET.anchorY / SHEET.frameHeight };
  const t = (current.race === 'sylvan' ? SYLVAN_BOXES : ART_BOXES)[key] ?? (BUILDING_KEY.test(key) ? BUILDING : /^(flower_|tuft)/.test(key) ? FLOWER : DECOR);
  return { x: t.x / t.w, y: t.y / t.h };
}

/**
 * Rectángulo opaco de una textura (o de un cuadro de una hoja), en píxeles del cuadro:
 * { cx, cy } centro, { bottom } borde inferior, { w, h } tamaño, { fw, fh } tamaño del cuadro.
 */
export function contentBounds(textures, key, frame) {
  const frameName = frame ?? (isSheet(key) ? PORTRAIT_FRAME : '__BASE');
  const id = `${key}:${frameName}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const tex = textures.get(key);
  const img = tex.getSourceImage();
  const f = tex.get(frameName);
  const fw = f.cutWidth;
  const fh = f.cutHeight;
  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, f.cutX, f.cutY, fw, fh, 0, 0, fw, fh);
  const { data, width, height } = ctx.getImageData(0, 0, fw, fh);

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bounds =
    maxX < 0
      ? { cx: width / 2, cy: height / 2, bottom: height, w: width, h: height, fw, fh } // imagen vacía: se usa entera
      : { cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2, bottom: maxY + 1, w: maxX - minX + 1, h: maxY - minY + 1, fw, fh };
  cache.set(id, bounds);
  return bounds;
}

/** ¿Es una clave de imagen o de hoja conocida? */
export const isArt = (key) => Object.hasOwn(IMAGES, key) || isSheet(key);
