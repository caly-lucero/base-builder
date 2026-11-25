import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY, MAX_LEVEL, RESEARCH, UNIQUE_BUILDINGS, UNITS, batchLimit, batchTimeFactor, researchStep, trainQueueLimit } from '../src/data/config.js';
import { HEROES } from '../src/data/heroes.js';
import {
  TOWN_HALL_CELL,
  armyCount,
  batchSizeOf,
  busyBuilders,
  maxTrainable,
  buildingAt,
  collect,
  collectAll,
  countOf,
  createBuilding,
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
  damagedBuildings,
  repairAll,
  repairAllCost,
  repairBuilding,
  repairCost,
  startTraining,
  startUpgrade,
  queueUpgrade,
  cancelQueuedUpgrade,
  supplyCap,
  supplyUsed,
  heroLevelCap,
  researchBonus,
  setSquad,
  squadHeroes,
  toggleSquad,
  unitCombat,
  unitLevel,
  unlockLevel,
  tickAll,
  townHall,
  trainableUnits,
  upgradeWallSegment,
  wallBatchCost,
  wallSegment,
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

test('un tramo mezcla muros y puertas contiguos del mismo nivel y se mejora de una vez', () => {
  const s = fresh(1000, 1000, 3);
  s.buildings.push(
    createBuilding(2, 'wall', 2, 2, T0),
    createBuilding(3, 'gate', 3, 2, T0),
    createBuilding(4, 'wall', 4, 2, T0),
    createBuilding(5, 'wall', 8, 8, T0),
    createBuilding(6, 'wall', 4, 3, T0, 2),
  );
  assert.deepEqual(wallSegment(s, 2).map((b) => b.id), [2, 3, 4]);
  assert.deepEqual(wallBatchCost(s, 2), { gold: 0, wood: 50 });
  const result = upgradeWallSegment(s, 2);
  assert.deepEqual({ ok: result.ok, count: result.count, level: result.level }, { ok: true, count: 3, level: 2 });
  assert.equal(s.wood, 950);
  assert.deepEqual(s.buildings.filter((b) => [2, 3, 4].includes(b.id)).map((b) => b.level), [2, 2, 2]);
  assert.equal(s.buildings.find((b) => b.id === 5).level, 1);
  assert.equal(s.buildings.find((b) => b.id === 6).level, 2);
});

test('la mejora de tramo es atómica si faltan recursos', () => {
  const s = fresh(1000, 15, 3);
  s.buildings.push(createBuilding(2, 'wall', 2, 2, T0), createBuilding(3, 'wall', 3, 2, T0));
  const result = upgradeWallSegment(s, 2);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Madera insuficiente');
  assert.deepEqual(s.buildings.filter((b) => b.type === 'wall').map((b) => b.level), [1, 1]);
  assert.equal(s.wood, 15);
});

/* ---------- construir ---------- */

test('construir cobra oro y madera, deja el edificio en nivel 1 y ocupa la casilla', () => {
  const s = fresh(1000, 1000, 1);
  const r = place(s, 'storage', 3 * 8, 4 * 8, T0);
  assert.equal(r.ok, true);
  assert.equal(r.building.level, 1);
  assert.equal(r.building.upgradeEndsAt, null);
  assert.equal(s.gold, 1000 - BUILDINGS.storage.cost.gold);
  assert.equal(s.wood, 1000 - BUILDINGS.storage.cost.wood);
  assert.equal(place(s, 'mine', 3 * 8, 4 * 8, T0).reason, 'Casilla ocupada');
});

test('no se construye sin el recurso que falta, fuera del mapa, ni con tipos raros', () => {
  const poorGold = fresh(10, 1000, 1);
  assert.equal(place(poorGold, 'mine', 0 * 8, 0 * 8, T0).reason, 'Oro insuficiente');
  const poorWood = fresh(1000, 5, 1);
  assert.equal(place(poorWood, 'storage', 0 * 8, 0 * 8, T0).reason, 'Madera insuficiente');

  const s = fresh();
  assert.equal(place(s, 'mine', 99 * 8, 0 * 8, T0).reason, 'Fuera del mapa');
  assert.equal(place(s, 'constructor', 0 * 8, 0 * 8, T0).reason, 'Edificio desconocido');
  assert.equal(place(s, '__proto__', 0 * 8, 0 * 8, T0).reason, 'Edificio desconocido');
  assert.equal(place(s, 'townhall', 0 * 8, 0 * 8, T0).reason, 'Ese edificio no se puede construir');
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
  for (let i = 0; i < TH[0].limits.mine; i++) assert.equal(place(s, 'mine', i * 8, 0 * 8, T0).ok, true);
  const blocked = place(s, 'mine', 3 * 8, 0 * 8, T0);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /Límite de Mina de oro: 3/);

  townHall(s).level = 2; // al subir el Ayuntamiento se permiten más
  assert.equal(place(s, 'mine', 3 * 8, 0 * 8, T0).ok, true);
  assert.equal(countOf(s, 'mine'), TH[0].limits.mine + 1);
});

test('los muros tienen su propio límite y cuestan solo madera', () => {
  const s = fresh(0, 10_000, 1);
  for (let i = 0; i < TH[0].limits.wall; i++) assert.equal(place(s, 'wall', i, 8, T0).ok, true, `muro ${i}`);
  assert.match(place(s, 'wall', 0, 16, T0).reason, /Límite de Muro/);
  assert.equal(s.gold, 0, 'no gastó oro');
  assert.equal(s.wood, 10_000 - BUILDINGS.wall.cost.wood * TH[0].limits.wall);
});

/* ---------- producción y recolección ---------- */

test('la mina produce oro y el aserradero madera, cada uno con su capacidad', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  const saw = place(s, 'sawmill', 1 * 8, 0 * 8, T0).building;

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
  const tower = place(s, 'tower', 0 * 8, 0 * 8, T0).building;
  const gained = tickAll(s, T0 + 60_000);
  assert.deepEqual(gained, { gold: 0, wood: 0 });
  assert.equal(tower.stored, 0);
});

test('si el reloj retrocede no se genera ni se pierde nada', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  tickAll(s, T0 + 10_000);
  const gained = tickAll(s, T0); // reloj hacia atrás
  assert.equal(gained.gold, 0);
  assert.equal(mine.stored, 5);
  assert.equal(mine.lastTick, T0);
});

test('recolectar manda cada recurso a su reserva y respeta el tope', () => {
  const s = fresh(1000, 1000, 1);
  const mine = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  const saw = place(s, 'sawmill', 1 * 8, 0 * 8, T0).building;
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
  const a = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  const b = place(s, 'mine', 1 * 8, 0 * 8, T0).building;
  const c = place(s, 'sawmill', 2 * 8, 0 * 8, T0).building;
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
  const { building } = place(s, 'storage', 0 * 8, 0 * 8, T0);
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
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
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
  const { building } = place(s, 'tower', 0 * 8, 0 * 8, T0);
  s.wood = 10;
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Madera insuficiente');
  s.wood = 1000;
  assert.equal(startUpgrade(s, building.id, T0).ok, true);
  assert.equal(s.wood, 1000 - BUILDINGS.tower.levels[1].upgradeCost.wood);
});

test('un edificio no puede pasar del nivel del Ayuntamiento; subir el Ayuntamiento lo permite', () => {
  const s = fresh(5000, 5000, 1);
  const mine = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
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
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
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
  const { building } = place(s, 'storage', 0 * 8, 0 * 8, T0);
  startUpgrade(s, building.id, T0);
  assert.equal(resourceCap(s), ECONOMY.baseCap + STORAGE[0].capBonus, 'mientras mejora conserva el nivel anterior');
  tickAll(s, T0 + 3 * 60 * 60 * 1000); // 3 h después
  assert.equal(building.level, 2);
  assert.equal(resourceCap(s), ECONOMY.baseCap + STORAGE[1].capBonus);
});

test('la producción acumulada antes de empezar la mejora no se pierde', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
  startUpgrade(s, building.id, T0 + 10_000);
  assert.equal(building.stored, 5);
});

test('solo hay tantas mejoras simultáneas como obreros (el Ayuntamiento también usa uno)', () => {
  const s = fresh(5000, 5000, 2); // Ayuntamiento nivel 2: puede mejorar a 3 y los demás a 2
  const ids = [0, 1, 2].map((x) => place(s, 'mine', x * 8, 0 * 8, T0).building.id);
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
  const s = fresh(1000, 1000, 10);
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
  assert.equal(startUpgrade(s, 999, T0).reason, 'No existe ese edificio');

  s.gold = 10;
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Oro insuficiente');

  s.gold = 1000;
  startUpgrade(s, building.id, T0);
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Ya se está mejorando');

  // Sube hasta el máximo (nivel 10), pagando cada mejora y esperando a que termine.
  let now = T0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    s.gold = 900_000;
    s.wood = 900_000;
    now += 13 * 60 * 60 * 1000;
    tickAll(s, now); // termina la mejora en curso
    if (building.level === level) assert.equal(startUpgrade(s, building.id, now).ok, true, `mejora al nivel ${level + 1}`);
  }
  now += 13 * 60 * 60 * 1000;
  tickAll(s, now);
  assert.equal(building.level, MAX_LEVEL);
  assert.equal(startUpgrade(s, building.id, now).reason, 'Ya está al nivel máximo');
});

test('todos los edificios llegan al nivel 10; del 4 en adelante son «élite» (dibujo del 3 con tinte)', () => {
  for (const [type, def] of Object.entries(BUILDINGS)) {
    assert.equal(def.levels.length, MAX_LEVEL, `${type} tiene 10 niveles`);
    assert.equal(def.levels[0].tint, undefined);
    for (let i = 3; i < MAX_LEVEL; i++) {
      assert.ok(def.levels[i].tint, `${type}: el nivel ${i + 1} lleva tinte`);
      assert.equal(def.levels[i].sprite, def.levels[2].sprite, `${type}: el nivel ${i + 1} reutiliza el dibujo del 3`);
    }
    // Cada mejora cuesta más y tarda más que la anterior (hasta el tope de 12 h).
    for (let i = 2; i < MAX_LEVEL; i++) {
      const [prev, next] = [def.levels[i - 1], def.levels[i]];
      const total = (c) => Object.values(c).reduce((x, y) => x + y, 0);
      assert.ok(total(next.upgradeCost) > total(prev.upgradeCost), `${type}: costo del nivel ${i + 1}`);
      assert.ok(next.upgradeSec >= prev.upgradeSec && next.upgradeSec <= 12 * 3600, `${type}: tiempo del nivel ${i + 1}`);
    }
  }
  // Producción y capacidad crecen en cada nivel.
  for (const type of ['mine', 'sawmill']) {
    const lv = BUILDINGS[type].levels;
    for (let i = 1; i < MAX_LEVEL; i++) assert.ok(lv[i].ratePerSec > lv[i - 1].ratePerSec && lv[i].capacity > lv[i - 1].capacity, `${type} nivel ${i + 1}`);
  }
  for (let i = 1; i < MAX_LEVEL; i++) {
    assert.ok(BUILDINGS.storage.levels[i].capBonus > BUILDINGS.storage.levels[i - 1].capBonus);
    assert.ok(BUILDINGS.house.levels[i].supply > BUILDINGS.house.levels[i - 1].supply);
  }
  // Y el Ayuntamiento nuevo permite más de todo.
  const th = BUILDINGS.townhall.levels;
  for (let i = 1; i < MAX_LEVEL; i++) {
    assert.ok(th[i].baseSupply > th[i - 1].baseSupply);
    for (const [type, n] of Object.entries(th[i - 1].limits)) assert.ok(th[i].limits[type] >= n, `${type} en el nivel ${i + 1}`);
  }
});

test('el Ayuntamiento desbloquea los edificios militares: cuartel 2, arquería 4, atelier 6, caballeriza 8, asedio 10', () => {
  const need = { barracks: 2, archery: 4, atelier: 6, stable: 8, siege: 10 };
  for (const [type, level] of Object.entries(need)) {
    assert.equal(unlockLevel(type), level, type);
    const low = fresh(99999, 99999, level - 1);
    assert.match(place(low, type, 0 * 8, 0 * 8, T0).reason, /pide/, `${type} no se construye antes`);
    const ok = fresh(99999, 99999, level);
    assert.equal(place(ok, type, 0 * 8, 0 * 8, T0).ok, true, `${type} sí con el nivel ${level}`);
  }
  assert.equal(unlockLevel('house'), 1);
});

test('un cuartel de nivel alto entrena más rápido', () => {
  const s = fresh(5000, 5000, 5);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
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
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
  startUpgrade(s, building.id, T0);
  building.upgradeEndsAt = T0 + 1e12; // alguien lo editó a un futuro lejano
  tickAll(s, T0 + 5_000);
  assert.equal(building.upgradeEndsAt, T0 + 5_000 + MINE[1].upgradeSec * 1000);
});

/* ---------- demoler y mover ---------- */

test('no se puede demoler en plena mejora ni el Ayuntamiento; el reembolso incluye lo invertido', () => {
  const s = fresh(1000, 1000, 3);
  const { building } = place(s, 'mine', 0 * 8, 0 * 8, T0);
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
  const mine = place(s, 'mine', 2 * 8, 2 * 8, T0).building;
  mine.stored = 42;
  mine.level = 2;

  assert.equal(moveBuilding(s, mine.id, 5, 6).ok, true);
  assert.deepEqual([mine.x, mine.y, mine.stored, mine.level], [5, 6, 42, 2]);
  assert.equal(buildingAt(s, 16, 16), null);
  assert.equal(buildingAt(s, 5, 6), mine);
  assert.equal(buildingAt(s, 6, 7), mine, 'ocupa 2×2 cuadros');
  assert.equal(buildingAt(s, 7, 7), null);
});

test('mover valida casilla ocupada, fuera del mapa, misma casilla y existencia', () => {
  const s = fresh(1000, 1000, 3);
  const a = place(s, 'mine', 2 * 8, 2 * 8, T0).building;
  place(s, 'mine', 3 * 8, 2 * 8, T0);
  assert.equal(moveBuilding(s, a.id, 24, 16).reason, 'Casilla ocupada');
  assert.equal(moveBuilding(s, a.id, 23, 17).reason, 'Casilla ocupada', 'pisar solo un borde también cuenta');
  assert.equal(moveBuilding(s, a.id, -1, 2).reason, 'Fuera del mapa');
  assert.equal(moveBuilding(s, a.id, 99, 2).reason, 'Fuera del mapa');
  assert.equal(moveBuilding(s, a.id, 47, 2).reason, 'Fuera del mapa', 'un edificio de 2×2 no cabe en el último cuadro');
  assert.equal(moveBuilding(s, a.id, 16, 16).reason, 'Ya está ahí');
  assert.equal(moveBuilding(s, 999, 4, 4).reason, 'No existe ese edificio');
  assert.equal(moveBuilding(s, a.id, 17, 16).ok, true, 'puede moverse a un sitio que solapa con donde estaba');
  assert.deepEqual([a.x, a.y], [17, 16]);
});

test('el Ayuntamiento se puede mover', () => {
  const s = fresh();
  assert.equal(moveBuilding(s, townHall(s).id, 3, 3).ok, true);
});

/* ---------- población y entrenamiento ---------- */

const HOUSE = BUILDINGS.house.levels;
const TH1_SUPPLY = TH[0].baseSupply;
const TH2_SUPPLY = TH[1].baseSupply;

test('la población máxima suma la del Ayuntamiento y la de cada casa', () => {
  const s = fresh(5000, 5000, 1);
  assert.equal(supplyCap(s), TH1_SUPPLY);
  const house = place(s, 'house', 0 * 8, 0 * 8, T0).building;
  assert.equal(supplyCap(s), TH1_SUPPLY + HOUSE[0].supply);
  house.level = 2;
  assert.equal(supplyCap(s), TH1_SUPPLY + HOUSE[1].supply);
  townHall(s).level = 2;
  assert.equal(supplyCap(s), TH[1].baseSupply + HOUSE[1].supply);
});

test('entrenar cobra, reserva población y la unidad llega al terminar', () => {
  const s = fresh(1000, 1000, 2);
  const barracks = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
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
  assert.deepEqual(events, [{ type: 'trained', id: barracks.id, unit: 'soldier', qty: 1 }]);
  assert.equal(supplyUsed(s), UNITS.soldier.supply, 'ahora cuenta como ejército, no se cobra dos veces');
  assert.equal(armyCount(s), 1);
});

test('un lote entrena varias unidades a la vez: cobra, reserva población y llegan juntas', () => {
  const s = fresh(2000, 2000, 2);
  const barracks = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  const gold = s.gold;
  const wood = s.wood;

  const r = startTraining(s, barracks.id, 'soldier', T0, 4);
  assert.equal(r.ok, true);
  assert.equal(s.gold, gold - UNITS.soldier.cost.gold * 4);
  assert.equal(s.wood, wood - UNITS.soldier.cost.wood * 4);
  assert.equal(supplyUsed(s), UNITS.soldier.supply * 4);
  const total = UNITS.soldier.trainSec * batchTimeFactor(4) * 1000;
  assert.equal(r.endsAt, T0 + Math.round(total), 'el lote tarda un poco más que una sola unidad');
  assert.ok(total > UNITS.soldier.trainSec * 1000 && total < UNITS.soldier.trainSec * 4 * 1000, 'pero mucho menos que de a una');

  const events = [];
  tickAll(s, T0 + Math.round(total) - 1000, events);
  assert.equal(s.army.soldier, 0);
  tickAll(s, T0 + Math.round(total), events);
  assert.equal(s.army.soldier, 4);
  assert.deepEqual(events, [{ type: 'trained', id: barracks.id, unit: 'soldier', qty: 4 }]);
  assert.equal(supplyUsed(s), UNITS.soldier.supply * 4);
});

test('el tamaño del lote depende del nivel del edificio, de la población y de los recursos', () => {
  const s = fresh(5000, 5000, 2);
  for (let i = 0; i < 3; i++) place(s, 'house', i * 8, 3 * 8, T0);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  assert.equal(batchSizeOf(b), batchLimit(1));
  const before = s.gold;
  assert.equal(startTraining(s, b.id, 'soldier', T0, batchLimit(1) + 1).ok, false, 'más que el tope del nivel');
  assert.equal(startTraining(s, b.id, 'soldier', T0, 0).ok, false);
  assert.equal(startTraining(s, b.id, 'soldier', T0, 1.5).ok, false);
  assert.equal(s.gold, before, 'una orden rechazada no cobra');

  b.level = 3;
  assert.ok(batchSizeOf(b) > batchLimit(1), 'un edificio de más nivel entrena lotes más grandes');
  assert.equal(maxTrainable(s, b, 'soldier'), batchSizeOf(b));
  s.gold = UNITS.soldier.cost.gold * 2 + 5;
  assert.equal(maxTrainable(s, b, 'soldier'), 2, 'el dinero limita el lote');
  s.gold = 5000;
  assert.equal(startTraining(s, b.id, 'soldier', T0, batchSizeOf(b)).ok, true);
  assert.equal(supplyUsed(s), UNITS.soldier.supply * batchSizeOf(b));
});

test('un lote que no cabe en la población no se acepta', () => {
  const s = fresh(5000, 5000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  s.army.soldier = supplyCap(s) - 2; // quedan 2 de población
  assert.equal(startTraining(s, b.id, 'soldier', T0, 3).reason, 'Población al máximo: construye casas');
  assert.equal(startTraining(s, b.id, 'soldier', T0, 2).ok, true);
});

test('los edificios militares son únicos: solo uno de cada clase', () => {
  const s = fresh(50_000, 50_000, 10);
  for (const type of UNIQUE_BUILDINGS) {
    const x = UNIQUE_BUILDINGS.indexOf(type) * 6;
    assert.equal(place(s, type, x, 0, T0).ok, true, `el primero de ${type}`);
    const again = place(s, type, x, 8, T0);
    assert.equal(again.ok, false, `un segundo ${type}`);
    assert.match(again.reason, /Solo puedes tener un/);
  }
});

test('un cuartel entrena un lote por vez: la siguiente orden queda en cola hasta que termine', () => {
  const s = fresh(1000, 1000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  assert.equal(startTraining(s, b.id, 'soldier', T0).ok, true);
  const q = startTraining(s, b.id, 'soldier', T0);
  assert.equal(q.ok, true);
  assert.equal(q.queued, true);
  tickAll(s, T0 + 60_000);
  assert.equal(startTraining(s, b.id, 'soldier', T0 + 60_000).ok, true);
});

test('el entrenamiento sigue mientras no juegas', () => {
  const s = fresh(1000, 1000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  tickAll(s, T0 + 3 * 60 * 60 * 1000); // 3 horas después
  assert.equal(s.army.soldier, 1);
});

test('cada edificio militar entrena su unidad y no la de otros', () => {
  const s = fresh(99999, 99999, 10);
  const spec = { barracks: 'soldier', archery: 'archer', atelier: 'mage', stable: 'knight' };
  const buildings = {};
  let x = 0;
  for (const type of Object.keys(spec)) buildings[type] = place(s, type, x++ * 8, 0 * 8, T0).building;
  for (let i = 0; i < 8; i++) place(s, 'house', i * 8, 1 * 8, T0);
  for (const [type, unit] of Object.entries(spec)) {
    assert.deepEqual(trainableUnits(buildings[type]), [unit], type);
    for (const other of Object.values(spec)) {
      if (other !== unit) assert.equal(startTraining(s, buildings[type].id, other, T0).reason, 'Este edificio no entrena eso');
    }
    assert.equal(startTraining(s, buildings[type].id, unit, T0).ok, true, `${type} entrena ${unit}`);
  }
});

test('el taller de asedio entrena catapultas desde el nivel 1 y arietes desde el 5', () => {
  const s = fresh(99999, 99999, 10);
  for (let i = 0; i < 6; i++) place(s, 'house', i * 8, 1 * 8, T0);
  const siege = place(s, 'siege', 0 * 8, 0 * 8, T0).building;
  assert.deepEqual(trainableUnits(siege), ['catapult']);
  assert.match(startTraining(s, siege.id, 'ram', T0).reason, /nivel 5/);
  siege.level = 5;
  assert.deepEqual(trainableUnits(siege), ['catapult', 'ram']);
  assert.equal(startTraining(s, siege.id, 'ram', T0).ok, true);
});

test('el nivel de las unidades es el de su edificio, y sube su vida y su daño', () => {
  const s = fresh(99999, 99999, 10);
  assert.equal(unitLevel(s, 'archer'), 1, 'sin edificio: nivel 1');
  const archery = place(s, 'archery', 0 * 8, 0 * 8, T0).building;
  const base = unitCombat(s, 'archer');
  assert.equal(base.hp, UNITS.archer.combat.hp);
  assert.equal(base.dmg, UNITS.archer.combat.dmg);
  archery.level = 5;
  assert.equal(unitLevel(s, 'archer'), 5);
  const l5 = unitCombat(s, 'archer');
  assert.ok(l5.hp > base.hp && l5.dmg > base.dmg);
  assert.equal(l5.hp, Math.round(UNITS.archer.combat.hp * (1 + UNITS.archer.perLevel * 4)));
  archery.level = 10;
  assert.ok(unitCombat(s, 'archer').hp > l5.hp);
  archery.damaged = true; // un edificio dañado no cuenta
  assert.equal(unitLevel(s, 'archer'), 1);
});

test('la Herrería investiga mejoras: cuestan, tardan, suben un nivel y no pasan del nivel de la herrería', () => {
  const s = fresh(99999, 99999, 10);
  const forge = place(s, 'forge', 0 * 8, 0 * 8, T0).building;
  assert.deepEqual(trainableUnits(forge), ['weapons', 'armor', 'fortify']);
  const step = researchStep('weapons', 0);
  const gold = s.gold;
  const r = startTraining(s, forge.id, 'weapons', T0);
  assert.equal(r.ok, true);
  assert.equal(s.gold, gold - step.cost.gold);
  assert.equal(supplyUsed(s), 0, 'una investigación no ocupa población');
  assert.equal(startTraining(s, forge.id, 'armor', T0).reason, 'Ya está investigando');

  const events = [];
  tickAll(s, T0 + step.sec * 1000, events);
  assert.equal(s.research.weapons, 1);
  assert.deepEqual(events, [{ type: 'trained', id: forge.id, unit: 'weapons', qty: 1 }]);
  assert.equal(researchBonus(s, 'weapons'), RESEARCH.weapons.perLevel);

  // Con la herrería en nivel 1 no se pasa del nivel 1; al mejorarla, sí.
  assert.equal(startTraining(s, forge.id, 'weapons', T0 + 1e7).reason, 'Mejora la Herrería para seguir');
  forge.level = 2;
  assert.equal(startTraining(s, forge.id, 'weapons', T0 + 1e7).ok, true);
  // Los costos y tiempos crecen con el nivel.
  assert.ok(researchStep('weapons', 5).cost.gold > researchStep('weapons', 1).cost.gold);
  assert.ok(researchStep('weapons', 5).sec > researchStep('weapons', 1).sec);
});

test('las investigaciones mejoran a las unidades', () => {
  const s = fresh();
  const plain = unitCombat(s, 'soldier');
  s.research.weapons = 5;
  s.research.armor = 5;
  const better = unitCombat(s, 'soldier');
  assert.ok(better.dmg > plain.dmg && better.hp > plain.hp);
  assert.equal(better.hp, Math.round(UNITS.soldier.combat.hp * (1 + RESEARCH.armor.perLevel * 5)));
});

test('sin población libre no se entrena, y una casa la libera', () => {
  const s = fresh(5000, 5000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  s.army.soldier = TH2_SUPPLY; // población llena
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Población al máximo: construye casas');
  place(s, 'house', 1 * 8, 0 * 8, T0);
  assert.equal(startTraining(s, b.id, 'soldier', T0).ok, true);
});

test('faltan recursos: el mensaje dice cuál', () => {
  const s = fresh(1000, 1000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  s.gold = 5;
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Oro insuficiente');
  s.gold = 1000;
  s.wood = 1;
  assert.equal(startTraining(s, b.id, 'soldier', T0).reason, 'Madera insuficiente');
});

test('el altar se construye con el Ayuntamiento en nivel 2 y invoca héroes distintos, cada uno una vez', () => {
  const s = fresh(9999, 9999, 1);
  assert.match(place(s, 'altar', 0 * 8, 0 * 8, T0).reason, /Altar del héroe: pide Fortaleza/);
  townHall(s).level = 2;
  for (let i = 0; i < 3; i++) place(s, 'house', i * 8, 1 * 8, T0);
  const altar = place(s, 'altar', 0 * 8, 0 * 8, T0).building;
  assert.equal(startTraining(s, altar.id, 'paladin', T0).ok, true);
  assert.equal(supplyUsed(s), HEROES.paladin.supply);
  tickAll(s, T0 + HEROES.paladin.trainSec * 1000);
  assert.deepEqual(s.heroes.paladin, { level: 1, xp: 0 });
  assert.deepEqual(s.squad, ['paladin'], 'el primero sale a pelear solo');
  assert.equal(startTraining(s, altar.id, 'paladin', T0 + 100_000).reason, 'Ya tienes a ese héroe');
  assert.equal(armyCount(s), 0, 'los héroes no cuentan como ejército');
  // La Cazadora pide el altar en nivel 2.
  assert.match(startTraining(s, altar.id, 'ranger', T0 + 100_000).reason, /Altar del héroe nivel 2/);
  altar.level = 2;
  assert.equal(startTraining(s, altar.id, 'ranger', T0 + 100_000).ok, true);
});

test('solo 2 héroes salen a pelear: se elige la escuadra', () => {
  const s = fresh();
  s.heroes = { paladin: { level: 1, xp: 0 }, ranger: { level: 3, xp: 10 }, priestess: { level: 1, xp: 0 } };
  assert.equal(setSquad(s, ['paladin', 'ranger']).ok, true);
  assert.deepEqual(s.squad, ['paladin', 'ranger']);
  assert.match(setSquad(s, ['paladin', 'ranger', 'priestess']).reason, /Solo pueden salir 2/);
  assert.equal(toggleSquad(s, 'priestess').ok, false, 'está llena');
  assert.equal(toggleSquad(s, 'ranger').ok, true, 'sale de la escuadra');
  assert.equal(toggleSquad(s, 'priestess').ok, true, 'ahora entra');
  assert.deepEqual(s.squad, ['paladin', 'priestess']);
  assert.match(setSquad(s, ['warlord']).reason, /aún no lo tienes/);
  assert.deepEqual(squadHeroes(s).map((h) => h.key), ['paladin', 'priestess']);
});

test('el nivel máximo de un héroe es el doble del nivel del Ayuntamiento, hasta 20', () => {
  const s = fresh(1000, 1000, 1);
  assert.equal(heroLevelCap(s), 2);
  townHall(s).level = 5;
  assert.equal(heroLevelCap(s), 10);
  townHall(s).level = 10;
  assert.equal(heroLevelCap(s), 20);
});

test('el cuartel no entrena héroes y el altar no entrena soldados', () => {
  const s = fresh(5000, 5000, 2);
  const barracks = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  const altar = place(s, 'altar', 1 * 8, 0 * 8, T0).building;
  assert.equal(startTraining(s, barracks.id, 'paladin', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, altar.id, 'soldier', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, townHall(s).id, 'soldier', T0).reason, 'Este edificio no entrena eso');
  assert.equal(startTraining(s, 999, 'soldier', T0).reason, 'No existe ese edificio');
});

test('mientras entrena no se mejora ni se demuele; mientras mejora no se entrena', () => {
  const s = fresh(5000, 5000, 3);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  assert.equal(startUpgrade(s, b.id, T0).reason, 'Espera a que termine el entrenamiento');
  assert.equal(demolish(s, b.id).reason, 'Espera a que termine el entrenamiento');
  tickAll(s, T0 + 60_000);

  assert.equal(startUpgrade(s, b.id, T0 + 60_000).ok, true);
  assert.equal(startTraining(s, b.id, 'soldier', T0 + 60_000).reason, 'El edificio está en obras');
});

test('no se demuele una casa que sostiene al ejército, y sí cuando sobra población', () => {
  const s = fresh(5000, 5000, 1);
  const house = place(s, 'house', 0 * 8, 0 * 8, T0).building;
  s.army.soldier = TH1_SUPPLY + 1; // solo cabe gracias a la casa
  assert.equal(demolish(s, house.id).reason, 'Hay demasiadas unidades para demoler esta casa');
  s.army.soldier = 2;
  assert.equal(demolish(s, house.id).ok, true);
});

test('un guardado manipulado no puede dejar un entrenamiento más lejos que su duración', () => {
  const s = fresh(1000, 1000, 2);
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  startTraining(s, b.id, 'soldier', T0);
  b.training.endsAt = T0 + 1e12;
  tickAll(s, T0 + 5_000);
  assert.equal(b.training.endsAt, T0 + 5_000 + UNITS.soldier.trainSec * 1000);
});

test('un entrenamiento con una unidad desconocida se descarta sin romper nada', () => {
  const s = fresh();
  const b = place(s, 'barracks', 0 * 8, 0 * 8, T0).building;
  b.training = { unit: 'dragon', endsAt: T0 + 1000 };
  tickAll(s, T0 + 5_000);
  assert.equal(b.training, null);
});

/* ---------- daño y reparación ---------- */

test('un edificio dañado no produce, ni se mejora, ni entrena, hasta repararlo', () => {
  const s = fresh(5000, 5000, 3);
  const mine = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  const barracks = place(s, 'barracks', 1 * 8, 0 * 8, T0).building;
  mine.damaged = true;
  barracks.damaged = true;

  tickAll(s, T0 + 60_000);
  assert.equal(mine.stored, 0, 'no produce mientras está dañado');
  assert.equal(startUpgrade(s, mine.id, T0 + 60_000).reason, 'Está dañado: repáralo primero');
  assert.equal(startTraining(s, barracks.id, 'soldier', T0 + 60_000).reason, 'Está dañado: repáralo primero');

  assert.equal(repairBuilding(s, mine.id).ok, true);
  assert.equal(mine.damaged, false);
  tickAll(s, T0 + 120_000);
  assert.ok(mine.stored > 0 && mine.stored <= 0.5 * 60 + 1e-6, 'produce solo desde que se reparó');
  assert.equal(startUpgrade(s, mine.id, T0 + 120_000).ok, true);
});

test('reparar cuesta una parte de lo invertido, valida y descuenta', () => {
  const s = fresh(1000, 1000, 5);
  const b = place(s, 'storage', 0 * 8, 0 * 8, T0).building; // 100 oro + 30 madera
  b.level = 3; // + mejoras ya pagadas
  const invested = investedCost(b);
  const cost = repairCost(b);
  assert.equal(cost.gold, Math.ceil(invested.gold * 0.3));
  assert.equal(cost.wood, Math.ceil(invested.wood * 0.3));

  assert.equal(repairBuilding(s, b.id).reason, 'No está dañado');
  assert.equal(repairBuilding(s, 999).reason, 'No existe ese edificio');
  b.damaged = true;
  s.gold = 1;
  assert.equal(repairBuilding(s, b.id).reason, 'Oro insuficiente');
  s.gold = 1000;
  const before = { gold: s.gold, wood: s.wood };
  assert.equal(repairBuilding(s, b.id).ok, true);
  assert.equal(s.gold, before.gold - cost.gold);
  assert.equal(s.wood, before.wood - cost.wood);
});

test('reparar todo repara en orden mientras alcance, y avisa si no alcanza', () => {
  const s = fresh(1000, 1000, 3);
  const a = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  const b = place(s, 'mine', 1 * 8, 0 * 8, T0).building;
  const w = place(s, 'wall', 2 * 8, 0 * 8, T0).building;
  for (const x of [a, b, w]) x.damaged = true;
  assert.equal(repairAllCost(s).gold, repairCost(a).gold + repairCost(b).gold + repairCost(w).gold);

  s.gold = repairCost(a).gold; // solo alcanza para una mina
  s.wood = 1000;
  const r = repairAll(s, T0 + 5000);
  assert.equal(r.ok, true);
  assert.ok(r.repaired >= 1 && r.left >= 1);
  assert.equal(damagedBuildings(s).length, r.left);

  s.gold = 0;
  s.wood = 0;
  assert.equal(repairAll(s).reason, 'No alcanzan los recursos para reparar');
  for (const x of s.buildings) x.damaged = false;
  assert.equal(repairAll(s).reason, 'No hay nada dañado');
});

test('un edificio dañado se puede demoler y mover', () => {
  const s = fresh(1000, 1000, 3);
  const b = place(s, 'mine', 0 * 8, 0 * 8, T0).building;
  b.damaged = true;
  assert.equal(moveBuilding(s, b.id, 4, 4).ok, true);
  assert.equal(demolish(s, b.id).ok, true);
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

/* ---------- tamaño de los edificios ---------- */

test('cada edificio ocupa varios cuadros y los más importantes son los más grandes', async () => {
  const { sizeOf, rectOf, centerOf, fitsInMap, areaIsFree, buildingsInArea, findFreeSpot } = await import('../src/game/logic.js');
  const area = (t) => sizeOf(t).w * sizeOf(t).h;
  assert.deepEqual(sizeOf('mine'), { w: 2, h: 2 });
  assert.equal(area('wall'), 1);
  assert.ok(area('mine') < area('storage') && area('storage') < area('barracks') && area('barracks') < area('townhall'), 'el Ayuntamiento es el más grande');
  assert.equal(Math.max(...Object.keys(BUILDINGS).map(area)), area('townhall'));
  assert.deepEqual(sizeOf('hall'), sizeOf('townhall'), 'el Ayuntamiento enemigo es como el tuyo');

  const s = fresh(5000, 5000, 3);
  const hall = townHall(s);
  assert.deepEqual(rectOf(hall), { x: TOWN_HALL_CELL.x, y: TOWN_HALL_CELL.y, w: 7, h: 7 });
  assert.deepEqual(centerOf(hall), { x: TOWN_HALL_CELL.x + 3, y: TOWN_HALL_CELL.y + 3 });
  assert.equal(buildingAt(s, TOWN_HALL_CELL.x + 6, TOWN_HALL_CELL.y + 6), hall, 'cualquiera de sus cuadros');
  assert.equal(buildingAt(s, TOWN_HALL_CELL.x + 7, TOWN_HALL_CELL.y), null);

  assert.equal(fitsInMap('barracks', 43, 43), true);
  assert.equal(fitsInMap('barracks', 44, 43), false, 'se sale por la derecha');
  assert.equal(fitsInMap('wall', 47, 47), true);
  assert.equal(areaIsFree(s, 'mine', hall.x - 2, hall.y), true);
  assert.equal(areaIsFree(s, 'mine', hall.x - 1, hall.y), false, 'pisa el borde del Ayuntamiento');
  assert.equal(buildingsInArea(s, 'storage', hall.x - 3, hall.y - 1)[0], hall);

  const spot = findFreeSpot(s, 'barracks', hall.x, hall.y);
  assert.ok(areaIsFree(s, 'barracks', spot.x, spot.y), 'encuentra un sitio donde sí cabe');
});

test('construir comprueba todo el rectángulo del edificio, no solo su esquina', () => {
  const s = fresh(5000, 5000, 3);
  assert.equal(place(s, 'barracks', 10, 10, T0).ok, true); // 5×5: ocupa 10–14
  assert.equal(place(s, 'mine', 14, 14, T0).reason, 'Casilla ocupada', 'su esquina de abajo ya está ocupada');
  assert.equal(place(s, 'mine', 15, 10, T0).ok, true, 'justo al lado sí');
  assert.equal(place(s, 'wall', 12, 12, T0).reason, 'Casilla ocupada', 'ni un muro en el centro');
  assert.equal(place(s, 'storage', 45, 10, T0).reason, 'Fuera del mapa', 'un almacén de 4×3 no cabe en el borde');
  assert.equal(place(s, 'wall', 47, 10, T0).ok, true, 'un muro (1×1) sí');
});

/* ---------- adornos que se pueden quitar ---------- */

test('los árboles y rocas se pueden quitar de uno en uno, todos a la vez y devolver', async () => {
  const { clearDecor, clearAllDecor, restoreDecor, allDecorKeys } = await import('../src/game/logic.js');
  const s = fresh();
  const all = allDecorKeys();
  assert.ok(all.length > 100);
  assert.deepEqual(s.cleared, []);
  assert.equal(clearDecor(s, all[0]).ok, true);
  assert.equal(clearDecor(s, all[0]).reason, 'Ya está quitado');
  assert.equal(clearDecor(s, '999,999').reason, 'Eso no se puede quitar');
  assert.deepEqual(s.cleared, [all[0]]);
  assert.equal(clearAllDecor(s).ok, true);
  assert.equal(s.cleared.length, all.length);
  assert.equal(clearAllDecor(s).reason, 'El mapa ya está limpio');
  assert.equal(restoreDecor(s).ok, true);
  assert.deepEqual(s.cleared, []);
  assert.equal(restoreDecor(s).reason, 'No hay adornos quitados');
});

/* ---------- colas ---------- */

test('la cola de entrenamiento: se paga y reserva población al encargar, tiene tope por nivel y los lotes se encadenan', () => {
  const s = fresh(5000, 5000, 4);
  const b = place(s, 'barracks', 0, 0, T0).building;
  const gold0 = s.gold;
  assert.equal(startTraining(s, b.id, 'soldier', T0, 2).ok, true);
  const used1 = supplyUsed(s);
  const q = startTraining(s, b.id, 'soldier', T0, 3);
  assert.deepEqual([q.ok, q.queued, q.position], [true, true, 1]);
  assert.equal(supplyUsed(s), used1 + 3, 'la población del lote en cola ya está reservada');
  assert.equal(s.gold, gold0 - 40 * 5, 'los dos lotes ya están pagados');
  assert.equal(trainQueueLimit(1), 1);
  assert.equal(startTraining(s, b.id, 'soldier', T0, 1).reason, 'La cola de este edificio está llena');

  // Termina el primer lote y arranca el segundo justo a esa hora; luego termina también.
  const first = b.training.endsAt;
  tickAll(s, first + 1000);
  assert.equal(s.army.soldier, 2);
  assert.deepEqual([b.training.unit, b.training.qty, b.queue.length], ['soldier', 3, 0]);
  assert.equal(b.training.endsAt, first + Math.round(UNITS.soldier.trainSec * batchTimeFactor(3) * 1000));
  tickAll(s, b.training.endsAt + 1);
  assert.equal(s.army.soldier, 5);
  assert.equal(b.training, null);
});

test('la cola avanza también mientras no juegas: varias tandas terminan de golpe al volver', () => {
  const s = fresh(5000, 5000, 7); // nivel 7: caben 3 lotes en cola
  const b = place(s, 'barracks', 0, 0, T0).building;
  b.level = 7;
  assert.equal(trainQueueLimit(7), 3);
  for (let i = 0; i < 4; i++) assert.equal(startTraining(s, b.id, 'soldier', T0, 2).ok, true);
  tickAll(s, T0 + 6 * 60 * 60 * 1000);
  assert.equal(s.army.soldier, 8);
  assert.equal(b.training, null);
  assert.deepEqual(b.queue, []);
});

test('héroes e investigaciones no se encolan, ni una unidad tras un héroe; sin población no se encola', () => {
  const s = fresh(5000, 5000, 5);
  const forge = place(s, 'forge', 0, 0, T0).building;
  forge.level = 3;
  assert.equal(startTraining(s, forge.id, 'weapons', T0).ok, true);
  assert.equal(startTraining(s, forge.id, 'armor', T0).reason, 'Ya está investigando');
  const barracks = place(s, 'barracks', 8, 0, T0).building;
  const room = supplyCap(s) - supplyUsed(s);
  assert.equal(startTraining(s, barracks.id, 'soldier', T0, Math.min(batchSizeOf(barracks), room)).ok, true);
  s.buildings.push({ ...barracks, id: 99, x: 30, y: 2, training: null, queue: [] }); // otro cuartel (solo para probar el límite)
  const full = fresh(5000, 5000, 2);
  const bk = place(full, 'barracks', 0, 0, T0).building;
  bk.level = 5;
  full.army.soldier = supplyCap(full) - 1;
  assert.equal(startTraining(full, bk.id, 'soldier', T0, 1).ok, true);
  assert.equal(startTraining(full, bk.id, 'soldier', T0, 1).reason, 'Población al máximo: construye casas');
});

test('cola de obras: con los obreros ocupados se encarga una mejora (se paga ya) y empieza sola al liberarse uno', () => {
  const s = fresh(9000, 9000, 3);
  const ids = [0, 1, 2].map((x) => place(s, 'mine', x * 8, 0, T0).building.id);
  assert.equal(queueUpgrade(s, ids[2]).reason, 'Hay un obrero libre: mejóralo directamente');
  assert.equal(startUpgrade(s, ids[0], T0).ok, true);
  assert.equal(startUpgrade(s, ids[1], T0).ok, true);
  const gold0 = s.gold;
  const r = queueUpgrade(s, ids[2]);
  assert.deepEqual([r.ok, r.position], [true, 1]);
  assert.equal(s.gold, gold0 - MINE[1].upgradeCost.gold, 'ya está pagada');
  assert.equal(queueUpgrade(s, ids[2]).reason, 'Ya está en la cola de obras');
  assert.equal(startUpgrade(s, ids[2], T0).reason, 'Ya está en la cola de obras');

  // Termina la primera obra: la mejora en cola empieza en ese mismo instante.
  const freedAt = s.buildings.find((b) => b.id === ids[0]).upgradeEndsAt;
  tickAll(s, freedAt + 1000);
  const third = s.buildings.find((b) => b.id === ids[2]);
  assert.equal(third.upgradeEndsAt, freedAt + MINE[1].upgradeSec * 1000);
  assert.deepEqual(s.upgradeQueue, []);
  tickAll(s, third.upgradeEndsAt + 1);
  assert.equal(third.level, 2);
});

test('cola de obras: cancelar devuelve todo, demoler también, y una mejora que ya no puede empezar se reembolsa', () => {
  const s = fresh(9000, 9000, 3);
  const ids = [0, 1, 2, 3].map((x) => place(s, 'mine', x * 8, 0, T0).building.id);
  startUpgrade(s, ids[0], T0);
  startUpgrade(s, ids[1], T0);
  s.gold = 400; // dentro del tope de recursos (los reembolsos nunca lo pasan)
  const gold0 = s.gold;
  queueUpgrade(s, ids[2]);
  queueUpgrade(s, ids[3]);
  assert.equal(cancelQueuedUpgrade(s, ids[2]).ok, true);
  assert.equal(s.gold, gold0 - MINE[1].upgradeCost.gold, 'queda pagada solo la que sigue en cola');
  assert.equal(cancelQueuedUpgrade(s, ids[2]).reason, 'No está en la cola');
  assert.equal(demolish(s, ids[3]).ok, true);
  assert.deepEqual(s.upgradeQueue, []);

  // Una mejora encargada cuyo edificio queda dañado antes de empezar: se devuelve lo pagado.
  const t = place(s, 'mine', 40, 0, T0).building.id;
  const before = s.gold;
  queueUpgrade(s, t);
  s.buildings.find((b) => b.id === t).damaged = true;
  const events = [];
  tickAll(s, s.buildings.find((b) => b.id === ids[0]).upgradeEndsAt + 1, events);
  assert.ok(events.some((e) => e.type === 'upgrade_cancelled'));
  assert.equal(s.gold, before, 'el dinero vuelve');
  assert.deepEqual(s.upgradeQueue, []);
});

test('la cola de obras tiene un tope', () => {
  const s = fresh(90000, 90000, 5);
  const ids = [0, 1, 2, 3, 4, 5, 6].map((i) => place(s, 'mine', i * 6, (i % 2) * 8, T0).building.id);
  startUpgrade(s, ids[0], T0);
  startUpgrade(s, ids[1], T0);
  for (const id of ids.slice(2, 5)) assert.equal(queueUpgrade(s, id).ok, true);
  assert.equal(queueUpgrade(s, ids[5]).reason, 'La cola de obras está llena');
});
