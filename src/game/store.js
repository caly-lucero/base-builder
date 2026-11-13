// Estado único de la partida + guardado automático + avisos a la UI.
import { createNewState, tickAll } from './logic.js';
import { clearSave, loadGame, saveGame } from './save.js';

let state = null;
const changeListeners = new Set();
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
  return tickAll(state, now, pendingEvents);
}

/** Entrega (y vacía) los eventos acumulados: [{ type:'upgraded', building, level, id }]. */
export function drainEvents() {
  return pendingEvents.splice(0);
}

/** Carga la partida y aplica lo ocurrido mientras estuviste fuera. */
export function init(now = Date.now()) {
  const loaded = loadGame();
  state = loaded.state ?? createNewState(now);

  // Si el reloj del sistema retrocedió, no dejamos edificios "en el futuro".
  if (now < state.savedAt) {
    for (const b of state.buildings) b.lastTick = Math.min(b.lastTick, now);
  }

  const gained = tick(now);
  if (loaded.warning) statusHandler(loaded.warning);
  return { source: loaded.source, gained, warning: loaded.warning };
}

/** Guarda sin avisar a la UI (autoguardado). */
export function persist(now = Date.now()) {
  if (!state) return false;
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
  pendingEvents.length = 0;
  persist();
  emit();
}

export function reset(now = Date.now()) {
  clearSave();
  replace(createNewState(now));
}
