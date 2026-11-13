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

/* ---------- niveles ---------- */

/** Estadísticas del edificio en un nivel dado (nivel 1 = primer elemento). */
export function statsOf(type, level) {
  return BUILDINGS[type].levels[level - 1];
}

export const maxLevel = (type) => BUILDINGS[type].levels.length;

/** Datos del siguiente nivel ({ upgradeCost, upgradeSec, ...stats }) o null si ya es el máximo. */
export function nextLevelOf(b) {
  return BUILDINGS[b.type].levels[b.level] ?? null;
}

export const isUpgrading = (b) => b.upgradeEndsAt !== null;

export function busyBuilders(state) {
  return state.buildings.filter(isUpgrading).length;
}

/** Oro invertido en un edificio: construcción más todas las mejoras ya terminadas. */
export function investedGold(b) {
  const def = BUILDINGS[b.type];
  let total = def.cost;
  for (let i = 1; i < b.level; i++) total += def.levels[i].upgradeCost;
  return total;
}

export function goldCap(state) {
  let cap = ECONOMY.baseCap;
  for (const b of state.buildings) cap += statsOf(b.type, b.level).capBonus ?? 0;
  return cap;
}

/** Formatea milisegundos como m:ss (o h:mm:ss). Redondea hacia arriba para no mostrar 0:00 antes de tiempo. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* ---------- el paso del tiempo ---------- */

/**
 * Avanza el tiempo de un edificio: termina su mejora si le toca y produce oro.
 * Devuelve el oro generado. Si se pasa `events`, agrega { type:'upgraded', ... } al terminar mejoras.
 */
export function tickBuilding(b, now, events) {
  if (b.upgradeEndsAt !== null) {
    const next = nextLevelOf(b);
    if (!next) {
      b.upgradeEndsAt = null; // estado imposible (ya es nivel máximo): se descarta
    } else {
      // Un reloj manipulado (o un guardado editado) nunca puede dejar por delante
      // más que la duración completa de la mejora.
      b.upgradeEndsAt = Math.min(b.upgradeEndsAt, now + next.upgradeSec * 1000);
      if (now < b.upgradeEndsAt) {
        b.lastTick = now; // en obras no produce
        return 0;
      }
      // La mejora terminó (quizá mientras no jugabas): sube de nivel y produce desde ese instante.
      b.level += 1;
      b.lastTick = b.upgradeEndsAt;
      b.upgradeEndsAt = null;
      events?.push({ type: 'upgraded', id: b.id, building: b.type, level: b.level });
    }
  }

  const stats = statsOf(b.type, b.level);
  if (!stats.ratePerSec) {
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
  b.stored = Math.min(stats.capacity, b.stored + (stats.ratePerSec * elapsed) / 1000);
  b.lastTick = now;
  return b.stored - before;
}

/** Avanza el tiempo de todos los edificios. Devuelve el oro total generado. */
export function tickAll(state, now, events) {
  let gained = 0;
  for (const b of state.buildings) gained += tickBuilding(b, now, events);
  return gained;
}

/* ---------- acciones del jugador ---------- */

export function place(state, type, x, y, now) {
  if (!isBuildingType(type)) return fail('Edificio desconocido');
  if (!inBounds(x, y)) return fail('Fuera del mapa');
  if (buildingAt(state, x, y)) return fail('Casilla ocupada');
  if (state.buildings.length >= MAX_BUILDINGS) return fail('Mapa lleno');
  const cost = BUILDINGS[type].cost;
  if (state.gold < cost) return fail('Oro insuficiente');

  state.gold -= cost;
  const building = { id: state.nextId++, type, level: 1, upgradeEndsAt: null, x, y, stored: 0, lastTick: now };
  state.buildings.push(building);
  return { ok: true, building };
}

export function startUpgrade(state, id, now) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe ese edificio');
  if (isUpgrading(b)) return fail('Ya se está mejorando');
  const next = nextLevelOf(b);
  if (!next) return fail('Ya está al nivel máximo');
  if (busyBuilders(state) >= ECONOMY.builders) return fail('Todos los obreros están ocupados');
  if (state.gold < next.upgradeCost) return fail('Oro insuficiente');

  tickBuilding(b, now); // acredita la producción hasta este instante antes de pausarla
  state.gold -= next.upgradeCost;
  b.upgradeEndsAt = now + next.upgradeSec * 1000;
  return { ok: true, endsAt: b.upgradeEndsAt };
}

export function demolish(state, id) {
  const index = state.buildings.findIndex((b) => b.id === id);
  if (index === -1) return fail('No existe ese edificio');
  const b = state.buildings[index];
  if (isUpgrading(b)) return fail('Espera a que termine la mejora');

  const newCap = goldCap(state) - (statsOf(b.type, b.level).capBonus ?? 0);
  if (state.gold > newCap) return fail('Gasta oro antes: no cabría sin este almacén');

  state.buildings.splice(index, 1);
  state.gold = Math.min(newCap, state.gold + Math.floor(investedGold(b) * ECONOMY.refundRate));
  return { ok: true };
}

/** Recolecta el oro acumulado de una mina hacia la reserva. */
export function collect(state, b) {
  if (!statsOf(b.type, b.level).ratePerSec) return fail('Este edificio no produce oro');
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
