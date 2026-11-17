import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, QUESTS, UNITS } from '../src/data/config.js';
import { createNewState, place, startUpgrade, tickAll, townHall, resourceCap } from '../src/game/logic.js';
import { claimQuest, currentQuest, questById, questCounts, questIds, questProgress } from '../src/game/quests.js';

const T0 = 1_700_000_000_000;

function fresh(gold = 1000, wood = 1000, thLevel = 3) {
  const s = createNewState(T0);
  s.gold = gold;
  s.wood = wood;
  townHall(s).level = thLevel;
  return s;
}

test('los datos de las misiones son coherentes: ids únicos, objetivos y recompensas válidos', () => {
  assert.equal(new Set(questIds()).size, QUESTS.length, 'ids únicos');
  for (const q of QUESTS) {
    assert.ok(q.text && q.id, `misión sin texto o id: ${q.id}`);
    assert.ok(['count', 'townhall', 'anyLevel', 'army', 'unit', 'hero', 'heroLevel', 'research', 'campaign'].includes(q.goal.kind), `${q.id}: objetivo desconocido`);
    if (q.goal.kind === 'count') assert.ok(Object.hasOwn(BUILDINGS, q.goal.building), `${q.id}: edificio desconocido`);
    if (q.goal.kind === 'unit') assert.ok(Object.hasOwn(UNITS, q.goal.unit), `${q.id}: unidad desconocida`);
    assert.ok(Object.keys(q.reward).length > 0, `${q.id}: sin recompensa`);
    for (const [res, n] of Object.entries(q.reward)) {
      assert.ok(['gold', 'wood'].includes(res) && Number.isInteger(n) && n > 0, `${q.id}: recompensa inválida`);
    }
  }
});

test('una partida nueva empieza por la primera misión, sin nada reclamado', () => {
  const s = createNewState(T0);
  assert.deepEqual(s.claimedQuests, []);
  assert.equal(currentQuest(s).id, QUESTS[0].id);
  assert.deepEqual(questCounts(s), { claimed: 0, total: QUESTS.length });
});

test('el avance por conteo sube al construir y no pasa del objetivo', () => {
  const s = fresh();
  const mines = questById('q_mines');
  assert.deepEqual(questProgress(s, mines), { current: 0, target: 2, done: false });
  place(s, 'mine', 0, 0, T0);
  assert.deepEqual(questProgress(s, mines), { current: 1, target: 2, done: false });
  place(s, 'mine', 1, 0, T0);
  place(s, 'mine', 2, 0, T0);
  assert.deepEqual(questProgress(s, mines), { current: 2, target: 2, done: true }, 'tiene 3 pero se muestra 2/2');
});

test('la misión del Ayuntamiento sigue su nivel', () => {
  const s = fresh(5000, 5000, 1);
  const q = questById('q_hall2');
  assert.equal(questProgress(s, q).done, false);
  startUpgrade(s, townHall(s).id, T0);
  assert.equal(questProgress(s, q).done, false, 'mientras mejora todavía es nivel 1');
  tickAll(s, T0 + 10 * 60_000);
  assert.equal(questProgress(s, q).done, true);
});

test('«mejora un edificio al nivel 2» ignora al Ayuntamiento y a lo que aún está en obras', () => {
  const s = fresh(5000, 5000, 2);
  const q = questById('q_upgrade');
  assert.equal(questProgress(s, q).done, false, 'el Ayuntamiento en nivel 2 no cuenta');
  const mine = place(s, 'mine', 0, 0, T0).building;
  assert.equal(questProgress(s, q).done, false);
  startUpgrade(s, mine.id, T0);
  assert.equal(questProgress(s, q).done, false, 'en obras todavía no');
  tickAll(s, T0 + 60_000);
  assert.equal(questProgress(s, q).done, true);
});

test('las misiones de ejército y héroe siguen lo entrenado', () => {
  const s = fresh();
  const soldiers = questById('q_soldiers');
  const army8 = questById('q_army8');
  const hero = questById('q_hero');
  assert.deepEqual(questProgress(s, soldiers), { current: 0, target: 3, done: false });
  s.army.soldier = 2;
  assert.deepEqual(questProgress(s, soldiers), { current: 2, target: 3, done: false });
  s.army.soldier = 5; // más de los pedidos: se muestra 3/3
  assert.deepEqual(questProgress(s, soldiers), { current: 3, target: 3, done: true });

  s.army = { ...s.army, soldier: 3, mage: 3, knight: 2 };
  assert.equal(questProgress(s, army8).done, true);
  assert.equal(questProgress(s, hero).done, false);
  s.heroes.paladin = { level: 1, xp: 0 };
  assert.equal(questProgress(s, hero).done, true);

  const second = questById('q_hero2');
  assert.deepEqual(questProgress(s, second), { current: 1, target: 2, done: false });
  s.heroes.ranger = { level: 1, xp: 0 };
  assert.equal(questProgress(s, second).done, true);
});

test('las misiones de nivel de héroe y de investigación siguen su avance', () => {
  const s = fresh();
  const heroLevel = questById('q_herolvl10');
  const research = questById('q_research');
  assert.deepEqual(questProgress(s, heroLevel), { current: 0, target: 10, done: false });
  s.heroes.paladin = { level: 4, xp: 0 };
  s.heroes.ranger = { level: 10, xp: 0 };
  assert.equal(questProgress(s, heroLevel).done, true);
  assert.equal(questProgress(s, research).done, false);
  s.research.armor = 1;
  assert.equal(questProgress(s, research).done, true);
});

test('las misiones de campaña siguen los niveles superados', () => {
  const s = fresh();
  const q = questById('q_win3');
  assert.deepEqual(questProgress(s, q), { current: 0, target: 3, done: false });
  s.campaign.cleared = 2;
  assert.equal(questProgress(s, q).done, false);
  s.campaign.cleared = 5;
  assert.deepEqual(questProgress(s, q), { current: 3, target: 3, done: true });
});

test('el héroe no cuenta como unidad de ejército', () => {
  const s = fresh();
  s.heroes.paladin = { level: 1, xp: 0 };
  assert.equal(questProgress(s, questById('q_army8')).current, 0);
});

test('no se reclama una misión sin cumplir ni una que no es la actual', () => {
  const s = fresh();
  assert.equal(claimQuest(s, QUESTS[0].id).reason, 'Aún no cumpliste la misión');
  assert.equal(claimQuest(s, QUESTS[1].id).reason, 'Esa misión no está disponible');
  assert.equal(claimQuest(s, 'no_existe').reason, 'Esa misión no está disponible');
  assert.deepEqual(s.claimedQuests, []);
});

test('reclamar da la recompensa, marca la misión y pasa a la siguiente; no se reclama dos veces', () => {
  const s = fresh(100, 100, 1);
  place(s, 'sawmill', 0, 0, T0); // misión 1
  const before = { gold: s.gold, wood: s.wood };
  const r = claimQuest(s, 'q_sawmill');
  assert.equal(r.ok, true);
  assert.deepEqual(r.granted, { gold: 0, wood: 40 });
  assert.equal(s.wood, before.wood + 40);
  assert.equal(s.gold, before.gold);
  assert.deepEqual(s.claimedQuests, ['q_sawmill']);
  assert.equal(currentQuest(s).id, 'q_mines');
  assert.equal(claimQuest(s, 'q_sawmill').ok, false, 'ya reclamada');
});

test('la recompensa no pasa del tope de recursos', () => {
  const s = fresh(1000, 1000, 1);
  place(s, 'sawmill', 0, 0, T0);
  s.wood = resourceCap(s) - 10; // caben 10, la recompensa es 40
  const r = claimQuest(s, 'q_sawmill');
  assert.equal(r.granted.wood, 10);
  assert.equal(s.wood, resourceCap(s));
});

test('se pueden reclamar varias misiones seguidas si ya estaban cumplidas, y al final no queda ninguna', () => {
  const s = fresh(1_000_000, 1_000_000, 10);
  s.gold = s.wood = 0;
  // Una base avanzada que cumple todo de una vez (se omiten los topes con almacenes grandes).
  const make = (id, type, x, y, level = 1) => ({ id, type, level, upgradeEndsAt: null, training: null, damaged: false, x, y, stored: 0, lastTick: T0 });
  let id = 100;
  let col = 0;
  const add = (type, level = 1, count = 1) => {
    for (let i = 0; i < count; i++) {
      s.buildings.push(make(id++, type, col % 24, Math.floor(col / 24) + 1, level));
      col++;
    }
  };
  add('mine', 10, 5);
  for (const t of ['sawmill', 'storage', 'tower', 'house', 'barracks', 'archery', 'atelier', 'stable', 'siege', 'forge', 'altar', 'gate']) add(t, 1);
  add('wall', 1, 20);
  s.army = { ...s.army, soldier: 4, archer: 5, mage: 3, knight: 2 };
  s.heroes = { paladin: { level: 12, xp: 0 }, ranger: { level: 1, xp: 0 } };
  s.squad = ['paladin', 'ranger'];
  s.research.weapons = 1;
  s.campaign.cleared = 3;
  let claimed = 0;
  while (currentQuest(s)) {
    const r = claimQuest(s, currentQuest(s).id);
    assert.equal(r.ok, true, `no se pudo reclamar ${currentQuest(s)?.id}`);
    claimed++;
  }
  assert.equal(claimed, QUESTS.length);
  assert.equal(currentQuest(s), null);
});
