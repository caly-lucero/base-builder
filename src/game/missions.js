// Misiones de campaña: bases enemigas generadas a partir del número de nivel (siempre la misma
// base para el mismo nivel). Lógica pura. El mapa es el mismo de 24×24; los atacantes llegan por
// el borde inferior, así que la base enemiga se arma en la mitad de arriba.
import { GRID } from '../data/config.js';
import { mulberry32 } from './decor.js';

const HALL = { x: 12, y: 7 };
const RING = 3; // radio del anillo de muros alrededor del Ayuntamiento enemigo

/** Nombre a mostrar de un nivel de campaña. */
export const missionName = (level) => `Campaña ${level}`;

/**
 * Genera la base enemiga del nivel `level` (1, 2, 3…). Devuelve:
 * { level, hpScale, dmgScale, buildings: [{ type, x, y, loot }], defenders: [{ kind, x, y }] }
 */
export function generateMission(level) {
  const lvl = Math.max(1, Math.floor(level));
  const rand = mulberry32(1000 + lvl * 7919);
  const occupied = new Set();
  const buildings = [];
  const put = (type, x, y, loot = {}) => {
    const key = `${x},${y}`;
    if (x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows || occupied.has(key)) return false;
    occupied.add(key);
    buildings.push({ type, x, y, loot });
    return true;
  };

  put('hall', HALL.x, HALL.y, { gold: 100 + 25 * lvl, wood: 60 + 15 * lvl });

  // Anillo de muros. Al principio tiene huecos al sur (por donde entran las tropas); desde el nivel 7 es cerrado.
  const gaps = Math.max(0, 2 - Math.floor((lvl - 1) / 3));
  const gapXs = [];
  const southXs = [-2, -1, 0, 1, 2];
  while (gapXs.length < gaps) gapXs.push(HALL.x + southXs.splice(Math.floor(rand() * southXs.length), 1)[0]);
  for (let x = HALL.x - RING; x <= HALL.x + RING; x++) {
    for (let y = HALL.y - RING; y <= HALL.y + RING; y++) {
      const onRing = Math.abs(x - HALL.x) === RING || Math.abs(y - HALL.y) === RING;
      if (!onRing || (y === HALL.y + RING && gapXs.includes(x))) continue;
      put('wall', x, y);
    }
  }

  // Torres en las esquinas interiores, y un almacén y un cuartel dentro del anillo.
  const corners = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const towers = Math.min(1 + Math.floor(lvl / 2), corners.length);
  for (let i = 0; i < towers; i++) put('tower', HALL.x + corners[i][0], HALL.y + corners[i][1]);
  put('storage', HALL.x - 1, HALL.y, { gold: 50 + 10 * lvl, wood: 30 + 5 * lvl });
  if (lvl >= 2) put('barracks', HALL.x + 1, HALL.y);

  // Edificios fuera del anillo: minas, aserraderos y granjas.
  const outside = 3 + Math.min(lvl, 6);
  const kinds = ['mine', 'sawmill', 'house'];
  for (let placed = 0, tries = 0; placed < outside && tries < 400; tries++) {
    const x = 2 + Math.floor(rand() * 20);
    const y = 1 + Math.floor(rand() * 13); // deja libre el sur: ahí desembarcan las tropas
    if (Math.abs(x - HALL.x) <= RING + 1 && Math.abs(y - HALL.y) <= RING + 1) continue;
    const kind = kinds[placed % kinds.length];
    const loot = kind === 'mine' ? { gold: 30 + 8 * lvl } : kind === 'sawmill' ? { wood: 25 + 6 * lvl } : {};
    if (put(kind, x, y, loot)) placed++;
  }

  // Defensores: guardias desde el principio y brutos desde el nivel 4, cerca del Ayuntamiento.
  const defenders = [];
  const near = () => ({ x: HALL.x + (rand() * 5 - 2.5), y: HALL.y + (rand() * 5 - 2.5) });
  // Una guarnición variada: guardias en general, arqueros desde el nivel 3, chamanes desde el 6 y brutos desde el 4.
  const total = Math.min(2 + lvl, 10);
  const bowmen = lvl >= 3 ? Math.min(1 + Math.floor((lvl - 3) / 3), 4) : 0;
  const shamans = lvl >= 6 ? Math.min(1 + Math.floor((lvl - 6) / 4), 3) : 0;
  const guards = Math.max(2, total - bowmen - shamans);
  for (let i = 0; i < guards; i++) defenders.push({ kind: 'guard', ...near() });
  for (let i = 0; i < bowmen; i++) defenders.push({ kind: 'bowman', ...near() });
  for (let i = 0; i < shamans; i++) defenders.push({ kind: 'shaman', ...near() });
  for (let i = 0; i < Math.max(0, Math.floor((lvl - 2) / 2)); i++) defenders.push({ kind: 'brute', ...near() });

  // El último enemigo de cada mapa (cada 10 niveles) es un jefe: más guarnición, más duro y con más botín.
  const boss = lvl % 10 === 0;
  if (boss) {
    for (let i = 0; i < 3; i++) defenders.push({ kind: 'brute', ...near() });
    const hall = buildings.find((b) => b.type === 'hall');
    hall.loot = { gold: hall.loot.gold * 2, wood: hall.loot.wood * 2 };
  }

  return { level: lvl, boss, hpScale: (1 + 0.12 * (lvl - 1)) * (boss ? 1.25 : 1), dmgScale: (1 + 0.08 * (lvl - 1)) * (boss ? 1.15 : 1), buildings, defenders };
}
