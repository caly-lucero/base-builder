import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twistQuarterTurn, unitBucketSize, visualUnitGroups } from '../src/game/visualScale.js';

const unit = (id, x, y, extra = {}) => ({ id, x, y, side: 'a', type: 'soldier', alive: true, hp: 10, maxHp: 10, ...extra });

test('la escala visual se adapta a la cantidad y al zoom', () => {
  assert.equal(unitBucketSize(10, 0.5), 1);
  assert.equal(unitBucketSize(50, 0.5), 3);
  assert.equal(unitBucketSize(120, 0.5), 4);
  assert.equal(unitBucketSize(120, 1.1), 1);
});

test('agrupa tropas cercanas sin mezclar tipos, bandos ni héroes', () => {
  const units = [
    ...Array.from({ length: 20 }, (_, i) => unit(i + 1, 2 + (i % 2) * 0.2, 2 + (i % 3) * 0.2)),
    unit(30, 2.1, 2.1, { type: 'archer' }),
    unit(31, 2.1, 2.1, { side: 'd' }),
    unit(32, 2.1, 2.1, { type: 'hero', heroKey: 'paladin' }),
  ];
  const groups = visualUnitGroups(units, 0.5);
  assert.equal(groups.reduce((sum, g) => sum + g.count, 0), units.length);
  assert.equal(groups.filter((g) => g.count === 20).length, 1);
  assert.equal(groups.find((g) => g.key === 'hero:32').count, 1);
});

test('el giro táctil tolera el cruce entre π y −π', () => {
  assert.equal(twistQuarterTurn(0, 0.2), 0);
  assert.equal(twistQuarterTurn(0, 0.9), 1);
  assert.equal(twistQuarterTurn(0, -0.9), -1);
  assert.equal(twistQuarterTurn(Math.PI - 0.2, -Math.PI + 0.6), 1);
});
