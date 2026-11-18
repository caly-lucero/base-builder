import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY } from '../src/data/config.js';
import { claimDaily, dailyAvailable, dailyDay, dailyReward, dayNumber } from '../src/game/daily.js';
import { createNewState, resourceCap, townHall } from '../src/game/logic.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

function fresh() {
  const s = createNewState(at(2026, 5, 1));
  s.gold = 0;
  s.wood = 0;
  return s;
}

test('el día cambia a medianoche local, no cada 24 h', () => {
  assert.equal(dayNumber(at(2026, 5, 2, 0)) - dayNumber(at(2026, 5, 1, 23)), 1);
  assert.equal(dayNumber(at(2026, 5, 1, 0)), dayNumber(at(2026, 5, 1, 23)));
});

test('una partida nueva puede reclamar el día 1; no se reclama dos veces el mismo día', () => {
  const s = fresh();
  const now = at(2026, 5, 1);
  assert.equal(dailyAvailable(s, now), true);
  assert.equal(dailyDay(s, now), 1);
  const r = claimDaily(s, now);
  assert.equal(r.ok, true);
  assert.equal(r.day, 1);
  assert.deepEqual(r.reward, { gold: DAILY.base.gold, wood: DAILY.base.wood });
  assert.equal(s.gold, DAILY.base.gold);
  assert.equal(dailyAvailable(s, at(2026, 5, 1, 23)), false);
  assert.equal(claimDaily(s, at(2026, 5, 1, 23)).ok, false);
  assert.equal(s.gold, DAILY.base.gold, 'no se cobra otra vez');
});

test('días seguidos suben la racha, el 7 es el mejor y luego vuelve al 1; faltar un día la reinicia', () => {
  const s = fresh();
  s.gold = 0;
  const gold = [];
  for (let d = 0; d < 8; d++) {
    const now = at(2026, 5, 1 + d);
    s.gold = 0;
    const r = claimDaily(s, now);
    gold.push(r.reward.gold);
    assert.equal(r.day, (d % 7) + 1);
  }
  assert.ok(gold[6] > gold[5] && gold[5] > gold[0], 'cada día da más');
  assert.equal(gold[7], gold[0], 'tras el día 7 empieza otra vuelta');

  const t = fresh();
  claimDaily(t, at(2026, 6, 1));
  claimDaily(t, at(2026, 6, 2));
  assert.equal(t.daily.streak, 2);
  assert.equal(dailyDay(t, at(2026, 6, 4)), 1, 'faltó el 3: vuelve al día 1');
  assert.equal(claimDaily(t, at(2026, 6, 4)).day, 1);
});

test('el premio crece con el Ayuntamiento y no pasa del tope de recursos', () => {
  const s = fresh();
  const low = dailyReward(s, 3);
  townHall(s).level = 5;
  const high = dailyReward(s, 3);
  assert.ok(high.gold > low.gold * 2);
  s.gold = resourceCap(s) - 10;
  const r = claimDaily(s, at(2026, 5, 1));
  assert.equal(s.gold, resourceCap(s));
  assert.equal(r.reward.gold, 10);
  assert.ok(r.offered.gold > 10, 'se ofrecía más, pero no cabe');
});

test('si el reloj retrocede no se puede reclamar otra vez', () => {
  const s = fresh();
  claimDaily(s, at(2026, 5, 10));
  assert.equal(dailyAvailable(s, at(2026, 5, 3)), false);
  assert.equal(claimDaily(s, at(2026, 5, 3)).ok, false);
});
