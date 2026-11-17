import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT, starReward } from '../src/data/config.js';
import { HERO_MAX_LEVEL, heroXpToNext } from '../src/data/heroes.js';
import { applyBattleResult, canAttack, nextCampaignLevel } from '../src/game/campaign.js';
import { createNewState, resourceCap, townHall } from '../src/game/logic.js';

const T0 = 1_700_000_000_000;

function fresh() {
  const s = createNewState(T0);
  s.army = { ...s.army, soldier: 5, mage: 2, knight: 1 };
  townHall(s).level = 10; // sin tope de nivel de héroe, salvo en la prueba que lo comprueba
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
  assert.deepEqual(s.army, { soldier: 3, archer: 0, mage: 2, knight: 0, catapult: 0, ram: 0 });
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

/** Un héroe de la escuadra con el nivel y la experiencia dados. */
function withHero(s, key, level = 1, xp = 0) {
  s.heroes[key] = { level, xp };
  if (!s.squad.includes(key)) s.squad.push(key);
  return s.heroes[key];
}

test('los héroes ganan experiencia SIEMPRE que pelean: por lo que destruyen y derrotan, con bono si ganas', () => {
  const s = fresh();
  const hero = withHero(s, 'paladin');
  const perFight = 4 * COMBAT.heroXpPerBuilding + 3 * COMBAT.heroXpPerKill;

  let r = applyBattleResult(s, result({ won: false }));
  assert.equal(r.xp, perFight, 'perder también da experiencia');
  assert.equal(hero.xp, perFight);

  hero.level = 1;
  hero.xp = 0;
  r = applyBattleResult(s, result({ level: 1 }));
  const win = perFight + COMBAT.heroXpWin + COMBAT.heroXpPerLevel;
  assert.equal(r.xp, win, 'ganar suma el bono');
  assert.ok(win >= heroXpToNext(1), 'una victoria ya alcanza para el nivel 2');
  assert.equal(r.heroLevelUps, 1);
  assert.equal(hero.level, 2);
  assert.equal(hero.xp, win - heroXpToNext(1), 'lo que sobra queda guardado');

  const nothing = applyBattleResult(s, result({ won: false, destroyed: 0, kills: 0 }));
  assert.equal(nothing.xp, 0, 'si no hizo nada, no gana');
});

test('cada héroe de la escuadra gana lo mismo; el que no salió no gana nada', () => {
  const s = fresh();
  withHero(s, 'paladin');
  withHero(s, 'ranger', 3, 5);
  s.heroes.priestess = { level: 1, xp: 0 }; // la tiene, pero no sale
  const r = applyBattleResult(s, result({ won: false }));
  assert.equal(r.heroes.length, 2);
  assert.deepEqual(r.heroes.map((h) => h.key), ['paladin', 'ranger']);
  assert.equal(s.heroes.priestess.xp, 0);
  assert.equal(s.heroes.ranger.xp, 5 + r.xp);
});

test('el héroe sube de nivel al juntar la experiencia, y lo que sobra queda para el siguiente', () => {
  const s = fresh();
  const hero = withHero(s, 'paladin', 1, heroXpToNext(1) - 1);
  const r = applyBattleResult(s, result({ level: 1 }));
  assert.equal(r.heroLevelUps >= 1, true);
  assert.equal(hero.level >= 2, true);
  assert.ok(hero.xp < heroXpToNext(hero.level), 'el sobrante queda para el siguiente nivel');
  assert.deepEqual(
    { level: r.hero.level, xp: r.hero.xp, next: r.hero.next },
    { level: hero.level, xp: hero.xp, next: heroXpToNext(hero.level) },
    'el informe trae el progreso',
  );
});

test('con la experiencia que da una campaña normal, el héroe sube varios niveles en pocas batallas', () => {
  const s = fresh();
  const hero = withHero(s, 'paladin');
  let fights = 0;
  while (hero.level < 4 && fights < 20) {
    applyBattleResult(s, result({ level: 1 + Math.floor(fights / 2) }));
    fights++;
  }
  assert.equal(hero.level, 4);
  assert.ok(fights <= 8, `llegó al nivel 4 en ${fights} batallas`);
});

test('el nivel de un héroe no pasa del doble del Ayuntamiento: guarda la experiencia hasta que lo subas', () => {
  const s = fresh();
  townHall(s).level = 2; // tope 4
  const hero = withHero(s, 'paladin', 3, 0);
  for (let i = 0; i < 40; i++) applyBattleResult(s, result({ level: 5 }));
  assert.equal(hero.level, 4, 'se queda en el tope');
  assert.ok(hero.xp <= heroXpToNext(4), 'la experiencia guardada tiene límite');
  const capped = applyBattleResult(s, result({ level: 5 }));
  assert.equal(capped.hero.capped, true);
  assert.equal(capped.heroLevelUps, 0);

  townHall(s).level = 3; // tope 6: ahora sí sube
  const r = applyBattleResult(s, result({ level: 5 }));
  assert.ok(hero.level > 4 && r.heroLevelUps >= 1);
});

test('el nivel máximo absoluto es 20 (Ayuntamiento en 10)', () => {
  const s = fresh();
  const hero = withHero(s, 'paladin', HERO_MAX_LEVEL - 1, heroXpToNext(HERO_MAX_LEVEL - 1) - 1);
  applyBattleResult(s, result({ level: 20 }));
  assert.equal(hero.level, HERO_MAX_LEVEL);
  assert.equal(HERO_MAX_LEVEL, 20);
  applyBattleResult(s, result({ level: 21 }));
  assert.equal(hero.level, HERO_MAX_LEVEL);
  assert.ok(hero.xp <= heroXpToNext(HERO_MAX_LEVEL));
});

test('sin héroes, ganar no da experiencia a nadie', () => {
  const s = fresh();
  const r = applyBattleResult(s, result());
  assert.equal(r.xp, 0);
  assert.equal(r.hero, null);
  assert.deepEqual(s.heroes, {});
});

test('canAttack pide al menos una unidad o un héroe en la escuadra', () => {
  const s = createNewState(T0);
  assert.equal(canAttack(s), false);
  s.army.soldier = 1;
  assert.equal(canAttack(s), true);
  s.army.soldier = 0;
  s.heroes.paladin = { level: 1, xp: 0 };
  assert.equal(canAttack(s), false, 'lo tiene, pero no está en la escuadra');
  s.squad = ['paladin'];
  assert.equal(canAttack(s), true);
  assert.ok(townHall(s));
});

/* ---------- estrellas ---------- */

test('se guarda la mejor cantidad de estrellas de cada nivel y no baja', () => {
  const s = fresh();
  applyBattleResult(s, result({ level: 1, stars: 2 }));
  assert.equal(s.campaign.stars[1], 2);
  applyBattleResult(s, result({ level: 1, stars: 1 }));
  assert.equal(s.campaign.stars[1], 2, 'un resultado peor no pisa el mejor');
  applyBattleResult(s, result({ level: 1, stars: 3 }));
  assert.equal(s.campaign.stars[1], 3);
});

test('cada estrella nueva da un premio extra que crece con el nivel; repetir no da nada', () => {
  const s = fresh();
  s.gold = 0;
  s.wood = 0;
  const loot = { gold: 0, wood: 0 };
  let r = applyBattleResult(s, result({ level: 1, stars: 2, loot }));
  const one = starReward(1);
  assert.equal(r.newStars, 2);
  assert.deepEqual(r.starBonus, { gold: one.gold * 2, wood: one.wood * 2 });
  assert.equal(s.gold, one.gold * 2);

  r = applyBattleResult(s, result({ level: 1, stars: 2, loot }));
  assert.equal(r.newStars, 0);
  assert.deepEqual(r.starBonus, { gold: 0, wood: 0 });

  r = applyBattleResult(s, result({ level: 1, stars: 3, loot }));
  assert.equal(r.newStars, 1, 'solo la tercera es nueva');
  assert.deepEqual(r.starBonus, one);
  assert.ok(starReward(8).gold > starReward(1).gold);
});

test('sin estrellas no se supera el nivel; con una sí', () => {
  const s = fresh();
  let r = applyBattleResult(s, result({ level: 1, won: false, stars: 1 })); // solo el 50 %: estrella pero no Ayuntamiento
  assert.equal(r.cleared, false);
  assert.equal(s.campaign.cleared, 0);
  assert.equal(s.campaign.stars[1], 1);
  r = applyBattleResult(s, result({ level: 1, won: true, stars: 1 }));
  assert.equal(r.cleared, true);
  assert.equal(r.stars, 1);
  r = applyBattleResult(s, result({ level: 2, won: false, stars: 0 }));
  assert.equal(r.newStars, 0);
  assert.equal(s.campaign.stars[2], undefined, 'sin estrellas no queda registro');
});

test('el premio de estrellas no pasa del tope de recursos', () => {
  const s = fresh();
  s.gold = resourceCap(s) - 5;
  const r = applyBattleResult(s, result({ level: 3, stars: 3, loot: { gold: 0, wood: 0 } }));
  assert.equal(s.gold, resourceCap(s));
  assert.equal(r.starBonus.gold, 5);
});
