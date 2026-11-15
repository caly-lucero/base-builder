import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, HERO_MAX_LEVEL, heroXpToNext } from '../src/data/config.js';
import { applyBattleResult, canAttack, nextCampaignLevel } from '../src/game/campaign.js';
import { createNewState, resourceCap, townHall } from '../src/game/logic.js';

const T0 = 1_700_000_000_000;

function fresh() {
  const s = createNewState(T0);
  s.army = { soldier: 5, mage: 2, knight: 1 };
  s.gold = 100;
  s.wood = 100;
  return s;
}

const result = (over = {}) => ({
  won: true, level: 1, percent: 100, destroyed: 4, kills: 3,
  loot: { gold: 80, wood: 30 },
  casualties: { soldier: 2, mage: 0, knight: 1 },
  ...over,
});

test('el primer nivel que se ataca es el 1 y avanza al ganar', () => {
  const s = fresh();
  assert.equal(nextCampaignLevel(s), 1);
  const r = applyBattleResult(s, result({ level: 1 }));
  assert.equal(r.cleared, true);
  assert.equal(s.campaign.cleared, 1);
  assert.equal(nextCampaignLevel(s), 2);
});

test('perder no avanza la campaña, pero se queda con el botín de lo destruido y se pagan las bajas', () => {
  const s = fresh();
  const r = applyBattleResult(s, result({ won: false, loot: { gold: 25, wood: 0 } }));
  assert.equal(r.cleared, false);
  assert.equal(s.campaign.cleared, 0);
  assert.equal(s.gold, 125);
  assert.deepEqual(s.army, { soldier: 3, mage: 2, knight: 0 });
});

test('volver a ganar un nivel ya superado no hace avanzar de más', () => {
  const s = fresh();
  s.campaign.cleared = 3;
  applyBattleResult(s, result({ level: 2 }));
  assert.equal(s.campaign.cleared, 3);
  applyBattleResult(s, result({ level: 4 }));
  assert.equal(s.campaign.cleared, 4);
});

test('el botín no pasa del tope de recursos, y no recorta lo que ya había', () => {
  const s = fresh();
  s.gold = resourceCap(s) - 10;
  s.wood = 100;
  const r = applyBattleResult(s, result({ loot: { gold: 80, wood: 30 } }));
  assert.equal(s.gold, resourceCap(s));
  assert.deepEqual(r.loot, { gold: 10, wood: 30 }, 'informa lo que realmente entró');
});

test('las bajas no dejan el ejército en negativo', () => {
  const s = fresh();
  s.army.soldier = 1;
  applyBattleResult(s, result({ casualties: { soldier: 9, mage: 0, knight: 0 } }));
  assert.equal(s.army.soldier, 0);
});

test('el héroe gana experiencia SIEMPRE que pelea: por lo que destruye y derrota, con bono si ganas', () => {
  const s = fresh();
  s.hero = { level: 1, xp: 0 };
  const perFight = 4 * COMBAT.heroXpPerBuilding + 3 * COMBAT.heroXpPerKill;

  let r = applyBattleResult(s, result({ won: false }));
  assert.equal(r.xp, perFight, 'perder también da experiencia');
  assert.equal(s.hero.xp, perFight);

  s.hero = { level: 1, xp: 0 };
  r = applyBattleResult(s, result({ level: 1 }));
  const win = perFight + COMBAT.heroXpWin + COMBAT.heroXpPerLevel;
  assert.equal(r.xp, win, 'ganar suma el bono');
  assert.ok(win >= heroXpToNext(1), 'una victoria ya alcanza para el nivel 2');
  assert.equal(r.heroLevelUps, 1);
  assert.equal(s.hero.level, 2);
  assert.equal(s.hero.xp, win - heroXpToNext(1), 'lo que sobra queda guardado');

  const nothing = applyBattleResult(s, result({ won: false, destroyed: 0, kills: 0 }));
  assert.equal(nothing.xp, 0, 'si no hizo nada, no gana');
});

test('el héroe sube de nivel al juntar la experiencia, y lo que sobra queda para el siguiente', () => {
  const s = fresh();
  s.hero = { level: 1, xp: heroXpToNext(1) - 1 };
  const r = applyBattleResult(s, result({ level: 1 }));
  assert.equal(r.heroLevelUps >= 1, true);
  assert.equal(s.hero.level >= 2, true);
  assert.ok(s.hero.xp < heroXpToNext(s.hero.level), 'el sobrante queda para el siguiente nivel');
  assert.deepEqual(r.hero, { level: s.hero.level, xp: s.hero.xp, next: heroXpToNext(s.hero.level) }, 'el informe trae el progreso');
});

test('con la experiencia que da una campaña normal, el héroe sube varios niveles en pocas batallas', () => {
  const s = fresh();
  s.hero = { level: 1, xp: 0 };
  let fights = 0;
  while (s.hero.level < 4 && fights < 20) {
    applyBattleResult(s, result({ level: 1 + Math.floor(fights / 2) }));
    fights++;
  }
  assert.equal(s.hero.level, 4);
  assert.ok(fights <= 8, `llegó al nivel 4 en ${fights} batallas`);
});

test('el héroe no pasa del nivel máximo', () => {
  const s = fresh();
  s.hero = { level: HERO_MAX_LEVEL - 1, xp: heroXpToNext(HERO_MAX_LEVEL - 1) - 1 };
  applyBattleResult(s, result({ level: 20 }));
  assert.equal(s.hero.level, HERO_MAX_LEVEL);
  assert.equal(s.hero.xp, 0);
  applyBattleResult(s, result({ level: 21 }));
  assert.equal(s.hero.level, HERO_MAX_LEVEL);
});

test('sin héroe, ganar no da experiencia a nadie', () => {
  const s = fresh();
  const r = applyBattleResult(s, result());
  assert.equal(r.xp, 0);
  assert.equal(s.hero, null);
});

test('canAttack pide al menos una unidad o el héroe', () => {
  const s = createNewState(T0);
  assert.equal(canAttack(s), false);
  s.army.soldier = 1;
  assert.equal(canAttack(s), true);
  s.army.soldier = 0;
  s.hero = { level: 1, xp: 0 };
  assert.equal(canAttack(s), true);
  assert.ok(townHall(s));
});
