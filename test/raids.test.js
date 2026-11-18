import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFENSE, RAID, UNITS } from '../src/data/config.js';
import { advanceBattle, attackers, createRaidBattle, defenderUnits, defenseHp } from '../src/game/battle.js';
import { createBuilding, createNewState, townHall } from '../src/game/logic.js';
import { applyRaidResult, generateRaid, postponeBlocked, postponeCost, postponeRaid, raidCountdownMs, raidDue, raidLevel, resolveRaid, simulateRaid } from '../src/game/raids.js';

const T0 = 1_700_000_000_000;

/** Partida con edificios puestos a mano. `spec`: [tipo, x, y, nivel] (x, y = cuadro de arriba a la izquierda; el
 *  Ayuntamiento ocupa x 20–26, y 20–26 del mapa de 48×48). */
function base(spec = [], { thLevel = 1, army = {}, hero = null } = {}) {
  const s = createNewState(T0);
  s.gold = 400;
  s.wood = 300;
  townHall(s).level = thLevel;
  for (const [type, x, y, level = 1] of spec) s.buildings.push(createBuilding(s.nextId++, type, x, y, T0, level));
  s.army = { ...s.army, ...army };
  // `hero` ({ level, xp }) es el paladín, que sale a pelear.
  s.heroes = hero ? { paladin: { ...hero } } : {};
  s.squad = hero ? ['paladin'] : [];
  return s;
}

const countOf = (s, type) => s.buildings.filter((b) => b.type === type).length;

/* ---------- oleadas ---------- */

test('la fuerza de la oleada crece con el Ayuntamiento y la campaña', () => {
  const s = base();
  assert.equal(raidLevel(s), 1);
  townHall(s).level = 3;
  assert.equal(raidLevel(s), 5);
  s.campaign.cleared = 6;
  assert.equal(raidLevel(s), 8);
  s.campaign.cleared = 999;
  assert.ok(raidLevel(s) <= 30, 'tiene tope');
});

test('una oleada es determinista, cambia con la semilla y crece con el nivel', () => {
  assert.deepEqual(generateRaid(3, 4), generateRaid(3, 4));
  assert.notDeepEqual(generateRaid(3, 4), generateRaid(3, 5));
  const low = generateRaid(1);
  const high = generateRaid(9);
  assert.ok(high.attackers.length > low.attackers.length);
  assert.ok(high.hpScale > low.hpScale && high.dmgScale > low.dmgScale);
  assert.equal(low.attackers.filter((a) => a.kind === 'brute').length, 0, 'sin brutos al principio');
  assert.ok(high.attackers.some((a) => a.kind === 'brute'));
});

test('los atacantes llegan por el borde de arriba, dentro del mapa', () => {
  for (const lvl of [1, 5, 12]) {
    for (const a of generateRaid(lvl).attackers) assert.ok(a.y >= 0 && a.y <= 4.1 && a.x >= 14 && a.x <= 34.1);
  }
});

/* ---------- la defensa como batalla ---------- */

test('la defensa pone a tus edificios, ejército y héroe como defensores y al enemigo como atacante', () => {
  const s = base([['barracks', 10, 6], ['tower', 4, 6, 3], ['mine', 18, 14]], { army: { soldier: 3, mage: 1 }, hero: { level: 2, xp: 0 } });
  const b = createRaidBattle(s, generateRaid(2));
  assert.equal(b.mode, 'raid');
  assert.equal(b.buildings.length, s.buildings.length);
  assert.equal(defenderUnits(b).length, 3 + 1 + 1, 'soldados, hechicero y héroe');
  assert.equal(attackers(b).length, generateRaid(2).attackers.length);
  assert.ok(attackers(b).every((u) => u.y < 5), 'el enemigo entra por arriba');
  assert.equal(b.byId.get(b.hallId).type, 'townhall');
});

test('las torres disparan según su nivel, y una torre dañada no dispara', () => {
  const s = base([['tower', 4, 6, 1], ['tower', 8, 6, 4], ['tower', 12, 6, 1]]);
  s.buildings.at(-1).damaged = true;
  const b = createRaidBattle(s, generateRaid(1));
  const towers = b.buildings.filter((e) => e.type === 'tower');
  assert.ok(towers[1].dmg > towers[0].dmg, 'la de nivel 4 pega más');
  assert.equal(towers[2].dmg, undefined, 'la dañada no tiene ataque');
});

test('la vida de un edificio crece con el nivel y un edificio dañado entra a medias', () => {
  assert.ok(defenseHp('mine', 5) > defenseHp('mine', 1));
  assert.equal(defenseHp('mine', 1), DEFENSE.baseHp.mine);
  assert.equal(defenseHp('mine', 2, true), Math.round(DEFENSE.baseHp.mine * (1 + DEFENSE.hpPerLevel) * DEFENSE.damagedHpFactor));
  const s = base([['mine', 6, 6]]);
  s.buildings.at(-1).damaged = true;
  const hp = createRaidBattle(s, generateRaid(1)).buildings.at(-1).hp;
  assert.equal(hp, defenseHp('mine', 1, true));
});

test('simular una defensa no modifica la partida', () => {
  const s = base([['mine', 6, 6], ['tower', 10, 6]], { army: { soldier: 2 } });
  const before = JSON.stringify(s);
  simulateRaid(s, generateRaid(2));
  assert.equal(JSON.stringify(s), before);
});

test('sin defensa el enemigo destruye edificios y se retira (o tumba el Ayuntamiento)', () => {
  const spec = [['mine', 6, 6], ['sawmill', 12, 6], ['storage', 6, 12], ['house', 12, 12]];
  const res = simulateRaid(base(spec), generateRaid(1));
  assert.ok(['retreated', 'raided'].includes(res.outcome), `resultado: ${res.outcome}`);
  assert.ok(res.destroyed >= 1);
  assert.ok(res.destroyedIds.length >= res.destroyed);
});

test('el enemigo se retira tras destruir 2 + nivel del Ayuntamiento edificios, no más (salvo golpes simultáneos)', () => {
  const spec = Array.from({ length: 10 }, (_, i) => ['mine', 2 + i * 4, 6]);
  const res = simulateRaid(base(spec), generateRaid(6));
  const max = RAID.maxDamaged(1);
  assert.ok(res.destroyed >= 1 && res.destroyed <= max + 3, `destruyó ${res.destroyed} (máximo ${max})`);
});

test('una buena defensa rechaza la primera oleada', () => {
  const spec = [['barracks', 28, 17], ['tower', 19, 15, 2], ['tower', 26, 15, 2], ['tower', 23, 17, 2], ['mine', 12, 18]];
  const res = simulateRaid(base(spec, { thLevel: 2, army: { soldier: 10 }, hero: { level: 2, xp: 0 } }), generateRaid(1));
  assert.equal(res.outcome, 'repelled', JSON.stringify(res));
  assert.equal(res.destroyed, 0);
  assert.ok(res.kills >= 1);
});

test('los muros frenan: con un anillo cerrado el enemigo tarda más en llegar al Ayuntamiento', () => {
  const walls = [];
  for (let x = 14; x <= 32; x++) for (let y = 14; y <= 32; y++) if (x === 14 || x === 32 || y === 14 || y === 32) walls.push(['wall', x, y]);
  const open = simulateRaid(base([]), generateRaid(1));
  const walled = simulateRaid(base(walls), generateRaid(1));
  assert.ok(walled.destroyedIds.length > 0, 'rompen muros');
  assert.ok(walled.timeSec >= open.timeSec, `con muros ${walled.timeSec}s, sin muros ${open.timeSec}s`);
});

test('la defensa es determinista', () => {
  const s = base([['mine', 6, 6], ['tower', 10, 6]], { army: { soldier: 3 } });
  assert.deepEqual(simulateRaid(s, generateRaid(3, 2)), simulateRaid(s, generateRaid(3, 2)));
});

/* ---------- consecuencias ---------- */

const result = (over = {}) => ({
  mode: 'raid', outcome: 'retreated', level: 2, timeSec: 40, hallDown: false, destroyed: 2, destroyedIds: [], kills: 3, ...over,
});

test('lo destruido queda dañado, el Ayuntamiento nunca', () => {
  const s = base([['mine', 6, 6], ['wall', 10, 6], ['tower', 12, 6]]);
  const ids = s.buildings.map((b) => b.id); // incluye el Ayuntamiento
  const report = applyRaidResult(s, result({ destroyedIds: ids }));
  assert.equal(townHall(s).damaged, false);
  assert.equal(s.buildings.filter((b) => b.damaged).length, 3);
  assert.equal(report.damaged, 3);
  assert.deepEqual([...report.damagedTypes].sort(), ['mine', 'tower', 'wall']);
});

test('lo ya dañado no se cuenta otra vez', () => {
  const s = base([['mine', 6, 6]]);
  s.buildings.at(-1).damaged = true;
  assert.equal(applyRaidResult(s, result({ destroyedIds: [s.buildings.at(-1).id] })).damaged, 0);
});

test('se roba un porcentaje por edificio importante, con tope, y más si caen el Ayuntamiento', () => {
  const s = base();
  s.gold = 1000;
  s.wood = 400;
  let r = applyRaidResult(s, result({ destroyed: 2 }));
  assert.deepEqual(r.stolen, { gold: Math.floor(1000 * 2 * RAID.stealPerBuilding), wood: Math.floor(400 * 2 * RAID.stealPerBuilding) });
  assert.equal(s.gold, 1000 - r.stolen.gold);

  s.gold = 1000;
  r = applyRaidResult(s, result({ destroyed: 99, hallDown: true }));
  assert.equal(r.stolen.gold, Math.floor(1000 * RAID.stealMax), 'no pasa del máximo');

  s.gold = 1000;
  r = applyRaidResult(s, result({ destroyed: 1, hallDown: true }));
  assert.equal(r.stolen.gold, Math.floor(1000 * (RAID.stealPerBuilding + RAID.stealHall)));
});

test('si no destruyeron nada no se roba nada', () => {
  const s = base();
  const r = applyRaidResult(s, result({ destroyed: 0, outcome: 'repelled' }));
  assert.deepEqual(r.stolen, { gold: 0, wood: 0 });
  assert.equal(s.gold, 400);
});

test('el héroe gana experiencia por cada atacante derrotado, con bono si el ataque fracasa', () => {
  const s = base([], { hero: { level: 1, xp: 0 } });
  let r = applyRaidResult(s, result({ kills: 3 }));
  assert.equal(r.xp, 3 * RAID.heroXpPerKill);
  s.heroes.paladin = { level: 1, xp: 0 };
  r = applyRaidResult(s, result({ kills: 3, outcome: 'repelled', destroyed: 0 }));
  assert.equal(r.xp, 3 * RAID.heroXpPerKill + RAID.heroXpRepel);
  assert.deepEqual(base().heroes, {});
  assert.equal(applyRaidResult(base(), result()).xp, 0, 'sin héroe no hay experiencia');
});

test('los recursos nunca quedan en negativo', () => {
  const s = base();
  s.gold = 0;
  s.wood = 3;
  applyRaidResult(s, result({ destroyed: 50, hallDown: true }));
  assert.ok(s.gold >= 0 && s.wood >= 0);
});

/* ---------- calendario ---------- */

test('un ataque programado llega a su hora, y «sin programar» (0) nunca está vencido', () => {
  const s = base();
  s.raid.nextAt = T0 + 5000;
  assert.equal(raidDue(s, T0), false);
  assert.equal(raidDue(s, T0 + 5000), true);
  assert.equal(raidCountdownMs(s, T0 + 2000), 3000);
  assert.equal(raidCountdownMs(s, T0 + 99_000), 0);
  s.raid.nextAt = 0;
  assert.equal(raidDue(s, T0 + 1e12), false);
});

test('una partida nueva tiene el primer ataque a los 20 minutos', () => {
  const s = createNewState(T0);
  assert.equal(s.raid.nextAt, T0 + RAID.firstDelaySec * 1000);
  assert.equal(s.raid.count, 0);
});

test('resolver un ataque aplica el resultado, programa el siguiente y cuenta uno más', () => {
  const s = base([['mine', 6, 6], ['sawmill', 12, 6], ['storage', 6, 12]]);
  s.raid.nextAt = T0;
  const now = T0 + 3 * 60 * 60 * 1000; // volvió tras 3 horas: se resuelve UNO solo
  const report = resolveRaid(s, now);
  assert.ok(['repelled', 'retreated', 'raided'].includes(report.outcome));
  assert.equal(s.raid.count, 1);
  assert.equal(s.raid.nextAt, now + RAID.intervalSec * 1000);
  assert.equal(raidDue(s, now), false, 'no hay otro enseguida');
});

test('las tropas no mueren al defender', () => {
  const s = base([['barracks', 10, 6]], { army: { soldier: 4, mage: 2 } });
  const before = { ...s.army };
  resolveRaid(s, T0);
  assert.deepEqual(s.army, before);
  assert.ok(UNITS.soldier);
});

/* ---------- ver la defensa en pantalla ---------- */

test('el informe trae una repetición (sin avanzar) que termina igual que el resultado', () => {
  const s = base([['tower', 22, 16], ['mine', 6, 6], ['sawmill', 12, 6], ['barracks', 30, 18]], { army: { soldier: 3 }, hero: { level: 1, xp: 0 } });
  s.raid.nextAt = T0;
  const report = resolveRaid(s, T0);
  const replay = report.replay;
  assert.ok(replay, 'hay repetición');
  assert.equal(Object.keys(report).includes('replay'), false, 'no se guarda ni se compara con el informe');
  assert.equal(replay.time, 0, 'llega sin avanzar');
  assert.equal(replay.over, false);

  // La repetición se avanza en pasos distintos a los de la simulación y debe dar lo mismo.
  for (let i = 0; i < 6000 && !replay.over; i++) advanceBattle(replay, 0.037);
  assert.equal(replay.over, true);
  assert.equal(replay.result.outcome, report.outcome);
  assert.equal(replay.result.kills, report.kills);
  assert.equal(replay.result.destroyed, report.destroyed);
});

test('los edificios de la defensa llevan nivel y si estaban dañados (para dibujarlos igual que en la base)', () => {
  const s = base([['mine', 6, 6, 3], ['house', 12, 6]]);
  s.buildings.find((b) => b.type === 'house').damaged = true;
  const b = createRaidBattle(s, generateRaid(1, 1));
  const mine = b.buildings.find((e) => e.type === 'mine');
  const house = b.buildings.find((e) => e.type === 'house');
  assert.equal(mine.level, 3);
  assert.equal(mine.damaged, false);
  assert.equal(house.damaged, true);
  assert.deepEqual([mine.w, mine.h, mine.cx, mine.cy], [2, 2, 6.5, 6.5], 'ocupa su rectángulo y tiene centro');
});

test('la defensa usa el nivel de tus edificios militares, tus investigaciones y a los 2 héroes de la escuadra', () => {
  const spec = [['archery', 10, 6, 6], ['tower', 4, 6, 1]];
  const s = base(spec, { thLevel: 6, army: { archer: 4 } });
  s.heroes = { paladin: { level: 3, xp: 0 }, priestess: { level: 1, xp: 0 }, ranger: { level: 1, xp: 0 } };
  s.squad = ['paladin', 'ranger'];
  s.research.armor = 4;
  s.research.fortify = 5;
  const plain = createRaidBattle(base(spec, { thLevel: 6, army: { archer: 4 } }), generateRaid(2));
  const b = createRaidBattle(s, generateRaid(2));
  const archer = defenderUnits(b).find((u) => u.type === 'archer');
  const archer1 = defenderUnits(plain).find((u) => u.type === 'archer');
  assert.ok(archer.hp > archer1.hp, 'el arquero de nivel 6 con armaduras pega y aguanta más');
  assert.deepEqual(defenderUnits(b).filter((u) => u.type === 'hero').map((u) => u.heroKey), ['paladin', 'ranger']);
  const tower = b.buildings.find((e) => e.type === 'tower');
  const tower1 = plain.buildings.find((e) => e.type === 'tower');
  assert.ok(tower.dmg > tower1.dmg && tower.hp > tower1.hp, 'las fortificaciones mejoran las torres y los edificios');
});

test('las armas de asedio no defienden la base', () => {
  const s = base([['siege', 10, 6]], { thLevel: 10, army: { catapult: 2, soldier: 1 } });
  const b = createRaidBattle(s, generateRaid(1));
  assert.deepEqual(defenderUnits(b).map((u) => u.type), ['soldier']);
});

test('el primer ataque de la partida es un aviso suave: 2 guardias y más flojos', () => {
  const first = generateRaid(1, 1);
  const second = generateRaid(1, 2);
  assert.equal(first.attackers.length, 2);
  assert.ok(first.hpScale < second.hpScale && first.dmgScale < second.dmgScale);
  assert.ok(second.attackers.length > first.attackers.length);
});

test('lo que está mejorando o entrenando no queda dañado: lo protegen las vallas', () => {
  const s = base([['mine', 6, 6], ['sawmill', 12, 6], ['barracks', 6, 12]]);
  const [, mine, sawmill, barracks] = s.buildings;
  mine.upgradeEndsAt = T0 + 60_000;
  barracks.training = { unit: 'soldier', endsAt: T0 + 60_000, qty: 2 };
  const report = applyRaidResult(s, result({ destroyedIds: [mine.id, sawmill.id, barracks.id] }));
  assert.equal(report.damaged, 1);
  assert.equal(report.protected, 2);
  assert.equal(mine.damaged, false);
  assert.equal(barracks.damaged, false);
  assert.equal(sawmill.damaged, true);
});

test('aplazar el ataque: cuesta oro por nivel, retrasa 8 minutos, tiene tope y no vale en el último minuto', () => {
  const s = base([], { thLevel: 2 });
  s.gold = 1000;
  s.raid.nextAt = T0 + 10 * 60_000;
  assert.deepEqual(postponeCost(s), { gold: 2 * RAID.postponeGoldPerLevel, wood: 0 });
  assert.equal(postponeBlocked(s, T0), null);

  const r = postponeRaid(s, T0);
  assert.equal(r.ok, true);
  assert.equal(s.raid.nextAt, T0 + 10 * 60_000 + RAID.postponeSec * 1000);
  assert.equal(s.gold, 1000 - 2 * RAID.postponeGoldPerLevel);
  assert.equal(s.raid.postponed, 1);

  assert.equal(postponeRaid(s, T0).ok, true);
  const third = postponeRaid(s, T0);
  assert.equal(third.ok, false, 'solo se puede aplazar RAID.maxPostpones veces');
  assert.match(third.reason, /máximo/);

  // Al llegar el ataque el contador de aplazos vuelve a cero.
  s.raid.nextAt = T0;
  resolveRaid(s, T0 + 1000);
  assert.equal(s.raid.postponed, 0);

  const late = base();
  late.gold = 1000;
  late.raid.nextAt = T0 + 30_000;
  assert.match(postponeBlocked(late, T0), /tarde/);
  const poor = base();
  poor.gold = 5;
  poor.raid.nextAt = T0 + 10 * 60_000;
  assert.match(postponeBlocked(poor, T0), /Faltan/);
  assert.equal(poor.gold, 5);
});
