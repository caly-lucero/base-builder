// Guardado: serialización, validación estricta, migraciones, checksum,
// copia de respaldo y exportar/importar.
//
// Nota de seguridad: el checksum NO impide hacer trampa (el código está en el
// navegador y cualquiera puede recalcularlo). Solo detecta archivos dañados o
// editados a mano sin querer. En un juego de un jugador está bien así.
import { ARMY_UNITS, BUILDINGS, ECONOMY, GRID, QUESTS } from '../data/config.js';
import {
  MAX_BUILDINGS,
  TOWN_HALL_CELL,
  createBuilding,
  emptyArmy,
  findFreeCell,
  isBuildingType,
  supplyCap,
  supplyUsed,
} from './logic.js';

export const SAVE_VERSION = 5;
export const MAX_SAVE_BYTES = 200_000;

const KEY = 'basebuilder.save';
const BACKUP_KEY = 'basebuilder.save.bak';
const BACKUP_EVERY_MS = 60_000;
const MAX_GOLD = 1_000_000_000;
const MAX_TIME = 8.64e15; // límite de Date

let lastBackupAt = 0;

/* ---------- checksum ---------- */

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const checksum = (data) => fnv1a('bb1|' + JSON.stringify(data)); // exportado para las pruebas

/* ---------- serializar / parsear ---------- */

export function serialize(state) {
  const data = JSON.parse(JSON.stringify(state)); // copia limpia
  return JSON.stringify({ v: SAVE_VERSION, sum: checksum(data), data });
}

/**
 * Lee texto de una partida. Nunca lanza: devuelve { ok, state } o { ok:false, error }.
 * Todo lo que viene de fuera (localStorage o archivo) pasa por aquí.
 */
export function parseSave(text) {
  try {
    if (typeof text !== 'string' || text.length === 0) return err('Archivo vacío');
    if (text.length > MAX_SAVE_BYTES) return err('Archivo demasiado grande');

    const env = JSON.parse(text);
    if (!isPlainObject(env)) return err('Formato inválido');
    if (!Number.isInteger(env.v) || env.v < 1) return err('Versión inválida');
    if (env.v > SAVE_VERSION) return err('La partida es de una versión más nueva del juego');
    if (typeof env.sum !== 'string' || !isPlainObject(env.data)) return err('Formato inválido');
    if (env.sum !== checksum(env.data)) return err('La partida está dañada o fue modificada');

    const migrated = migrate(env.data, env.v);
    return { ok: true, state: validateState(migrated) };
  } catch (e) {
    return err(e instanceof ValidationError ? e.message : 'No se pudo leer la partida');
  }
}

/* ---------- migraciones ---------- */

// Cuando cambie el formato: sube SAVE_VERSION y agrega aquí un paso por versión.
// Los datos llegan sin validar: cada paso debe tolerar formas inesperadas
// (la validación estricta se hace después, sobre el resultado final).
function migrate(data, version) {
  let d = data;

  if (version < 2) {
    // v1 → v2: los edificios no tenían nivel ni mejoras en curso.
    d = {
      ...d,
      buildings: Array.isArray(d.buildings)
        ? d.buildings.map((b) => (isPlainObject(b) ? { ...b, level: 1, upgradeEndsAt: null } : b))
        : d.buildings,
    };
  }

  if (version < 3) d = migrateV2toV3(d);

  // v3 → v4: aparecieron las misiones. Una base ya avanzada las tendrá cumplidas y podrá reclamarlas.
  if (version < 4) d = { ...d, claimedQuests: [] };

  // v4 → v5: aparecieron el ejército, el héroe y el entrenamiento en los edificios.
  if (version < 5) {
    d = {
      ...d,
      army: emptyArmy(),
      hero: null,
      buildings: Array.isArray(d.buildings) ? d.buildings.map((b) => (isPlainObject(b) ? { ...b, training: null } : b)) : d.buildings,
    };
  }

  return d;
}

// v2 → v3: el mapa pasó de 12×12 a 24×24, apareció la madera y el Ayuntamiento.
// Las constantes son las de aquella época a propósito: describen cómo eran las partidas v2,
// no cómo es el juego hoy.
const V2_TO_V3_SHIFT = 6; // (24 − 12) / 2: la base antigua queda centrada en el mapa nuevo
const V3_WOOD_GIFT = 60;

function migrateV2toV3(data) {
  const d = { ...data, wood: V3_WOOD_GIFT };
  if (!Array.isArray(d.buildings) || !Number.isInteger(d.nextId)) return d; // la validación lo rechazará

  const buildings = d.buildings.map((b) =>
    isPlainObject(b) && Number.isInteger(b.x) && Number.isInteger(b.y)
      ? { ...b, x: b.x + V2_TO_V3_SHIFT, y: b.y + V2_TO_V3_SHIFT }
      : b,
  );
  const valid = buildings.filter((b) => isPlainObject(b) && isBuildingType(b.type));

  // El Ayuntamiento nace en el centro (o en la casilla libre más cercana) y con el nivel
  // mínimo que permita que lo que el jugador ya tenía siga siendo legal.
  const cell = findFreeCell(new Set(valid.map((b) => `${b.x},${b.y}`)), TOWN_HALL_CELL.x, TOWN_HALL_CELL.y);
  if (!cell) return { ...d, buildings };

  const counts = {};
  let highest = 1;
  for (const b of valid) {
    counts[b.type] = (counts[b.type] ?? 0) + 1;
    if (Number.isInteger(b.level)) highest = Math.max(highest, b.level);
  }
  const halls = BUILDINGS.townhall.levels;
  let level = Math.min(Math.max(highest, 1), halls.length);
  while (level < halls.length && Object.entries(counts).some(([type, n]) => n > (halls[level - 1].limits[type] ?? Infinity))) {
    level++;
  }

  return {
    ...d,
    nextId: d.nextId + 1,
    buildings: [...buildings, createBuilding(d.nextId, 'townhall', cell.x, cell.y, Number.isFinite(d.savedAt) ? d.savedAt : 0, level)],
  };
}

/* ---------- validación estricta ---------- */

class ValidationError extends Error {}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const isNum = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

function bad(msg) {
  throw new ValidationError(msg);
}

/** Devuelve un estado NUEVO y limpio (solo campos conocidos) o lanza ValidationError. */
export function validateState(d) {
  if (!isPlainObject(d)) bad('Estado inválido');
  if (!isInt(d.gold, 0, MAX_GOLD)) bad('Oro inválido');
  if (!isInt(d.wood, 0, MAX_GOLD)) bad('Madera inválida');
  if (!isInt(d.nextId, 1, 10_000_000)) bad('Contador inválido');
  if (!isNum(d.savedAt, 0, MAX_TIME)) bad('Fecha inválida');
  if (!Array.isArray(d.buildings) || d.buildings.length > MAX_BUILDINGS) bad('Edificios inválidos');

  if (!Array.isArray(d.claimedQuests) || d.claimedQuests.length > QUESTS.length) bad('Misiones inválidas');
  const knownQuests = new Set(QUESTS.map((q) => q.id));
  const claimedQuests = d.claimedQuests.map((id) => {
    if (typeof id !== 'string' || !knownQuests.has(id)) bad('Misión desconocida');
    return id;
  });
  if (new Set(claimedQuests).size !== claimedQuests.length) bad('Misión repetida');

  if (!isPlainObject(d.army)) bad('Ejército inválido');
  const army = {};
  for (const u of ARMY_UNITS) {
    if (!isInt(d.army[u], 0, 999)) bad('Ejército inválido');
    army[u] = d.army[u];
  }
  if (d.hero !== null && !(isPlainObject(d.hero) && isInt(d.hero.level, 1, 10))) bad('Héroe inválido');
  const hero = d.hero === null ? null : { level: d.hero.level };

  const ids = new Set();
  const cells = new Set();
  let upgrading = 0;
  let townHalls = 0;
  const buildings = d.buildings.map((b) => {
    if (!isPlainObject(b)) bad('Edificio inválido');
    if (!isBuildingType(b.type)) bad('Tipo de edificio desconocido');
    if (!isInt(b.id, 1, 10_000_000) || b.id >= d.nextId) bad('Id de edificio inválido');
    if (!isInt(b.x, 0, GRID.cols - 1) || !isInt(b.y, 0, GRID.rows - 1)) bad('Posición inválida');

    const levels = BUILDINGS[b.type].levels;
    if (!isInt(b.level, 1, levels.length)) bad('Nivel inválido');
    const capacity = levels[b.level - 1].capacity ?? 0;
    if (!isNum(b.stored, 0, capacity)) bad('Producción inválida');
    if (!isNum(b.lastTick, 0, MAX_TIME)) bad('Fecha de edificio inválida');

    if (b.upgradeEndsAt !== null) {
      if (b.level >= levels.length) bad('Mejora imposible: ya es nivel máximo');
      if (!isNum(b.upgradeEndsAt, 0, MAX_TIME)) bad('Fecha de mejora inválida');
      if (++upgrading > ECONOMY.builders) bad('Más mejoras simultáneas de las permitidas');
    }

    let training = null;
    if (b.training !== null) {
      if (!isPlainObject(b.training)) bad('Entrenamiento inválido');
      const trains = BUILDINGS[b.type].trains ?? [];
      if (typeof b.training.unit !== 'string' || !trains.includes(b.training.unit)) bad('Unidad de entrenamiento inválida');
      if (!isNum(b.training.endsAt, 0, MAX_TIME)) bad('Fecha de entrenamiento inválida');
      if (b.upgradeEndsAt !== null) bad('No puede mejorar y entrenar a la vez');
      training = { unit: b.training.unit, endsAt: b.training.endsAt };
    }

    if (b.type === 'townhall') townHalls++;

    const cell = b.x + ',' + b.y;
    if (ids.has(b.id)) bad('Id repetido');
    if (cells.has(cell)) bad('Dos edificios en la misma casilla');
    ids.add(b.id);
    cells.add(cell);
    return {
      id: b.id,
      type: b.type,
      level: b.level,
      upgradeEndsAt: b.upgradeEndsAt,
      training,
      x: b.x,
      y: b.y,
      stored: b.stored,
      lastTick: b.lastTick,
    };
  });

  if (townHalls !== 1) bad('Debe haber exactamente un Ayuntamiento');

  let cap = ECONOMY.baseCap;
  for (const b of buildings) cap += BUILDINGS[b.type].levels[b.level - 1].capBonus ?? 0;

  const state = {
    gold: Math.min(d.gold, cap),
    wood: Math.min(d.wood, cap),
    nextId: d.nextId,
    savedAt: d.savedAt,
    claimedQuests,
    army,
    hero,
    buildings,
  };
  // Un guardado no puede traer más unidades de las que sostiene la población.
  if (supplyUsed(state) > supplyCap(state)) bad('El ejército excede la población disponible');
  return state;
}

/* ---------- localStorage ---------- */

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Carga la partida: principal → respaldo → nada.
 * source: 'main' | 'backup' | 'none'. `warning` explica si hubo que recurrir al respaldo.
 */
export function loadGame() {
  const main = read(KEY);
  if (main === null) return { state: null, source: 'none' };

  const r = parseSave(main);
  if (r.ok) return { state: r.state, source: 'main' };

  const bak = read(BACKUP_KEY);
  if (bak !== null) {
    const rb = parseSave(bak);
    if (rb.ok) {
      return { state: rb.state, source: 'backup', warning: 'La partida principal estaba dañada; se recuperó la copia de respaldo.' };
    }
  }
  return { state: null, source: 'none', warning: 'La partida guardada estaba dañada y no se pudo recuperar. Empezaste de cero.' };
}

/** Guarda en localStorage. Devuelve false si el navegador lo impide (modo privado, cuota…). */
export function saveGame(state, now = Date.now()) {
  try {
    const text = serialize(state);
    const previous = localStorage.getItem(KEY);
    // Respaldo rotativo: guarda la versión anterior solo si era válida y ha pasado un rato.
    if (previous !== null && now - lastBackupAt > BACKUP_EVERY_MS && parseSave(previous).ok) {
      localStorage.setItem(BACKUP_KEY, previous);
      lastBackupAt = now;
    }
    localStorage.setItem(KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* sin acceso a localStorage: nada que borrar */
  }
}

function err(error) {
  return { ok: false, error };
}
