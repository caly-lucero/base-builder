import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMY_UNITS, BUILDINGS, UNITS } from '../src/data/config.js';
import {
  advanceBattle, attackers, castHeroAbility, abilityStatus, createBattle, createDuel, defenderUnits,
} from '../src/game/battle.js';

const army = (over = {}) => ({ soldier: 0, archer: 0, mage: 0, knight: 0, catapult: 0, ram: 0, ...over });

/** Misión mínima: un Ayuntamiento y lo que se pida. */
function mini({ buildings = [], defenders = [], hpScale = 1, dmgScale = 1 } = {}) {
  return { level: 1, hpScale, dmgScale, defenders, buildings: [{ type: 'hall', x: 12, y: 8, loot: { gold: 10, wood: 5 } }, ...buildings] };
}

const run = (b, seconds, dt = 0.1) => {
  for (let t = 0; t < seconds && !b.over; t += dt) advanceBattle(b, dt);
  return b;
};

/* ---------- datos ---------- */

test('cada unidad se entrena en un edificio que existe y que la tiene en su lista', () => {
  for (const [key, u] of Object.entries(UNITS)) {
    assert.ok(BUILDINGS[u.building], `${key}: edificio ${u.building}`);
    assert.ok(BUILDINGS[u.building].trains.includes(key), `${key} está en trains de ${u.building}`);
    assert.ok(u.minLevel >= 1 && u.minLevel <= 10 && u.perLevel > 0 && u.supply >= 1 && u.trainSec > 0, key);
  }
  assert.deepEqual(ARMY_UNITS, ['soldier', 'archer', 'mage', 'knight', 'catapult', 'ram']);
});

/* ---------- equilibrio entre unidades ---------- */

const costOf = (k) => UNITS[k].cost.gold + 0.8 * UNITS[k].cost.wood;
const count = (k, budget = 1500) => Math.max(1, Math.round(budget / costOf(k)));

/** Quién gana con el mismo gasto: A atacando y B defendiendo, y al revés. */
function matchup(x, y) {
  const fight = (a, d) => {
    const duel = createDuel({ [a]: count(a) }, { [d]: count(d) });
    for (let i = 0; i < 2000 && !duel.over; i++) advanceBattle(duel, 0.1);
    assert.notEqual(duel.result.winner, 'draw', `${a} contra ${d} no se resolvió`);
    return duel.result.winner === 'a' ? a : d;
  };
  const first = fight(x, y);
  const second = fight(y, x);
  return first === second ? first : 'split'; // quien golpea primero gana: están parejos
}

test('equilibrio: con el mismo gasto ninguna unidad gana a todas ni pierde contra todas', () => {
  const kinds = ['soldier', 'archer', 'mage', 'knight'];
  const wins = Object.fromEntries(kinds.map((k) => [k, 0]));
  const losses = Object.fromEntries(kinds.map((k) => [k, 0]));
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      const w = matchup(kinds[i], kinds[j]);
      if (w === 'split') continue;
      wins[w]++;
      losses[w === kinds[i] ? kinds[j] : kinds[i]]++;
    }
  }
  for (const k of kinds) {
    assert.ok(wins[k] < 3, `${k} le gana a todas (${wins[k]})`);
    assert.ok(losses[k] < 3, `${k} pierde contra todas (${losses[k]})`);
  }
});

test('los contras de diseño se cumplen: el soldado vence al caballero, el caballero a magos y arqueros, el mago al soldado', () => {
  assert.equal(matchup('soldier', 'knight'), 'soldier');
  assert.equal(matchup('knight', 'mage'), 'knight');
  assert.equal(matchup('knight', 'archer'), 'knight');
  assert.equal(matchup('mage', 'soldier'), 'mage');
});

test('un nivel más alto del edificio da unidades más fuertes que ganan al mismo ejército de nivel 1', () => {
  const strong = Object.fromEntries(ARMY_UNITS.map((k) => [k, { ...UNITS[k].combat, hp: Math.round(UNITS[k].combat.hp * 1.9), dmg: UNITS[k].combat.dmg * 1.9 }]));
  const duel = createDuel({ soldier: 10 }, { soldier: 10 }, null);
  // mismo número, los de la izquierda con estadísticas de nivel 7
  for (const u of attackers(duel)) {
    u.hp = u.maxHp = strong.soldier.hp;
    u.dmg = strong.soldier.dmg;
  }
  for (let i = 0; i < 2000 && !duel.over; i++) advanceBattle(duel, 0.1);
  assert.equal(duel.result.winner, 'a');
});

/* ---------- mecánicas de cada unidad ---------- */

test('el arquero dispara desde lejos: pega antes de que el enemigo lo alcance', () => {
  const b = createDuel({ archer: 1 }, { soldier: 1 });
  const [archer] = attackers(b);
  const [soldier] = defenderUnits(b);
  run(b, 1.2);
  assert.ok(soldier.hp < soldier.maxHp, 'el soldado ya recibió flechas');
  assert.ok(archer.range > 3.5);
});

test('una unidad hace más daño al tipo contra el que tiene ventaja', () => {
  const hitOnce = (a, d) => {
    const b = createDuel({ [a]: 1 }, { [d]: 1 });
    const [target] = defenderUnits(b);
    const before = target.hp;
    // junto al enemigo para que golpee ya
    attackers(b)[0].x = target.x - 0.5;
    attackers(b)[0].y = target.y;
    run(b, 0.15);
    return before - target.hp;
  };
  const bonus = hitOnce('soldier', 'knight');
  const plain = hitOnce('soldier', 'soldier');
  assert.ok(Math.abs(bonus / plain - UNITS.soldier.bonus.knight) < 0.01, `soldado contra caballero: x${bonus / plain}`);
});

test('el hechicero daña también a los que rodean al objetivo', () => {
  const b = createDuel({ mage: 1 }, { soldier: 3 });
  const targets = defenderUnits(b);
  targets.forEach((t, i) => {
    t.x = 11;
    t.y = 12 + i * 0.4; // apretados
  });
  const mage = attackers(b)[0];
  mage.x = 8;
  mage.y = 12;
  run(b, 1.5);
  const hurt = targets.filter((t) => t.hp < t.maxHp).length;
  assert.ok(hurt >= 2, `${hurt} heridos: el área alcanzó a más de uno`);
});

test('las armas de asedio van a por los edificios, no a por las unidades', () => {
  const b = createBattle(mini({ buildings: [{ type: 'mine', x: 5, y: 8 }], defenders: [{ kind: 'guard', x: 8, y: 13 }] }), army({ catapult: 1 }), []);
  const cat = attackers(b)[0];
  run(b, 6);
  const guard = defenderUnits(b)[0];
  assert.equal(guard.hp, guard.maxHp, 'ignora al guardia mientras haya edificios');
  assert.ok(cat.x !== cat.home.x || cat.y !== cat.home.y, 'avanza');
});

test('un arma de asedio daña mucho a un edificio y casi nada a una unidad', () => {
  const dmgTo = (target) => {
    const b = createBattle(mini({ buildings: [{ type: 'mine', x: 12, y: 18 }], defenders: [{ kind: 'guard', x: 12, y: 18 }] }), army({ ram: 1 }), []);
    const ram = attackers(b)[0];
    ram.x = 12;
    ram.y = 19;
    const t = target === 'building' ? b.buildings.find((e) => e.type === 'mine') : defenderUnits(b)[0];
    const before = t.hp;
    ram.cd = 0;
    run(b, 0.2);
    return before - t.hp;
  };
  const vsBuilding = dmgTo('building');
  const vsUnit = dmgTo('unit');
  assert.ok(vsBuilding > 0);
  assert.ok(vsUnit < vsBuilding * 0.5, `edificio ${vsBuilding} contra unidad ${vsUnit}`);
});

test('las estadísticas pasadas a la batalla (nivel del edificio, investigaciones) se usan', () => {
  const stats = { soldier: { ...UNITS.soldier.combat, hp: 500, dmg: 77 } };
  const b = createBattle(mini(), army({ soldier: 2 }), [], stats);
  assert.ok(attackers(b).every((u) => u.maxHp === 500 && u.dmg === 77));
  const plain = createBattle(mini(), army({ soldier: 2 }), []);
  assert.ok(attackers(plain).every((u) => u.maxHp === UNITS.soldier.combat.hp));
});

/* ---------- héroes en la batalla ---------- */

const withHeroes = (heroes, m = mini({ defenders: [{ kind: 'brute', x: 12, y: 16 }, { kind: 'guard', x: 12.4, y: 16 }, { kind: 'guard', x: 11.6, y: 16 }] })) =>
  createBattle(m, army(), heroes);

test('dos héroes salen a pelear con su nombre, nivel y habilidad', () => {
  const b = withHeroes([{ key: 'paladin', level: 8 }, { key: 'pyromancer', level: 1 }]);
  const heroes = attackers(b).filter((u) => u.type === 'hero');
  assert.deepEqual(heroes.map((u) => u.heroKey), ['paladin', 'pyromancer']);
  assert.equal(heroes[0].ability.kind, 'shield');
  assert.equal(heroes[0].ability.rank, 1, 'el paladín de nivel 8 tiene el rango 2');
  assert.equal(heroes[1].ability.kind, 'fire');
  assert.ok(heroes[0].armor > 0, 'sus pasivas ya cuentan');
});

test('la bola de fuego daña en área, y se recarga', () => {
  const b = withHeroes([{ key: 'pyromancer', level: 1 }]);
  const hero = attackers(b)[0];
  const foes = defenderUnits(b);
  hero.x = 12;
  hero.y = 12.5; // a 3.5 casillas del grupo
  hero.ability.cd = 0;
  const before = foes.map((f) => f.hp);
  assert.equal(castHeroAbility(b, hero.id), true);
  const after = foes.map((f) => f.hp);
  assert.ok(after.every((hp, i) => hp < before[i]), 'todo el grupo recibió daño');
  assert.equal(castHeroAbility(b, hero.id), false, 'en recarga');
  assert.ok(abilityStatus(b, hero.id).cdLeft > 0);
  assert.equal(b.events.at(-1).type, 'cast');
  run(b, hero.ability.cdSec + 0.5);
  assert.ok(hero.ability.cd < hero.ability.cdSec, 'la cuenta de recarga avanza');
});

test('la lluvia de flechas de la cazadora golpea a los enemigos agrupados, no a los lejanos', () => {
  const b = withHeroes([{ key: 'ranger', level: 1 }]);
  const hero = attackers(b)[0];
  const [brute, g1, g2] = defenderUnits(b);
  g2.x = 3; // uno aparte
  g2.y = 16;
  hero.x = 12;
  hero.y = 12;
  hero.ability.cd = 0;
  const far = g2.hp;
  assert.equal(castHeroAbility(b, hero.id), true);
  assert.ok(brute.hp < brute.maxHp && g1.hp < g1.maxHp);
  assert.equal(g2.hp, far, 'el lejano no recibió daño');
});

test('la sanación cura a los aliados cercanos y solo hasta su vida máxima', () => {
  const b = withHeroes([{ key: 'priestess', level: 1 }, { key: 'paladin', level: 1 }]);
  const [priestess, paladin] = attackers(b);
  paladin.hp = 10;
  priestess.x = paladin.x;
  priestess.y = paladin.y;
  priestess.ability.cd = 0;
  assert.equal(castHeroAbility(b, priestess.id), true);
  assert.ok(paladin.hp > 10 && paladin.hp <= paladin.maxHp);
  priestess.ability.cd = 0;
  paladin.hp = paladin.maxHp - 5;
  castHeroAbility(b, priestess.id);
  assert.equal(paladin.hp, paladin.maxHp, 'no pasa del máximo');
});

test('el escudo sagrado reduce el daño que reciben los aliados cercanos mientras dura', () => {
  const b = withHeroes([{ key: 'paladin', level: 1 }, { key: 'ranger', level: 1 }]);
  const [paladin, ranger] = attackers(b);
  ranger.x = paladin.x + 1;
  ranger.y = paladin.y;
  paladin.ability.cd = 0;
  assert.equal(castHeroAbility(b, paladin.id), true);
  assert.ok(ranger.shieldUntil > b.time);
  const guard = defenderUnits(b).find((u) => u.type === 'guard');
  guard.x = ranger.x;
  guard.y = ranger.y - 0.5;
  guard.cd = 0;
  const before = ranger.hp;
  run(b, 0.15);
  const taken = before - ranger.hp;
  assert.ok(taken > 0 && taken <= guard.dmg * (1 - paladin.ability.power) + 0.01, `recibió ${taken} de ${guard.dmg}`);
});

test('el grito de guerra sube el daño de los aliados cercanos por un rato', () => {
  const b = withHeroes([{ key: 'warlord', level: 1 }, { key: 'paladin', level: 1 }]);
  const [warlord, paladin] = attackers(b);
  paladin.x = warlord.x + 1;
  paladin.y = warlord.y;
  warlord.ability.cd = 0;
  assert.equal(castHeroAbility(b, warlord.id), true);
  assert.ok(paladin.buffMul > 1 && paladin.buffUntil > b.time);
  run(b, warlord.ability.dur + 1);
  assert.ok(paladin.buffUntil <= b.time, 'el efecto termina');
});

test('una habilidad lanzada sola solo se usa cuando vale la pena (hay enemigos cerca)', () => {
  const b = withHeroes([{ key: 'pyromancer', level: 1 }]);
  const hero = attackers(b)[0];
  hero.x = 3;
  hero.y = 23; // muy lejos de todo
  hero.speed = 0; // y quieto
  run(b, 4);
  assert.equal(abilityStatus(b, hero.id).cdLeft, 0, 'sigue lista: no se gastó en el aire');
  assert.ok(b.events.every((e) => e.type !== 'cast'));
});

test('la regeneración de un héroe lo cura con el tiempo', () => {
  const b = withHeroes([{ key: 'priestess', level: 3 }]); // la primera pasiva da regeneración
  const hero = attackers(b)[0];
  assert.ok(hero.regen > 0);
  hero.hp = 20;
  hero.x = 3;
  hero.y = 23;
  run(b, 5);
  assert.ok(hero.hp > 20);
});

test('con héroes la batalla sigue siendo determinista', () => {
  const heroes = [{ key: 'paladin', level: 6 }, { key: 'pyromancer', level: 4 }];
  const m = mini({ defenders: [{ kind: 'brute', x: 12, y: 12 }, { kind: 'guard', x: 11, y: 12 }, { kind: 'guard', x: 13, y: 12 }] });
  const a = createBattle(m, army({ soldier: 4, archer: 3 }), heroes);
  const c = createBattle(m, army({ soldier: 4, archer: 3 }), heroes);
  for (let i = 0; i < 600; i++) advanceBattle(a, 0.1);
  for (let i = 0; i < 60; i++) advanceBattle(c, 1.0);
  assert.deepEqual(a.result, c.result);
  assert.deepEqual(attackers(a).map((u) => [u.id, Math.round(u.hp * 1000)]), attackers(c).map((u) => [u.id, Math.round(u.hp * 1000)]));
});
