import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState } from '../src/game/logic.js';
import { NODES_PER_MAP, NODE_POSITIONS, currentMap, firstLevelOfMap, isMapOpen, levelStatus, mapNodes, mapOfLevel, mapStars, starsOf, themeOf } from '../src/game/campaignMap.js';

const fresh = (cleared = 0, stars = {}) => {
  const s = createNewState(1);
  s.campaign = { cleared, stars };
  return s;
};

test('los niveles se agrupan de 10 en 10 en mapas', () => {
  assert.equal(NODE_POSITIONS.length, NODES_PER_MAP);
  assert.equal(mapOfLevel(1), 0);
  assert.equal(mapOfLevel(10), 0);
  assert.equal(mapOfLevel(11), 1);
  assert.equal(mapOfLevel(30), 2);
  assert.equal(firstLevelOfMap(2), 21);
});

test('el estado de cada punto: superado, el siguiente o bloqueado', () => {
  const s = fresh(3);
  assert.deepEqual([1, 3, 4, 5, 10].map((l) => levelStatus(s, l)), ['done', 'done', 'current', 'locked', 'locked']);
  const nodes = mapNodes(s, 0);
  assert.equal(nodes.length, 10);
  assert.equal(nodes[9].boss, true, 'el décimo es el jefe');
  assert.equal(nodes.filter((n) => n.status === 'done').length, 3);
});

test('las estrellas se guardan por nivel y se suman por mapa', () => {
  const s = fresh(4, { 1: 3, 2: 2, 3: 1 }); // el 4 no tiene dato: partida antigua, cuenta 1
  assert.equal(starsOf(s, 1), 3);
  assert.equal(starsOf(s, 4), 1);
  assert.equal(starsOf(s, 5), 0);
  assert.deepEqual(mapStars(s, 0), { got: 7, max: 30 });
});

test('al superar los 10 enemigos se abre el siguiente mapa', () => {
  assert.equal(currentMap(fresh(0)), 0);
  assert.equal(currentMap(fresh(9)), 0);
  assert.equal(currentMap(fresh(10)), 1, 'con los 10 vencidos el siguiente enemigo está en el mapa 2');
  assert.equal(isMapOpen(fresh(9), 1), false);
  assert.equal(isMapOpen(fresh(10), 1), true);
  assert.equal(isMapOpen(fresh(10), 2), false);
  assert.equal(isMapOpen(fresh(10), 0), true, 'los anteriores se pueden revisar');
  assert.equal(isMapOpen(fresh(10), -1), false);
});

test('cada mapa tiene su nombre; pasados los de la lista se repiten con número', () => {
  assert.notEqual(themeOf(0).name, themeOf(1).name);
  assert.match(themeOf(10).name, /2$/);
});

test('el décimo enemigo de cada mapa es un jefe más duro y con más botín', async () => {
  const { generateMission } = await import('../src/game/missions.js');
  const normal = generateMission(9);
  const boss = generateMission(10);
  assert.equal(boss.boss, true);
  assert.equal(normal.boss, false);
  assert.ok(boss.hpScale > generateMission(8).hpScale * 1.2);
  assert.ok(boss.defenders.length > normal.defenders.length);
  assert.ok(boss.buildings.find((b) => b.type === 'hall').loot.gold > normal.buildings.find((b) => b.type === 'hall').loot.gold);
  // La dificultad sube de un mapa a otro: el jefe del mapa 2 es más duro que el del mapa 1.
  assert.ok(generateMission(20).hpScale > boss.hpScale);
});
