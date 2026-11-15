// Lógica pura del juego: no toca el DOM, Phaser ni localStorage.
// Todas las funciones reciben el estado y el tiempo (`now`) para poder probarlas.
import { BUILDINGS, ECONOMY, GRID, RESOURCES, RESOURCE_NAMES } from '../data/config.js';

export const MAX_BUILDINGS = GRID.cols * GRID.rows;

/** Casilla del Ayuntamiento en una partida nueva: el centro del mapa. */
export const TOWN_HALL_CELL = { x: Math.floor(GRID.cols / 2) - 1, y: Math.floor(GRID.rows / 2) - 1 };

export function createBuilding(id, type, x, y, now, level = 1) {
  return { id, type, level, upgradeEndsAt: null, x, y, stored: 0, lastTick: now };
}

export function createNewState(now = Date.now()) {
  return {
    gold: ECONOMY.start.gold,
    wood: ECONOMY.start.wood,
    nextId: 2,
    buildings: [createBuilding(1, 'townhall', TOWN_HALL_CELL.x, TOWN_HALL_CELL.y, now)],
    claimedQuests: [], // ids de las misiones ya reclamadas (ver quests.js)
    savedAt: now,
  };
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

/** Casilla libre más cercana a (cx, cy), buscando en anillos crecientes. `occupied` es un Set de "x,y". */
export function findFreeCell(occupied, cx, cy) {
  const limit = Math.max(GRID.cols, GRID.rows);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (inBounds(x, y) && !occupied.has(`${x},${y}`)) return { x, y };
      }
    }
  }
  return null;
}

/* ---------- costos ---------- */

export const costOf = (cost, resource) => cost?.[resource] ?? 0;

/** Primer recurso que falta para pagar `cost`, o null si alcanza. */
export function missingResource(state, cost) {
  return RESOURCES.find((r) => state[r] < costOf(cost, r)) ?? null;
}

export const canAfford = (state, cost) => missingResource(state, cost) === null;

function spend(state, cost) {
  for (const r of RESOURCES) state[r] -= costOf(cost, r);
}

const insufficient = (resource) => {
  const name = RESOURCE_NAMES[resource];
  return `${name[0].toUpperCase()}${name.slice(1)} insuficiente`;
};

/** "50 oro · 30 madera" (o "Gratis"). */
export function formatCost(cost) {
  const parts = RESOURCES.filter((r) => costOf(cost, r) > 0).map((r) => `${cost[r]} ${RESOURCE_NAMES[r]}`);
  return parts.length ? parts.join(' · ') : 'Gratis';
}

/* ---------- niveles ---------- */

/** Estadísticas del edificio en un nivel dado (nivel 1 = primer elemento). */
export function statsOf(type, level) {
  return BUILDINGS[type].levels[level - 1];
}

export const maxLevel = (type) => BUILDINGS[type].levels.length;

/** Nombre a mostrar: el Ayuntamiento cambia de nombre con el nivel. */
export function displayName(type, level) {
  const def = BUILDINGS[type];
  return def.levelNames?.[level - 1] ?? def.name;
}

/** Datos del siguiente nivel ({ upgradeCost, upgradeSec, ...stats }) o null si ya es el máximo. */
export function nextLevelOf(b) {
  return BUILDINGS[b.type].levels[b.level] ?? null;
}

export const isUpgrading = (b) => b.upgradeEndsAt !== null;

export function busyBuilders(state) {
  return state.buildings.filter(isUpgrading).length;
}

/** Lo invertido en un edificio, por recurso: construcción más todas las mejoras ya terminadas. */
export function investedCost(b) {
  const def = BUILDINGS[b.type];
  const total = {};
  for (const r of RESOURCES) {
    total[r] = costOf(def.cost, r);
    for (let i = 1; i < b.level; i++) total[r] += costOf(def.levels[i].upgradeCost, r);
  }
  return total;
}

/** Tope de cada recurso (el mismo para oro y madera): base + almacenes. */
export function resourceCap(state) {
  let cap = ECONOMY.baseCap;
  for (const b of state.buildings) cap += statsOf(b.type, b.level).capBonus ?? 0;
  return cap;
}

/* ---------- Ayuntamiento y límites ---------- */

export const townHall = (state) => state.buildings.find((b) => b.type === 'townhall') ?? null;
export const townHallLevel = (state) => townHall(state)?.level ?? 1;

export const countOf = (state, type) => state.buildings.filter((b) => b.type === type).length;

/** Cuántos edificios de ese tipo permite el nivel actual del Ayuntamiento. */
export function limitFor(state, type) {
  return statsOf('townhall', townHallLevel(state)).limits?.[type] ?? 0;
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
 * Avanza el tiempo de un edificio: termina su mejora si le toca y produce.
 * Devuelve lo generado (del recurso que produce ese edificio).
 * Si se pasa `events`, agrega { type:'upgraded', ... } al terminar mejoras.
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

/** Avanza el tiempo de todos los edificios. Devuelve lo generado: { gold, wood }. */
export function tickAll(state, now, events) {
  const gained = { gold: 0, wood: 0 };
  for (const b of state.buildings) {
    const amount = tickBuilding(b, now, events);
    const resource = statsOf(b.type, b.level).produces;
    if (amount && resource) gained[resource] += amount;
  }
  return gained;
}

/* ---------- acciones del jugador ---------- */

/** Por qué NO se puede construir `type` en (x, y), o null si se puede. No modifica nada. */
export function placementError(state, type, x, y) {
  if (!isBuildingType(type)) return 'Edificio desconocido';
  const def = BUILDINGS[type];
  if (def.buildable === false) return 'Ese edificio no se puede construir';
  if (!inBounds(x, y)) return 'Fuera del mapa';
  if (buildingAt(state, x, y)) return 'Casilla ocupada';
  if (state.buildings.length >= MAX_BUILDINGS) return 'Mapa lleno';

  const limit = limitFor(state, type);
  if (countOf(state, type) >= limit) {
    return limit === 0 ? `Aún no puedes construir ${def.name}` : `Límite de ${def.name}: ${limit}. Mejora el Ayuntamiento`;
  }
  const missing = missingResource(state, def.cost);
  return missing ? insufficient(missing) : null;
}

export function place(state, type, x, y, now) {
  const error = placementError(state, type, x, y);
  if (error) return fail(error);

  const def = BUILDINGS[type];
  spend(state, def.cost);
  const building = createBuilding(state.nextId++, type, x, y, now);
  state.buildings.push(building);
  return { ok: true, building };
}

export function startUpgrade(state, id, now) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe ese edificio');
  if (isUpgrading(b)) return fail('Ya se está mejorando');
  const next = nextLevelOf(b);
  if (!next) return fail('Ya está al nivel máximo');
  if (b.type !== 'townhall' && b.level >= townHallLevel(state)) return fail('Mejora antes el Ayuntamiento');
  if (busyBuilders(state) >= ECONOMY.builders) return fail('Todos los obreros están ocupados');
  const missing = missingResource(state, next.upgradeCost);
  if (missing) return fail(insufficient(missing));

  tickBuilding(b, now); // acredita la producción hasta este instante antes de pausarla
  spend(state, next.upgradeCost);
  b.upgradeEndsAt = now + next.upgradeSec * 1000;
  return { ok: true, endsAt: b.upgradeEndsAt };
}

export function demolish(state, id) {
  const index = state.buildings.findIndex((b) => b.id === id);
  if (index === -1) return fail('No existe ese edificio');
  const b = state.buildings[index];
  if (b.type === 'townhall') return fail('El Ayuntamiento no se puede demoler');
  if (isUpgrading(b)) return fail('Espera a que termine la mejora');

  // Solo un almacén cambia el tope: si lo que hay no cabría sin él, no se puede demoler.
  const bonus = statsOf(b.type, b.level).capBonus ?? 0;
  const newCap = resourceCap(state) - bonus;
  if (bonus > 0 && (state.gold > newCap || state.wood > newCap)) {
    return fail('Gasta recursos antes: no cabrían sin este almacén');
  }

  const invested = investedCost(b);
  state.buildings.splice(index, 1);
  for (const r of RESOURCES) {
    const refund = Math.floor(invested[r] * ECONOMY.refundRate);
    if (refund > 0) state[r] = Math.min(newCap, state[r] + refund);
  }
  return { ok: true };
}

/** Cambia un edificio de casilla (gratis). */
export function moveBuilding(state, id, x, y) {
  const b = state.buildings.find((v) => v.id === id);
  if (!b) return fail('No existe ese edificio');
  if (!inBounds(x, y)) return fail('Fuera del mapa');
  if (b.x === x && b.y === y) return fail('Ya está ahí');
  if (buildingAt(state, x, y)) return fail('Casilla ocupada');
  b.x = x;
  b.y = y;
  return { ok: true };
}

/** Recolecta lo acumulado de un edificio productor hacia la reserva del recurso que produce. */
export function collect(state, b) {
  const resource = statsOf(b.type, b.level).produces;
  if (!resource) return fail('Este edificio no produce');
  const space = Math.floor(resourceCap(state) - state[resource]);
  if (space < 1) return fail('Almacén lleno');
  const take = Math.min(Math.floor(b.stored), space);
  if (take < 1) return fail('Aún no hay nada');
  b.stored -= take;
  state[resource] += take;
  return { ok: true, resource, amount: take };
}

export function collectAll(state) {
  const total = { gold: 0, wood: 0 };
  for (const b of state.buildings) {
    const r = collect(state, b);
    if (r.ok) total[r.resource] += r.amount;
  }
  return total.gold + total.wood > 0 ? { ok: true, ...total } : fail('No hay nada para recolectar');
}

function fail(reason) {
  return { ok: false, reason };
}
