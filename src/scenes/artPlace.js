// Cómo se colocan los dibujos en pantalla (lo comparten la base y la batalla).
import { spriteScale, tileBase } from '../game/projection.js';
import { PORTRAIT_FRAME } from '../game/unitArt.js';
import { anchorOf, contentBounds, isSheet } from '../game/sprites.js';

/**
 * Apoya un dibujo sobre una casilla (x, y pueden ser fraccionarios): el punto de apoyo del arte cae en el
 * centro del rombo y la escala sigue al zoom. En una hoja de personaje conserva el cuadro que tenga puesto.
 */
export function placeOnTile(img, key, x, y, grow = 1) {
  const a = anchorOf(key);
  const p = tileBase(x, y);
  if (img.texture.key !== key) img.setTexture(key);
  return img.setOrigin(a.x, a.y).setPosition(p.x, p.y).setScale(spriteScale() * grow);
}

/** Dibuja un icono centrado en (cx, cy) que cabe en un cuadrado de `size` px de pantalla (sin zoom). */
export function fitIcon(scene, img, key, cx, cy, size) {
  const sheet = isSheet(key);
  if (sheet) img.setTexture(key, PORTRAIT_FRAME);
  else img.setTexture(key);
  const b = contentBounds(scene.textures, key);
  return img.setOrigin(b.cx / b.fw, b.cy / b.fh).setPosition(cx, cy).setScale(size / Math.max(b.w, b.h));
}
