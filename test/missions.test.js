import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID } from '../src/data/config.js';
import { advanceBattle, createBattle } from '../src/game/battle.js';
import { garrisonSize, generateMission, missionName } from '../src/game/missions.js';
import { sizeOf } from '../src/game/logic.js';
import { findPath } from '../src/game/pathfinding.js';

const count = (m, type) => m.buildings.filter((b) => b.type === type).length;

test('la misma misión siempre sale igual, y niveles distintos salen distintos', () => {
  assert.deepEqual(generateMission(4), generateMission(4));
  assert.notDeepEqual(generateMission(4), generateMission(5));
});

test('cada misión tiene un Ayuntamiento, edificios dentro del mapa y sin pisarse entre sí', () => {
  for (let level = 1; level <= 25; level++) {
    const m = generateMission(level);
    assert.equal(count(m, 'hall'), 1, `nivel ${level}: un solo Ayuntamiento`);
    const seen = new Set();
    for (const b of m.buildings) {
      const { w, h } = sizeOf(b.type);
      assert.ok(b.x >= 0 && b.x + w <= GRID.cols && b.y >= 0 && b.y + h <= GRID.rows, `nivel ${level}: ${b.type} fuera del mapa`);
      for (let y = b.y; y < b.y + h; y++) {
        for (let x = b.x; x < b.x + w; x++) {
          const key = `${x},${y}`;
          assert.ok(!seen.has(key), `nivel ${level}: cuadro repetido ${key} (${b.type})`);
          seen.add(key);
        }
      }
    }
    for (const d of m.defenders) assert.ok(d.x >= 0 && d.x < GRID.cols && d.y >= 0 && d.y < GRID.rows);
  }
});

test('la dificultad crece con el nivel', () => {
  const m1 = generateMission(1);
  const m8 = generateMission(8);
  assert.ok(m8.hpScale > m1.hpScale && m8.dmgScale > m1.dmgScale);
  assert.ok(count(m8, 'tower') > count(m1, 'tower'));
  assert.ok(m8.defenders.length > m1.defenders.length);
  assert.ok(m8.buildings.length > m1.buildings.length);
  assert.equal(m1.hpScale, 1);
  assert.equal(m1.defenders.filter((d) => d.kind === 'brute').length, 0, 'sin brutos al principio');
  assert.ok(m8.defenders.some((d) => d.kind === 'brute'));
});

test('el anillo de muros tiene huecos al principio y es cerrado en niveles altos', () => {
  const gaps = (m) => {
    // El lado sur del anillo (y = 21): cada hueco son 2 cuadros seguidos sin muro.
    const wallXs = new Set(m.buildings.filter((b) => b.type === 'wall' && b.y === 21).map((b) => b.x));
    let g = 0;
    for (let x = 14; x <= 32; x++) if (!wallXs.has(x)) g++;
    return g / 2;
  };
  assert.equal(gaps(generateMission(1)), 2);
  assert.equal(gaps(generateMission(4)), 1);
  assert.equal(gaps(generateMission(7)), 0);
});

test('los niveles de entrada tienen un hueco por el que se llega al Ayuntamiento sin romper muros', () => {
  for (const level of [1, 2, 3]) {
    const m = generateMission(level);
    const cells = (list) => new Set(list.flatMap((b) => {
      const { w, h } = sizeOf(b.type);
      return Array.from({ length: w * h }, (_, i) => `${b.x + (i % w)},${b.y + Math.floor(i / w)}`);
    }));
    const solid = cells(m.buildings.filter((b) => b.type !== 'wall'));
    const walls = cells(m.buildings.filter((b) => b.type === 'wall'));
    const hall = m.buildings.find((b) => b.type === 'hall');
    const path = findPath({ x: 24, y: GRID.rows - 2 }, { x: hall.x + 3, y: hall.y + sizeOf('hall').h }, { // el cuadro justo debajo del Ayuntamiento
      maxNodes: 6000,
      blocked: (x, y) => solid.has(`${x},${y}`) || walls.has(`${x},${y}`),
    });
    assert.ok(path, `nivel ${level}: sin camino libre`);
  }
});

test('hay botín repartido y el Ayuntamiento es el que más guarda', () => {
  const m = generateMission(3);
  const lootOf = (b) => (b.loot.gold ?? 0) + (b.loot.wood ?? 0);
  const total = m.buildings.reduce((n, b) => n + lootOf(b), 0);
  assert.ok(total > 0);
  assert.equal(Math.max(...m.buildings.map(lootOf)), lootOf(m.buildings.find((b) => b.type === 'hall')));
});

test('equilibrio: con un ejército razonable la primera misión se gana y una alta se pierde', () => {
  const play = (level, army, heroLevel) => {
    const b = createBattle(generateMission(level), army, heroLevel ? { level: heroLevel } : null);
    for (let i = 0; i < 4000 && !b.over; i++) advanceBattle(b, 0.1);
    return b.result;
  };
  const first = play(1, { soldier: 8, mage: 0, knight: 0 }, 1);
  assert.equal(first.won, true, `nivel 1 con 8 soldados y héroe: ${JSON.stringify(first)}`);
  const hard = play(12, { soldier: 8, mage: 0, knight: 0 }, 1);
  assert.equal(hard.won, false, 'el nivel 12 no se gana con el mismo ejército');
  const strong = play(3, { soldier: 10, mage: 4, knight: 3 }, 3);
  assert.equal(strong.won, true, `nivel 3 con un ejército fuerte: ${JSON.stringify(strong)}`);
});

test('missionName', () => {
  assert.equal(missionName(3), 'Campaña 3');
});

test('la guarnición crece con el nivel cada vez más rápido y la generada coincide con garrisonSize', () => {
  let prev = 0;
  for (let l = 1; l <= 40; l++) {
    const n = garrisonSize(l);
    assert.ok(n >= prev, `nivel ${l}`);
    prev = n;
  }
  assert.equal(garrisonSize(1), 3);
  assert.ok(garrisonSize(30) > 6 * garrisonSize(10) / 2, 'en el 30 hay muchísimos más que en el 10');
  for (const l of [1, 5, 12, 25]) {
    const m = generateMission(l);
    assert.ok(Math.abs(m.defenders.length - garrisonSize(l)) <= 2, `nivel ${l}: ${m.defenders.length} vs ${garrisonSize(l)}`);
  }
  assert.ok(generateMission(8).defenders.some((d) => d.kind === 'spider'), 'arañas desde el nivel 8');
});

test('la guarnición tiene un tope y de ahí en adelante crece la dureza (campaña sin fin sin romper la simulación)', () => {
  assert.equal(garrisonSize(200), garrisonSize(60));
  assert.ok(garrisonSize(60) <= 200);
  const a = generateMission(40);
  const b = generateMission(80);
  assert.ok(b.hpScale > a.hpScale * 1.5 && b.dmgScale > a.dmgScale * 1.5);
  assert.ok(generateMission(100).defenders.length <= 250);
  for (const l of [31, 55, 100]) assert.ok(generateMission(l).buildings.every((e) => e.x >= 0 && e.y >= 0));
});
