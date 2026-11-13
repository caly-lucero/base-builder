// Guardado: serialización, validación estricta, migraciones, checksum,
// copia de respaldo y exportar/importar.
//
// Nota de seguridad: el checksum NO impide hacer trampa (el código está en el
// navegador y cualquiera puede recalcularlo). Solo detecta archivos dañados o
// editados a mano sin querer. En un juego de un jugador está bien así.
import { BUILDINGS, ECONOMY, GRID } from '../data/config.js';
import { MAX_BUILDINGS, isBuildingType } from './logic.js';

export const SAVE_VERSION = 1;
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

const checksum = (data) => fnv1a('bb1|' + JSON.stringify(data));

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
// Ej.: if (version < 2) { data = { ...data, newField: 0 }; }
function migrate(data, version) {
  void version;
  return data;
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
  if (!isInt(d.nextId, 1, 10_000_000)) bad('Contador inválido');
  if (!isNum(d.savedAt, 0, MAX_TIME)) bad('Fecha inválida');
  if (!Array.isArray(d.buildings) || d.buildings.length > MAX_BUILDINGS) bad('Edificios inválidos');

  const ids = new Set();
  const cells = new Set();
  const buildings = d.buildings.map((b) => {
    if (!isPlainObject(b)) bad('Edificio inválido');
    if (!isBuildingType(b.type)) bad('Tipo de edificio desconocido');
    if (!isInt(b.id, 1, 10_000_000) || b.id >= d.nextId) bad('Id de edificio inválido');
    if (!isInt(b.x, 0, GRID.cols - 1) || !isInt(b.y, 0, GRID.rows - 1)) bad('Posición inválida');
    const capacity = BUILDINGS[b.type].capacity ?? 0;
    if (!isNum(b.stored, 0, capacity)) bad('Producción inválida');
    if (!isNum(b.lastTick, 0, MAX_TIME)) bad('Fecha de edificio inválida');

    const cell = b.x + ',' + b.y;
    if (ids.has(b.id)) bad('Id repetido');
    if (cells.has(cell)) bad('Dos edificios en la misma casilla');
    ids.add(b.id);
    cells.add(cell);
    return { id: b.id, type: b.type, x: b.x, y: b.y, stored: b.stored, lastTick: b.lastTick };
  });

  let cap = ECONOMY.baseCap;
  for (const b of buildings) cap += BUILDINGS[b.type].capBonus ?? 0;

  return {
    gold: Math.min(d.gold, cap),
    nextId: d.nextId,
    savedAt: d.savedAt,
    buildings,
  };
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
