// Misiones de campaña: bases enemigas generadas a partir del número de nivel (siempre la misma
// base para el mismo nivel). Lógica pura. El mapa es el mismo de 48×48 cuadros; los atacantes llegan por
// el borde inferior, así que la base enemiga se arma en la mitad de arriba. Cada edificio ocupa su tamaño
// (el mismo que en tu base; el Ayuntamiento enemigo es como el tuyo).
import { GRID } from '../data/config.js';
import { mulberry32 } from './decor.js';
import { sizeOf } from './logic.js';

const HALL = { x: 20, y: 9 }; // cuadro de arriba a la izquierda del Ayuntamiento enemigo (7×7)
const RING = 6; // cuadros libres entre el Ayuntamiento y el anillo de muros

/** Nombre a mostrar de un nivel de campaña. */
export const missionName = (level) => `Campaña ${level}`;

/**
 * Cuántos defensores tiene el enemigo del nivel `lvl`. Un ejército crece más o menos al doble por cada nivel
 * del Ayuntamiento (y el Ayuntamiento sube ~1 nivel cada 4 de campaña), así que la guarnición crece igual de
 * rápido: lenta al principio (2 guardias en el nivel 1) y cada vez más numerosa. Calibrado con tools/balance.mjs.
 */
export const garrisonSize = (lvl) => Math.min(MAX_GARRISON, Math.round(2 + 0.9 * lvl + 0.06 * lvl * lvl + 0.0035 * lvl ** 3));
const MAX_GARRISON = 200; // más no cabe en el mapa ni en la simulación: de ahí en adelante crece la dureza, no la cantidad

/** Dureza de los defensores: sube parejo hasta el nivel 30 y, ya con la guarnición al tope, más rápido todavía. */
const scaleOf = (lvl, perLevel) => 1 + perLevel * (Math.min(lvl, 30) - 1) + perLevel * 2 * Math.max(0, lvl - 30);

/**
 * Genera la base enemiga del nivel `level` (1, 2, 3…). Devuelve:
 * { level, boss, hpScale, dmgScale, buildings: [{ type, x, y, loot }], defenders: [{ kind, x, y }] }
 * (x, y de los edificios = su cuadro de arriba a la izquierda).
 */
export function generateMission(level) {
  const lvl = Math.max(1, Math.floor(level));
  const rand = mulberry32(1000 + lvl * 7919);
  const occupied = new Set();
  const buildings = [];
  const hall = sizeOf('hall');

  const fits = (type, x, y) => {
    const { w, h } = sizeOf(type);
    if (x < 0 || y < 0 || x + w > GRID.cols || y + h > GRID.rows) return false;
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (occupied.has(`${cx},${cy}`)) return false;
    return true;
  };
  const put = (type, x, y, loot = {}) => {
    if (!fits(type, x, y)) return false;
    const { w, h } = sizeOf(type);
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) occupied.add(`${cx},${cy}`);
    buildings.push({ type, x, y, loot });
    return true;
  };

  put('hall', HALL.x, HALL.y, { gold: 100 + 25 * lvl, wood: 60 + 15 * lvl });

  // Anillo de muros (un cuadro cada uno). Al principio tiene huecos de 2 cuadros al sur (por donde entran las
  // tropas); desde el nivel 7 es cerrado.
  const left = HALL.x - RING;
  const right = HALL.x + hall.w - 1 + RING;
  const top = HALL.y - RING;
  const bottom = HALL.y + hall.h - 1 + RING;
  const centerX = HALL.x + Math.floor(hall.w / 2);
  const gaps = Math.max(0, 2 - Math.floor((lvl - 1) / 3));
  const gapStarts = [];
  const southOffsets = [-6, -3, 0, 3];
  while (gapStarts.length < gaps) gapStarts.push(centerX + southOffsets.splice(Math.floor(rand() * southOffsets.length), 1)[0]);
  const inGap = (x) => gapStarts.some((g) => x === g || x === g + 1);
  for (let x = left; x <= right; x++) {
    for (let y = top; y <= bottom; y++) {
      const onRing = x === left || x === right || y === top || y === bottom;
      if (!onRing || (y === bottom && inGap(x))) continue;
      put('wall', x, y);
    }
  }

  // Torres en las esquinas interiores, un cuartel a la izquierda del Ayuntamiento y un almacén a la derecha.
  const corners = [[left + 1, top + 1], [right - 2, top + 1], [left + 1, bottom - 2], [right - 2, bottom - 2]];
  for (let i = corners.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const towers = Math.min(1 + Math.floor(lvl / 2), corners.length);
  for (let i = 0; i < towers; i++) put('tower', corners[i][0], corners[i][1]);
  put('storage', HALL.x + hall.w, HALL.y + 1, { gold: 50 + 10 * lvl, wood: 30 + 5 * lvl });
  if (lvl >= 2) put('barracks', left + 1, HALL.y + 1);

  // Edificios fuera del anillo: minas, aserraderos y casas.
  const outside = 3 + Math.min(lvl, 6);
  const kinds = ['mine', 'sawmill', 'house'];
  for (let placed = 0, tries = 0; placed < outside && tries < 600; tries++) {
    const x = 3 + Math.floor(rand() * 41);
    const y = 2 + Math.floor(rand() * 28); // deja libre el sur: ahí desembarcan las tropas
    if (x > left - 3 && x < right + 3 && y > top - 3 && y < bottom + 3) continue; // lejos del anillo
    const kind = kinds[placed % kinds.length];
    const loot = kind === 'mine' ? { gold: 30 + 8 * lvl } : kind === 'sawmill' ? { wood: 25 + 6 * lvl } : {};
    if (put(kind, x, y, loot)) placed++;
  }

  // Defensores: dentro del anillo, en los cuadros que no ocupa ningún edificio.
  const defenders = [];
  const near = () => {
    for (let tries = 0; tries < 40; tries++) {
      const x = left + 1 + rand() * (right - left - 1);
      const y = top + 1 + rand() * (bottom - top - 1);
      if (!occupied.has(`${Math.round(x)},${Math.round(y)}`)) return { x, y };
    }
    return { x: centerX, y: bottom - 1 };
  };
  // Una guarnición variada que crece con el nivel al ritmo con que crece un ejército de verdad (ver garrisonSize):
  // guardias en general, arqueros desde el nivel 3, brutos desde el 4, chamanes desde el 6 y arañas desde el 8.
  const total = garrisonSize(lvl);
  const share = (from, fraction) => (lvl >= from ? Math.max(1, Math.round(total * fraction)) : 0);
  const bowmen = share(3, 0.18);
  const brutes = share(4, Math.min(0.32, 0.1 + lvl * 0.01));
  const shamans = share(6, 0.1);
  const spiders = share(8, 0.1);
  const guards = Math.max(2, total - bowmen - brutes - shamans - spiders);
  for (const [kind, n] of [['guard', guards], ['bowman', bowmen], ['brute', brutes], ['shaman', shamans], ['spider', spiders]]) {
    for (let i = 0; i < n; i++) defenders.push({ kind, ...near() });
  }

  // El último enemigo de cada mapa (cada 10 niveles) es un jefe: más guarnición, más duro y con más botín.
  const boss = lvl % 10 === 0;
  if (boss) {
    for (let i = 0; i < Math.max(3, Math.round(total * 0.2)); i++) defenders.push({ kind: 'brute', ...near() });
    const heart = buildings.find((b) => b.type === 'hall');
    heart.loot = { gold: heart.loot.gold * 2, wood: heart.loot.wood * 2 };
  }

  return { level: lvl, boss, hpScale: scaleOf(lvl, 0.12) * (boss ? 1.25 : 1), dmgScale: scaleOf(lvl, 0.08) * (boss ? 1.15 : 1), buildings, defenders };
}
