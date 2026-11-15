import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY, UNITS } from '../src/data/config.js';
import {
  TOWN_HALL_CELL,
  armyCount,
  busyBuilders,
  buildingAt,
  collect,
  collectAll,
  countOf,
  createNewState,
  demolish,
  displayName,
  findFreeCell,
  formatCost,
  formatDuration,
  investedCost,
  limitFor,
  moveBuilding,
  place,
  placementError,
  resourceCap,
  startTraining,
  startUpgrade,
  supplyCap,
  supplyUsed,
  tickAll,
  townHall,
  trainableUnits,
} from '../src/game/logic.js';

const T0 = 1_700_000_000_000;
const MINE = BUILDINGS.mine.levels;
const SAWMILL = BUILDINGS.sawmill.levels;
const STORAGE = BUILDINGS.storage.levels;
const TH = BUILDINGS.townhall.levels;

/** Partida con recursos a medida y el Ayuntamiento en el nivel que se pida. */
function fresh(gold = 1000, wood = 1000, thLevel = 3) {
  const s = createNewState(T0);
  s.gold = gold;
  s.wood = wood;
  townHall(s).level = thLevel;
  return s;
}

/* ---------- partida nueva ---------- */

test('una partida nueva trae el Ayuntamiento en el centro y los recursos iniciales', () => {
  const s = createNewState(T0);
  assert.equal(s.buildings.length, 1);
  const th = s.buildings[0];
  assert.equal(th.type, 'townhall');
  assert.equal(th.level, 1);
  assert.deepEqual({ x: th.x, y: th.y }, TOWN_HALL_CELL);
  assert.equal(s.gold, ECONOMY.start.gold);
  assert.equal(s.wood, ECONOMY.start.wood);
  assert.equal(s.nextId, 2);
});

/* ---------- construir ---------- */

test('construir cobra oro y madera, deja el edificio en nivel 1 y ocupa la casilla', () => {
  const s = fresh(1000, 1000, 1);
  const r = place(s, 'storage', 3, 4, T0);
  assert.equal(r.ok, true);
  assert.equal(r.building.level, 1);
  assert.equal(r.building.upgradeEndsAt, null);
  assert.equal(s.gold, 1000 - BUILDINGS.storage.cost.gold);
  assert.equal(s.wood, 1000 - BUILDINGS.storage.cost.wood);
  assert.equal(place(s, 'mine', 3, 4, T0).reason, 'Casilla ocupada');
});

test('no se construye sin el recurso que falta, fuera del mapa, ni con tipos raros', () => {
  const poorGold = fresh(10, 1000, 1);
  assert.equal(place(poorGold, 'mine', 0, 0, T0).reason, 'Oro insuficiente');
  const poorWood = fresh(1000, 5, 1);
  assert.equal(place(poorWood, 'storage', 0, 0, T0).reason, 'Madera insuficiente');

  const s = fresh();
  assert.equal(place(s, 'mine', 99, 0, T0).reason, 'Fuera del mapa');
  assert.equal(place(s, 'constructor', 0, 0, T0).reason, 'Edificio desconocido');
  assert.equal(place(s, '__proto__', 0, 0, T0).reason, 'Edificio desconocido');
  assert.equal(place(s, 'townhall', 0, 0, T0).reason, 'Ese edificio no se puede construir');
  assert.equal(place(s, 'mine', TOWN_HALL_CELL.x, TOWN_HALL_CELL.y, T0).reason, 'Casilla ocupada');
});

test('placementError explica por qué no se puede construir y no modifica el estado', () => {
  const s = fresh(1000, 1000, 1);
  const before = JSON.stringify(s);
  assert.equal(placementError(s, 'mine', 0, 0), null);
  assert.equal(placementError(s, 'mine', TOWN_HALL_CELL.x, TOWN_HALL_CELL.y), 'Casilla ocupada');
  assert.equal(placementError(s, 'mine', -1, 0), 'Fuera del mapa');
  assert.equal(placementError(s, 'townhall', 0, 0), 'Ese edificio no se puede construir');
  s.gold = 0;
  assert.equal(placementError(s, 'mine', 0, 0), 'Oro insuficiente');
  s.gold = 1000;
  assert.equal(JSON.stringify(s), before, 'sin efectos secundarios');
});

test('el nivel del Ayuntamiento limita cuántos edificios de cada tipo se pueden tener', () => {
  const s = fresh(5000, 5000, 1);
  assert.equal(limitFor(s, 'mine'), TH[0].limits.mine);
  for (let i = 0; i < TH[0].limits.mine; i++) assert.equal(place(s, 'mine', i, 0, T0).ok, true);
  const blocked = place(s, 'mine', 9, 0, T0);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /Límite de Mina de oro: 3/);

  townHall(s).level = 2; // al subir el Ayuntamiento se permiten más
  assert.equal(place(s, 'mine', 9, 0, T0).ok, true);
  assert.equal(countOf(s, 'mine'), TH[0].limits.mine + 1);
});

test('los muros tienen su propio límite y cuestan solo madera', () => {
  const s = fresh(0, 10_000, 1);
  for (let i = 0; i < TH[0].limits.wall; i++) assert.equal(place(s, 'wall', i, 1, T0).ok, true, `muro ${i}`);
  assert.match(place(s, 'wall', 0, 2, T0).reason, /Límite de Muro/);
  assert.equal(s.gold, 0, 'no gastó oro');
  assert.equal(s.wood, 10_000 - BUILDINGS.wall.cost.wood * TH[0].limits.wall);
});

/* ---------- producción y recolección ---------- */

test('la mina produce oro y el aserradero madera, cada uno con su capacidad', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0, 0, T0).building;
  const saw = place(s, 'sawmill', 1, 0, T0).building;

  const gained = tickAll(s, T0 + 10_000);
  assert.equal(mine.stored, 5); // 0.5 oro/s * 10 s
  assert.ok(Math.abs(saw.stored - 4) < 1e-9); // 0.4 madera/s * 10 s
  assert.equal(gained.gold, 5);
  assert.ok(Math.abs(gained.wood - 4) < 1e-9);

  tickAll(s, T0 + 10_000 + ECONOMY.maxOfflineMs);
  assert.equal(mine.stored, MINE[0].capacity);
  assert.equal(saw.stored, SAWMILL[0].capacity);
});

test('el Ayuntamiento, el almacén y la torre no producen nada', () => {
  const s = fresh();
  const tower = place(s, 'tower', 0, 0, T0).building;
  const gained = tickAll(s, T0 + 60_000);
  assert.deepEqual(gained, { gold: 0, wood: 0 });
  assert.equal(tower.stored, 0);
});

test('si el reloj retrocede no se genera ni se pierde nada', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0, 0, T0).building;
  tickAll(s, T0 + 10_000);
  const gained = tickAll(s, T0); // reloj hacia atrás
  assert.equal(gained.gold, 0);
  assert.equal(mine.stored, 5);
  assert.equal(mine.lastTick, T0);
});

test('recolectar manda cada recurso a su reserva y respeta el tope', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0, 0, T0).building;
  const saw = place(s, 'sawmill', 1, 0, T0).building;
  mine.stored = 100;
  saw.stored = 50;
  s.gold = resourceCap(s) - 30; // caben 30 de oro
  s.wood = 100;

  const g = collect(s, mine);
  assert.deepEqual([g.resource, g.amount], ['gold', 30]);
  assert.equal(s.gold, resourceCap(s));
  assert.equal(mine.stored, 70);
  assert.equal(collect(s, mine).reason, 'Almacén lleno');

  const w = collect(s, saw);
  assert.deepEqual([w.resource, w.amount], ['wood', 50]);
  assert.equal(s.wood, 150);
  assert.equal(collect(s, saw).reason, 'Aún no hay nada');
  assert.equal(collect(s, townHall(s)).reason, 'Este edificio no produce');
});

test('collectAll suma oro y madera por separado', () => {
  const s = fresh(1000, 1000, 3);
  const a = place(s, 'mine', 0, 0, T0).building;
  const b = place(s, 'mine', 1, 0, T0).building;
  const c = place(s, 'sawmill', 2, 0, T0).building;
  s.gold = 100;
  s.wood = 100;
  a.stored = 10;
  b.stored = 20;
  c.stored = 7;
  const r = collectAll(s);
  assert.deepEqual([r.ok, r.gold, r.wood], [true, 30, 7]);
  assert.equal(collectAll(s).reason, 'No hay nada para recolectar');
});

test('el almacén sube el tope de oro y de madera, y no se demuele si algo no cabría', () => {
  const s = fresh(1000, 1000, 1);
  const { building } = place(s, 'storage', 0, 0, T0);
  assert.equal(resourceCap(s), ECONOMY.baseCap + STORAGE[0].capBonus);

  s.gold = ECONOMY.baseCap + 100;
  s.wood = 10;
  assert.equal(demolish(s, building.id).ok, false, 'el oro no cabría');
  s.gold = 10;
  s.wood = ECONOMY.baseCap + 100;
  assert.equal(demolish(s, building.id).ok, false, 'la madera no cabría');

  s.gold = 100;
  s.wood = 100;
  assert.equal(demolish(s, building.id).ok, true);
  assert.equal(s.gold, 100 + Math.floor(BUILDINGS.storage.cost.gold * ECONOMY.refundRate));
  assert.equal(s.wood, 100 + Math.floor(BUILDINGS.storage.cost.wood * ECONOMY.refundRate));
});

/* ---------- mejoras ---------- */

test('iniciar una mejora cobra sus costos y fija cuándo termina', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0, 0, T0);
  const gold = s.gold;
  const wood = s.wood;
  const r = startUpgrade(s, building.id, T0);
  assert.equal(r.ok, true);
  assert.equal(s.gold, gold - MINE[1].upgradeCost.gold);
  assert.equal(s.wood, wood, 'esta mejora no cuesta madera');
  assert.equal(building.upgradeEndsAt, T0 + MINE[1].upgradeSec * 1000);
  assert.equal(building.level, 1); // sube al terminar, no al empezar
});

test('una mejora que pide madera la cobra, y sin ella no empieza', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'tower', 0, 0, T0);
  s.wood = 10;
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Madera insuficiente');
  s.wood = 1000;
  assert.equal(startUpgrade(s, building.id, T0).ok, true);
  assert.equal(s.wood, 1000 - BUILDINGS.tower.levels[1].upgradeCost.wood);
});

test('un edificio no puede pasar del nivel del Ayuntamiento; subir el Ayuntamiento lo permite', () => {
  const s = fresh(5000, 5000, 1);
  const mine = place(s, 'mine', 0, 0, T0).building;
  assert.equal(startUpgrade(s, mine.id, T0).reason, 'Mejora antes el Ayuntamiento');

  const th = townHall(s);
  assert.equal(startUpgrade(s, th.id, T0).ok, true, 'el Ayuntamiento sí puede mejorar');
  assert.equal(th.upgradeEndsAt, T0 + TH[1].upgradeSec * 1000);
  tickAll(s, T0 + TH[1].upgradeSec * 1000);
  assert.equal(th.level, 2);
  assert.equal(limitFor(s, 'mine'), TH[1].limits.mine);

  assert.equal(startUpgrade(s, mine.id, T0 + 200_000).ok, true);
});

test('durante la mejora no produce; al terminar sube de nivel, avisa y produce con las nuevas estadísticas', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  const endsAt = building.upgradeEndsAt;

  const events = [];
  tickAll(s, endsAt - 1000, events);
  assert.equal(building.stored, 0, 'en obras no produce');
  assert.equal(events.length, 0);

  tickAll(s, endsAt + 10_000, events); // 10 s después de terminar
  assert.equal(building.level, 2);
  assert.equal(building.upgradeEndsAt, null);
  assert.deepEqual(events, [{ type: 'upgraded', id: building.id, building: 'mine', level: 2 }]);
  assert.ok(Math.abs(building.stored - MINE[1].ratePerSec * 10) < 1e-9, 'produce con la tasa del nivel 2 desde que terminó');
});

test('una mejora que terminó mientras no jugabas se completa al volver', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'storage', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  assert.equal(resourceCap(s), ECONOMY.baseCap + STORAGE[0].capBonus, 'mientras mejora conserva el nivel anterior');
  tickAll(s, T0 + 3 * 60 * 60 * 1000); // 3 h después
  assert.equal(building.level, 2);
  assert.equal(resourceCap(s), ECONOMY.baseCap + STORAGE[1].capBonus);
});

test('la producción acumulada antes de empezar la mejora no se pierde', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0 + 10_000);
  assert.equal(building.stored, 5);
});

test('solo hay tantas mejoras simultáneas como obreros (el Ayuntamiento también usa uno)', () => {
  const s = fresh(5000, 5000, 2); // Ayuntamiento nivel 2: puede mejorar a 3 y los demás a 2
  const ids = [0, 1, 2].map((x) => place(s, 'mine', x, 0, T0).building.id);
  assert.equal(startUpgrade(s, ids[0], T0).ok, true);
  assert.equal(startUpgrade(s, ids[1], T0).ok, true);
  assert.equal(busyBuilders(s), ECONOMY.builders);
  assert.equal(startUpgrade(s, ids[2], T0).reason, 'Todos los obreros están ocupados');
  assert.equal(startUpgrade(s, townHall(s).id, T0).reason, 'Todos los obreros están ocupados');
  tickAll(s, T0 + 10 * 60 * 1000); // terminan las dos
  assert.equal(busyBuilders(s), 0);
  assert.equal(startUpgrade(s, ids[2], T0 + 10 * 60 * 1000).ok, true);
});

test('mejorar valida recursos, nivel máximo, mejora repetida y existencia', () => {
  const s = fresh(1000, 1000, 5);
  const { building } = place(s, 'mine', 0, 0, T0);
  assert.equal(startUpgrade(s, 999, T0).reason, 'No existe ese edificio');

  s.gold = 10;
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Oro insuficiente');

  s.gold = 1000;
  startUpgrade(s, building.id, T0);
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Ya se está mejorando');

  // Sube hasta el máximo (nivel 5), pagando cada mejora y esperando a que termine.
  let now = T0;
  for (let level = 1; level < 5; level++) {
    s.gold = 100_000;
    s.wood = 100_000;
    now += 3 * 60 * 60 * 1000;
    tickAll(s, now); // termina la mejora en curso
    if (building.level === level) assert.equal(startUpgrade(s, building.id, now).ok, true, `mejora al nivel ${level + 1}`);
  }
  now += 3 * 60 * 60 * 1000;
  tickAll(s, now);
  assert.equal(building.level, 5);
  assert.equal(startUpgrade(s, building.id, now).reason, 'Ya está al nivel máximo');
});

test('los niveles 4 y 5 son «élite»: más fuertes, con el dibujo del nivel 3 teñido', () => {
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (type === 'altar') continue; // el altar tiene un solo nivel: el héroe sube por experiencia
    assert.equal(def.levels.length, 5, `${type} tiene 5 niveles`);
    assert.ok(def.levels[3].tint && def.levels[4].tint, `${type}: los niveles 4 y 5 llevan tinte`);
    assert.equal(def.levels[3].sprite, def.levels[2].sprite, `${type}: el nivel 4 reutiliza el dibujo del 3`);
    assert.equal(def.levels[0].tint, undefined);
  }
  // Producción y capacidad crecen en cada nivel.
  for (const type of ['mine', 'sawmill']) {
    const lv = BUILDINGS[type].levels;
    for (let i = 1; i < 5; i++) assert.ok(lv[i].ratePerSec > lv[i - 1].ratePerSec && lv[i].capacity > lv[i - 1].capacity, `${type} nivel ${i + 1}`);
  }
  assert.ok(BUILDINGS.storage.levels[4].capBonus > BUILDINGS.storage.levels[3].capBonus);
  assert.ok(BUILDINGS.farm.levels[4].supply > BUILDINGS.farm.levels[3].supply);
  // Y el Ayuntamiento nuevo permite más de todo.
  const th = BUILDINGS.townhall.levels;
  for (let i = 1; i < 5; i++) {
    assert.ok(th[i].baseSupply > th[i - 1].baseSupply);
    for (const [type, n] of Object.entries(th[i - 1].limits)) assert.ok(th[i].limits[type] >= n, `${type} en el nivel ${i + 1}`);
  }
});

test('un cuartel de nivel alto entrena más rápido', () => {
  const s = fresh(5000, 5000, 5);
  const b = place(s, 'barracks', 0, 0, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  const normal = b.training.endsAt - T0;
  tickAll(s, T0 + 60_000);
  b.level = 5;
  startTraining(s, b.id, 'soldier', T0 + 60_000);
  const fast = b.training.endsAt - (T0 + 60_000);
  assert.equal(normal, UNITS.soldier.trainSec * 1000);
  assert.equal(fast, Math.round(UNITS.soldier.trainSec * 1000 * BUILDINGS.barracks.levels[4].trainFactor));
  assert.ok(fast < normal);
});

test('un reloj o guardado manipulado no puede dejar una mejora más lejos que su duración', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  building.upgradeEndsAt = T0 + 1e12; // alguien lo editó a un futuro lejano
  tickAll(s, T0 + 5_000);
  assert.equal(building.upgradeEndsAt, T0 + 5_000 + MINE[1].upgradeSec * 1000);
});

/* ---------- demoler y mover ---------- */

test('no se puede demoler en plena mejora ni el Ayuntamiento; el reembolso incluye lo invertido', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  assert.equal(demolish(s, building.id).reason, 'Espera a que termine la mejora');
  assert.equal(demolish(s, townHall(s).id).reason, 'El Ayuntamiento no se puede demoler');

  tickAll(s, T0 + 60_000); // nivel 2
  assert.deepEqual(investedCost(building), { gold: BUILDINGS.mine.cost.gold + MINE[1].upgradeCost.gold, wood: 0 });
  s.gold = 0;
  demolish(s, building.id);
  assert.equal(s.gold, Math.floor((BUILDINGS.mine.cost.gold + MINE[1].upgradeCost.gold) * ECONOMY.refundRate));
});

test('mover un edificio lo cambia de casilla sin perder nivel ni producción', () => {
  const s = fresh(1000, 1000, 3);
  const mine = place(s, 'mine', 2, 2, T0).building;
  mine.stored = 42;
  mine.level = 2;

  assert.equal(moveBuilding(s, mine.id, 5, 6).ok, true);
  assert.deepEqual([mine.x, mine.y, mine.stored, mine.level], [5, 6, 42, 2]);
  assert.equal(buildingAt(s, 2, 2), null);
  assert.equal(buildingAt(s, 5, 6), mine);
});

test('mover valida casilla ocupada, fuera del mapa, misma casilla y existencia', () => {
  const s = fresh(1000, 1000, 3);
  const a = place(s, 'mine', 2, 2, T0).building;
  place(s, 'mine', 3, 2, T0);
  assert.equal(moveBuilding(s, a.id, 3, 2).reason, 'Casilla ocupada');
  assert.equal(moveBuilding(s, a.id, -1, 2).reason, 'Fuera del mapa');
  assert.equal(moveBuilding(s, a.id, 99, 2).reason, 'Fuera del mapa');
  assert.equal(moveBuilding(s, a.id, 2, 2).reason, 'Ya está ahí');
  assert.equal(moveBuilding(s, 999, 4, 4).reason, 'No existe ese edificio');
  assert.deepEqual([a.x, a.y], [2, 2], 'no se movió');
});

test('el Ayuntamiento se puede mover', () => {
  const s = fresh();
  assert.equal(moveBuilding(s, townHall(s).id, 3, 3).ok, true);
});

/* ---------- población y entrenamiento ---------- */

const FARM = BUILDINGS.farm.levels;
const TH1_SUPPLY = TH[0].baseSupply;

test('la población máxima suma la del Ayuntamiento y la de cada granja', () => {
  const s = fresh(5000, 5000, 1);
  assert.equal(supplyCap(s), TH1_SUPPLY);
  const farm = place(s, 'farm', 0, 0, T0).building;
  assert.equal(supplyCap(s), TH1_SUPPLY + FARM[0].supply);
  farm.level = 2;
  assert.equal(supplyCap(s), TH1_SUPPLY + FARM[1].supply);
  townHall(s).level = 2;
  assert.equal(supplyCap(s), TH[1].baseSupply + FARM[1].supply);
});

test('entrenar cobra, reserva población y la unidad llega al terminar', () => {
  const s = fresh(1000, 1000, 1);
  const barracks = place(s, 'barracks', 0, 0, T0).building;
  const gold = s.gold;
  const wood = s.wood;

  const r = startTraining(s, barracks.id, 'soldier', T0);
  assert.equal(r.ok, true);
  assert.equal(s.gold, gold - UNITS.soldier.cost.gold);
  assert.equal(s.wood, wood - UNITS.soldier.cost.wood);
  assert.equal(supplyUsed(s), UNITS.soldier.supply, 'la población se reserva desde el inicio');
  assert.equal(s.army.soldier, 0, 'todavía no existe');

  const events = [];
  tickAll(s, T0 + UNITS.soldier.trainSec * 1000 - 1000, events);
  assert.equal(s.army.soldier, 0);
  tickAll(s, T0 + UNITS.soldier.trainSec * 1000, events);
  assert.equal(s.army.soldier, 1);
  assert.equal(barracks.training, null);
  assert.deepEqual(events, [{ type: 'trained', id: barracks.id, unit: 'soldier' }]);
  assert.equal(supplyUsed(s), UNITS.soldier.supply, 'ahora cuenta como ejército, no se cobra dos veces');
  assert.equal(armyCount(s), 1);
});

test('un cuartel entrena de a uno: no acepta otra orden hasta terminar', () => {
  const s = fresh(1000, 1000, 1);
  const b = place(s, 'barracks', 0, 0, T0).building;
  assert.equal(startTraining(s, b.id, 'soldier', T0).ok, true);
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Ya está entrenando');
  tickAll(s, T0 + 60_000);
  assert.equal(startTraining(s, b.id, 'soldier', T0 + 60_000).ok, true);
});

test('el entrenamiento sigue mientras no juegas', () => {
  const s = fresh(1000, 1000, 1);
  const b = place(s, 'barracks', 0, 0, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  tickAll(s, T0 + 3 * 60 * 60 * 1000); // 3 horas después
  assert.equal(s.army.soldier, 1);
});

test('las unidades avanzadas piden nivel de cuartel', () => {
  const s = fresh(5000, 5000, 3);
  const b = place(s, 'barracks', 0, 0, T0).building;
  assert.deepEqual(trainableUnits(b), ['soldier']);
  assert.match(startTraining(s, b.id, 'mage', T0).reason, /Cuartel nivel 2/);
  assert.match(startTraining(s, b.id, 'knight', T0).reason, /Cuartel nivel 3/);
  b.level = 3;
  assert.deepEqual(trainableUnits(b), ['soldier', 'mage', 'knight']);
  assert.equal(startTraining(s, b.id, 'knight', T0).ok, true);
});

test('sin población libre no se entrena, y una granja la libera', () => {
  const s = fresh(5000, 5000, 1);
  const b = place(s, 'barracks', 0, 0, T0).building;
  s.army.soldier = TH1_SUPPLY; // población llena
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Población al máximo: construye granjas');
  place(s, 'farm', 1, 0, T0);
  assert.equal(startTraining(s, b.id, 'soldier', T0).ok, true);
});

test('faltan recursos: el mensaje dice cuál', () => {
  const s = fresh(1000, 1000, 1);
  const b = place(s, 'barracks', 0, 0, T0).building;
  s.gold = 5;
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Oro insuficiente');
  s.gold = 1000;
  s.wood = 1;
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Madera insuficiente');
});

test('el altar solo se construye con el Ayuntamiento en nivel 2 y solo invoca un héroe', () => {
  const s = fresh(5000, 5000, 1);
  assert.match(place(s, 'altar', 0, 0, T0).reason, /Aún no puedes construir Altar/);
  townHall(s).level = 2;
  const altar = place(s, 'altar', 0, 0, T0).building;
  assert.equal(startTraining(s, altar.id, 'hero', T0).ok, true);
  assert.equal(supplyUsed(s), UNITS.hero.supply);
  tickAll(s, T0 + UNITS.hero.trainSec * 1000);
  assert.deepEqual(s.hero, { level: 1, xp: 0 });
  assert.equal(startTraining(s, altar.id, 'hero', T0 + 100_000).reason, 'Ya tienes un héroe');
  assert.equal(armyCount(s), 0, 'el héroe no cuenta como ejército');
});

test('el cuartel no entrena héroes y el altar no entrena soldados', () => {
  const s = fresh(5000, 5000, 2);
  const barracks = place(s, 'barracks', 0, 0, T0).building;
  const altar = place(s, 'altar', 1, 0, T0).building;
  assert.equal(startTraining(s, barracks.id, 'hero', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, altar.id, 'soldier', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, townHall(s).id, 'soldier', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, 999, 'soldier', T0).reason, 'No existe ese edificio');
});

test('mientras entrena no se mejora ni se demuele; mientras mejora no se entrena', () => {
  const s = fresh(5000, 5000, 3);
  const b = place(s, 'barracks', 0, 0, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  assert.equal(startUpgrade(s, b.id, T0).reason, 'Espera a que termine el entrenamiento');
  assert.equal(demolish(s, b.id).reason, 'Espera a que termine el entrenamiento');
  tickAll(s, T0 + 60_000);

  assert.equal(startUpgrade(s, b.id, T0 + 60_000).ok, true);
  assert.equal(startTraining(s, b.id, 'soldier', T0 + 60_000).reason, 'El edificio está en obras');
});

test('no se demuele una granja que sostiene al ejército, y sí cuando sobra población', () => {
  const s = fresh(5000, 5000, 1);
  const farm = place(s, 'farm', 0, 0, T0).building;
  s.army.soldier = TH1_SUPPLY + 1; // solo cabe gracias a la granja
  assert.equal(demolish(s, farm.id).reason, 'Hay demasiadas unidades para demoler esta granja');
  s.army.soldier = 2;
  assert.equal(demolish(s, farm.id).ok, true);
});

test('un guardado manipulado no puede dejar un entrenamiento más lejos que su duración', () => {
  const s = fresh(1000, 1000, 1);
  const b = place(s, 'barracks', 0, 0, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  b.training.endsAt = T0 + 1e12;
  tickAll(s, T0 + 5_000);
  assert.equal(b.training.endsAt, T0 + 5_000 + UNITS.soldier.trainSec * 1000);
});

test('un entrenamiento con una unidad desconocida se descarta sin romper nada', () => {
  const s = fresh();
  const b = place(s, 'barracks', 0, 0, T0).building;
  b.training = { unit: 'dragon', endsAt: T0 + 1000 };
  tickAll(s, T0 + 5_000);
  assert.equal(b.training, null);
});

/* ---------- utilidades ---------- */

test('findFreeCell devuelve la casilla pedida si está libre, o la libre más cercana', () => {
  assert.deepEqual(findFreeCell(new Set(), 5, 5), { x: 5, y: 5 });
  const near = findFreeCell(new Set(['5,5']), 5, 5);
  assert.notDeepEqual(near, { x: 5, y: 5 });
  assert.ok(Math.max(Math.abs(near.x - 5), Math.abs(near.y - 5)) === 1);
  const ring = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ring.add(`${5 + dx},${5 + dy}`);
  const far = findFreeCell(ring, 5, 5);
  assert.ok(Math.max(Math.abs(far.x - 5), Math.abs(far.y - 5)) === 2);
});

test('formatCost y displayName', () => {
  assert.equal(formatCost({ gold: 50 }), '50 oro');
  assert.equal(formatCost({ gold: 100, wood: 30 }), '100 oro · 30 madera');
  assert.equal(formatCost({ wood: 8 }), '8 madera');
  assert.equal(formatCost({}), 'Gratis');
  assert.equal(displayName('townhall', 1), 'Ayuntamiento');
  assert.equal(displayName('townhall', 2), 'Fortaleza');
  assert.equal(displayName('townhall', 3), 'Castillo');
  assert.equal(displayName('mine', 2), 'Mina de oro');
});

test('formatDuration muestra m:ss y h:mm:ss, redondeando hacia arriba', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(1), '0:01');
  assert.equal(formatDuration(59_000), '0:59');
  assert.equal(formatDuration(125_000), '2:05');
  assert.equal(formatDuration(3_600_000), '1:00:00');
  assert.equal(formatDuration(-5), '0:00');
});
