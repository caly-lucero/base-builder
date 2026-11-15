// Muros unidos: los muros y puertas que están uno junto a otro se dibujan como una sola pared.
// Esto calcula, a partir de los edificios, qué piezas de enlace hay que dibujar entre vecinos.
// Lógica pura: no sabe de Phaser. Las coordenadas son casillas (con decimales si está entre dos).

const WALL_LIKE = new Set(['wall', 'gate']);

export const isWallLike = (type) => WALL_LIKE.has(type);

/**
 * Enlaces entre muros/puertas contiguos (solo en las 4 direcciones; las diagonales no se unen).
 * `buildings` son objetos con { type, x, y, level } (el nivel es 1 si falta).
 * Devuelve [{ key, orient: 'h'|'v', x, y, level }]:
 *  - 'h': une una casilla con la de su derecha; se coloca entre las dos (x + 0.5).
 *  - 'v': une una casilla con la de abajo; se coloca entre las dos (y + 0.5).
 *  - level: el menor de los dos niveles (la pared es tan buena como su parte más débil).
 */
export function wallConnectors(buildings) {
  const cells = new Map();
  for (const b of buildings) if (isWallLike(b.type)) cells.set(`${b.x},${b.y}`, b);

  const out = [];
  for (const b of cells.values()) {
    const level = (e) => e.level ?? 1;
    const east = cells.get(`${b.x + 1},${b.y}`);
    if (east) out.push({ key: `h:${b.x},${b.y}`, orient: 'h', x: b.x + 0.5, y: b.y, level: Math.min(level(b), level(east)) });
    const south = cells.get(`${b.x},${b.y + 1}`);
    if (south) out.push({ key: `v:${b.x},${b.y}`, orient: 'v', x: b.x, y: b.y + 0.5, level: Math.min(level(b), level(south)) });
  }
  return out;
}

/** Los niveles 4 y 5 reutilizan el dibujo de enlace del nivel 3 (con su tinte). */
export const connectorSprite = (orient, level) => `wall${orient}_${Math.min(Math.max(level, 1), 3)}`;
