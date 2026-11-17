import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS } from '../src/data/config.js';
import { achievementById, achievementStatus, claimAchievement, claimableCount, measure } from '../src/game/achievements.js';
import { createBuilding, createNewState, resourceCap, townHall } from '../src/game/logic.js';

const T0 = 1_700_000_000_000;

function fresh() {
  const s = createNewState(T0);
  s.gold = 0;
  s.wood = 0;
  return s;
}

const add = (s, type, x, y, level = 1) => s.buildings.push(createBuilding(s.nextId++, type, x, y, T0, level));

test('los datos de los logros son coherentes', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length, 'ids únicos');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.text && a.kind && a.tiers.length >= 3, a.id);
    let last = 0;
    let lastReward = 0;
    for (const t of a.tiers) {
      assert.ok(t.target > last, `${a.id}: los objetivos crecen`);
      const total = (t.reward.gold ?? 0) + (t.reward.wood ?? 0);
      assert.ok(total > lastReward, `${a.id}: los premios crecen`);
      last = t.target;
      lastReward = total;
    }
  }
});

test('una partida nueva no tiene nada reclamado ni nada que reclamar', () => {
  const s = fresh();
  assert.deepEqual(Object.values(s.achievements), ACHIEVEMENTS.map(() => 0));
  assert.equal(claimableCount(s), 0);
  const st = achievementStatus(s, achievementById('builder'));
  assert.deepEqual([st.claimed, st.current, st.claimable], [0, 0, false]);
});

test('cada tipo de logro mide lo que dice', () => {
  const s = fresh();
  townHall(s).level = 4;
  add(s, 'mine', 0, 0, 6);
  add(s, 'sawmill', 1, 0);
  add(s, 'wall', 2, 0);
  add(s, 'gate', 3, 0);
  s.army = { ...s.army, soldier: 4, catapult: 1, ram: 2 };
  s.campaign.cleared = 7;
  s.heroes = { paladin: { level: 3, xp: 0 }, ranger: { level: 9, xp: 0 } };
  s.research = { weapons: 2, armor: 6, fortify: 0 };
  s.raid.count = 3;
  assert.equal(measure(s, 'buildings'), 2, 'sin muros ni Ayuntamiento');
  assert.equal(measure(s, 'walls'), 2);
  assert.equal(measure(s, 'townhall'), 4);
  assert.equal(measure(s, 'buildingLevel'), 6, 'sin contar el Ayuntamiento');
  assert.equal(measure(s, 'army'), 7);
  assert.equal(measure(s, 'siege'), 3);
  assert.equal(measure(s, 'campaign'), 7);
  assert.equal(measure(s, 'heroes'), 2);
  assert.equal(measure(s, 'heroLevel'), 9);
  assert.equal(measure(s, 'research'), 6);
  assert.equal(measure(s, 'raids'), 3);
  assert.equal(measure(s, 'desconocido'), 0);
});

test('se reclama un nivel por vez, con su premio, y no se repite', () => {
  const s = fresh();
  s.campaign.cleared = 12; // cumple los dos primeros niveles de «Conquistador» (3 y 10)
  const def = achievementById('conquer');
  assert.equal(achievementStatus(s, def).claimable, true);
  assert.equal(claimableCount(s), 1);

  let r = claimAchievement(s, 'conquer');
  assert.equal(r.ok, true);
  assert.equal(r.tier, 1);
  assert.deepEqual(r.granted, def.tiers[0].reward);
  assert.equal(s.gold, def.tiers[0].reward.gold);
  assert.equal(s.achievements.conquer, 1);
  assert.equal(achievementStatus(s, def).next.target, 10, 'ahora pide el siguiente');

  r = claimAchievement(s, 'conquer');
  assert.equal(r.ok, true);
  assert.equal(s.achievements.conquer, 2);
  r = claimAchievement(s, 'conquer');
  assert.equal(r.ok, false);
  assert.match(r.reason, /Aún no lo cumples/);
  assert.equal(claimableCount(s), 0);
});

test('reclamar valida: logro inexistente, sin cumplir y ya completo', () => {
  const s = fresh();
  assert.match(claimAchievement(s, 'no_existe').reason, /no existe/);
  assert.match(claimAchievement(s, 'builder').reason, /Aún no lo cumples/);
  s.achievements.builder = 4;
  assert.match(claimAchievement(s, 'builder').reason, /todo este logro/);
});

test('el premio no pasa del tope de recursos', () => {
  const s = fresh();
  s.campaign.cleared = 3;
  s.gold = resourceCap(s) - 20;
  const r = claimAchievement(s, 'conquer');
  assert.equal(r.granted.gold, 20);
  assert.equal(s.gold, resourceCap(s));
});
