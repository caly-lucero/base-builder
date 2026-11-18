import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMY_UNITS, BUILDINGS, UNITS } from '../src/data/config.js';
import {
  advanceBattle, attackers, castHeroAbility, abilityStatus, createBattle, createDuel, defenderUnits,
} from '../src/game/battle.js';

const army = (over = {}) => ({ soldier: 0, archer: 0, mage: 0, knight: 0, catapult: 0, ram: 0, ...over });

/** Misión mínima: un Ayuntamiento (7×7, centro en el cuadro 23, 13) y lo que se pida. Las posiciones son cuadros del mapa de 48×48. */
function mini({ buildings = [], defenders = [], hpScale = 1, dmgScale = 1 } = {}) {
  return { level: 1, hpScale, dmgScale, defenders, buildings: [{ type: 'hall', x: 20, y: 10, loot: { gold: 10, wood: 5 } }, ...buildings] };
}

/** Cambia de sitio un edificio ya creado (su rectángulo, su centro y el plano de cuadros). */
function moveHall(b, e, x, y) {
  for (const [k, v] of [...b.grid]) if (v === e) b.grid.delete(k);
  Object.assign(e, { x, y, cx: x + (e.w - 1) / 2, cy: y + (e.h - 1) / 2 });
  for (let cy = y; cy < y + e.h; cy++) for (let cx = x; cx < x + e.w; cx++) b.grid.set(cy * 48 + cx, e);
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
  assert.equal(matchup('archer', 'mage'), 'archer');
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
    t.x = 22;
    t.y = 24 + i * 0.8; // apretados
  });
  const mage = attackers(b)[0];
  mage.x = 16;
  mage.y = 24;
  run(b, 1.5);
  const hurt = targets.filter((t) => t.hp < t.maxHp).length;
  assert.ok(hurt >= 2, `${hurt} heridos: el área alcanzó a más de uno`);
});

test('las armas de asedio van a por los edificios, no a por las unidades', () => {
  const b = createBattle(mini({ buildings: [{ type: 'mine', x: 10, y: 16 }], defenders: [{ kind: 'guard', x: 16, y: 26 }] }), army({ catapult: 1 }), []);
  const cat = attackers(b)[0];
  run(b, 6);
  const guard = defenderUnits(b)[0];
  assert.equal(guard.hp, guard.maxHp, 'ignora al guardia mientras haya edificios');
  assert.ok(cat.x !== cat.home.x || cat.y !== cat.home.y, 'avanza');
});

test('un arma de asedio daña mucho a un edificio y casi nada a una unidad', () => {
  const dmgTo = (target) => {
    const b = createBattle(mini({ buildings: [{ type: 'mine', x: 24, y: 36 }], defenders: [{ kind: 'guard', x: 24.5, y: 36.5 }] }), army({ ram: 1 }), []);
    const ram = attackers(b)[0];
    ram.x = 24.5;
    ram.y = 38.5;
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

const withHeroes = (heroes, m = mini({ defenders: [{ kind: 'brute', x: 24, y: 32 }, { kind: 'guard', x: 24.8, y: 32 }, { kind: 'guard', x: 23.2, y: 32 }] })) =>
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
  hero.x = 24;
  hero.y = 25; // a 7 cuadros del grupo
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
  g2.x = 6; // uno aparte
  g2.y = 32;
  hero.x = 24;
  hero.y = 24;
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
  ranger.x = paladin.x + 2;
  ranger.y = paladin.y;
  paladin.ability.cd = 0;
  assert.equal(castHeroAbility(b, paladin.id), true);
  assert.ok(ranger.shieldUntil > b.time);
  const guard = defenderUnits(b).find((u) => u.type === 'guard');
  guard.x = ranger.x;
  guard.y = ranger.y - 1;
  guard.home = { x: guard.x, y: guard.y }; // sin volver a su puesto lejano
  guard.cd = 0;
  const before = ranger.hp;
  run(b, 0.15);
  const taken = before - ranger.hp;
  assert.ok(taken > 0 && taken <= guard.dmg * (1 - paladin.ability.power) + 0.01, `recibió ${taken} de ${guard.dmg}`);
});

test('el grito de guerra sube el daño de los aliados cercanos por un rato', () => {
  const b = withHeroes([{ key: 'warlord', level: 1 }, { key: 'paladin', level: 1 }]);
  const [warlord, paladin] = attackers(b);
  paladin.x = warlord.x + 2;
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
  hero.y = 46; // muy lejos de todo
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
  hero.y = 46;
  run(b, 5);
  assert.ok(hero.hp > 20);
});

test('con héroes la batalla sigue siendo determinista', () => {
  const heroes = [{ key: 'paladin', level: 6 }, { key: 'pyromancer', level: 4 }];
  const m = mini({ defenders: [{ kind: 'brute', x: 24, y: 24 }, { kind: 'guard', x: 22, y: 24 }, { kind: 'guard', x: 26, y: 24 }] });
  const a = createBattle(m, army({ soldier: 4, archer: 3 }), heroes);
  const c = createBattle(m, army({ soldier: 4, archer: 3 }), heroes);
  for (let i = 0; i < 600; i++) advanceBattle(a, 0.1);
  for (let i = 0; i < 60; i++) advanceBattle(c, 1.0);
  assert.deepEqual(a.result, c.result);
  assert.deepEqual(attackers(a).map((u) => [u.id, Math.round(u.hp * 1000)]), attackers(c).map((u) => [u.id, Math.round(u.hp * 1000)]));
});

/* ---------- estrellas y alarma de la guarnición ---------- */

import { retreat } from '../src/game/battle.js';

const miniBase = (extra = []) => mini({ buildings: extra, hpScale: 1 });
const killWhen = (b, types) => {
  for (const e of b.buildings) if (types.includes(e.type)) e.hp = 1;
};

test('destruir el Ayuntamiento da la 1.ª estrella pero la batalla sigue', () => {
  const b = createBattle(miniBase([{ type: 'mine', x: 8, y: 36 }, { type: 'sawmill', x: 40, y: 36 }, { type: 'storage', x: 8, y: 6 }]), army({ soldier: 3 }), []);
  b.buildings.forEach((e) => (e.hp = e.maxHp = e.type === 'hall' ? 1 : 100000)); // solo el Ayuntamiento es frágil
  const hall = b.buildings.find((e) => e.type === 'hall');
  moveHall(b, hall, 20, 36);
  run(b, 15);
  assert.equal(hall.alive, false, 'el Ayuntamiento cayó');
  assert.equal(b.over, false, 'pero la batalla no terminó');
  retreat(b);
  assert.equal(b.result.won, true, 'con el Ayuntamiento destruido es una victoria aunque te retires');
  assert.equal(b.result.stars, 1);
  assert.equal(b.result.percent, 25);
});

test('destruir la mitad de la base da la 2.ª estrella aunque el Ayuntamiento siga en pie', () => {
  const b = createBattle(miniBase([{ type: 'mine', x: 22, y: 36 }, { type: 'sawmill', x: 26, y: 36 }, { type: 'storage', x: 24, y: 40 }]), army({ soldier: 4 }), []);
  b.buildings.forEach((e) => (e.hp = e.maxHp = e.type === 'hall' ? 100000 : 1));
  run(b, 25);
  retreat(b);
  assert.equal(b.result.won, false, 'sin el Ayuntamiento no es una victoria');
  assert.ok(b.result.percent >= 50, `destruyó ${b.result.percent} %`);
  assert.equal(b.result.stars, b.result.percent >= 100 ? 3 : 1);
});

test('destruirlo todo da las 3 estrellas y termina la batalla', () => {
  const b = createBattle(miniBase([{ type: 'mine', x: 22, y: 36 }, { type: 'wall', x: 16, y: 38 }]), army({ soldier: 5 }), []);
  b.buildings.forEach((e) => (e.hp = e.maxHp = e.type === 'hall' ? 1 : 1));
  moveHall(b, b.buildings.find((e) => e.type === 'hall'), 20, 30);
  run(b, 60);
  assert.equal(b.over, true);
  assert.equal(b.result.percent, 100);
  assert.equal(b.result.stars, 3);
  assert.equal(b.result.won, true);
});

test('sin destruir nada no hay estrellas', () => {
  const b = createBattle(miniBase([{ type: 'mine', x: 10, y: 6 }]), army({ soldier: 1 }), []);
  retreat(b);
  assert.equal(b.result.stars, 0);
  assert.equal(b.result.won, false);
});

test('al atacar algo de la aldea, toda la guarnición se entera y acude desde más lejos', () => {
  const m = mini({ buildings: [{ type: 'mine', x: 24, y: 40 }], defenders: [{ kind: 'guard', x: 24, y: 26 }] });
  const quiet = createBattle(m, army({ soldier: 1 }), []);
  const guard = defenderUnits(quiet)[0];
  attackers(quiet)[0].x = 24;
  attackers(quiet)[0].y = 38;
  run(quiet, 0.3);
  assert.ok(quiet.alarm, 'el golpe a la mina dio la alarma');
  const startY = guard.y;
  run(quiet, 3);
  assert.ok(guard.y > startY + 2, `el guardia, a ${40 - 26} cuadros, acudió (${startY} → ${guard.y})`);

  // Sin alarma, el mismo guardia se queda en su puesto.
  const calm = createBattle(m, army({ soldier: 1 }), []);
  attackers(calm)[0].x = 6;
  attackers(calm)[0].y = 44;
  const g2 = defenderUnits(calm)[0];
  const y0 = g2.y;
  run(calm, 2);
  assert.equal(g2.y, y0);
  assert.ok(!calm.alarm);
});

test('las guarniciones tienen variedad: arqueros desde el nivel 3 y chamanes desde el 6', async () => {
  const { generateMission } = await import('../src/game/missions.js');
  const kinds = (lvl) => new Set(generateMission(lvl).defenders.map((d) => d.kind));
  assert.deepEqual([...kinds(1)], ['guard']);
  assert.ok(kinds(3).has('bowman'));
  assert.ok(!kinds(3).has('shaman'));
  assert.ok(kinds(8).has('shaman') && kinds(8).has('brute') && kinds(8).has('bowman'));
});
