// Guardado: serialización, validación estricta, migraciones, checksum,
// copia de respaldo y exportar/importar.
//
// Nota de seguridad: el checksum NO impide hacer trampa (el código está en el
// navegador y cualquiera puede recalcularlo). Solo detecta archivos dañados o
// editados a mano sin querer. En un juego de un jugador está bien así.
import { ACHIEVEMENTS, ARMY_UNITS, BUILDINGS, DAILY, ECONOMY, GRID, QUESTS, RESEARCH_KEYS, UNIQUE_BUILDINGS, UNITS, UPGRADE_QUEUE_MAX, researchStep } from '../data/config.js';
import { HERO_MAX_LEVEL, SQUAD_SIZE, isHeroKey } from '../data/heroes.js';
import {
  MAX_BUILDINGS,
  allDecorKeys,
  costOf,
  createBuilding,
  emptyAchievements,
  emptyArmy,
  emptyResearch,
  findFreeCell,
  findFreeSpot,
  investedCost,
  isBuildingType,
  sizeOf,
  supplyCap,
  supplyUsed,
} from './logic.js';

export const SAVE_VERSION = 13;
export const MAX_SAVE_BYTES = 900_000; // con muros de a un cuadro una base grande llega a miles de edificios

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

    const { _notice: notice, ...migrated } = migrate(env.data, env.v);
    return { ok: true, state: validateState(migrated), notice };
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

  // v5 → v6: aparecieron la campaña y la experiencia del héroe.
  if (version < 6) {
    d = { ...d, campaign: { cleared: 0 }, hero: isPlainObject(d.hero) ? { ...d.hero, xp: 0 } : d.hero };
  }

  // v6 → v7: aparecieron los ataques enemigos (calendario) y los edificios dañados.
  // `nextAt: 0` significa «sin programar»: al abrir la partida se programa el primer ataque (ver store.init).
  if (version < 7) {
    d = {
      ...d,
      raid: { nextAt: 0, count: 0, postponed: 0 },
      buildings: Array.isArray(d.buildings) ? d.buildings.map((b) => (isPlainObject(b) ? { ...b, damaged: false } : b)) : d.buildings,
    };
  }

  // v7 → v8: las granjas pasaron a ser casas; aparecieron los edificios militares nuevos, los 5 héroes
  // (con una escuadra de 2), la Herrería y los niveles hasta el 10. El héroe único pasa a ser el Paladín.
  if (version < 8) d = migrateV7toV8(d);

  // v8 → v9: aparecieron las estrellas de campaña (cada nivel ya superado cuenta como 1 estrella) y el logro de estrellas.
  if (version < 9) d = migrateV8toV9(d);

  // v9 → v10: los edificios militares pasaron a ser únicos (uno de cada) y se entrena por lotes.
  if (version < 10) d = migrateV9toV10(d);

  // v10 → v11: el mapa pasó de 24×24 casillas a 48×48 cuadros y cada edificio ocupa varios.
  if (version < 11) d = migrateV10toV11(d);

  // v11 → v12: aparecieron los adornos que se pueden quitar (empiezan todos puestos).
  if (version < 12) d = { ...d, cleared: [] };

  // v12 → v13: llegaron las colas (de entrenamiento y de obras) y el premio diario.
  if (version < 13) {
    d = {
      ...d,
      upgradeQueue: [],
      daily: { day: 0, streak: 0 },
      buildings: Array.isArray(d.buildings) ? d.buildings.map((b) => (isPlainObject(b) ? { ...b, queue: [] } : b)) : d.buildings,
    };
  }

  return d;
}

/**
 * v10 → v11: cada casilla vieja pasa a ser un bloque de 2×2 cuadros. Los edificios conservan su centro (los
 * grandes se acomodan al sitio libre más cercano) y cada muro o puerta se convierte en 4 piezas (2×2) para
 * que las murallas sigan cerradas. Si un muro cae donde ahora hay un edificio grande, se pierde esa pieza.
 */
function migrateV10toV11(d) {
  if (!Array.isArray(d.buildings) || !Number.isInteger(d.nextId)) return d;
  const ok = d.buildings.every((b) => isPlainObject(b) && isBuildingType(b.type) && Number.isInteger(b.x) && Number.isInteger(b.y));
  if (!ok) return d; // la validación lo rechazará

  const area = (b) => sizeOf(b.type).w * sizeOf(b.type).h;
  const thin = (b) => area(b) === 1; // muros y puertas
  const order = [...d.buildings].sort((a, b) => Number(thin(a)) - Number(thin(b)) || area(b) - area(a) || a.id - b.id);

  const placed = { buildings: [] };
  let nextId = d.nextId;
  for (const b of order) {
    const { w, h } = sizeOf(b.type);
    if (thin(b)) {
      const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
      cells.forEach(([dx, dy], i) => {
        const x = b.x * 2 + dx;
        const y = b.y * 2 + dy;
        if (x >= GRID.cols || y >= GRID.rows || placed.buildings.some((o) => o.x === x && o.y === y)) return;
        const covered = placed.buildings.some((o) => {
          const r = sizeOf(o.type);
          return x >= o.x && x < o.x + r.w && y >= o.y && y < o.y + r.h;
        });
        if (!covered) placed.buildings.push({ ...b, id: i === 0 ? b.id : nextId++, x, y });
      });
      continue;
    }
    const ideal = {
      x: Math.min(GRID.cols - w, Math.max(0, Math.round(b.x * 2 + 0.5 - (w - 1) / 2))),
      y: Math.min(GRID.rows - h, Math.max(0, Math.round(b.y * 2 + 0.5 - (h - 1) / 2))),
    };
    const spot = findFreeSpot(placed, b.type, ideal.x, ideal.y);
    if (spot) placed.buildings.push({ ...b, x: spot.x, y: spot.y });
  }
  placed.buildings.sort((a, b) => a.id - b.id);
  return { ...d, nextId, buildings: placed.buildings };
}

/**
 * v9 → v10: si había varios cuarteles (u otro edificio militar), se queda el de mayor nivel y los demás se
 * demuelen devolviendo TODO lo invertido (y lo que estaban entrenando). Deja un aviso en `_notice`.
 */
function migrateV9toV10(d) {
  if (!Array.isArray(d.buildings)) return d;
  const score = (b) => (Number.isInteger(b.level) ? b.level : 1) * 10 + (isPlainObject(b.training) ? 4 : 0) + (b.damaged ? 0 : 2);
  const removed = [];
  const buildings = [...d.buildings];
  for (const type of UNIQUE_BUILDINGS) {
    const same = buildings.filter((b) => isPlainObject(b) && b.type === type);
    if (same.length <= 1) continue;
    same.sort((a, b) => score(b) - score(a) || (a.id ?? 0) - (b.id ?? 0));
    removed.push(...same.slice(1));
  }
  if (!removed.length) return d;

  const refund = { gold: 0, wood: 0 };
  for (const b of removed) {
    if (!isInt(b.level, 1, BUILDINGS[b.type].levels.length)) continue;
    const paid = investedCost(b);
    const next = BUILDINGS[b.type].levels[b.level];
    if (b.upgradeEndsAt != null && next) for (const r of Object.keys(refund)) paid[r] += costOf(next.upgradeCost, r);
    const key = isPlainObject(b.training) ? b.training.unit : null;
    if (UNITS[key]) for (const r of Object.keys(refund)) paid[r] += costOf(UNITS[key].cost, r);
    else if (RESEARCH_KEYS.includes(key)) {
      const step = researchStep(key, isPlainObject(d.research) && isInt(d.research[key], 0, 10) ? d.research[key] : 0);
      for (const r of Object.keys(refund)) paid[r] += costOf(step.cost, r);
    }
    for (const r of Object.keys(refund)) refund[r] += paid[r];
  }

  const gone = new Set(removed);
  const names = [...new Set(removed.map((b) => BUILDINGS[b.type].name))].join(', ');
  const back = [refund.gold > 0 && `${refund.gold} de oro`, refund.wood > 0 && `${refund.wood} de madera`].filter(Boolean).join(' y ');
  return {
    ...d,
    gold: (Number.isInteger(d.gold) ? d.gold : 0) + refund.gold,
    wood: (Number.isInteger(d.wood) ? d.wood : 0) + refund.wood,
    buildings: buildings.filter((b) => !gone.has(b)),
    _notice: `Ahora solo hay un edificio militar de cada clase (${names}): se unificaron ${removed.length} y se te devolvió ${back || 'lo invertido'}. Mejóralo para entrenar más unidades a la vez.`,
  };
}

function migrateV8toV9(d) {
  const campaign = isPlainObject(d.campaign) ? d.campaign : { cleared: 0 };
  const stars = {};
  const cleared = Number.isInteger(campaign.cleared) ? Math.min(campaign.cleared, 9999) : 0;
  for (let level = 1; level <= cleared; level++) stars[level] = 1;
  return { ...d, campaign: { ...campaign, stars }, achievements: { ...emptyAchievements(), ...(isPlainObject(d.achievements) ? d.achievements : {}) } };
}

function migrateV7toV8(d) {
  const oldHero = isPlainObject(d.hero) ? d.hero : null;
  const { hero: _removed, ...rest } = d;
  return {
    ...rest,
    army: { ...emptyArmy(), ...(isPlainObject(d.army) ? d.army : {}) }, // los tipos nuevos empiezan en 0
    heroes: oldHero ? { paladin: { level: oldHero.level, xp: oldHero.xp } } : {},
    squad: oldHero ? ['paladin'] : [],
    research: emptyResearch(),
    achievements: emptyAchievements(),
    buildings: Array.isArray(d.buildings)
      ? d.buildings.map((b) => {
          if (!isPlainObject(b)) return b;
          const type = b.type === 'farm' ? 'house' : b.type;
          const training = isPlainObject(b.training) && b.training.unit === 'hero' ? { ...b.training, unit: 'paladin' } : b.training;
          return { ...b, type, training };
        })
      : d.buildings,
  };
}

// v2 → v3: el mapa pasó de 12×12 a 24×24, apareció la madera y el Ayuntamiento.
// Las constantes son las de aquella época a propósito: describen cómo eran las partidas v2,
// no cómo es el juego hoy.
const V2_TO_V3_SHIFT = 6; // (24 − 12) / 2: la base antigua queda centrada en el mapa nuevo
const V3_GRID = 24; // el mapa de aquella época: 24×24 casillas
const V3_HALL_CELL = { x: 11, y: 11 }; // y su Ayuntamiento, en el centro
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
  const cell = findFreeCell(new Set(valid.map((b) => `${b.x},${b.y}`)), V3_HALL_CELL.x, V3_HALL_CELL.y, V3_GRID, V3_GRID);
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

  if (!isPlainObject(d.heroes)) bad('Héroes inválidos');
  const heroes = {};
  for (const [key, h] of Object.entries(d.heroes)) {
    if (!isHeroKey(key) || !isPlainObject(h) || !isInt(h.level, 1, HERO_MAX_LEVEL) || !isInt(h.xp, 0, 99_999)) bad('Héroe inválido');
    heroes[key] = { level: h.level, xp: h.xp };
  }
  if (!Array.isArray(d.squad) || d.squad.length > SQUAD_SIZE) bad('Escuadra inválida');
  const squad = d.squad.map((k) => {
    if (typeof k !== 'string' || !heroes[k]) bad('Escuadra inválida');
    return k;
  });
  if (new Set(squad).size !== squad.length) bad('Escuadra repetida');

  if (!isPlainObject(d.research)) bad('Investigaciones inválidas');
  const research = {};
  for (const k of RESEARCH_KEYS) {
    if (!isInt(d.research[k], 0, 10)) bad('Investigaciones inválidas');
    research[k] = d.research[k];
  }

  if (!isPlainObject(d.achievements)) bad('Logros inválidos');
  const achievements = {};
  for (const a of ACHIEVEMENTS) {
    if (!isInt(d.achievements[a.id], 0, a.tiers.length)) bad('Logros inválidos');
    achievements[a.id] = d.achievements[a.id];
  }

  if (!isPlainObject(d.campaign) || !isInt(d.campaign.cleared, 0, 9999) || !isPlainObject(d.campaign.stars)) bad('Campaña inválida');
  const starEntries = Object.entries(d.campaign.stars);
  if (starEntries.length > 10_000) bad('Campaña inválida');
  const stars = {};
  for (const [level, n] of starEntries) {
    if (!/^[1-9]\d{0,3}$/.test(level) || !isInt(n, 0, 3)) bad('Estrellas inválidas');
    if (n > 0) stars[level] = n;
  }
  const campaign = { cleared: d.campaign.cleared, stars };

  // Adornos quitados: se descartan sin avisar los que ya no existan (si cambia el paisaje) y los repetidos.
  if (!Array.isArray(d.cleared) || d.cleared.length > 5000) bad('Adornos inválidos');
  const known = new Set(allDecorKeys());
  const cleared = [...new Set(d.cleared.filter((k) => typeof k === 'string' && known.has(k)))];

  if (!isPlainObject(d.raid) || !isNum(d.raid.nextAt, 0, MAX_TIME) || !isInt(d.raid.count, 0, 1_000_000)) bad('Calendario de ataques inválido');
  const postponed = d.raid.postponed === undefined ? 0 : d.raid.postponed;
  if (!isInt(postponed, 0, 100)) bad('Calendario de ataques inválido');
  const raid = { nextAt: d.raid.nextAt, count: d.raid.count, postponed };

  // Premio diario: el día (número de día del calendario) en que se reclamó el último y los días seguidos.
  if (!isPlainObject(d.daily) || !isInt(d.daily.day, 0, 1_000_000) || !isInt(d.daily.streak, 0, DAILY.days)) bad('Premio diario inválido');
  const daily = { day: d.daily.day, streak: d.daily.streak };

  const ids = new Set();
  const cells = new Set();
  let upgrading = 0;
  let townHalls = 0;
  const buildings = d.buildings.map((b) => {
    if (!isPlainObject(b)) bad('Edificio inválido');
    if (!isBuildingType(b.type)) bad('Tipo de edificio desconocido');
    if (!isInt(b.id, 1, 10_000_000) || b.id >= d.nextId) bad('Id de edificio inválido');
    const size = BUILDINGS[b.type].size;
    if (!isInt(b.x, 0, GRID.cols - size.w) || !isInt(b.y, 0, GRID.rows - size.h)) bad('Posición inválida');

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
      const qty = b.training.qty === undefined ? 1 : b.training.qty; // las partidas anteriores entrenaban de una en una
      if (!isInt(qty, 1, 99)) bad('Cantidad de entrenamiento inválida');
      if (qty > 1 && !UNITS[b.training.unit]) bad('Solo las unidades se entrenan por lotes');
      training = { unit: b.training.unit, endsAt: b.training.endsAt, qty };
    }

    // Lotes en espera (ya pagados): solo si hay un entrenamiento en curso y son unidades de este edificio.
    const queue = [];
    if (b.queue !== undefined) {
      if (!Array.isArray(b.queue) || b.queue.length > 12) bad('Cola de entrenamiento inválida');
      if (b.queue.length && !training) bad('Hay cola pero no se está entrenando');
      const trains = BUILDINGS[b.type].trains ?? [];
      for (const q of b.queue) {
        if (!isPlainObject(q) || !UNITS[q.unit] || !trains.includes(q.unit) || !isInt(q.qty, 1, 99)) bad('Cola de entrenamiento inválida');
        queue.push({ unit: q.unit, qty: q.qty });
      }
    }

    if (typeof b.damaged !== 'boolean') bad('Estado de daño inválido');
    if (b.damaged && b.type === 'townhall') bad('El Ayuntamiento no puede estar dañado');

    if (b.type === 'townhall') townHalls++;

    if (ids.has(b.id)) bad('Id repetido');
    ids.add(b.id);
    for (let cy = b.y; cy < b.y + size.h; cy++) {
      for (let cx = b.x; cx < b.x + size.w; cx++) {
        const cell = cx + ',' + cy;
        if (cells.has(cell)) bad('Dos edificios en la misma casilla');
        cells.add(cell);
      }
    }
    return {
      id: b.id,
      type: b.type,
      level: b.level,
      upgradeEndsAt: b.upgradeEndsAt,
      training,
      queue,
      damaged: b.damaged,
      x: b.x,
      y: b.y,
      stored: b.stored,
      lastTick: b.lastTick,
    };
  });

  if (townHalls !== 1) bad('Debe haber exactamente un Ayuntamiento');

  // Mejoras encargadas: edificios que existen, sin repetir, a los que les queda un nivel por subir.
  if (!Array.isArray(d.upgradeQueue) || d.upgradeQueue.length > UPGRADE_QUEUE_MAX) bad('Cola de obras inválida');
  const queued = new Set();
  for (const id of d.upgradeQueue) {
    const target = buildings.find((x) => x.id === id);
    if (!target || queued.has(id) || target.level >= BUILDINGS[target.type].levels.length) bad('Cola de obras inválida');
    queued.add(id);
  }

  let cap = ECONOMY.baseCap;
  for (const b of buildings) cap += BUILDINGS[b.type].levels[b.level - 1].capBonus ?? 0;

  const state = {
    gold: Math.min(d.gold, cap),
    wood: Math.min(d.wood, cap),
    nextId: d.nextId,
    savedAt: d.savedAt,
    claimedQuests,
    army,
    heroes,
    squad,
    research,
    achievements,
    campaign,
    cleared,
    upgradeQueue: [...queued],
    daily,
    raid,
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
  if (r.ok) return { state: r.state, source: 'main', warning: r.notice };

  const bak = read(BACKUP_KEY);
  if (bak !== null) {
    const rb = parseSave(bak);
    if (rb.ok) {
      return { state: rb.state, source: 'backup', warning: ['La partida principal estaba dañada; se recuperó la copia de respaldo.', rb.notice].filter(Boolean).join(' ') };
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
