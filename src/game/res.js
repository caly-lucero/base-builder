// Nitidez: el lienzo se dibuja a la resolución real de la pantalla (K veces el tamaño lógico) y las cámaras
// hacen zoom K, así todo el juego sigue hablando en píxeles lógicos (432 de ancho) pero el texto y los dibujos
// de interfaz salen nítidos. El puntero llega en píxeles del lienzo y aquí se convierte a lógicos.
import { LAYOUT } from '../data/config.js';

export const RES = { k: 1 };

const MAX_K = 2; // más no se nota con este arte y pesa mucho en celulares modestos

/** Calcula K según el tamaño y la densidad de la pantalla. Se llama una vez, después de `fitLayout`. */
export function fitRes(innerW, innerH, dpr = 1) {
  const css = Math.min(innerW / LAYOUT.width, innerH / LAYOUT.height); // píxeles CSS por píxel lógico
  const raw = (Number.isFinite(css) && css > 0 ? css : 1) * (dpr > 0 ? dpr : 1);
  RES.k = Math.min(MAX_K, Math.max(1, Math.round(raw * 4) / 4));
  return RES.k;
}

/** Pone la cámara de una escena a zoom K anclada arriba a la izquierda: (0, 0) lógico es la esquina del lienzo. */
export function fitCamera(scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RES.k).setScroll(0, 0);
}

/** El puntero visto en píxeles lógicos (un objeto que hereda del original: lo demás se lee igual). */
export function logical(pointer) {
  if (!pointer || RES.k === 1) return pointer;
  return Object.create(pointer, { x: { value: pointer.x / RES.k }, y: { value: pointer.y / RES.k } });
}

/** Como `scene.input.on(evento, fn)` pero entregando el puntero en píxeles lógicos. */
export function onPointer(scene, event, fn) {
  scene.input.on(event, (pointer, ...rest) => fn.call(scene, logical(pointer), ...rest));
}
