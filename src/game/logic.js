// Lógica pura del juego: no toca el DOM, Phaser ni localStorage.
// Todas las funciones reciben el estado y el tiempo (`now`) para poder probarlas.
import { BUILDINGS, ECONOMY, GRID } from '../data/config.js';

export const MAX_BUILDINGS = GRID.cols * GRID.rows;

export function createNewState(now = Date.now()) {
  return { gold: ECONOMY.startGold, nextId: 1, buildings: [], savedAt: now };
}

export function isBuildingType(type) {
  return typeof type === 'string' && Object.hasOwn(BUILDINGS, type);
}

export function inBounds(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows;
}

export function buildingAt(state, x, y) {
  return state.buildings.find((b) => b.x === x && b.y === y) ?? null;
}

export function goldCap(state) {
  let cap = ECONOMY.baseCap;
  for (const b of state.buildings) cap += BUILDINGS[b.type].capBonus ?? 0;
  return cap;
}

/** Produce oro en una mina. Devuelve cuánto se generó. */
export function tickBuilding(b, now) {
  const def = BUILDINGS[b.type];
  if (!def.ratePerSec) {
    b.lastTick = now;
    return 0;
  }
  let elapsed = now - b.lastTick;
  if (elapsed < 0) {
    // El reloj del sistema retrocedió: no se regala ni se quita tiempo.
    b.lastTick = now;
    return 0;
  }
  elapsed = Math.min(elapsed, ECONOMY.maxOfflineMs);
  const before = b.stored;
  b.stored = Math.min(def.capacity, b.stored + (def.ratePerSec * elapsed) / 1000);
  b.lastTick = now;
  return b.stored - before;
}

/** Avanza el tiempo de todos los edificios. Devuelve el oro total generado. */
export function tickAll(state, now) {
  let gained = 0;
  for (const b of state.buildings) gained += tickBuilding(b, now);
  return gained;
}

export function place(state, type, x, y, now) {
  if (!isBuildingType(type)) return fail('Edificio desconocido');
  if (!inBounds(x, y)) return fail('Fuera del mapa');
  if (buildingAt(state, x, y)) return fail('Casilla ocupada');
  if (state.buildings.length >= MAX_BUILDINGS) return fail('Mapa lleno');
  const cost = BUILDINGS[type].cost;
  if (state.gold < cost) return fail('Oro insuficiente');

  state.gold -= cost;
  const building = { id: state.nextId++, type, x, y, stored: 0, lastTick: now };
  state.buildings.push(building);
  return { ok: true, building };
}

export function demolish(state, id) {
  const index = state.buildings.findIndex((b) => b.id === id);
  if (index === -1) return fail('No existe ese edificio');
  const b = state.buildings[index];
  const def = BUILDINGS[b.type];

  const newCap = goldCap(state) - (def.capBonus ?? 0);
  if (state.gold > newCap) return fail('Gasta oro antes: no cabría sin este almacén');

  state.buildings.splice(index, 1);
  state.gold = Math.min(newCap, state.gold + Math.floor(def.cost * ECONOMY.refundRate));
  return { ok: true };
}

/** Recolecta el oro acumulado de una mina hacia la reserva. */
export function collect(state, b) {
  if (!BUILDINGS[b.type].ratePerSec) return fail('Este edificio no produce oro');
  const space = goldCap(state) - state.gold;
  if (space < 1) return fail('Almacén lleno');
  const take = Math.min(Math.floor(b.stored), Math.floor(space));
  if (take < 1) return fail('Aún no hay oro');
  b.stored -= take;
  state.gold += take;
  return { ok: true, amount: take };
}

export function collectAll(state) {
  let total = 0;
  for (const b of state.buildings) {
    const r = collect(state, b);
    if (r.ok) total += r.amount;
  }
  return total > 0 ? { ok: true, amount: total } : fail('No hay oro para recolectar');
}

function fail(reason) {
  return { ok: false, reason };
}
