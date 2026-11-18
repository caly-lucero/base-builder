// Cómo se colocan los dibujos en pantalla (lo comparten la base y la batalla).
import { artTurn, rotateVec, spriteScale, tileBase, view } from '../game/projection.js';
import { PORTRAIT_FRAME, unitFrame } from '../game/unitArt.js';
import { IMAGES } from '../data/assets.js';
import { anchorOf, contentBounds, isSheet } from '../game/sprites.js';

const BUILDING_ART = /^(townhall|mine|sawmill|storage|tower|wall|gate|house|barracks|archery|atelier|stable|siege|forge|altar)_\d$/;

/**
 * Apoya un dibujo sobre una casilla (x, y pueden ser fraccionarios): el punto de apoyo del arte cae en el
 * centro del rombo y la escala sigue al zoom. En una hoja de personaje conserva el cuadro que tenga puesto.
 */
export function placeOnTile(img, key, x, y, grow = 1) {
  const art = viewKey(key);
  const a = anchorOf(art);
  const p = tileBase(x, y);
  if (img.texture.key !== art) img.setTexture(art);
  return img.setOrigin(a.x, a.y).setPosition(p.x, p.y).setScale(spriteScale() * grow);
}

/** Los edificios tienen un dibujo por cada giro de la cámara: devuelve el que toca ahora (el de siempre si no está girada). */
export function viewKey(key) {
  return view.rot && BUILDING_ART.test(key) ? `${key}_r${artTurn()}` : key;
}

/** Dibujos de edificios que faltan para ver el mapa con el giro `rot`: [[clave, archivo], …] (los giros no se cargan hasta usarlos). */
export function missingRotationArt(scene, rot) {
  const turn = artTurn(rot);
  if (!turn) return [];
  return Object.entries(IMAGES).filter(([key]) => key.endsWith(`_r${turn}`) && !scene.textures.exists(key));
}

/** Cuadro de animación de un personaje que se mueve o mira en la dirección (dx, dy) del mapa, vista con la cámara girada. */
export function viewFrame(anim, dx, dy, t) {
  const v = rotateVec(dx, dy);
  return unitFrame(anim, v.dx, v.dy, t);
}

/** Dibuja un icono centrado en (cx, cy) que cabe en un cuadrado de `size` px de pantalla (sin zoom). */
export function fitIcon(scene, img, key, cx, cy, size) {
  const sheet = isSheet(key);
  if (sheet) img.setTexture(key, PORTRAIT_FRAME);
  else img.setTexture(key);
  const b = contentBounds(scene.textures, key);
  return img.setOrigin(b.cx / b.fw, b.cy / b.fh).setPosition(cx, cy).setScale(size / Math.max(b.w, b.h));
}
