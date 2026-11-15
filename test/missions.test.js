import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID } from '../src/data/config.js';
import { advanceBattle, createBattle } from '../src/game/battle.js';
import { generateMission, missionName } from '../src/game/missions.js';
import { findPath } from '../src/game/pathfinding.js';

const count = (m, type) => m.buildings.filter((b) => b.type === type).length;

test('la misma misión siempre sale igual, y niveles distintos salen distintos', () => {
  assert.deepEqual(generateMission(4), generateMission(4));
  assert.notDeepEqual(generateMission(4), generateMission(5));
});

test('cada misión tiene un Ayuntamiento, edificios dentro del mapa y sin repetir casilla', () => {
  for (let level = 1; level <= 25; level++) {
    const m = generateMission(level);
    assert.equal(count(m, 'hall'), 1, `nivel ${level}: un solo Ayuntamiento`);
    const seen = new Set();
    for (const b of m.buildings) {
      assert.ok(b.x >= 0 && b.x < GRID.cols && b.y >= 0 && b.y < GRID.rows, `nivel ${level}: ${b.type} fuera del mapa`);
      const key = `${b.x},${b.y}`;
      assert.ok(!seen.has(key), `nivel ${level}: casilla repetida ${key}`);
      seen.add(key);
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
    const wallXs = new Set(m.buildings.filter((b) => b.type === 'wall' && b.y === 10).map((b) => b.x));
    let g = 0;
    for (let x = 9; x <= 15; x++) if (!wallXs.has(x)) g++;
    return g;
  };
  assert.equal(gaps(generateMission(1)), 2);
  assert.equal(gaps(generateMission(4)), 1);
  assert.equal(gaps(generateMission(7)), 0);
});

test('los niveles de entrada tienen un hueco por el que se llega al Ayuntamiento sin romper muros', () => {
  for (const level of [1, 2, 3]) {
    const m = generateMission(level);
    const solid = new Set(m.buildings.filter((b) => b.type !== 'wall').map((b) => `${b.x},${b.y}`));
    const walls = new Set(m.buildings.filter((b) => b.type === 'wall').map((b) => `${b.x},${b.y}`));
    const hall = m.buildings.find((b) => b.type === 'hall');
    const path = findPath({ x: 12, y: GRID.rows - 2 }, { x: hall.x, y: hall.y }, {
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
