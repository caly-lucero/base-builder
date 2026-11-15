// Simulación de batalla: lógica pura y determinista (sin Phaser, sin azar, sin relojes).
// Las posiciones son casillas con decimales; el centro de la casilla (x, y) es el punto (x, y).
//
// Cómo pelean las unidades:
//  - AUTOMÁTICO: cada atacante busca solo un objetivo: primero enemigos cercanos y, si no hay,
//    el edificio más cercano que no sea un muro (y los muros solo cuando no queda otra cosa).
//  - ÓRDENES: el jugador puede darle a un grupo un objetivo concreto (atacar un edificio o enemigo)
//    o un punto al que ir. Al cumplirlo, el grupo vuelve al modo automático.
//  - Los muros se rodean si se puede; si el camino pasa por un muro, la unidad lo ataca para abrirse paso.
import { ARMY_UNITS, COMBAT, ENEMY_BUILDINGS, ENEMY_UNITS, GRID, HERO_PER_LEVEL, UNITS } from '../data/config.js';
import { findPath } from './pathfinding.js';

const BUILDING_RADIUS = 0.5;
const UNIT_RADIUS = 0.25;
const RANGED_FROM = 2; // desde este alcance un golpe se muestra como disparo

/** Estadísticas de combate del héroe según su nivel. */
export function heroCombat(level) {
  const base = UNITS.hero.combat;
  const extra = Math.max(0, level - 1);
  return { ...base, hp: base.hp + extra * HERO_PER_LEVEL.hp, dmg: base.dmg + extra * HERO_PER_LEVEL.dmg };
}

/* ---------- creación ---------- */

/**
 * Prepara una batalla. `mission` viene de missions.js; `army` es { soldier, mage, knight };
 * `hero` es null o { level }. Los atacantes aparecen en formación en el borde inferior del mapa.
 */
export function createBattle(mission, army, hero) {
  const b = {
    level: mission.level,
    time: 0,
    acc: 0,
    over: false,
    result: null,
    nextId: 1,
    units: [],
    buildings: [],
    byId: new Map(),
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
    const e = {
      id: b.nextId++, side: 'd', kind: 'building', type: spec.type, x: spec.x, y: spec.y,
      hp, maxHp: hp, alive: true, loot: spec.loot ?? { gold: 0, wood: 0 },
    };
    if (def.dmg) Object.assign(e, { dmg: Math.round(def.dmg * mission.dmgScale), range: def.range, atkSec: def.atkSec, cd: 0 });
    if (spec.type === 'hall') b.hallId = e.id;
    if (spec.type !== 'wall') b.countedBuildings++;
    b.buildings.push(e);
    b.byId.set(e.id, e);
  }

  for (const d of mission.defenders) {
    const def = ENEMY_UNITS[d.kind];
    addUnit(b, 'd', d.kind, d.x, d.y, {
      hp: Math.round(def.hp * mission.hpScale), dmg: Math.round(def.dmg * mission.dmgScale),
      range: def.range, speed: def.speed, atkSec: def.atkSec,
    });
  }

  const roster = [];
  for (const kind of ARMY_UNITS) for (let i = 0; i < (army[kind] ?? 0); i++) roster.push(kind);
  if (hero) roster.push('hero');
  const perRow = 8;
  roster.forEach((kind, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, roster.length - row * perRow);
    const col = i - row * perRow;
    const stats = kind === 'hero' ? heroCombat(hero.level) : UNITS[kind].combat;
    addUnit(b, 'a', kind, GRID.cols / 2 - (inRow - 1) / 2 + col, GRID.rows - 2 - row * 0.9, stats);
  });
  return b;
}

function addUnit(b, side, kind, x, y, s) {
  const u = {
    id: b.nextId++, side, kind: 'unit', type: kind, x, y, home: { x, y },
    hp: s.hp, maxHp: s.hp, dmg: s.dmg, range: s.range, speed: s.speed, atkSec: s.atkSec,
    cd: 0, alive: true, order: null, path: null, pathKey: null, pathAge: 99,
  };
  b.units.push(u);
  b.byId.set(u.id, u);
  return u;
}

/* ---------- consultas ---------- */

export const attackers = (b) => b.units.filter((u) => u.side === 'a' && u.alive);
export const defenderUnits = (b) => b.units.filter((u) => u.side === 'd' && u.alive);
export const liveBuildings = (b) => b.buildings.filter((e) => e.alive);

const radiusOf = (e) => (e.kind === 'building' ? BUILDING_RADIUS : UNIT_RADIUS);
const centerDist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
/** Distancia entre los bordes: lo que cuenta para el alcance. */
const edgeDist = (a, c) => centerDist(a, c) - radiusOf(c);

const buildingAt = (b, x, y) => b.buildings.find((e) => e.alive && e.x === x && e.y === y) ?? null;
const wallAt = (b, x, y) => {
  const e = buildingAt(b, x, y);
  return e && e.type === 'wall' ? e : null;
};
const solidAt = (b, x, y) => {
  const e = buildingAt(b, x, y);
  return Boolean(e) && e.type !== 'wall';
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
  if (!b.over) finish(b, false);
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
    if (u.side === 'a') stepAttacker(b, u, dt);
    else stepDefender(b, u, dt);
  }
  for (const e of b.buildings) if (e.alive && e.dmg) stepTower(b, e);
  checkEnd(b);
}

/* ---------- atacantes ---------- */

function stepAttacker(b, u, dt) {
  if (u.order?.type === 'move') {
    if (Math.hypot(u.order.x - u.x, u.order.y - u.y) < 0.25) {
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
  let bestDist = COMBAT.aggro;
  for (const e of defenderUnits(b)) {
    const d = centerDist(u, e);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  if (best) return best;

  // Edificios: primero cualquiera que no sea muro; los muros solo si no queda nada más.
  for (const wallsToo of [false, true]) {
    let nearest = null;
    let nd = Infinity;
    for (const e of b.buildings) {
      if (!e.alive || (e.type === 'wall') !== wallsToo) continue;
      const d = centerDist(u, e);
      if (d < nd) {
        nearest = e;
        nd = d;
      }
    }
    if (nearest) return nearest;
  }
  return null;
}

/**
 * Camina hacia `dest` ({x, y}) por el mejor camino. Devuelve el muro que le cierra el paso, si lo hay
 * (entonces no se mueve: tiene que romperlo).
 */
function moveToward(b, u, dest, dt) {
  const goal = { x: Math.round(dest.x), y: Math.round(dest.y) };
  const key = `${goal.x},${goal.y}`;
  u.pathAge += dt;
  if (!u.path || u.pathKey !== key || u.pathAge > COMBAT.repathSec) {
    u.path = findPath({ x: Math.round(u.x), y: Math.round(u.y) }, goal, {
      blocked: (x, y) => solidAt(b, x, y),
      extraCost: (x, y) => (wallAt(b, x, y) ? COMBAT.wallCost : 0),
    });
    u.pathKey = key;
    u.pathAge = 0;
  }

  const next = u.path?.[0] ?? null;
  const wall = next ? wallAt(b, next.x, next.y) : null;
  if (wall) return wall;

  const wp = next ?? dest; // sin camino: en línea recta
  walkTo(u, wp, dt);
  if (next && u.x === next.x && u.y === next.y) u.path.shift();
  return null;
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

const LEASH = 8; // hasta dónde se aleja un defensor de su puesto

function stepDefender(b, u, dt) {
  let best = null;
  let bestDist = COMBAT.aggro;
  for (const a of attackers(b)) {
    const d = centerDist(u, a);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  if (best && centerDist(u, u.home) < LEASH) {
    if (edgeDist(u, best) <= u.range) hit(b, u, best);
    else walkTo(u, best, dt); // los defensores no se frenan con sus propios muros
  } else if (centerDist(u, u.home) > 0.15) {
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

function hit(b, from, target) {
  if (from.cd > 0) return;
  from.cd = from.atkSec;
  target.hp -= from.dmg;
  b.events.push({ type: from.range >= RANGED_FROM ? 'shot' : 'hit', from: from.id, to: target.id, dmg: from.dmg });
  if (target.hp <= 0) kill(b, target);
}

function kill(b, target) {
  target.hp = 0;
  target.alive = false;
  b.events.push({ type: 'die', id: target.id });
  if (target.kind === 'unit' && target.side === 'd') b.kills++;
  if (target.kind === 'building') {
    if (target.type !== 'wall') b.destroyed++;
    b.loot.gold += target.loot.gold ?? 0;
    b.loot.wood += target.loot.wood ?? 0;
    b.events.push({ type: 'destroy', id: target.id });
  }
}

function checkEnd(b) {
  const hall = b.byId.get(b.hallId);
  if (hall && !hall.alive) return finish(b, true);
  if (attackers(b).length === 0) return finish(b, false);
  if (b.time >= COMBAT.timeLimitSec) return finish(b, false);
  return undefined;
}

function finish(b, won) {
  b.over = true;
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
    loot: { ...b.loot },
    survivors, // soldados, hechiceros y caballeros que quedaron vivos
    casualties: Object.fromEntries(ARMY_UNITS.map((k) => [k, b.sent[k] - survivors[k]])), // los que se perdieron
    heroSurvived: heroPresent, // el héroe nunca se pierde: «cae» pero vuelve; esto solo informa
  };
  b.events.push({ type: 'end', won });
}
