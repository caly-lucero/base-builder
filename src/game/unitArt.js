// Cómo se leen las hojas de animación de los personajes (las hace tools/iso/sheets.js). Lógica pura.
//   fila 0: caminar hacia abajo-derecha (6 cuadros)     fila 1: caminar hacia arriba-derecha (6)
//   fila 2: atacar abajo-derecha (4) + arriba-derecha (4)
//   fila 3: quieto SE, quieto NE, caído SE, caído NE
// Hacia la izquierda se usa el mismo cuadro volteado (flipX).
import { ART_SCALE } from '../data/config.js';

export const SHEET = { frameWidth: 96 * ART_SCALE, frameHeight: 120 * ART_SCALE, cols: 8, anchorX: 48 * ART_SCALE, anchorY: 98 * ART_SCALE };
export const WALK_FRAMES = 6;
export const ATTACK_FRAMES = 4;

/** De un desplazamiento en casillas (dx, dy) a hacia dónde mira en pantalla: voltear y si va hacia arriba. */
export function facing(dx, dy) {
  const sx = dx - dy; // pantalla: derecha +
  const sy = dx + dy; // pantalla: abajo +
  return { flipX: sx < -1e-6, north: sy < -1e-6 };
}

/**
 * Cuadro y volteo para una animación:
 *  - walk: `t` es el avance (en ciclos); attack: `t` va de 0 a 1; idle y die ignoran `t`.
 */
export function unitFrame(anim, dx, dy, t = 0) {
  const { flipX, north } = facing(dx, dy);
  const row = north ? 1 : 0;
  const cols = SHEET.cols;
  if (anim === 'walk') return { frame: row * cols + (Math.floor(((t % 1) + 1) % 1 * WALK_FRAMES) % WALK_FRAMES), flipX };
  if (anim === 'attack') return { frame: 2 * cols + row * ATTACK_FRAMES + Math.min(ATTACK_FRAMES - 1, Math.max(0, Math.floor(t * ATTACK_FRAMES))), flipX };
  if (anim === 'die') return { frame: 3 * cols + 2 + row, flipX };
  return { frame: 3 * cols + row, flipX }; // idle
}

/** Cuadro «quieto» mirando hacia abajo-derecha: sirve de retrato en menús. */
export const PORTRAIT_FRAME = 3 * SHEET.cols;
