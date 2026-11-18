import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, place, startUpgrade, townHall } from '../src/game/logic.js';
import { MAX_VISIBLE_WORKERS, REST_TIME, WORKER_SPEED, WORK_TIME, createWorker, plannedWorkers, stepWorker, symbolicWorkers, workerPosition } from '../src/game/workers.js';

const T0 = 1_700_000_000_000;
const HOME = { x: 0, y: 0 };
const SITE = { x: 3, y: 4 }; // a 5 casillas
const LEG = 5 / WORKER_SPEED; // segundos por tramo

function fresh() {
  const s = createNewState(T0);
  s.gold = 1000;
  s.wood = 1000;
  townHall(s).level = 3;
  return s;
}

const w0 = () => ({ phase: 'out', t: 0, wait: 0 });

test('solo se dibujan unos pocos aldeanos, alternando oro y madera y siempre los mismos', () => {
  const s = fresh();
  for (let i = 0; i < 3; i++) place(s, 'mine', i, 5, T0);
  for (let i = 0; i < 3; i++) place(s, 'sawmill', i, 8, T0);
  const planned = plannedWorkers(s);
  assert.equal(planned.length, 6);
  const shown = symbolicWorkers(planned);
  assert.equal(shown.length, MAX_VISIBLE_WORKERS);
  assert.deepEqual(shown.map((p) => p.resource), ['gold', 'wood', 'gold']);
  assert.deepEqual(shown.map((p) => p.buildingId), symbolicWorkers([...planned].reverse()).map((p) => p.buildingId), 'no depende del orden');
  place(s, 'mine', 5, 5, T0);
  assert.deepEqual(symbolicWorkers(plannedWorkers(s)).map((p) => p.buildingId), shown.map((p) => p.buildingId), 'construir más no cambia a quién se ve');
  assert.deepEqual(symbolicWorkers([]), []);
});

test('una partida nueva no tiene aldeanos; hay uno por cada edificio productor', () => {
  const s = fresh();
  assert.deepEqual(plannedWorkers(s), []);
  const mine = place(s, 'mine', 2, 2, T0).building;
  const saw = place(s, 'sawmill', 3, 2, T0).building;
  place(s, 'tower', 4, 2, T0); // no produce
  place(s, 'wall', 5, 2, T0); // no produce

  const planned = plannedWorkers(s);
  assert.equal(planned.length, 2);
  const hall = townHall(s);
  assert.deepEqual(planned.find((p) => p.buildingId === mine.id), {
    buildingId: mine.id, resource: 'gold', home: { x: hall.x, y: hall.y }, site: { x: 2, y: 2 },
  });
  assert.equal(planned.find((p) => p.buildingId === saw.id).resource, 'wood');
});

test('un edificio en obras no tiene aldeano', () => {
  const s = fresh();
  const mine = place(s, 'mine', 2, 2, T0).building;
  assert.equal(plannedWorkers(s).length, 1);
  startUpgrade(s, mine.id, T0);
  assert.equal(plannedWorkers(s).length, 0);
});

test('sin Ayuntamiento no hay a dónde llevar nada', () => {
  const s = fresh();
  place(s, 'mine', 2, 2, T0);
  s.buildings = s.buildings.filter((b) => b.type !== 'townhall');
  assert.deepEqual(plannedWorkers(s), []);
});

test('un aldeano camina del Ayuntamiento al edificio a la velocidad esperada', () => {
  const w = w0();
  stepWorker(w, LEG / 2, HOME, SITE);
  assert.equal(w.phase, 'out');
  const p = workerPosition(w, HOME, SITE);
  assert.ok(Math.abs(p.x - 1.5) < 1e-9 && Math.abs(p.y - 2) < 1e-9, 'a mitad de camino');
  assert.deepEqual([p.carrying, p.moving], [false, true]);

  stepWorker(w, LEG / 2 + 0.001, HOME, SITE);
  assert.equal(w.phase, 'work', 'llegó y se pone a trabajar');
  assert.deepEqual(workerPosition(w, HOME, SITE), { x: 3, y: 4, carrying: false, moving: false });
});

test('al volver lleva la carga, y luego descansa en el Ayuntamiento', () => {
  const w = w0();
  stepWorker(w, LEG + WORK_TIME + LEG / 2, HOME, SITE);
  assert.equal(w.phase, 'back');
  const p = workerPosition(w, HOME, SITE);
  assert.ok(Math.abs(p.x - 1.5) < 1e-9 && Math.abs(p.y - 2) < 1e-9);
  assert.deepEqual([p.carrying, p.moving], [true, true]);

  stepWorker(w, LEG / 2 + 0.001, HOME, SITE);
  assert.equal(w.phase, 'rest');
  assert.deepEqual(workerPosition(w, HOME, SITE), { x: 0, y: 0, carrying: false, moving: false });
});

test('un ciclo completo dura ida + trabajo + vuelta + descanso y vuelve al inicio', () => {
  const w = w0();
  stepWorker(w, 2 * LEG + WORK_TIME + REST_TIME + 1e-6, HOME, SITE);
  assert.equal(w.phase, 'out');
  assert.ok(w.t < 1e-3);
});

test('un paso grande da lo mismo que muchos pasos chicos (tab oculta y vuelta)', () => {
  const big = w0();
  const small = w0();
  const total = 37.3;
  stepWorker(big, total, HOME, SITE);
  for (let i = 0; i < 3730; i++) stepWorker(small, 0.01, HOME, SITE);
  assert.equal(big.phase, small.phase);
  const a = workerPosition(big, HOME, SITE);
  const b = workerPosition(small, HOME, SITE);
  assert.ok(Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05);
});

test('si el edificio estuviera en la misma casilla que el Ayuntamiento no se rompe', () => {
  const w = w0();
  stepWorker(w, 5, { x: 2, y: 2 }, { x: 2, y: 2 });
  const p = workerPosition(w, { x: 2, y: 2 }, { x: 2, y: 2 });
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('los aldeanos de edificios distintos arrancan desfasados', () => {
  assert.notDeepEqual(createWorker(1), createWorker(2));
  for (const id of [1, 2, 7, 100]) {
    const w = createWorker(id);
    assert.ok(w.t >= 0 && w.t < 1);
    assert.equal(w.phase, 'out');
  }
});
