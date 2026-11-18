// Mapas de campaña: cada mapa tiene 10 enemigos (puntos) que se atacan en orden; al superar los 10 se abre otro mapa
// con enemigos más fuertes. Lógica pura: solo agrupa los niveles de campaña (1, 2, 3…) de 10 en 10.

export const NODES_PER_MAP = 10;

/** Nombres y colores de los primeros mapas; después se repiten con el número. */
export const MAP_THEMES = [
  { name: 'Praderas del Reino', top: 0x9fd36f, bottom: 0x4f8f3a, decor: ['tree_a', 'tree_b', 'bush_a', 'rock_b'] },
  { name: 'Bosque Umbrío', top: 0x4f8a5a, bottom: 0x1f4a30, decor: ['tree_a', 'tree_c', 'tree_b', 'bush_b'] },
  { name: 'Pantano de Niebla', top: 0x9fb08a, bottom: 0x55633f, decor: ['tree_c', 'bush_b', 'stump', 'rock_d'] },
  { name: 'Desierto Ardiente', top: 0xf0d58a, bottom: 0xc9953f, decor: ['rock_a', 'rock_c', 'rock_e', 'stump'] },
  { name: 'Montañas Heladas', top: 0xdfeaf2, bottom: 0x8fb0c8, decor: ['rock_a', 'rock_c', 'rock_f', 'rock_e'] },
  { name: 'Tierras Volcánicas', top: 0xb9604a, bottom: 0x4a2a24, decor: ['rock_a', 'rock_f', 'rock_c', 'stump'] },
  { name: 'Ciénaga Maldita', top: 0x7a9a6a, bottom: 0x2f4a3a, decor: ['tree_c', 'stump', 'log', 'bush_b'] },
  { name: 'Ruinas Antiguas', top: 0xc8c2a8, bottom: 0x7a765f, decor: ['rock_b', 'rock_d', 'crate', 'rock_e'] },
  { name: 'Costa de Tormentas', top: 0x9ac0d8, bottom: 0x4d7a9a, decor: ['rock_c', 'rock_d', 'log', 'bush_a'] },
  { name: 'El Abismo', top: 0x6a4a8a, bottom: 0x241638, decor: ['rock_a', 'rock_f', 'stump', 'rock_c'] },
];

/** Posiciones de los 10 puntos dentro del mapa (0–1), de abajo a arriba formando un camino con curvas. */
export const NODE_POSITIONS = [
  { x: 0.2, y: 0.92 },
  { x: 0.52, y: 0.86 },
  { x: 0.8, y: 0.77 },
  { x: 0.62, y: 0.66 },
  { x: 0.3, y: 0.6 },
  { x: 0.18, y: 0.46 },
  { x: 0.46, y: 0.38 },
  { x: 0.78, y: 0.34 },
  { x: 0.7, y: 0.2 },
  { x: 0.4, y: 0.09 },
];

/** Número de mapa (0, 1, 2…) al que pertenece un nivel de campaña. */
export const mapOfLevel = (level) => Math.floor((Math.max(1, level) - 1) / NODES_PER_MAP);

/** Primer nivel de un mapa. */
export const firstLevelOfMap = (map) => map * NODES_PER_MAP + 1;

/** Nombre y colores de un mapa. */
export function themeOf(map) {
  const base = MAP_THEMES[map % MAP_THEMES.length];
  const lap = Math.floor(map / MAP_THEMES.length);
  return { ...base, name: lap ? `${base.name} ${lap + 1}` : base.name };
}

/** Mapa en el que está la campaña ahora (donde está el siguiente enemigo por vencer). */
export const currentMap = (state) => mapOfLevel(state.campaign.cleared + 1);

/** Estado de un nivel: 'done' (superado), 'current' (el siguiente) o 'locked'. */
export function levelStatus(state, level) {
  if (level <= state.campaign.cleared) return 'done';
  return level === state.campaign.cleared + 1 ? 'current' : 'locked';
}

/** Estrellas (0–3) de un nivel superado (las partidas antiguas sin dato cuentan 1). */
export function starsOf(state, level) {
  return state.campaign.stars[level] ?? (level <= state.campaign.cleared ? 1 : 0);
}

/**
 * Los 10 puntos de un mapa: [{ level, index, status, stars, boss, pos }]. El último de cada mapa es el jefe.
 */
export function mapNodes(state, map) {
  return NODE_POSITIONS.map((pos, index) => {
    const level = firstLevelOfMap(map) + index;
    return { level, index, status: levelStatus(state, level), stars: starsOf(state, level), boss: index === NODES_PER_MAP - 1, pos };
  });
}

/** Estrellas ganadas y posibles en un mapa. */
export function mapStars(state, map) {
  const nodes = mapNodes(state, map);
  return { got: nodes.reduce((n, x) => n + x.stars, 0), max: nodes.length * 3 };
}

/** ¿Se puede ver ese mapa? Los ya abiertos sí (hasta el actual); el siguiente se abre al superar los 10 de este. */
export const isMapOpen = (state, map) => map >= 0 && map <= currentMap(state);
