// Batalla en curso: se guarda aparte de la partida para poder retomarla si se cierra la página o se recarga.
// Solo los ataques tuyos (las defensas se ven como una repetición y no hace falta guardarlas).
import { ARMY_UNITS, GRID } from '../data/config.js';
import { snapshotBattle } from './battle.js';

const KEY = 'basebuilder.battle';
const VERSION = 1;
export const MAX_BATTLE_AGE_MS = 24 * 60 * 60 * 1000; // pasado un día ya no se ofrece retomarla

/** Convierte lo guardado en una batalla retomable, o null si no sirve. `state` es la partida actual. Lógica pura. */
export function parsePending(raw, state, now = Date.now()) {
  let env;
  try {
    env = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!env || env.v !== VERSION || !Number.isInteger(env.level) || env.level < 1 || !env.battle) return null;
  if (!Number.isFinite(env.savedAt) || env.savedAt > now + 60_000 || now - env.savedAt > MAX_BATTLE_AGE_MS) return null;
  if (env.level > state.campaign.cleared + 1) return null; // un nivel que aún no está abierto

  const b = env.battle;
  if (b.mode !== 'attack' || b.over || b.level !== env.level) return null;
  if (!Array.isArray(b.units) || !Array.isArray(b.buildings) || b.units.length > 5000 || b.buildings.length > 5000) return null;
  const okEntity = (e) => e && typeof e === 'object' && Number.isInteger(e.id) && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp);
  if (!b.units.every(okEntity) || !b.buildings.every(okEntity)) return null;
  if (!b.buildings.every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= GRID.cols && e.y + e.h <= GRID.rows)) return null;
  if (!Number.isInteger(b.hallId) || !b.buildings.some((e) => e.id === b.hallId)) return null;
  if (!Number.isFinite(b.time) || !Number.isFinite(b.acc) || !Number.isInteger(b.nextId)) return null;
  // Las tropas con que salió siguen existiendo (si no, la partida cambió: se importó otra, p. ej.).
  if (!b.sent || ARMY_UNITS.some((k) => !(b.sent[k] <= (state.army[k] ?? 0)))) return null;
  return { level: env.level, snapshot: b, savedAt: env.savedAt };
}

/** Guarda la batalla en curso. Devuelve false si el navegador no deja guardar. */
export function saveBattle(battle, now = Date.now()) {
  if (!battle || battle.over || battle.mode !== 'attack') return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: now, level: battle.level, battle: snapshotBattle(battle) }));
    return true;
  } catch {
    return false;
  }
}

export function clearBattle() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: nada que borrar */
  }
}

/** La batalla guardada que se puede retomar con esta partida, o null. Si no sirve, se borra. */
export function loadPending(state, now = Date.now()) {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const pending = parsePending(raw, state, now);
  if (!pending) clearBattle();
  return pending;
}
