import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectorSprite, isWallLike, wallConnectors } from '../src/game/walls.js';

const w = (x, y, level = 1, type = 'wall') => ({ type, x, y, level });

test('un muro solo no tiene enlaces', () => {
  assert.deepEqual(wallConnectors([w(3, 3)]), []);
});

test('dos muros de al lado se unen con un enlace horizontal entre los dos', () => {
  const c = wallConnectors([w(3, 3), w(4, 3)]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { key: 'h:3,3', orient: 'h', x: 3.5, y: 3, level: 1 });
});

test('dos muros uno sobre otro se unen con un enlace vertical', () => {
  const c = wallConnectors([w(3, 3), w(3, 4)]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { key: 'v:3,3', orient: 'v', x: 3, y: 3.5, level: 1 });
});

test('las diagonales no se unen', () => {
  assert.deepEqual(wallConnectors([w(3, 3), w(4, 4)]), []);
});

test('una puerta se une con los muros que tiene al lado', () => {
  const c = wallConnectors([w(2, 5), w(3, 5, 1, 'gate'), w(4, 5)]);
  assert.deepEqual(c.map((e) => e.key).sort(), ['h:2,5', 'h:3,5']);
});

test('lo que no es muro ni puerta no se une', () => {
  assert.deepEqual(wallConnectors([w(3, 3), { type: 'tower', x: 4, y: 3, level: 1 }, { type: 'mine', x: 3, y: 4, level: 1 }]), []);
  assert.equal(isWallLike('wall'), true);
  assert.equal(isWallLike('gate'), true);
  assert.equal(isWallLike('tower'), false);
});

test('el enlace toma el menor de los dos niveles', () => {
  assert.equal(wallConnectors([w(3, 3, 5), w(4, 3, 2)])[0].level, 2);
  assert.equal(wallConnectors([w(3, 3, 3), w(3, 4, 1, 'gate')])[0].level, 1);
});

test('una hilera de N muros da N-1 enlaces, y un anillo cerrado tantos como casillas', () => {
  const row = Array.from({ length: 6 }, (_, i) => w(i, 0));
  assert.equal(wallConnectors(row).length, 5);

  const ring = [];
  for (let x = 0; x <= 3; x++) for (let y = 0; y <= 3; y++) if (x === 0 || y === 0 || x === 3 || y === 3) ring.push(w(x, y));
  assert.equal(ring.length, 12);
  assert.equal(wallConnectors(ring).length, 12, 'un anillo de 12 casillas tiene 12 uniones');
});

test('una T o una cruz une cada rama, sin repetir enlaces', () => {
  const cross = [w(5, 5), w(4, 5), w(6, 5), w(5, 4), w(5, 6)];
  const c = wallConnectors(cross);
  assert.equal(c.length, 4);
  assert.equal(new Set(c.map((e) => e.key)).size, 4);
});

test('el nivel se asume 1 si falta (por ejemplo en los muros enemigos)', () => {
  assert.equal(wallConnectors([{ type: 'wall', x: 1, y: 1 }, { type: 'wall', x: 2, y: 1 }])[0].level, 1);
});

test('el dibujo de enlace de los niveles 4 y 5 es el del 3', () => {
  assert.equal(connectorSprite('h', 1), 'wallh_1');
  assert.equal(connectorSprite('v', 3), 'wallv_3');
  assert.equal(connectorSprite('h', 5), 'wallh_3');
  assert.equal(connectorSprite('v', 0), 'wallv_1');
});
