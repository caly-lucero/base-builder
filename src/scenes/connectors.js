// Dibujo de los enlaces entre muros contiguos (ver game/walls.js). Lo usan la base y la batalla.
import { connectorSprite } from '../game/walls.js';
import { isTileVisible } from '../game/projection.js';

// Los enlaces verticales se asientan un poco más abajo del punto medio para tapar el hueco
// entre la parte baja de un muro y la parte alta del de abajo.
const V_OFFSET = 0.08;
const DEPTH_WORLD = 10;

/**
 * Crea, mueve y quita las imágenes de enlace para que coincidan con `list` (resultado de wallConnectors).
 *  - pool: Map key → imagen, que la escena conserva entre llamadas.
 *  - scene.placeOnTile(img, key, x, y, grow): coloca un dibujo apoyado en una casilla.
 *  - tintFor(connector): tinte del enlace o null.
 */
export function renderConnectors(scene, pool, list, { grow, tintFor }) {
  const wanted = new Set(list.map((c) => c.key));
  for (const [key, img] of pool) {
    if (!wanted.has(key)) {
      img.destroy();
      pool.delete(key);
    }
  }

  for (const c of list) {
    const texture = connectorSprite(c.orient, c.level);
    let img = pool.get(c.key);
    if (!img) {
      img = scene.add.image(0, 0, texture);
      pool.set(c.key, img);
    }
    const visible = isTileVisible(Math.round(c.x), Math.round(c.y));
    img.setVisible(visible);
    if (!visible) continue;

    scene.placeOnTile(img, texture, c.x, c.orient === 'v' ? c.y + V_OFFSET : c.y, grow);
    const tint = tintFor(c);
    if (tint) img.setTint(tint);
    else img.clearTint();

    // Horizontal: justo debajo de las dos piezas, para que sus contornos queden por encima.
    // Vertical: entre la fila de arriba y la de abajo.
    img.setDepth(DEPTH_WORLD + (c.orient === 'h' ? c.y + (c.x - 0.5) / 100 - 0.002 : c.y + c.x / 100));
  }
}
