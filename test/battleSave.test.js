import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceBattle, createBattle, orderMove, restoreBattle, snapshotBattle, unitIdsOfKinds } from '../src/game/battle.js';
import { MAX_BATTLE_AGE_MS, parsePending } from '../src/game/battleSave.js';
import { createNewState } from '../src/game/logic.js';
import { generateMission } from '../src/game/missions.js';
import { lockIsForeign } from '../src/game/store.js';

const T0 = 1_700_000_000_000;

function stateWith(army, cleared = 0) {
  const s = createNewState(T0);
  s.army = { ...s.army, ...army };
  s.campaign.cleared = cleared;
  return s;
}

function run(b, seconds) {
  for (let t = 0; t < seconds && !b.over; t += 0.1) advanceBattle(b, 0.1);
  return b;
}

const pack = (b, level = b.level, savedAt = T0) => JSON.stringify({ v: 1, savedAt, level, battle: snapshotBattle(b) });

test('una batalla guardada y retomada sigue exactamente igual que la original', () => {
  const a = createBattle(generateMission(3), { soldier: 8, archer: 4, mage: 2 }, [{ key: 'paladin', level: 3 }]);
  run(a, 25);
  assert.ok(!a.over, 'a los 25 s todavía se pelea');
  orderMove(a, unitIdsOfKinds(a, ['soldier']), 20, 20); // una orden del jugador también viaja en la copia
  const copy = restoreBattle(JSON.parse(JSON.stringify(snapshotBattle(a))));
  assert.equal(copy.byId.size, a.byId.size);
  assert.equal(copy.grid.size, a.grid.size);
  assert.deepEqual(copy.units.map((u) => u.order), a.units.map((u) => u.order));

  run(a, 90);
  run(copy, 90);
  assert.deepEqual(copy.result, a.result);
  assert.deepEqual(copy.units.map((u) => [u.id, u.alive, +u.x.toFixed(6), +u.y.toFixed(6), u.hp]), a.units.map((u) => [u.id, u.alive, +u.x.toFixed(6), +u.y.toFixed(6), u.hp]));
});

test('la copia no comparte nada con la original (seguir una no mueve la otra)', () => {
  const a = createBattle(generateMission(1), { soldier: 3 }, []);
  const snap = snapshotBattle(a);
  run(a, 30);
  const copy = restoreBattle(snap);
  assert.equal(copy.time, 0);
  assert.ok(a.time > 0);
});

test('parsePending acepta una batalla válida y rechaza lo que no sirve', () => {
  const a = createBattle(generateMission(2), { soldier: 5 }, []);
  run(a, 10);
  const s = stateWith({ soldier: 5 }, 1); // el nivel 2 es el siguiente a superar
  const ok = parsePending(pack(a), s, T0 + 60_000);
  assert.equal(ok.level, 2);
  assert.ok(ok.snapshot.units.length > 0);

  assert.equal(parsePending('{no es json', s, T0), null);
  assert.equal(parsePending(JSON.stringify({ v: 2, savedAt: T0, level: 2, battle: a }), s, T0), null, 'otra versión');
  assert.equal(parsePending(pack(a), stateWith({ soldier: 5 }, 0), T0), null, 'el nivel 2 aún no está abierto');
  assert.equal(parsePending(pack(a), stateWith({ soldier: 4 }, 1), T0), null, 'ya no tiene las tropas con que salió');
  assert.equal(parsePending(pack(a), s, T0 + MAX_BATTLE_AGE_MS + 1), null, 'demasiado vieja');
  assert.equal(parsePending(pack(a, 2, T0 + 10 * 60_000), s, T0), null, 'guardada en el futuro');

  const over = createBattle(generateMission(2), { soldier: 1 }, []);
  over.over = true;
  assert.equal(parsePending(pack(over), stateWith({ soldier: 5 }, 1), T0), null, 'una batalla terminada no se retoma');
  const raid = JSON.parse(pack(a));
  raid.battle.mode = 'raid';
  assert.equal(parsePending(JSON.stringify(raid), s, T0), null, 'solo los ataques tuyos');
  const broken = JSON.parse(pack(a));
  broken.battle.units[0].hp = 'mucha';
  assert.equal(parsePending(JSON.stringify(broken), s, T0), null);
  const noHall = JSON.parse(pack(a));
  noHall.battle.hallId = 9999;
  assert.equal(parsePending(JSON.stringify(noHall), s, T0), null);
  const outside = JSON.parse(pack(a));
  outside.battle.buildings[0].x = 80;
  assert.equal(parsePending(JSON.stringify(outside), s, T0), null);
});

test('la marca de pestaña: solo la de OTRA pestaña cuenta', () => {
  assert.equal(lockIsForeign(JSON.stringify({ id: 'abc', t: 1 }), 'abc'), false);
  assert.equal(lockIsForeign(JSON.stringify({ id: 'xyz', t: 1 }), 'abc'), true);
  assert.equal(lockIsForeign(null, 'abc'), false);
  assert.equal(lockIsForeign('basura', 'abc'), false);
  assert.equal(lockIsForeign(JSON.stringify({ t: 1 }), 'abc'), false);
});
