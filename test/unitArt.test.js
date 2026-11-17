import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_FRAMES, PORTRAIT_FRAME, SHEET, WALK_FRAMES, facing, unitFrame } from '../src/game/unitArt.js';

const total = SHEET.cols * 4;

test('hacia dónde mira en pantalla: x va abajo-derecha e y abajo-izquierda', () => {
  assert.deepEqual(facing(1, 0), { flipX: false, north: false }); // abajo-derecha
  assert.deepEqual(facing(0, 1), { flipX: true, north: false }); // abajo-izquierda
  assert.deepEqual(facing(0, -1), { flipX: false, north: true }); // arriba-derecha
  assert.deepEqual(facing(-1, 0), { flipX: true, north: true }); // arriba-izquierda
});

test('caminar usa las filas 0 y 1 y da la vuelta', () => {
  const seen = new Set();
  for (let t = 0; t < 1; t += 0.05) {
    const f = unitFrame('walk', 1, 0, t);
    assert.ok(f.frame >= 0 && f.frame < WALK_FRAMES);
    seen.add(f.frame);
  }
  assert.equal(seen.size, WALK_FRAMES, 'recorre todos los cuadros');
  assert.ok(unitFrame('walk', 0, -1, 0).frame >= SHEET.cols, 'hacia arriba usa la fila 1');
  assert.equal(unitFrame('walk', 1, 0, 1.0).frame, unitFrame('walk', 1, 0, 0).frame, 'es cíclico');
  assert.equal(unitFrame('walk', 1, 0, -0.1).frame >= 0, true, 'tolera tiempos negativos');
});

test('atacar usa la fila 2 (SE a la izquierda, NE a la derecha) y no se sale', () => {
  assert.equal(unitFrame('attack', 1, 0, 0).frame, 2 * SHEET.cols);
  assert.equal(unitFrame('attack', 1, 0, 1).frame, 2 * SHEET.cols + ATTACK_FRAMES - 1);
  assert.equal(unitFrame('attack', 0, -1, 0).frame, 2 * SHEET.cols + ATTACK_FRAMES);
  assert.equal(unitFrame('attack', 0, -1, 5).frame, 2 * SHEET.cols + 2 * ATTACK_FRAMES - 1, 'con t > 1 se queda en el último');
});

test('quieto y caído viven en la última fila', () => {
  assert.equal(unitFrame('idle', 1, 0).frame, PORTRAIT_FRAME);
  assert.equal(unitFrame('idle', 0, -1).frame, PORTRAIT_FRAME + 1);
  assert.equal(unitFrame('die', 1, 0).frame, PORTRAIT_FRAME + 2);
  assert.equal(unitFrame('die', 0, -1).frame, PORTRAIT_FRAME + 3);
});

test('ningún cuadro se sale de la hoja', () => {
  for (const anim of ['walk', 'attack', 'idle', 'die']) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
      for (const t of [0, 0.3, 0.99, 1, 7]) {
        const f = unitFrame(anim, dx, dy, t).frame;
        assert.ok(f >= 0 && f < total, `${anim} ${dx},${dy} t=${t}: ${f}`);
      }
    }
  }
});
