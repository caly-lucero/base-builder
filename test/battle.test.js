import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, GRID } from '../src/data/config.js';
import { HEROES } from '../src/data/heroes.js';
import {
  advanceBattle, attackers, battleStatus, clearOrders, createBattle, defenderUnits, heroCombat,
  orderAttack, orderMove, retreat, unitIdsOfKinds,
} from '../src/game/battle.js';
import { generateMission } from '../src/game/missions.js';

const army = (soldier = 0, mage = 0, knight = 0) => ({ soldier, mage, knight });

/** Misión mínima hecha a mano: edificios y defensores a medida. Las posiciones son cuadros del mapa de 48×48; el
 *  Ayuntamiento (7×7) ocupa x 20–26, y 10–16 (su centro es el cuadro 23, 13). */
function mini({ buildings = [], defenders = [], hpScale = 1, dmgScale = 1 } = {}) {
  return {
    level: 1, hpScale, dmgScale, defenders,
    buildings: [{ type: 'hall', x: 20, y: 10, loot: { gold: 100, wood: 50 } }, ...buildings],
  };
}

function run(battle, seconds, dt = 0.1) {
  for (let t = 0; t < seconds && !battle.over; t += dt) advanceBattle(battle, dt);
  return battle;
}

const byType = (b, type) => b.buildings.filter((e) => e.type === type);

/* ---------- creación ---------- */

test('los atacantes aparecen en formación en el borde inferior, el héroe incluido', () => {
  const b = createBattle(mini(), army(3, 2, 1), { level: 2 });
  const a = attackers(b);
  assert.equal(a.length, 3 + 2 + 1 + 1);
  assert.ok(a.every((u) => u.y >= GRID.rows - 4 && u.x >= 0 && u.x < GRID.cols));
  assert.equal(a.filter((u) => u.type === 'hero').length, 1);
  assert.equal(new Set(a.map((u) => u.id)).size, a.length, 'ids únicos');
});

test('el héroe sube de estadísticas con el nivel', () => {
  const l1 = heroCombat(1);
  const l5 = heroCombat(5);
  assert.equal(l1.hp, HEROES.paladin.combat.hp);
  assert.ok(l5.hp > l1.hp && l5.dmg > l1.dmg);
  assert.equal(l5.speed, l1.speed);
});

test('la vida y el daño de lo enemigo se escalan con la misión', () => {
  const easy = createBattle(mini({ buildings: [{ type: 'tower', x: 14, y: 12 }], defenders: [{ kind: 'guard', x: 5, y: 5 }] }), army(1), null);
  const hard = createBattle(mini({ hpScale: 2, dmgScale: 2, buildings: [{ type: 'tower', x: 14, y: 12 }], defenders: [{ kind: 'guard', x: 5, y: 5 }] }), army(1), null);
  assert.equal(byType(hard, 'tower')[0].hp, byType(easy, 'tower')[0].hp * 2);
  assert.equal(byType(hard, 'tower')[0].dmg, byType(easy, 'tower')[0].dmg * 2);
  assert.equal(defenderUnits(hard)[0].hp, defenderUnits(easy)[0].hp * 2);
});

/* ---------- combate automático ---------- */

test('un grupo ataca solo y destruye el Ayuntamiento: gana y se lleva el botín', () => {
  const b = createBattle(mini(), army(6), null);
  run(b, 120);
  assert.equal(b.over, true);
  assert.equal(b.result.won, true);
  assert.deepEqual(b.result.loot, { gold: 100, wood: 50 });
  assert.equal(b.result.percent, 100);
  assert.equal(b.result.survivors.soldier, 6, 'sin defensas no hay bajas');
});

test('se cuentan los defensores derrotados', () => {
  const guards = [20, 23, 26].map((x) => ({ kind: 'guard', x, y: 24 }));
  const b = createBattle(mini({ defenders: guards }), army(8), null);
  run(b, 120);
  assert.equal(b.result.won, true);
  assert.equal(b.result.kills, 3);
  assert.equal(b.kills, 3);
});

test('sin tropas la batalla termina enseguida en derrota', () => {
  const b = createBattle(mini(), army(0), null);
  advanceBattle(b, 0.2);
  assert.equal(b.over, true);
  assert.equal(b.result.won, false);
});

test('una torre mata a las tropas que se acercan y la batalla se pierde', () => {
  const towers = [[16, 12], [28, 12], [22, 19]].map(([x, y]) => ({ type: 'tower', x, y }));
  const b = createBattle(mini({ buildings: towers, hpScale: 6, dmgScale: 3 }), army(2), null);
  run(b, COMBAT.timeLimitSec);
  assert.equal(b.result.won, false);
  assert.equal(attackers(b).length, 0);
});

test('los defensores salen a pelear al ver a los atacantes y vuelven a su puesto después', () => {
  const guard = { kind: 'guard', x: 23, y: 30 };
  const b = createBattle(mini({ defenders: [guard] }), army(1), null);
  const g = defenderUnits(b)[0];
  const startY = g.y;
  run(b, 6);
  assert.ok(g.y !== startY || !g.alive, 'se movió o murió');
  run(b, 120);
  assert.equal(b.result.won, true);
});

test('los hechiceros atacan desde lejos (disparo) y los soldados cuerpo a cuerpo (golpe)', () => {
  const b = createBattle(mini(), army(1, 1), null);
  const kinds = new Set();
  for (let t = 0; t < 60 && !b.over; t += 0.1) {
    advanceBattle(b, 0.1);
    for (const e of b.events.splice(0)) if (e.type === 'hit' || e.type === 'shot') kinds.add(e.type);
  }
  assert.ok(kinds.has('shot') && kinds.has('hit'), `eventos vistos: ${[...kinds]}`);
});

test('un muro cerrado se rodea si hay hueco y se rompe si no lo hay', () => {
  const ring = (gap) => {
    const walls = [];
    for (let x = 14; x <= 32; x++) for (let y = 4; y <= 22; y++) {
      if (!(x === 14 || x === 32 || y === 4 || y === 22)) continue;
      if (gap && y === 22 && (x === 23 || x === 24)) continue;
      walls.push({ type: 'wall', x, y });
    }
    return walls;
  };
  const open = createBattle(mini({ buildings: ring(true) }), army(5), null);
  run(open, 150);
  assert.equal(open.result.won, true);
  assert.ok(byType(open, 'wall').filter((w) => !w.alive).length <= 2, 'por el hueco casi no rompe muros');

  const closed = createBattle(mini({ buildings: ring(false) }), army(5), null);
  run(closed, 170);
  assert.equal(closed.result.won, true, 'rompe un muro y pasa');
  assert.ok(byType(closed, 'wall').some((w) => !w.alive), 'hay al menos un muro roto');
});

/* ---------- órdenes ---------- */

test('una orden de atacar hace que el grupo ignore lo demás hasta cumplirla', () => {
  const far = { type: 'mine', x: 6, y: 10, loot: { gold: 40 } };
  const b = createBattle(mini({ buildings: [far] }), army(4), null);
  const mine = byType(b, 'mine')[0];
  assert.equal(orderAttack(b, unitIdsOfKinds(b), mine.id), true);
  run(b, 80);
  assert.equal(mine.alive, false, 'cayó la mina ordenada');
  assert.ok(byType(b, 'hall')[0].alive || b.over);
  assert.ok(attackers(b).every((u) => u.order === null), 'terminada la orden vuelven al modo automático');
});

test('no se puede ordenar atacar a un aliado, a un objetivo muerto ni a algo inexistente', () => {
  const b = createBattle(mini(), army(2), null);
  const ids = unitIdsOfKinds(b);
  assert.equal(orderAttack(b, ids, ids[0]), false, 'aliado');
  assert.equal(orderAttack(b, ids, 99999), false, 'inexistente');
  const hall = byType(b, 'hall')[0];
  hall.alive = false;
  assert.equal(orderAttack(b, ids, hall.id), false, 'muerto');
});

test('una orden de mover lleva al grupo al punto y luego vuelven al modo automático', () => {
  const b = createBattle(mini(), army(3), null);
  const ids = unitIdsOfKinds(b);
  orderMove(b, ids, 10, 30);

  // Se mira a cada unidad en el instante exacto en que cumple la orden: debe estar en el punto.
  const arrivedAt = new Map();
  for (let i = 0; i < 400 && arrivedAt.size < ids.length; i++) {
    advanceBattle(b, 0.1);
    for (const u of attackers(b)) if (u.order === null && !arrivedAt.has(u.id)) arrivedAt.set(u.id, { x: u.x, y: u.y });
  }
  assert.equal(arrivedAt.size, ids.length, 'todas cumplieron la orden');
  for (const p of arrivedAt.values()) assert.ok(Math.hypot(p.x - 10, p.y - 30) < 1, `llegó a ${p.x.toFixed(1)},${p.y.toFixed(1)}`);

  // Y desde ahí siguen solas: se alejan del punto hacia el enemigo.
  run(b, 20);
  assert.ok(attackers(b).some((u) => Math.hypot(u.x - 10, u.y - 30) > 4), 'volvieron al modo automático');
});

test('mover a un punto fuera del mapa lo deja dentro', () => {
  const b = createBattle(mini(), army(1), null);
  orderMove(b, unitIdsOfKinds(b), -50, 999);
  const u = attackers(b)[0];
  assert.deepEqual([u.order.x, u.order.y], [0, GRID.rows - 1]);
});

test('se puede ordenar solo a un tipo de unidad y quitar las órdenes', () => {
  const b = createBattle(mini(), army(2, 1, 1), { level: 1 });
  assert.equal(unitIdsOfKinds(b, ['mage']).length, 1);
  assert.equal(unitIdsOfKinds(b, ['hero']).length, 1);
  assert.equal(unitIdsOfKinds(b, ['soldier', 'knight']).length, 3);
  assert.equal(unitIdsOfKinds(b).length, 5);
  const ids = unitIdsOfKinds(b);
  orderMove(b, ids, 3, 3);
  clearOrders(b, ids);
  assert.ok(attackers(b).every((u) => u.order === null));
});

/* ---------- fin, tiempo y determinismo ---------- */

test('al agotarse el tiempo la batalla se pierde, conservando el botín de lo destruido', () => {
  const b = createBattle(mini({ buildings: [{ type: 'mine', x: 22, y: 30, loot: { gold: 77 } }], hpScale: 500 }), army(1), null);
  const mine = byType(b, 'mine')[0];
  mine.hp = 1; // la mina cae pronto; el Ayuntamiento (hpScale 500) no
  run(b, COMBAT.timeLimitSec + 5);
  assert.equal(b.over, true);
  assert.equal(b.result.won, false);
  assert.equal(b.result.loot.gold, 77);
  assert.ok(b.result.timeSec >= COMBAT.timeLimitSec);
});

test('el porcentaje no cuenta los muros', () => {
  const walls = [[14, 4], [15, 4], [16, 4]].map(([x, y]) => ({ type: 'wall', x, y }));
  const b = createBattle(mini({ buildings: walls }), army(4), null);
  assert.equal(battleStatus(b).percent, 0);
  run(b, 120);
  assert.equal(b.result.total, 1, 'solo cuenta el Ayuntamiento');
  assert.equal(b.result.percent, 100);
});

test('la simulación es determinista y no depende de cómo se parta el tiempo', () => {
  const m = generateMission(3);
  const a = createBattle(m, army(8, 3, 1), { level: 2 });
  const c = createBattle(m, army(8, 3, 1), { level: 2 });
  for (let i = 0; i < 400; i++) advanceBattle(a, 0.1);
  for (let i = 0; i < 40; i++) advanceBattle(c, 1.0);
  assert.equal(a.over, c.over);
  assert.equal(a.destroyed, c.destroyed);
  assert.deepEqual(a.result, c.result);
  assert.deepEqual(attackers(a).map((u) => [u.id, u.hp]), attackers(c).map((u) => [u.id, u.hp]));
});

test('retirarse termina la batalla como derrota y salva a las unidades vivas', () => {
  const b = createBattle(mini({ defenders: [{ kind: 'guard', x: 23, y: 30 }] }), army(5), null);
  run(b, 3);
  retreat(b);
  assert.equal(b.over, true);
  assert.equal(b.result.won, false);
  const alive = attackers(b).length;
  assert.equal(b.result.survivors.soldier, alive);
  assert.equal(b.result.casualties.soldier, 5 - alive);
  retreat(b); // una segunda retirada no cambia nada
  assert.equal(b.result.won, false);
});

test('una batalla terminada no avanza más', () => {
  const b = createBattle(mini(), army(0), null);
  advanceBattle(b, 1);
  const t = b.time;
  advanceBattle(b, 10);
  assert.equal(b.time, t);
});
