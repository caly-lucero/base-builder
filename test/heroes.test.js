import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITY_RANKS, HEROES, HERO_KEYS, HERO_MAX_LEVEL, PASSIVE_LEVELS, abilityAt, abilityRank, heroCap, heroStats, heroXpToNext,
  isHeroKey, passivesAt, passivesUnlocked,
} from '../src/data/heroes.js';

test('hay 5 héroes distintos, cada uno con su habilidad y 5 pasivas', () => {
  assert.equal(HERO_KEYS.length, 5);
  assert.equal(new Set(HERO_KEYS.map((k) => HEROES[k].sprite)).size, 5, 'cada uno se ve distinto');
  assert.equal(new Set(HERO_KEYS.map((k) => HEROES[k].ability.kind)).size, 5, 'cada uno con una habilidad distinta');
  for (const key of HERO_KEYS) {
    const h = HEROES[key];
    assert.equal(h.passives.length, PASSIVE_LEVELS.length, `${key}: una pasiva por nivel de desbloqueo`);
    assert.ok(h.name && h.title && h.cost.gold > 0 && h.trainSec > 0 && h.supply >= 1, key);
    for (const p of h.passives) assert.ok(['hp', 'dmg', 'speed', 'armor', 'regen'].includes(p.type) && p.value > 0 && p.text, key);
  }
  assert.equal(isHeroKey('paladin'), true);
  assert.equal(isHeroKey('__proto__'), false);
  assert.equal(isHeroKey('dragon'), false);
});

test('el nivel máximo es el doble del Ayuntamiento, con tope en 20', () => {
  assert.equal(HERO_MAX_LEVEL, 20);
  assert.equal(heroCap(1), 2);
  assert.equal(heroCap(5), 10);
  assert.equal(heroCap(10), 20);
  assert.equal(heroCap(99), 20);
  assert.equal(heroCap(0), 2, 'un nivel absurdo no rompe nada');
});

test('la experiencia que pide cada nivel crece', () => {
  for (let l = 1; l < HERO_MAX_LEVEL; l++) assert.ok(heroXpToNext(l + 1) > heroXpToNext(l));
});

test('la habilidad (árbol 1) sube de rango en los niveles 1, 7, 13 y 19', () => {
  assert.deepEqual(ABILITY_RANKS.map((r) => r.level), [1, 7, 13, 19]);
  assert.equal(abilityRank(1), 0);
  assert.equal(abilityRank(6), 0);
  assert.equal(abilityRank(7), 1);
  assert.equal(abilityRank(13), 2);
  assert.equal(abilityRank(19), 3);
  assert.equal(abilityRank(20), 3);
  for (const key of HERO_KEYS) {
    for (let rank = 1; rank < 4; rank++) {
      const prev = abilityAt(key, ABILITY_RANKS[rank - 1].level);
      const next = abilityAt(key, ABILITY_RANKS[rank].level);
      assert.ok(next.power > prev.power, `${key}: más poder en el rango ${rank + 1}`);
      assert.ok(next.cdSec <= prev.cdSec, `${key}: no tarda más en recargarse`);
      assert.ok(next.radius >= prev.radius, `${key}: no pierde alcance`);
      assert.equal(next.rank, rank);
    }
  }
});

test('las pasivas (árbol 2) se desbloquean en los niveles 3, 6, 10, 14 y 18', () => {
  assert.deepEqual(PASSIVE_LEVELS, [3, 6, 10, 14, 18]);
  assert.equal(passivesUnlocked(1), 0);
  assert.equal(passivesUnlocked(3), 1);
  assert.equal(passivesUnlocked(9), 2);
  assert.equal(passivesUnlocked(18), 5);
  assert.equal(passivesUnlocked(20), 5);
  const none = passivesAt('paladin', 2);
  assert.deepEqual(none, { hp: 0, dmg: 0, speed: 0, armor: 0, regen: 0 });
  const some = passivesAt('paladin', 6);
  assert.equal(some.armor, 0.1);
  assert.equal(some.hp, 0.15);
  assert.ok(passivesAt('paladin', 20).armor <= 0.6, 'la armadura tiene tope');
});

test('las estadísticas suben con el nivel y la armadura y regeneración llegan con las pasivas', () => {
  for (const key of HERO_KEYS) {
    let last = heroStats(key, 1);
    assert.equal(last.hp, HEROES[key].combat.hp, `${key} nivel 1 = base`);
    for (let l = 2; l <= HERO_MAX_LEVEL; l++) {
      const now = heroStats(key, l);
      assert.ok(now.hp >= last.hp && now.dmg >= last.dmg, `${key} no baja de nivel ${l - 1} a ${l}`);
      last = now;
    }
    assert.ok(heroStats(key, 20).hp > 2 * heroStats(key, 1).hp, `${key}: el nivel 20 es mucho más fuerte`);
  }
  assert.equal(heroStats('paladin', 1).armor, 0);
  assert.ok(heroStats('paladin', 10).armor > 0);
  assert.ok(heroStats('priestess', 3).regen > 0);
});

test('un héroe necesita un nivel de altar mayor cuanto más especial es', () => {
  const levels = HERO_KEYS.map((k) => HEROES[k].altarLevel);
  assert.equal(Math.min(...levels), 1, 'hay uno disponible desde el principio');
  assert.ok(Math.max(...levels) <= 10);
  assert.equal(new Set(levels).size, levels.length, 'se desbloquean de a uno');
});
