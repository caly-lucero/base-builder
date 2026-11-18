// Estado único de la partida + guardado automático + avisos a la UI.
import { RAID } from '../data/config.js';
import { createNewState, tickAll } from './logic.js';
import { raidDue, resolveRaid } from './raids.js';
import { clearSave, loadGame, saveGame } from './save.js';

let state = null;
const changeListeners = new Set();

/* ---------- una sola pestaña a la vez ----------
 * Dos pestañas con el juego abierto se pisarían el guardado. La última que se abre se queda con el "turno"
 * (una marca en localStorage); la otra se entera por el evento `storage`, deja de guardar y avisa. */
const LOCK_KEY = 'basebuilder.tab';
const TAB_ID = Math.random().toString(36).slice(2, 10);
let superseded = false;
const supersededListeners = new Set();

/** ¿Esa marca guardada es de OTRA pestaña? (lógica pura, para probarla) */
export function lockIsForeign(raw, tabId) {
  if (!raw) return false;
  try {
    const id = JSON.parse(raw)?.id;
    return typeof id === 'string' && id !== tabId;
  } catch {
    return false;
  }
}

/** Esta pestaña toma el turno. */
function takeLock() {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() }));
  } catch {
    /* sin almacenamiento: no hay forma de coordinarse */
  }
}

/** Avisa cuando otra pestaña abre el juego (esta ya no guarda). */
export function onSuperseded(fn) {
  supersededListeners.add(fn);
  if (superseded) fn();
  return () => supersededListeners.delete(fn);
}

export const isSuperseded = () => superseded;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key !== LOCK_KEY || superseded || !lockIsForeign(e.newValue, TAB_ID)) return;
    superseded = true;
    for (const fn of supersededListeners) fn();
  });
}
let statusHandler = () => {};
let saveFailedNotified = false;
const pendingEvents = []; // mejoras terminadas, etc., que la escena aún no ha mostrado

export const get = () => state;

export function onChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function onStatus(fn) {
  statusHandler = fn;
}

function emit() {
  for (const fn of changeListeners) fn(state);
}

/**
 * Avanza el tiempo de toda la partida (producción y mejoras en curso).
 * Es el único sitio que lo hace, para que ningún evento se pierda.
 * Devuelve el oro generado.
 */
export function tick(now = Date.now()) {
  const gained = tickAll(state, now, pendingEvents);
  // Si llegó la hora de un ataque enemigo, se resuelve (uno solo, aunque hayas estado fuera mucho tiempo).
  if (!raidsHeld && raidDue(state, now)) {
    const late = now - state.raid.nextAt;
    const report = resolveRaid(state, now);
    report.live = late < 20_000; // llegó mientras jugabas (no durante una ausencia): se puede ver la defensa en vivo
    pendingEvents.push({ type: 'raid', report });
  }
  return gained;
}

let raidsHeld = false;

/** Pausa o reanuda los ataques enemigos (mientras atacas tú, no te atacan a la vez). */
export function holdRaids(held) {
  raidsHeld = Boolean(held);
}

/** Una partida sin calendario (migrada o importada) programa su primer ataque. */
function ensureRaidSchedule(s, now) {
  if (!s.raid.nextAt) s.raid.nextAt = now + RAID.firstDelaySec * 1000;
}

/** Entrega (y vacía) los eventos acumulados: [{ type:'upgraded', building, level, id }]. */
export function drainEvents() {
  return pendingEvents.splice(0);
}

/** Carga la partida y aplica lo ocurrido mientras estuviste fuera. */
export function init(now = Date.now()) {
  const loaded = loadGame();
  takeLock();
  state = loaded.state ?? createNewState(now);

  // Si el reloj del sistema retrocedió, no dejamos edificios "en el futuro".
  if (now < state.savedAt) {
    for (const b of state.buildings) b.lastTick = Math.min(b.lastTick, now);
  }

  ensureRaidSchedule(state, now);

  const gained = tick(now);
  if (loaded.warning) statusHandler(loaded.warning);
  return { source: loaded.source, gained, warning: loaded.warning };
}

/** Guarda sin avisar a la UI (autoguardado). */
export function persist(now = Date.now()) {
  if (!state || superseded) return false; // otra pestaña tomó el turno: no se le pisa el guardado
  tick(now);
  state.savedAt = now;
  const ok = saveGame(state, now);
  if (!ok && !saveFailedNotified) {
    saveFailedNotified = true;
    statusHandler('No se pudo guardar en este navegador. Usa «Exportar partida» para no perder tu progreso.');
  }
  if (ok) saveFailedNotified = false;
  return ok;
}

/** Llamar después de modificar el estado desde una acción del jugador. */
export function commit() {
  persist();
  emit();
}

/** Sustituye toda la partida (importar o nueva partida). */
export function replace(newState) {
  state = newState;
  ensureRaidSchedule(state, Date.now());
  pendingEvents.length = 0;
  persist();
  emit();
}

export function reset(now = Date.now()) {
  clearSave();
  replace(createNewState(now));
}
