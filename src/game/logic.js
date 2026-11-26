// Lógica pura del juego: no toca el DOM, Phaser ni localStorage.
// Todas las funciones reciben el estado y el tiempo (`now`) para poder probarlas.
import { ACHIEVEMENTS, ARMY_UNITS, BUILDINGS, ECONOMY, GRID, MAX_LEVEL, RAID, RESEARCH, RESEARCH_KEYS, RESOURCES, RESOURCE_NAMES, UNIQUE_BUILDINGS, UNITS, UPGRADE_QUEUE_MAX, batchLimit, batchTimeFactor, researchStep, trainQueueLimit } from '../data/config.js';
import { HEROES, SQUAD_SIZE, heroCap, isHeroKey } from '../data/heroes.js';
import { DEFAULT_RACE, isRace } from '../data/races.js';
import { decorKey, generateDecor } from './decor.js';

export const MAX_BUILDINGS = GRID.cols * GRID.rows;

/** Cuadro de arriba del Ayuntamiento en una partida nueva: queda en el centro del mapa. */
export const TOWN_HALL_CELL = {
  x: Math.floor((GRID.cols - BUILDINGS.townhall.size.w) / 2),
  y: Math.floor((GRID.rows - BUILDINGS.townhall.size.h) / 2),
};

export function createBuilding(id, type, x, y, now, level = 1) {
  return { id, type, level, upgradeEndsAt: null, training: null, queue: [], damaged: false, x, y, stored: 0, lastTick: now };
}

/** Ejército vacío: { soldier: 0, archer: 0, mage: 0, … }. */
export const emptyArmy = () => Object.fromEntries(ARMY_UNITS.map((u) => [u, 0]));

/** Logros: niveles reclamados de cada uno (todos en 0). */
export const emptyAchievements = () => Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, 0]));

/** Investigaciones de la Herrería, todas en el nivel 0. */
export const emptyResearch = () => Object.fromEntries(RESEARCH_KEYS.map((k) => [k, 0]));

export function createNewState(now = Date.now(), race = DEFAULT_RACE) {
  return {
    gold: ECONOMY.start.gold,
    wood: ECONOMY.start.wood,
    nextId: 2,
    buildings: [createBuilding(1, 'townhall', TOWN_HALL_CELL.x, TOWN_HALL_CELL.y, now)],
    claimedQuests: [], // ids de las misiones ya reclamadas (ver quests.js)
    raid: { nextAt: now + RAID.firstDelaySec * 1000, count: 0, postponed: 0 }, // próximo ataque enemigo y cuántos ha habido (ver raids.js)
    army: emptyArmy(), // unidades entrenadas, por tipo
    heroes: {}, // héroes que tienes: { paladin: { level, xp }, … } (ver heroes.js)
    squad: [], // los (hasta 2) que salen a pelear, por clave
    upgradeQueue: [], // ids de edificios con una mejora encargada que espera un obrero libre (ya pagada)
    race: isRace(race) ? race : DEFAULT_RACE, // raza elegida al empezar (ver data/races.js)
    daily: { day: 0, streak: 0 }, // premio diario: último día reclamado y racha (ver daily.js)
    cleared: [], // adornos del mapa (árboles, rocas…) que el jugador quitó: sus claves "x,y" (ver decor.js)
    research: emptyResearch(), // nivel de cada investigación de la Herrería
    achievements: emptyAchievements(), // niveles reclamados de cada logro (ver achievements.js)
    campaign: { cleared: 0, stars: {} }, // niveles superados y mejores estrellas (0-3) de cada nivel
    savedAt: now,
  };
}

export function isBuildingType(type) {
  return typeof type === 'string' && Object.hasOwn(BUILDINGS, type);
}

export function inBounds(x, y, cols = GRID.cols, rows = GRID.rows) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < cols && y < rows;
}

/* ---------- tamaño de los edificios (cuántos cuadros ocupan) ---------- */

/** Tamaño { w, h } en cuadros de un tipo de edificio (el del enemigo `hall` es como el Ayuntamiento). */
export const sizeOf = (type) => BUILDINGS[type === 'hall' ? 'townhall' : type].size;

/** El rectángulo que ocupa un edificio: { x, y, w, h } (x, y = cuadro de más arriba). */
export function rectOf(b) {
  const { w, h } = sizeOf(b.type);
  return { x: b.x, y: b.y, w, h };
}

/** Centro de un edificio en cuadros, con la convención «el centro del cuadro (x, y) es (x, y)». */
export function centerOf(b) {
  const { w, h } = sizeOf(b.type);
  return { x: b.x + (w - 1) / 2, y: b.y + (h - 1) / 2 };
}

/** ¿El edificio `type` puesto con su esquina en (x, y) cabe dentro del mapa? */
export function fitsInMap(type, x, y) {
  const { w, h } = sizeOf(type);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + w <= GRID.cols && y + h <= GRID.rows;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Edificio que ocupa el cuadro (x, y), si hay alguno. */
export function buildingAt(state, x, y) {
  return state.buildings.find((b) => overlapsCell(b, x, y)) ?? null;
}

function overlapsCell(b, x, y) {
  const { w, h } = sizeOf(b.type);
  return x >= b.x && x < b.x + w && y >= b.y && y < b.y + h;
}

/** Edificios (distintos de `ignoreId`) que pisan el rectángulo de `type` puesto en (x, y). */
export function buildingsInArea(state, type, x, y, ignoreId = null) {
  const { w, h } = sizeOf(type);
  const area = { x, y, w, h };
  return state.buildings.filter((b) => b.id !== ignoreId && overlaps(area, rectOf(b)));
}

/** ¿Hay sitio para `type` en (x, y)? (dentro del mapa y sin pisar a otros). */
export const areaIsFree = (state, type, x, y, ignoreId = null) => fitsInMap(type, x, y) && buildingsInArea(state, type, x, y, ignoreId).length === 0;

/** Cuadro libre más cercano a (cx, cy), buscando en anillos crecientes. `occupied` es un Set de "x,y". */
export function findFreeCell(occupied, cx, cy, cols = GRID.cols, rows = GRID.rows) {
  const limit = Math.max(cols, rows);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (inBounds(x, y, cols, rows) && !occupied.has(`${x},${y}`)) return { x, y };
      }
    }
  }
  return null;
}

/** Sitio más cercano a (cx, cy) donde cabe `type`, buscando en anillos crecientes; null si no hay. */
export function findFreeSpot(state, type, cx, cy, ignoreId = null) {
  const limit = Math.max(GRID.cols, GRID.rows);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (areaIsFree(state, type, cx + dx, cy + dy, ignoreId)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return null;
}

/* ---------- adornos del mapa (árboles, rocas, arbustos) ---------- */

/** Claves de todos los adornos que se pueden quitar. */
export const allDecorKeys = () => generateDecor().map(decorKey);

/** Quita un adorno del mapa (gratis). */
export function clearDecor(state, key) {
  if (!allDecorKeys().includes(key)) return fail('Eso no se puede quitar');
  if (state.cleared.includes(key)) return fail('Ya está quitado');
  state.cleared.push(key);
  return { ok: true };
}

/** Quita todos los adornos de una vez (mapa limpio). */
export function clearAllDecor(state) {
  const all = allDecorKeys();
  if (state.cleared.length >= all.length) return fail('El mapa ya está limpio');
  state.cleared = all;
  return { ok: true, removed: all.length };
}

/** Devuelve todos los adornos al mapa. */
export function restoreDecor(state) {
  if (!state.cleared.length) return fail('No hay adornos quitados');
  state.cleared = [];
  return { ok: true };
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
export const isTraining = (b) => Boolean(b.training);

export function busyBuilders(state) {
  return state.buildings.filter(isUpgrading).length;
}

/* ---------- población y ejército ---------- */

/** Población máxima: la del Ayuntamiento más la de cada casa. */
export function supplyCap(state) {
  let cap = statsOf('townhall', townHallLevel(state)).baseSupply ?? 0;
  for (const b of state.buildings) cap += statsOf(b.type, b.level).supply ?? 0;
  return cap;
}

/** Población que ocupa lo que se entrena con esa clave: una unidad o un héroe (una investigación no ocupa). */
export const supplyOf = (key) => UNITS[key]?.supply ?? HEROES[key]?.supply ?? 0;

/** Población usada: el ejército, los héroes y lo que está entrenándose (se reserva al empezar). */
export function supplyUsed(state) {
  let used = 0;
  for (const u of ARMY_UNITS) used += (state.army[u] ?? 0) * UNITS[u].supply;
  for (const key of Object.keys(state.heroes)) used += HEROES[key]?.supply ?? 0;
  for (const b of state.buildings) {
    if (b.training) used += supplyOf(b.training.unit) * (b.training.qty ?? 1);
    for (const q of b.queue ?? []) used += supplyOf(q.unit) * q.qty; // lo que espera en cola ya está pagado y reservado
  }
  return used;
}

/** Cuántas unidades caben en un lote de este edificio (según su nivel). */
export const batchSizeOf = (b) => batchLimit(b.level);

/** Costo de entrenar `qty` unidades de `key` (el de una, multiplicado). */
export function batchCost(key, qty) {
  const unit = UNITS[key];
  return Object.fromEntries(RESOURCES.map((r) => [r, costOf(unit.cost, r) * qty]));
}

/** Cuántas unidades se pueden pedir ya: tope del lote, población libre y recursos. */
export function maxTrainable(state, b, key) {
  const unit = UNITS[key];
  if (!unit) return 1; // héroes e investigaciones: siempre de uno en uno
  const freeSupply = Math.floor((supplyCap(state) - supplyUsed(state)) / unit.supply);
  let n = Math.min(batchSizeOf(b), freeSupply);
  for (const r of RESOURCES) if (costOf(unit.cost, r) > 0) n = Math.min(n, Math.floor(state[r] / costOf(unit.cost, r)));
  return Math.max(0, n);
}

/** Cuánto dura en total lo que entrena un edificio (con el lote y el factor de su nivel), en milisegundos. */
export function trainingTotalMs(state, b) {
  const factor = statsOf(b.type, b.level).trainFactor ?? 1;
  return (trainSecOf(state, b.training.unit) ?? 1) * batchTimeFactor(b.training.qty ?? 1) * factor * 1000;
}

export const armyCount = (state) => ARMY_UNITS.reduce((n, u) => n + (state.army[u] ?? 0), 0);

/** Qué nivel del edificio hace falta para entrenar (o invocar, o investigar) esa clave. */
export function requiredLevel(buildingType, key) {
  if (UNITS[key]) return UNITS[key].minLevel;
  if (HEROES[key]) return HEROES[key].altarLevel;
  return 1; // las investigaciones se limitan por su propio nivel, no por el del edificio
}

/** Lo que este edificio puede entrenar ahora (según su nivel): unidades, héroes o investigaciones. */
export function trainableUnits(b) {
  return (BUILDINGS[b.type].trains ?? []).filter((k) => b.level >= requiredLevel(b.type, k));
}

/* ---------- nivel de las unidades, héroes e investigaciones ---------- */

/** Nivel de una unidad: el del mejor edificio que la entrena (o 1 si todavía no tienes ninguno). */
export function unitLevel(state, kind) {
  const type = UNITS[kind].building;
  return state.buildings.filter((b) => b.type === type && !b.damaged).reduce((m, b) => Math.max(m, b.level), 1);
}

export const researchLevel = (state, track) => state.research?.[track] ?? 0;
/** Bono de una investigación (fracción): nivel × lo que da cada nivel. */
export const researchBonus = (state, track) => researchLevel(state, track) * RESEARCH[track].perLevel;

/**
 * Estadísticas de combate de una unidad hoy: base, más el nivel de su edificio (más vida y daño) y
 * las investigaciones de la Herrería. Es lo que se lleva a la batalla.
 */
export function unitCombat(state, kind) {
  const def = UNITS[kind];
  const grow = 1 + def.perLevel * (unitLevel(state, kind) - 1);
  return {
    ...def.combat,
    hp: Math.round(def.combat.hp * grow * (1 + researchBonus(state, 'armor'))),
    dmg: Math.round(def.combat.dmg * grow * (1 + researchBonus(state, 'weapons')) * 10) / 10,
  };
}

/** Nivel máximo que pueden alcanzar hoy tus héroes (el doble del nivel del Ayuntamiento, tope 20). */
export const heroLevelCap = (state) => heroCap(townHallLevel(state));

export const heroCount = (state) => Object.keys(state.heroes).length;

/** Héroes que salen a pelear: [{ key, level, xp }] en el orden de la escuadra. */
export const squadHeroes = (state) =>
  state.squad.filter((k) => state.heroes[k]).map((k) => ({ key: k, level: state.heroes[k].level, xp: state.heroes[k].xp }));

/** Elige quiénes salen a pelear (máximo 2, que ya tengas). */
export function setSquad(state, keys) {
  const unique = [...new Set(keys)];
  if (unique.length > SQUAD_SIZE) return fail(`Solo pueden salir ${SQUAD_SIZE} héroes`);
  if (unique.some((k) => !isHeroKey(k) || !state.heroes[k])) return fail('Ese héroe aún no lo tienes');
  state.squad = unique;
  return { ok: true };
}

/** Pone o saca a un héroe de la escuadra. */
export function toggleSquad(state, key) {
  if (!state.heroes[key]) return fail('Ese héroe aún no lo tienes');
  if (state.squad.includes(key)) return setSquad(state, state.squad.filter((k) => k !== key));
  if (state.squad.length >= SQUAD_SIZE) return fail(`Solo pueden salir ${SQUAD_SIZE}: saca antes a uno`);
  return setSquad(state, [...state.squad, key]);
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

/** Primer nivel del Ayuntamiento con el que se puede construir ese edificio (o null si nunca). */
export function unlockLevel(type) {
  const i = BUILDINGS.townhall.levels.findIndex((l) => (l.limits?.[type] ?? 0) > 0);
  return i === -1 ? null : i + 1;
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

  if (b.damaged) {
    b.lastTick = now; // dañado: no produce hasta que se repare
    return 0;
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

/** Cuánto dura como máximo lo que se está entrenando (unidad, héroe o investigación), sin el factor del edificio. */
export function trainSecOf(state, key) {
  if (UNITS[key]) return UNITS[key].trainSec;
  if (HEROES[key]) return HEROES[key].trainSec;
  if (RESEARCH[key]) return researchStep(key, researchLevel(state, key)).sec;
  return null;
}

/** Cuánto tarda en este edificio un lote de `qty` unidades de `key`, en milisegundos. */
const batchMs = (b, key, qty) => Math.round(UNITS[key].trainSec * batchTimeFactor(qty) * 1000 * (statsOf(b.type, b.level).trainFactor ?? 1));

/**
 * Termina el entrenamiento de un edificio si le toca: suma la unidad, crea al héroe o sube la investigación.
 * Si hay lotes en cola, el siguiente empieza justo cuando terminó el anterior (también si pasó mientras no estabas).
 */
function tickTraining(state, b, now, events) {
  for (let guard = 0; b.training && guard < 20; guard++) {
    const key = b.training.unit;
    const sec = trainSecOf(state, key);
    if (sec === null) {
      b.training = null; // desconocido: se descarta
      b.queue = [];
      return;
    }
    // Igual que las mejoras: nunca queda más lejos que la duración completa.
    const qty = b.training.qty ?? 1;
    b.training.endsAt = Math.min(b.training.endsAt, now + sec * batchTimeFactor(qty) * 1000);
    if (now < b.training.endsAt) return;

    const endedAt = b.training.endsAt;
    b.training = null;
    if (HEROES[key]) {
      if (!state.heroes[key]) state.heroes[key] = { level: 1, xp: 0 };
      if (state.squad.length < SQUAD_SIZE && !state.squad.includes(key)) state.squad.push(key); // sale a pelear si hay lugar
    } else if (RESEARCH[key]) {
      state.research[key] = Math.min(MAX_LEVEL, researchLevel(state, key) + 1);
    } else {
      state.army[key] = (state.army[key] ?? 0) + qty;
    }
    events?.push({ type: 'trained', id: b.id, unit: key, qty });

    const next = b.queue?.shift();
    if (next && UNITS[next.unit]) b.training = { unit: next.unit, qty: next.qty, endsAt: endedAt + batchMs(b, next.unit, next.qty) };
  }
}

/* ---------- cola de mejoras ---------- */

export const isQueuedUpgrade = (state, id) => state.upgradeQueue.includes(id);

/** Empieza las mejoras encargadas a medida que quedan obreros libres. `freed`: instantes en que se liberaron obreros. */
function pumpUpgradeQueue(state, now, freed, events) {
  for (let guard = 0; guard < 50 && state.upgradeQueue.length && busyBuilders(state) < ECONOMY.builders; guard++) {
    const id = state.upgradeQueue.shift();
    const b = state.buildings.find((x) => x.id === id);
    const next = b && nextLevelOf(b);
    if (!b || !next) continue; // el edificio ya no existe o no tiene más niveles
    if (b.damaged || isTraining(b) || isUpgrading(b)) {
      // Ya no puede empezar (un ataque lo dañó, p. ej.): se devuelve lo pagado.
      for (const r of RESOURCES) state[r] = Math.max(state[r], Math.min(resourceCap(state), state[r] + costOf(next.upgradeCost, r)));
      events?.push({ type: 'upgrade_cancelled', id: b.id, building: b.type });
      continue;
    }
    freed.sort((p, q) => p - q);
    const start = freed.length ? Math.min(now, freed.shift()) : now; // empieza cuando se liberó el obrero (aunque fuera mientras no estabas)
    b.upgradeEndsAt = start + next.upgradeSec * 1000;
    const ends = b.upgradeEndsAt;
    tickBuilding(b, now, events); // si ya terminó (estuviste mucho fuera), sube de nivel en el acto
    if (b.upgradeEndsAt === null) freed.push(ends);
  }
}

/** Encarga una mejora cuando no hay obrero libre: se paga ya y empieza sola al liberarse uno. */
export function queueUpgrade(state, id) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe ese edificio');
  if (b.damaged) return fail('Está dañado: repáralo primero');
  if (isUpgrading(b)) return fail('Ya se está mejorando');
  if (isTraining(b)) return fail('Espera a que termine el entrenamiento');
  if (isQueuedUpgrade(state, id)) return fail('Ya está en la cola de obras');
  const next = nextLevelOf(b);
  if (!next) return fail('Ya está al nivel máximo');
  if (b.type !== 'townhall' && b.level >= townHallLevel(state)) return fail('Mejora antes el Ayuntamiento');
  if (busyBuilders(state) < ECONOMY.builders) return fail('Hay un obrero libre: mejóralo directamente');
  if (state.upgradeQueue.length >= UPGRADE_QUEUE_MAX) return fail('La cola de obras está llena');
  const missing = missingResource(state, next.upgradeCost);
  if (missing) return fail(insufficient(missing));
  spend(state, next.upgradeCost);
  state.upgradeQueue.push(id);
  return { ok: true, position: state.upgradeQueue.length };
}

/** Saca una mejora de la cola y devuelve todo lo pagado. */
export function cancelQueuedUpgrade(state, id) {
  const i = state.upgradeQueue.indexOf(id);
  if (i === -1) return fail('No está en la cola');
  const b = state.buildings.find((x) => x.id === id);
  state.upgradeQueue.splice(i, 1);
  const next = b && nextLevelOf(b);
  if (next) for (const r of RESOURCES) state[r] = Math.max(state[r], Math.min(resourceCap(state), state[r] + costOf(next.upgradeCost, r)));
  return { ok: true };
}

/** Avanza el tiempo de todos los edificios. Devuelve lo generado: { gold, wood }. */
export function tickAll(state, now, events) {
  const gained = { gold: 0, wood: 0 };
  const freed = []; // instantes en que terminó una obra (un obrero quedó libre)
  for (const b of state.buildings) {
    const endsAt = b.upgradeEndsAt;
    const amount = tickBuilding(b, now, events);
    if (endsAt !== null && b.upgradeEndsAt === null) freed.push(endsAt);
    const resource = statsOf(b.type, b.level).produces;
    if (amount && resource) gained[resource] += amount;
    tickTraining(state, b, now, events);
  }
  pumpUpgradeQueue(state, now, freed, events);
  return gained;
}

/* ---------- acciones del jugador ---------- */

/** Por qué NO se puede construir `type` en (x, y), o null si se puede. No modifica nada. */
export function placementError(state, type, x, y) {
  if (!isBuildingType(type)) return 'Edificio desconocido';
  const def = BUILDINGS[type];
  if (def.buildable === false) return 'Ese edificio no se puede construir';
  if (!fitsInMap(type, x, y)) return 'Fuera del mapa';
  if (buildingsInArea(state, type, x, y).length) return 'Casilla ocupada';
  if (state.buildings.length >= MAX_BUILDINGS) return 'Mapa lleno';

  const limit = limitFor(state, type);
  if (countOf(state, type) >= limit) {
    if (limit === 0) {
      const need = unlockLevel(type);
      return need ? `${def.name}: pide ${displayName('townhall', need)} (nivel ${need})` : `Aún no puedes construir ${def.name}`;
    }
    if (UNIQUE_BUILDINGS.includes(type)) return `Solo puedes tener un ${def.name}: mejóralo para entrenar más a la vez`;
    return `Límite de ${def.name}: ${limit}. Mejora el Ayuntamiento`;
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
  if (b.damaged) return fail('Está dañado: repáralo primero');
  if (isUpgrading(b)) return fail('Ya se está mejorando');
  if (isTraining(b)) return fail('Espera a que termine el entrenamiento');
  if (isQueuedUpgrade(state, id)) return fail('Ya está en la cola de obras');
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

export const WALL_BATCH_MAX = 25;
const isWallPiece = (b) => b && (b.type === 'wall' || b.type === 'gate');

/** Tramo ortogonal conectado al muro o puerta elegidos, del mismo nivel. */
export function wallSegment(state, id, max = WALL_BATCH_MAX) {
  const first = state.buildings.find((b) => b.id === id);
  if (!isWallPiece(first)) return [];
  const at = new Map(state.buildings.filter((b) => isWallPiece(b) && b.level === first.level).map((b) => [`${b.x},${b.y}`, b]));
  const out = [];
  const seen = new Set();
  const queue = [first];
  while (queue.length && out.length < max) {
    const b = queue.shift();
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push(at.get(`${b.x + dx},${b.y + dy}`));
  }
  return out;
}

export function wallBatchCost(state, id, max = WALL_BATCH_MAX) {
  const cost = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const b of wallSegment(state, id, max)) {
    const next = nextLevelOf(b);
    if (next) for (const r of RESOURCES) cost[r] += costOf(next.upgradeCost, r);
  }
  return cost;
}

/** Mejora un tramo de defensas de una vez. Los muros no ocupan obreros. */
export function upgradeWallSegment(state, id, max = WALL_BATCH_MAX) {
  const first = state.buildings.find((b) => b.id === id);
  if (!isWallPiece(first)) return fail('Elige un muro o una puerta');
  const segment = wallSegment(state, id, max);
  if (!segment.length) return fail('No hay tramo para mejorar');
  for (const b of segment) {
    if (b.damaged) return fail('Repara primero todo el tramo');
    if (isUpgrading(b) || isQueuedUpgrade(state, b.id)) return fail('Parte del tramo ya está en obras');
    if (!nextLevelOf(b)) return fail('El tramo ya está al nivel máximo');
    if (b.level >= townHallLevel(state)) return fail('Mejora antes el Ayuntamiento');
  }
  const cost = wallBatchCost(state, id, max);
  const missing = missingResource(state, cost);
  if (missing) return fail(insufficient(missing));
  spend(state, cost);
  for (const b of segment) b.level += 1;
  return { ok: true, count: segment.length, level: first.level, cost };
}

/**
 * Empieza a entrenar en un edificio: una unidad (cuartel, arquería, atelier, caballeriza, taller), un héroe
 * (altar) o una investigación (herrería). Se paga y se reserva la población al empezar; llega cuando termina
 * el tiempo (también sin conexión).
 */
export function startTraining(state, id, key, now, qty = 1) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe ese edificio');
  const def = BUILDINGS[b.type];
  if (!def.trains?.includes(key)) return fail('Este edificio no entrena eso');
  if (b.damaged) return fail('Está dañado: repáralo primero');
  if (isUpgrading(b)) return fail('El edificio está en obras');
  // Una unidad se puede dejar en cola mientras el edificio entrena otra (no así héroes ni investigaciones).
  const queuing = isTraining(b);
  if (queuing && !(UNITS[key] && UNITS[b.training.unit])) return fail(RESEARCH[key] ? 'Ya está investigando' : 'Ya está entrenando');
  if (queuing && (b.queue?.length ?? 0) >= trainQueueLimit(b.level)) return fail('La cola de este edificio está llena');
  const factor = statsOf(b.type, b.level).trainFactor ?? 1; // los edificios de nivel alto trabajan más rápido

  if (RESEARCH[key]) {
    const level = researchLevel(state, key);
    if (level >= MAX_LEVEL) return fail('Investigación al máximo');
    if (level >= b.level) return fail('Mejora la Herrería para seguir');
    const step = researchStep(key, level);
    const missing = missingResource(state, step.cost);
    if (missing) return fail(insufficient(missing));
    spend(state, step.cost);
    b.training = { unit: key, endsAt: now + Math.round(step.sec * 1000 * factor), qty: 1 };
    return { ok: true, endsAt: b.training.endsAt };
  }

  const unit = UNITS[key] ?? HEROES[key];
  const need = requiredLevel(b.type, key);
  if (b.level < need) return fail(`Pide ${def.name} nivel ${need}`);
  if (HEROES[key] && (state.heroes[key] || state.buildings.some((x) => x.training?.unit === key))) return fail('Ya tienes a ese héroe');
  // Los héroes se invocan de uno en uno; las unidades, por lotes (hasta lo que permita el nivel del edificio).
  const count = HEROES[key] ? 1 : qty;
  if (!Number.isInteger(count) || count < 1) return fail('Cantidad inválida');
  if (count > batchSizeOf(b)) return fail(`Este edificio entrena como mucho ${batchSizeOf(b)} a la vez: mejóralo para más`);
  if (supplyUsed(state) + unit.supply * count > supplyCap(state)) return fail('Población al máximo: construye casas');
  const cost = HEROES[key] ? unit.cost : batchCost(key, count);
  const missing = missingResource(state, cost);
  if (missing) return fail(insufficient(missing));

  spend(state, cost);
  if (queuing) {
    (b.queue ??= []).push({ unit: key, qty: count });
    return { ok: true, queued: true, position: b.queue.length, qty: count, endsAt: b.training.endsAt };
  }
  b.training = { unit: key, endsAt: now + Math.round(unit.trainSec * batchTimeFactor(count) * 1000 * factor), qty: count };
  return { ok: true, endsAt: b.training.endsAt, qty: count };
}

export function demolish(state, id) {
  const index = state.buildings.findIndex((b) => b.id === id);
  if (index === -1) return fail('No existe ese edificio');
  const b = state.buildings[index];
  if (b.type === 'townhall') return fail('El Ayuntamiento no se puede demoler');
  if (isUpgrading(b)) return fail('Espera a que termine la mejora');
  if (isTraining(b)) return fail('Espera a que termine el entrenamiento');

  // Una casa que sostiene a las unidades actuales no se puede demoler.
  const supplyBonus = statsOf(b.type, b.level).supply ?? 0;
  if (supplyBonus > 0 && supplyUsed(state) > supplyCap(state) - supplyBonus) {
    return fail('Hay demasiadas unidades para demoler esta casa');
  }

  // Solo un almacén cambia el tope: si lo que hay no cabría sin él, no se puede demoler.
  const bonus = statsOf(b.type, b.level).capBonus ?? 0;
  const newCap = resourceCap(state) - bonus;
  if (bonus > 0 && (state.gold > newCap || state.wood > newCap)) {
    return fail('Gasta recursos antes: no cabrían sin este almacén');
  }

  if (isQueuedUpgrade(state, id)) cancelQueuedUpgrade(state, id); // lo pagado por una mejora en cola vuelve entero
  const invested = investedCost(b);
  state.buildings.splice(index, 1);
  for (const r of RESOURCES) {
    const refund = Math.floor(invested[r] * ECONOMY.refundRate);
    if (refund > 0) state[r] = Math.min(newCap, state[r] + refund);
  }
  return { ok: true };
}

/* ---------- daño y reparación (ataques enemigos) ---------- */

export const damagedBuildings = (state) => state.buildings.filter((b) => b.damaged);

/** Lo que cuesta reparar un edificio: una parte de lo que se invirtió en él (redondeada hacia arriba). */
export function repairCost(b) {
  const invested = investedCost(b);
  const cost = {};
  for (const r of RESOURCES) cost[r] = Math.ceil(invested[r] * RAID.repairRate);
  return cost;
}

export function repairBuilding(state, id) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return fail('No existe ese edificio');
  if (!b.damaged) return fail('No está dañado');
  const cost = repairCost(b);
  const missing = missingResource(state, cost);
  if (missing) return fail(insufficient(missing));
  spend(state, cost);
  b.damaged = false;
  b.lastTick = Math.max(b.lastTick, 0);
  return { ok: true, cost };
}

/** Costo total de reparar todo lo dañado. */
export function repairAllCost(state) {
  const total = { gold: 0, wood: 0 };
  for (const b of damagedBuildings(state)) for (const r of RESOURCES) total[r] += repairCost(b)[r];
  return total;
}

/** Repara todo lo dañado, en orden, mientras alcancen los recursos. Devuelve cuántos y cuánto costó. */
export function repairAll(state, now = Date.now()) {
  const spent = { gold: 0, wood: 0 };
  let repaired = 0;
  for (const b of damagedBuildings(state)) {
    const r = repairBuilding(state, b.id);
    if (!r.ok) continue;
    b.lastTick = now; // vuelve a producir desde ahora
    repaired++;
    for (const k of RESOURCES) spent[k] += r.cost[k];
  }
  const left = damagedBuildings(state).length;
  if (!repaired) return fail(left ? 'No alcanzan los recursos para reparar' : 'No hay nada dañado');
  return { ok: true, repaired, left, cost: spent };
}

/** Cambia un edificio de sitio (gratis): (x, y) es el cuadro de arriba del lugar nuevo. */
export function moveBuilding(state, id, x, y) {
  const b = state.buildings.find((v) => v.id === id);
  if (!b) return fail('No existe ese edificio');
  if (!fitsInMap(b.type, x, y)) return fail('Fuera del mapa');
  if (b.x === x && b.y === y) return fail('Ya está ahí');
  if (buildingsInArea(state, b.type, x, y, id).length) return fail('Casilla ocupada');
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
