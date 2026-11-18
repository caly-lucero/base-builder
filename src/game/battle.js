// Simulación de batalla: lógica pura y determinista (sin Phaser, sin azar, sin relojes).
// Las posiciones son cuadros con decimales; el centro del cuadro (x, y) es el punto (x, y). Los edificios ocupan
// varios cuadros (ver `size` en config.js) y las distancias del juego (alcances, velocidades…) están pensadas en
// «casillas» de antes, que eran de 2×2 cuadros: por eso se multiplican por `S`.
//
// Cómo pelean las unidades:
//  - AUTOMÁTICO: cada atacante busca solo un objetivo: primero enemigos cercanos y, si no hay,
//    el edificio más cercano que no sea un muro (y los muros solo cuando no queda otra cosa).
//  - ÓRDENES: el jugador puede darle a un grupo un objetivo concreto (atacar un edificio o enemigo)
//    o un punto al que ir. Al cumplirlo, el grupo vuelve al modo automático.
//  - Los muros se rodean si se puede; si el camino pasa por un muro, la unidad lo ataca para abrirse paso.
import { ARMY_UNITS, COMBAT, DEFENSE, ENEMY_BUILDINGS, ENEMY_UNITS, GRID, RAID, STARS, UNITS } from '../data/config.js';
import { HEROES, abilityAt, heroStats } from '../data/heroes.js';
import { researchBonus, sizeOf, squadHeroes, townHallLevel, unitCombat } from './logic.js';
import { findPath } from './pathfinding.js';

export const S = 2; // cuadros por casilla de antes: todas las distancias del combate se miden en cuadros
const UNIT_RADIUS = 0.25 * S;
const RANGED_FROM = 2 * S; // desde este alcance un golpe se muestra como disparo
const ABILITY_FIRST_CD = 3; // los héroes pueden lanzar su habilidad a los 3 s de empezar

/** Estadísticas de combate del héroe «paladín» a un nivel (el héroe de las partidas antiguas). */
export function heroCombat(level, key = 'paladin') {
  return heroStats(key, level);
}

/** Acepta la forma antigua (un solo héroe `{ level }`) y la nueva (lista de `{ key, level }`). */
function normalizeHeroes(h) {
  if (!h) return [];
  if (Array.isArray(h)) return h;
  return [{ key: 'paladin', level: h.level ?? 1 }];
}

/* ---------- creación ---------- */

/**
 * Prepara una batalla. `mission` viene de missions.js; `army` es { soldier, archer, mage, … } (cantidades);
 * `heroes` es la lista de héroes que salen ([{ key, level }]); `stats` (opcional) dice las estadísticas de
 * cada tipo de unidad (por defecto las del nivel 1; ver logic.unitCombat). Los atacantes aparecen en
 * formación en el borde inferior del mapa.
 */
export function createBattle(mission, army, heroes = [], stats = null) {
  const b = {
    mode: 'attack',
    level: mission.level,
    time: 0,
    acc: 0,
    over: false,
    result: null,
    nextId: 1,
    units: [],
    buildings: [],
    byId: new Map(),
    grid: new Map(), // cuadro (y·ancho + x) → edificio en pie que lo ocupa
    events: [],
    loot: { gold: 0, wood: 0 },
    destroyed: 0,
    kills: 0, // defensores derrotados
    hallId: null,
    countedBuildings: 0, // edificios que cuentan para el porcentaje (todos menos los muros)
    sent: Object.fromEntries(ARMY_UNITS.map((k) => [k, army[k] ?? 0])), // tropas con las que se salió
  };

  for (const spec of mission.buildings) {
    const def = ENEMY_BUILDINGS[spec.type];
    const hp = Math.round(def.hp * mission.hpScale);
    const e = newBuilding(b, spec.type, spec.x, spec.y, hp, { loot: spec.loot ?? { gold: 0, wood: 0 } });
    if (def.dmg) Object.assign(e, { dmg: Math.round(def.dmg * mission.dmgScale), range: def.range * S, atkSec: def.atkSec, cd: 0 });
    if (spec.type === 'hall') b.hallId = e.id;
    if (spec.type !== 'wall') b.countedBuildings++;
  }

  for (const d of mission.defenders) {
    const def = ENEMY_UNITS[d.kind];
    addUnit(b, 'd', d.kind, d.x, d.y, {
      hp: Math.round(def.hp * mission.hpScale), dmg: Math.round(def.dmg * mission.dmgScale),
      range: def.range, speed: def.speed, atkSec: def.atkSec,
    });
  }

  const roster = [];
  for (const kind of ARMY_UNITS) for (let i = 0; i < (army[kind] ?? 0); i++) roster.push({ kind });
  for (const h of normalizeHeroes(heroes)) roster.push({ kind: 'hero', hero: h });
  const perRow = 8;
  roster.forEach((r, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, roster.length - row * perRow);
    const col = i - row * perRow;
    const x = GRID.cols / 2 - ((inRow - 1) / 2) * S + col * S;
    const y = GRID.rows - 2 * S - row * 0.9 * S;
    if (r.hero) addHero(b, 'a', r.hero, x, y);
    else addUnit(b, 'a', r.kind, x, y, stats?.[r.kind] ?? UNITS[r.kind].combat);
  });
  return b;
}

/** Un edificio de la batalla: ocupa su rectángulo de cuadros (`cx`, `cy` es su centro) y se anota en el plano. */
function newBuilding(b, type, x, y, hp, extra = {}) {
  const { w, h } = sizeOf(type);
  const e = {
    id: b.nextId++, side: 'd', kind: 'building', type, x, y, w, h, cx: x + (w - 1) / 2, cy: y + (h - 1) / 2,
    hp, maxHp: hp, alive: true, loot: { gold: 0, wood: 0 }, ...extra,
  };
  b.buildings.push(e);
  b.byId.set(e.id, e);
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) b.grid.set(cy * GRID.cols + cx, e);
  return e;
}

function addUnit(b, side, kind, x, y, s) {
  const def = UNITS[kind] ?? ENEMY_UNITS[kind]; // los héroes no están en ninguno
  const u = {
    id: b.nextId++, side, kind: 'unit', type: kind, x, y, home: { x, y },
    hp: s.hp, maxHp: s.hp, dmg: s.dmg, range: s.range * S, speed: s.speed * S, atkSec: s.atkSec,
    armor: s.armor ?? 0, regen: s.regen ?? 0,
    bonus: def?.bonus ?? null, splash: def?.splash ? { ...def.splash, radius: def.splash.radius * S } : null, siege: def?.siege ?? null,
    cd: 0, alive: true, order: null, path: null, pathKey: null, pathAge: 99,
  };
  b.units.push(u);
  b.byId.set(u.id, u);
  return u;
}

/** Un héroe: sus estadísticas según nivel y pasivas, y su habilidad lista para lanzarse. */
function addHero(b, side, hero, x, y) {
  const u = addUnit(b, side, 'hero', x, y, heroStats(hero.key, hero.level));
  u.heroKey = hero.key;
  u.heroLevel = hero.level;
  const ability = abilityAt(hero.key, hero.level);
  u.ability = { ...ability, radius: ability.radius * S, cd: ABILITY_FIRST_CD };
  return u;
}

/**
 * Un duelo entre dos ejércitos en campo abierto (sin edificios): sirve para comprobar el equilibrio entre
 * unidades. `a` y `b` son { tipo: cantidad } (tipos de UNITS); `stats` fija las estadísticas por tipo.
 * Los dos grupos arrancan frente a frente, a distancia de verse. Termina cuando uno se queda sin tropas.
 */
export function createDuel(a, b, stats = null) {
  const d = {
    mode: 'duel', level: 0, time: 0, acc: 0, over: false, result: null, nextId: 1,
    units: [], buildings: [], byId: new Map(), grid: new Map(), events: [], loot: { gold: 0, wood: 0 },
    destroyed: 0, kills: 0, hallId: null, countedBuildings: 0,
  };
  const place = (counts, side, x) => {
    const kinds = Object.entries(counts).flatMap(([kind, n]) => Array.from({ length: n }, () => kind));
    const perCol = 6;
    kinds.forEach((kind, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const dx = side === 'a' ? -col * 0.5 * S : col * 0.5 * S;
      addUnit(d, side, kind, x + dx, GRID.rows / 2 + (row - (Math.min(perCol, kinds.length) - 1) / 2) * 0.6 * S, stats?.[kind] ?? UNITS[kind].combat);
    });
  };
  place(a, 'a', 8 * S);
  place(b, 'd', 12 * S);
  return d;
}

function checkDuelEnd(b) {
  const a = attackers(b).length;
  const d = defenderUnits(b).length;
  if (a > 0 && d > 0 && b.time < 120) return undefined;
  b.over = true;
  const hp = (list) => Math.round(list.reduce((sum, u) => sum + u.hp, 0));
  b.result = { winner: a > 0 && d === 0 ? 'a' : d > 0 && a === 0 ? 'd' : 'draw', aliveA: a, aliveD: d, hpA: hp(attackers(b)), hpD: hp(defenderUnits(b)), timeSec: Math.round(b.time) };
  b.events.push({ type: 'end' });
  return undefined;
}

/* ---------- defensa de tu base (ataque enemigo) ---------- */

/** Vida de uno de tus edificios en una defensa: crece con el nivel; si ya está dañado entra a medias. */
export function defenseHp(type, level, damaged = false) {
  const base = DEFENSE.baseHp[type] ?? 120;
  return Math.round(base * (1 + DEFENSE.hpPerLevel * (level - 1)) * (damaged ? DEFENSE.damagedHpFactor : 1));
}

/**
 * Prepara la defensa de tu base contra una oleada (ver raids.js). Tus edificios son los defensores
 * (las torres disparan, salvo las dañadas) junto con tu ejército y tu héroe, formados donde se ven en
 * la base. Los atacantes son los enemigos de la oleada. Termina cuando el enemigo se retira tras
 * destruir demasiado, tumba tu Ayuntamiento, es derrotado o se acaba el tiempo.
 * `state` es la partida; no se modifica (el resultado se aplica con raids.js).
 */
export function createRaidBattle(state, raid) {
  const b = {
    mode: 'raid', level: raid.level, time: 0, acc: 0, over: false, result: null, nextId: 1,
    units: [], buildings: [], byId: new Map(), grid: new Map(), events: [], loot: { gold: 0, wood: 0 },
    destroyed: 0, kills: 0, hallId: null, countedBuildings: 0, destroyedIds: [],
    maxDestroyed: RAID.maxDamaged(townHallLevel(state)),
  };

  const fortify = researchBonus(state, 'fortify'); // Herrería: más vida de edificios y más daño de torres
  for (const src of state.buildings) {
    const hp = Math.round(defenseHp(src.type, src.level, src.damaged) * (1 + fortify));
    const e = newBuilding(b, src.type, src.x, src.y, hp, {
      sourceId: src.id,
      level: src.level, damaged: Boolean(src.damaged), // para dibujarlo igual que en la base
    });
    if (src.type === 'tower' && !src.damaged) {
      const t = DEFENSE.tower;
      Object.assign(e, { dmg: Math.round(t.dmg * (1 + t.dmgPerLevel * (src.level - 1)) * (1 + fortify)), range: t.range * S, atkSec: t.atkSec, cd: 0 });
    }
    if (src.type === 'townhall') b.hallId = e.id;
  }

  const first = (type) => state.buildings.filter((x) => x.type === type).sort((p, q) => p.id - q.id)[0];
  const camp = first('barracks') ?? first('townhall');
  const shrine = first('altar') ?? camp;
  // Las tropas se forman junto al cuartel (al lado de su rectángulo) y los héroes junto al altar.
  const beside = (src, dx, dy) => {
    const r = sizeOf(src.type);
    return { x: src.x + r.w + dx, y: src.y + (r.h - 1) / 2 + dy };
  };
  let slot = 0;
  for (const kind of ARMY_UNITS) {
    if (UNITS[kind].siege) continue; // las armas de asedio no defienden
    const stats = unitCombat(state, kind);
    for (let i = 0; i < (state.army[kind] ?? 0) && slot < 24; i++, slot++) {
      const p = beside(camp, 0.5 + (slot % 4) * 0.84, -1.2 + Math.floor(slot / 4) * 0.72);
      addUnit(b, 'd', kind, p.x, p.y, stats);
    }
  }
  squadHeroes(state).forEach((h, i) => {
    const p = beside(shrine, 0.5 + i * 1.2, 1.2);
    addHero(b, 'd', h, p.x, p.y);
  });

  for (const a of raid.attackers) {
    const def = ENEMY_UNITS[a.kind];
    addUnit(b, 'a', a.kind, a.x, a.y, {
      hp: Math.round(def.hp * raid.hpScale), dmg: Math.round(def.dmg * raid.dmgScale),
      range: def.range, speed: def.speed, atkSec: def.atkSec,
    });
  }
  return b;
}

function checkRaidEnd(b) {
  const hall = b.byId.get(b.hallId);
  if (hall && !hall.alive) return finishRaid(b, 'raided');
  if (attackers(b).length === 0) return finishRaid(b, 'repelled');
  if (b.destroyed >= b.maxDestroyed) return finishRaid(b, 'retreated'); // ya hicieron bastante daño y se van
  if (b.time >= RAID.timeLimitSec) return finishRaid(b, b.destroyed > 0 ? 'retreated' : 'repelled');
  return undefined;
}

function finishRaid(b, outcome) {
  b.over = true;
  const hall = b.byId.get(b.hallId);
  b.result = {
    mode: 'raid',
    outcome, // 'repelled' (rechazado), 'retreated' (se retiró tras hacer daño) o 'raided' (tumbó el Ayuntamiento)
    level: b.level,
    timeSec: Math.round(b.time),
    hallDown: Boolean(hall && !hall.alive),
    destroyed: b.destroyed, // edificios importantes destruidos (sin contar muros ni puertas)
    destroyedIds: [...b.destroyedIds], // ids de tus edificios destruidos, muros y puertas incluidos
    kills: b.kills, // atacantes derrotados
  };
  b.events.push({ type: 'end', outcome });
}

/* ---------- consultas ---------- */

export const attackers = (b) => b.units.filter((u) => u.side === 'a' && u.alive);
export const defenderUnits = (b) => b.units.filter((u) => u.side === 'd' && u.alive);
export const liveBuildings = (b) => b.buildings.filter((e) => e.alive);

/** Punto donde está algo: su centro (en los edificios, el centro de su rectángulo). */
const posOf = (e) => (e.kind === 'building' ? { x: e.cx, y: e.cy } : e);
const centerDist = (a, c) => {
  const p = posOf(a);
  const q = posOf(c);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
/** Distancia de un punto al rectángulo de un edificio (0 si está dentro). */
const rectDist = (p, e) => Math.hypot(Math.max(e.x - 0.5 - p.x, 0, p.x - (e.x + e.w - 0.5)), Math.max(e.y - 0.5 - p.y, 0, p.y - (e.y + e.h - 0.5)));
/** Distancia entre los bordes: lo que cuenta para el alcance. */
const edgeDist = (a, c) => (c.kind === 'building' ? rectDist(posOf(a), c) : centerDist(a, c) - UNIT_RADIUS);

const buildingAt = (b, x, y) => {
  const e = b.grid.get(y * GRID.cols + x);
  return e?.alive ? e : null;
};
// Muros y puertas se rodean si se puede y se rompen si no; el resto de edificios es un obstáculo sólido.
const isWallish = (type) => type === 'wall' || type === 'gate';
const wallAt = (b, x, y) => {
  const e = buildingAt(b, x, y);
  return e && isWallish(e.type) ? e : null;
};
const solidAt = (b, x, y) => {
  const e = buildingAt(b, x, y);
  return Boolean(e) && !isWallish(e.type);
};

/** Resumen para el HUD de la batalla. */
export function battleStatus(b) {
  return {
    timeLeft: Math.max(0, COMBAT.timeLimitSec - b.time),
    alliesAlive: attackers(b).length,
    enemiesAlive: defenderUnits(b).length,
    percent: b.countedBuildings ? Math.round((b.destroyed / b.countedBuildings) * 100) : 100,
  };
}

/* ---------- órdenes del jugador ---------- */

/** Ids de los atacantes vivos de esos tipos (`null` = todos). Tipos: soldier, mage, knight, hero. */
export function unitIdsOfKinds(b, kinds = null) {
  return attackers(b).filter((u) => !kinds || kinds.includes(u.type)).map((u) => u.id);
}

/** Manda al grupo a atacar un edificio o unidad enemiga. Devuelve false si el objetivo no vale. */
export function orderAttack(b, ids, targetId) {
  const t = b.byId.get(targetId);
  if (!t || !t.alive || t.side !== 'd') return false;
  for (const id of ids) {
    const u = b.byId.get(id);
    if (u?.alive && u.side === 'a') {
      u.order = { type: 'attack', targetId };
      u.path = null;
    }
  }
  return true;
}

/** Manda al grupo a un punto del mapa (en casillas). */
export function orderMove(b, ids, x, y) {
  const px = Math.min(GRID.cols - 1, Math.max(0, x));
  const py = Math.min(GRID.rows - 1, Math.max(0, y));
  for (const id of ids) {
    const u = b.byId.get(id);
    if (u?.alive && u.side === 'a') {
      u.order = { type: 'move', x: px, y: py };
      u.path = null;
    }
  }
}

/** Devuelve al grupo al modo automático. */
export function clearOrders(b, ids) {
  for (const id of ids) {
    const u = b.byId.get(id);
    if (u) u.order = null;
  }
}

/** El jugador se retira: la batalla termina como derrota. Las unidades vivas se salvan, y lo destruido hasta ahora cuenta. */
export function retreat(b) {
  if (!b.over) finish(b);
}

/* ---------- avance ---------- */

/** Avanza `dtSec` segundos en pasos fijos (resultado idéntico sin importar cómo se parta el tiempo). */
export function advanceBattle(b, dtSec) {
  if (b.over) return;
  b.acc += dtSec;
  for (let guard = 0; b.acc >= COMBAT.tickSec - 1e-9 && !b.over && guard < 500; guard++) {
    step(b, COMBAT.tickSec);
    b.acc -= COMBAT.tickSec;
  }
}

function step(b, dt) {
  b.time += dt;
  for (const u of b.units) u.cd = Math.max(0, u.cd - dt);
  for (const e of b.buildings) if (e.cd !== undefined) e.cd = Math.max(0, e.cd - dt);

  for (const u of b.units) {
    if (!u.alive) continue;
    if (u.regen && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.regen * dt);
    if (u.ability) stepAbility(b, u, dt);
    if (u.side === 'a') stepAttacker(b, u, dt);
    else stepDefender(b, u, dt);
  }
  for (const e of b.buildings) if (e.alive && e.dmg) stepTower(b, e);
  separateUnits(b);
  checkEnd(b);
}

/* ---------- que las unidades no se encimen ---------- */

const SEP_MIN = 2 * UNIT_RADIUS * 0.8; // distancia mínima entre dos unidades (un poco menos que dos radios: pueden rozarse)
const SEP_MAX_PUSH = 0.12; // lo más que se mueve una unidad por paso para despegarse

/**
 * Empuja suavemente a las unidades que quedaron una encima de otra, para que no se amontonen en el mismo punto.
 * Nunca las mete en un edificio ni las saca del mapa, y no mueve a las que ya llegaron a donde las mandaste.
 */
function separateUnits(b) {
  const alive = b.units.filter((u) => u.alive);
  if (alive.length < 2) return;
  const cells = new Map();
  for (const u of alive) {
    const key = Math.floor(u.x) * 1000 + Math.floor(u.y);
    const list = cells.get(key);
    if (list) list.push(u);
    else cells.set(key, [u]);
  }
  const push = new Map(); // unidad -> [dx, dy]
  const add = (u, dx, dy) => {
    const p = push.get(u);
    if (p) {
      p[0] += dx;
      p[1] += dy;
    } else push.set(u, [dx, dy]);
  };
  for (const u of alive) {
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (const v of cells.get(gx * 1000 + gy) ?? []) {
          if (v.id <= u.id) continue; // cada pareja una sola vez
          let dx = u.x - v.x;
          let dy = u.y - v.y;
          let d = Math.hypot(dx, dy);
          if (d >= SEP_MIN) continue;
          if (d < 1e-6) {
            // Justo en el mismo punto: se separan en una dirección que depende de sus ids (siempre la misma).
            const a = (u.id * 2.399963 + v.id * 1.234567) % (Math.PI * 2);
            dx = Math.cos(a);
            dy = Math.sin(a);
            d = 1;
          }
          const k = Math.min(SEP_MAX_PUSH, (SEP_MIN - d) / 2) / d;
          add(u, dx * k, dy * k);
          add(v, -dx * k, -dy * k);
        }
      }
    }
  }
  for (const [u, [dx, dy]] of push) {
    if (u.order?.type === 'move' && Math.hypot(u.order.x - u.x, u.order.y - u.y) < 2 * S) continue; // ya casi llegó
    const nx = Math.min(GRID.cols - 1, Math.max(0, u.x + dx));
    const ny = Math.min(GRID.rows - 1, Math.max(0, u.y + dy));
    if (solidAt(b, Math.round(nx), Math.round(ny))) continue;
    u.x = nx;
    u.y = ny;
  }
}

/* ---------- atacantes ---------- */

function stepAttacker(b, u, dt) {
  if (u.order?.type === 'move') {
    if (Math.hypot(u.order.x - u.x, u.order.y - u.y) < 0.25 * S) {
      u.order = null;
      u.path = null;
    } else {
      const blocker = moveToward(b, u, u.order, dt);
      if (blocker && edgeDist(u, blocker) <= u.range) hit(b, u, blocker);
      return;
    }
  }
  const target = chooseTarget(b, u);
  if (!target) return;
  if (edgeDist(u, target) <= u.range) {
    hit(b, u, target);
    return;
  }
  const blocker = moveToward(b, u, target, dt);
  if (blocker && edgeDist(u, blocker) <= u.range) hit(b, u, blocker);
}

function chooseTarget(b, u) {
  if (u.order?.type === 'attack') {
    const t = b.byId.get(u.order.targetId);
    if (t?.alive) return t;
    u.order = null; // el objetivo cayó: vuelve al modo automático
  }

  let best = null;
  let bestDist = COMBAT.aggro * S;
  // Las armas de asedio van a por los edificios: solo pelean con unidades si no queda ninguno.
  if (!u.siege) {
    for (const e of defenderUnits(b)) {
      const d = centerDist(u, e);
      if (d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
  }
  if (best) return best;

  // Edificios: primero cualquiera que no sea muro; los muros solo si no queda nada más.
  for (const wallsToo of [false, true]) {
    let nearest = null;
    let nd = Infinity;
    for (const e of b.buildings) {
      if (!e.alive || isWallish(e.type) !== wallsToo) continue;
      const d = rectDist(u, e);
      if (d < nd) {
        nearest = e;
        nd = d;
      }
    }
    if (nearest) return nearest;
  }
  // Sin edificios que atacar (o si es un arma de asedio), va a por el enemigo más cercano, esté donde esté.
  return defenderUnits(b).sort((p, q) => centerDist(u, p) - centerDist(u, q))[0] ?? null;
}

/**
 * Camina hacia `dest` ({x, y}) por el mejor camino. Devuelve el muro que le cierra el paso, si lo hay
 * (entonces no se mueve: tiene que romperlo).
 */
function moveToward(b, u, dest, dt) {
  u.pathAge += dt;
  // Hacia un edificio se va a un cuadro libre junto a él (el cuadro se elige una vez y se revisa cada tanto).
  if (dest.kind === 'building' && (u.approach?.id !== dest.id || u.pathAge > COMBAT.repathSec)) u.approach = { id: dest.id, goal: approachGoal(b, u, dest) };
  const goal = dest.kind === 'building' ? u.approach.goal : { x: Math.round(dest.x), y: Math.round(dest.y) };
  const key = `${goal.x},${goal.y}`;
  if (!u.path || u.pathKey !== key || u.pathAge > COMBAT.repathSec) {
    u.path = findPath({ x: Math.round(u.x), y: Math.round(u.y) }, goal, {
      blocked: (x, y) => solidAt(b, x, y),
      extraCost: (x, y) => (wallAt(b, x, y) ? COMBAT.wallCost : 0),
      maxNodes: 6000,
    });
    u.pathKey = key;
    u.pathAge = 0;
  }

  const next = u.path?.[0] ?? null;
  const wall = next ? wallAt(b, next.x, next.y) : null;
  if (wall) return wall;

  // Cada unidad sigue el camino por su propio «carril» (un pequeño desvío fijo según su id): así una columna no se
  // funde en una sola unidad al pasar por los mismos puntos.
  const lane = laneOffset(u);
  const wp = next ? { x: next.x + lane.x, y: next.y + lane.y } : dest; // sin camino: en línea recta
  walkTo(u, wp, dt);
  if (next && u.x === wp.x && u.y === wp.y) u.path.shift();
  return null;
}

/** Desvío fijo de una unidad respecto al centro de los cuadros del camino (menos de medio cuadro: nunca invade el vecino). */
function laneOffset(u) {
  const a = (u.id * 2.399963) % (Math.PI * 2);
  const r = 0.12 + 0.22 * ((u.id * 0.618034) % 1);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/** El cuadro libre de alrededor de un edificio que queda más cerca de la unidad (o su centro si no hay ninguno). */
function approachGoal(b, u, target) {
  let best = null;
  let bestD = Infinity;
  for (let y = target.y - 1; y <= target.y + target.h; y++) {
    for (let x = target.x - 1; x <= target.x + target.w; x++) {
      const inside = x >= target.x && x < target.x + target.w && y >= target.y && y < target.y + target.h;
      if (inside || x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows || solidAt(b, x, y)) continue;
      const d = Math.hypot(x - u.x, y - u.y);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best ?? { x: Math.round(target.cx), y: Math.round(target.cy) };
}

function walkTo(u, wp, dt) {
  const dx = wp.x - u.x;
  const dy = wp.y - u.y;
  const dist = Math.hypot(dx, dy);
  const move = u.speed * dt;
  if (dist <= move) {
    u.x = wp.x;
    u.y = wp.y;
  } else {
    u.x += (dx / dist) * move;
    u.y += (dy / dist) * move;
  }
}

/* ---------- defensores ---------- */

const LEASH = 8 * S; // hasta dónde se aleja un defensor de su puesto

function stepDefender(b, u, dt) {
  // Cuando atacan algo de la aldea, TODA la guarnición se entera: ve más lejos y se aleja más de su puesto.
  const aggro = (b.alarm ? COMBAT.aggro * 2 : COMBAT.aggro) * S;
  const leash = b.alarm ? LEASH * 1.8 : LEASH;
  let best = null;
  let bestDist = aggro;
  for (const a of attackers(b)) {
    const d = centerDist(u, a);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  if (best && centerDist(u, u.home) < leash) {
    if (edgeDist(u, best) <= u.range) hit(b, u, best);
    else walkTo(u, best, dt); // los defensores no se frenan con sus propios muros
  } else if (centerDist(u, u.home) > 0.15 * S) {
    walkTo(u, u.home, dt);
  }
}

function stepTower(b, t) {
  if (t.cd > 0) return;
  let best = null;
  let bestDist = Infinity;
  for (const a of attackers(b)) {
    const d = centerDist(t, a);
    if (d - UNIT_RADIUS <= t.range && d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  if (best) hit(b, t, best);
}

/* ---------- golpes, muertes y fin ---------- */

/** Daño de un golpe de `from` sobre `target`, con la ventaja contra su tipo, los gritos de guerra y el asedio. */
function damageOf(b, from, target) {
  let dmg = from.dmg;
  if (from.kind === 'unit') {
    if (from.buffUntil > b.time) dmg *= from.buffMul;
    if (from.bonus?.[target.type]) dmg *= from.bonus[target.type];
    if (from.siege && target.kind === 'unit') dmg *= from.siege.vsUnits;
  }
  return dmg;
}

/** Aplica daño a algo: las unidades lo reducen con su armadura y con el escudo sagrado. Devuelve lo que se llevó. */
function inflict(b, target, amount) {
  let dmg = amount;
  if (target.kind === 'unit') {
    if (target.shieldUntil > b.time) dmg *= 1 - target.shieldPower;
    dmg *= 1 - (target.armor ?? 0);
  }
  target.hp -= dmg;
  if (target.hp <= 0 && target.alive) kill(b, target);
  return dmg;
}

function hit(b, from, target) {
  if (from.cd > 0) return;
  from.cd = from.atkSec;
  if (from.side === 'a' && target.side === 'd') b.alarm = true; // toda la guarnición se entera
  const dealt = inflict(b, target, damageOf(b, from, target));
  b.events.push({ type: from.range >= RANGED_FROM ? 'shot' : 'hit', from: from.id, to: target.id, dmg: dealt });

  // Los hechiceros dañan también a los que están alrededor del objetivo (solo unidades).
  if (from.splash) {
    for (const other of b.units) {
      if (!other.alive || other === target || other.side !== target.side) continue;
      if (centerDist(other, target) <= from.splash.radius) inflict(b, other, damageOf(b, from, other) * from.splash.fraction);
    }
    b.events.push({ type: 'splash', x: posOf(target).x, y: posOf(target).y, radius: from.splash.radius });
  }
}

/* ---------- habilidades de los héroes ---------- */

/** Rivales de una unidad: unidades del otro bando y, si ataca una base enemiga, también sus edificios. */
function foesOf(b, u) {
  const units = b.units.filter((x) => x.alive && x.side !== u.side);
  return u.side === 'a' && b.mode === 'attack' ? [...units, ...liveBuildings(b)] : units;
}

const alliesOf = (b, u) => b.units.filter((x) => x.alive && x.side === u.side);

function stepAbility(b, u, dt) {
  const a = u.ability;
  a.cd = Math.max(0, a.cd - dt);
  if (a.cd <= 0) castAbility(b, u, false);
}

/**
 * Lanza la habilidad del héroe `u` si está lista. Sola (`force` falso) solo lo hace cuando vale la pena;
 * a mano (`force` verdadero, ver castHeroAbility) lo hace con tal de que tenga algún efecto.
 * Devuelve si se lanzó.
 */
function castAbility(b, u, force) {
  const a = u.ability;
  if (!a || !u.alive || a.cd > 0 || b.over) return false;
  let cast = null;

  if (a.kind === 'volley' || a.kind === 'fire') {
    const reach = Math.max(u.range + 2.5 * S, 5 * S);
    const foes = foesOf(b, u);
    let best = null;
    let bestCount = 0;
    for (const f of foes) {
      if (centerDist(u, f) > reach) continue;
      const count = foes.filter((g) => centerDist(f, g) <= a.radius).length;
      if (count > bestCount || (count === bestCount && best && centerDist(u, f) < centerDist(u, best))) {
        best = f;
        bestCount = count;
      }
    }
    if (best && (force || bestCount >= 2 || (best.kind === 'unit' && best.maxHp >= 100))) {
      for (const f of foes) if (centerDist(best, f) <= a.radius) inflict(b, f, a.power);
      cast = { x: posOf(best).x, y: posOf(best).y };
    }
  } else if (a.kind === 'heal') {
    const hurt = alliesOf(b, u).filter((x) => centerDist(u, x) <= a.radius && x.hp < x.maxHp * 0.65);
    if (hurt.length || (force && alliesOf(b, u).some((x) => x.hp < x.maxHp))) {
      for (const x of alliesOf(b, u)) if (centerDist(u, x) <= a.radius) x.hp = Math.min(x.maxHp, x.hp + a.power);
      cast = { x: u.x, y: u.y };
    }
  } else if (a.kind === 'shield' || a.kind === 'warcry') {
    const near = foesOf(b, u).some((f) => centerDist(u, f) <= 5 * S);
    if (near || force) {
      for (const x of alliesOf(b, u)) {
        if (centerDist(u, x) > a.radius) continue;
        if (a.kind === 'shield') {
          x.shieldUntil = b.time + a.dur;
          x.shieldPower = a.power;
        } else {
          x.buffUntil = b.time + a.dur;
          x.buffMul = 1 + a.power;
        }
      }
      cast = { x: u.x, y: u.y };
    }
  }

  if (!cast) return false;
  a.cd = a.cdSec;
  b.events.push({ type: 'cast', id: u.id, kind: a.kind, x: cast.x, y: cast.y, radius: a.radius });
  return true;
}

/** El jugador lanza a mano la habilidad de un héroe suyo. Devuelve si se pudo. */
export function castHeroAbility(b, unitId) {
  const u = b.byId.get(unitId);
  return Boolean(u?.ability) && castAbility(b, u, true);
}

/** Estado de la habilidad de un héroe para la interfaz: { name, kind, cdLeft, cdSec } o null. */
export function abilityStatus(b, unitId) {
  const u = b.byId.get(unitId);
  if (!u?.ability) return null;
  return { name: u.ability.name, kind: u.ability.kind, cdLeft: u.ability.cd, cdSec: u.ability.cdSec, alive: u.alive };
}

function kill(b, target) {
  target.hp = 0;
  target.alive = false;
  b.events.push({ type: 'die', id: target.id });
  // «Bajas del enemigo»: en un ataque tuyo son los defensores; en una defensa, los atacantes.
  if (target.kind === 'unit' && target.side === (b.mode === 'raid' ? 'a' : 'd')) b.kills++;
  if (target.kind === 'building') {
    for (let cy = target.y; cy < target.y + target.h; cy++) for (let cx = target.x; cx < target.x + target.w; cx++) b.grid.delete(cy * GRID.cols + cx);
    if (!isWallish(target.type)) b.destroyed++;
    b.destroyedIds?.push(target.sourceId);
    b.loot.gold += target.loot.gold ?? 0;
    b.loot.wood += target.loot.wood ?? 0;
    b.events.push({ type: 'destroy', id: target.id });
  }
}

function checkEnd(b) {
  if (b.mode === 'duel') return checkDuelEnd(b);
  if (b.mode === 'raid') return checkRaidEnd(b);
  // Destruir el Ayuntamiento da la 1.ª estrella pero la batalla sigue: quedan la 2.ª (50 %) y la 3.ª (100 %).
  // Termina al destruirlo todo, al quedarte sin tropas o al agotarse el tiempo.
  if (b.countedBuildings > 0 && b.destroyed >= b.countedBuildings) return finish(b, true);
  if (attackers(b).length === 0) return finish(b);
  if (b.time >= COMBAT.timeLimitSec) return finish(b);
  return undefined;
}

const hallDown = (b) => {
  const hall = b.byId.get(b.hallId);
  return Boolean(hall && !hall.alive);
};

function finish(b) {
  b.over = true;
  const won = hallDown(b); // con el Ayuntamiento destruido ya es una victoria (al menos 1 estrella)
  const survivors = Object.fromEntries(ARMY_UNITS.map((k) => [k, 0]));
  let heroPresent = false;
  for (const u of attackers(b)) {
    if (u.type === 'hero') heroPresent = true;
    else survivors[u.type]++;
  }
  b.result = {
    won,
    level: b.level,
    timeSec: Math.round(b.time),
    destroyed: b.destroyed,
    kills: b.kills,
    total: b.countedBuildings,
    percent: b.countedBuildings ? Math.round((b.destroyed / b.countedBuildings) * 100) : 100,
    stars: 0, // se calcula justo debajo
    loot: { ...b.loot },
    survivors, // soldados, hechiceros y caballeros que quedaron vivos
    casualties: Object.fromEntries(ARMY_UNITS.map((k) => [k, b.sent[k] - survivors[k]])), // los que se perdieron
    heroSurvived: heroPresent, // el héroe nunca se pierde: «cae» pero vuelve; esto solo informa
  };
  const r = b.result;
  r.stars = (r.won ? 1 : 0) + (r.percent >= STARS.half ? 1 : 0) + (r.percent >= STARS.all ? 1 : 0);
  b.events.push({ type: 'end', won, stars: r.stars });
}

/* ---------- guardar y retomar una batalla ---------- */

/**
 * Una copia de la batalla como datos simples (JSON), para guardarla si se cierra la página. Los ids, las órdenes y
 * los caminos son números y listas, así que se conserva todo; los índices (byId, grid) se rehacen al retomarla.
 */
export function snapshotBattle(b) {
  const { byId: _byId, grid: _grid, events: _events, ...rest } = b;
  return JSON.parse(JSON.stringify(rest));
}

/** Rehace una batalla guardada con snapshotBattle: sigue exactamente desde donde estaba. */
export function restoreBattle(snap) {
  const b = JSON.parse(JSON.stringify(snap));
  b.events = [];
  b.byId = new Map();
  b.grid = new Map();
  for (const u of b.units) b.byId.set(u.id, u);
  for (const e of b.buildings) {
    b.byId.set(e.id, e);
    if (!e.alive) continue;
    for (let cy = e.y; cy < e.y + e.h; cy++) for (let cx = e.x; cx < e.x + e.w; cx++) b.grid.set(cy * GRID.cols + cx, e);
  }
  return b;
}
