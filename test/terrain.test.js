import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRID } from '../src/data/config.js';
import { grassLook, isOutside, valueNoise } from '../src/game/terrain.js';

test('el ruido es determinista y queda en [0, 1]', () => {
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37;
    const y = i * 0.91;
    const v = valueNoise(x, y, 5, 3);
    assert.ok(v >= 0 && v <= 1, `fuera de rango: ${v}`);
    assert.equal(v, valueNoise(x, y, 5, 3));
  }
});

test('el ruido es suave: casillas vecinas se parecen', () => {
  for (let i = 0; i < 100; i++) {
    const a = valueNoise(i, 4, 7, 1);
    const b = valueNoise(i + 0.1, 4, 7, 1);
    assert.ok(Math.abs(a - b) < 0.1);
  }
});

test('cada casilla del mapa sale siempre igual y con un tinte claro (nunca negro)', () => {
  const seen = new Set();
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      const a = grassLook(x, y);
      assert.deepEqual(a, grassLook(x, y));
      assert.ok(['grass_a', 'grass_b'].includes(a.key));
      const r = (a.tint >> 16) & 255;
      const g = (a.tint >> 8) & 255;
      const b = a.tint & 255;
      assert.ok(g > 170, `tinte demasiado oscuro en ${x},${y}`);
      assert.ok(r <= 255 && b <= 255);
      seen.add(a.tint);
    }
  }
  assert.ok(seen.size > 100, 'debe haber variación de color');
});

test('isOutside distingue el borde del mapa', () => {
  assert.equal(isOutside(0, 0), false);
  assert.equal(isOutside(GRID.cols - 1, GRID.rows - 1), false);
  assert.equal(isOutside(-1, 3), true);
  assert.equal(isOutside(3, GRID.rows), true);
});
