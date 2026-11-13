import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY } from '../src/data/config.js';
import {
  busyBuilders,
  collect,
  collectAll,
  createNewState,
  demolish,
  formatDuration,
  goldCap,
  investedGold,
  place,
  startUpgrade,
  tickAll,
} from '../src/game/logic.js';

const T0 = 1_700_000_000_000;
const MINE = BUILDINGS.mine.levels;
const STORAGE = BUILDINGS.storage.levels;

function stateWithGold(gold) {
  const s = createNewState(T0);
  s.gold = gold;
  return s;
}

/* ---------- fase 1: construir, producir, recolectar ---------- */

test('colocar un edificio descuenta oro, lo crea en nivel 1 y ocupa la casilla', () => {
  const s = createNewState(T0);
  const r = place(s, 'mine', 3, 4, T0);
  assert.equal(r.ok, true);
  assert.equal(r.building.level, 1);
  assert.equal(r.building.upgradeEndsAt, null);
  assert.equal(s.gold, ECONOMY.startGold - BUILDINGS.mine.cost);
  assert.equal(place(s, 'mine', 3, 4, T0).reason, 'Casilla ocupada');
});

test('no se puede construir sin oro, fuera del mapa ni con tipos inventados', () => {
  const s = stateWithGold(10);
  assert.equal(place(s, 'mine', 0, 0, T0).reason, 'Oro insuficiente');
  s.gold = 1000;
  assert.equal(place(s, 'mine', 99, 0, T0).reason, 'Fuera del mapa');
  assert.equal(place(s, 'constructor', 0, 0, T0).reason, 'Edificio desconocido');
  assert.equal(place(s, '__proto__', 0, 0, T0).reason, 'Edificio desconocido');
});

test('la mina produce con el tiempo y respeta su capacidad', () => {
  const s = createNewState(T0);
  const { building } = place(s, 'mine', 0, 0, T0);
  tickAll(s, T0 + 10_000);
  assert.equal(building.stored, 5); // 0.5 oro/s * 10 s
  tickAll(s, T0 + 10_000 + ECONOMY.maxOfflineMs);
  assert.equal(building.stored, MINE[0].capacity);
});

test('si el reloj retrocede no se genera ni se pierde oro', () => {
  const s = createNewState(T0);
  const { building } = place(s, 'mine', 0, 0, T0);
  tickAll(s, T0 + 10_000);
  const gained = tickAll(s, T0); // reloj hacia atrás
  assert.equal(gained, 0);
  assert.equal(building.stored, 5);
  assert.equal(building.lastTick, T0);
});

test('recolectar mueve el oro a la reserva y respeta el límite del almacén', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  building.stored = 100;
  s.gold = ECONOMY.baseCap - 30; // caben 30
  const r = collect(s, building);
  assert.equal(r.amount, 30);
  assert.equal(s.gold, ECONOMY.baseCap);
  assert.equal(building.stored, 70);
  assert.equal(collect(s, building).reason, 'Almacén lleno');
});

test('collectAll suma todas las minas', () => {
  const s = stateWithGold(400);
  const a = place(s, 'mine', 0, 0, T0).building;
  const b = place(s, 'mine', 1, 0, T0).building;
  a.stored = 10;
  b.stored = 20;
  assert.equal(collectAll(s).amount, 30);
});

test('el almacén sube el límite y no se puede demoler si el oro no cabría', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'storage', 0, 0, T0);
  assert.equal(goldCap(s), ECONOMY.baseCap + STORAGE[0].capBonus);
  s.gold = ECONOMY.baseCap + 100;
  assert.equal(demolish(s, building.id).ok, false);
  s.gold = 100;
  assert.equal(demolish(s, building.id).ok, true);
  assert.equal(s.gold, 100 + Math.floor(BUILDINGS.storage.cost * ECONOMY.refundRate));
});

/* ---------- fase 2: mejoras con temporizador ---------- */

test('iniciar una mejora cobra el costo y fija cuándo termina', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  const gold = s.gold;
  const r = startUpgrade(s, building.id, T0);
  assert.equal(r.ok, true);
  assert.equal(s.gold, gold - MINE[1].upgradeCost);
  assert.equal(building.upgradeEndsAt, T0 + MINE[1].upgradeSec * 1000);
  assert.equal(building.level, 1); // sube al terminar, no al empezar
});

test('durante la mejora no produce; al terminar sube de nivel, avisa y produce con las nuevas estadísticas', () => {
  const s = stateWithGold(1000);
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
  const s = stateWithGold(1000);
  const { building } = place(s, 'storage', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  const cap = goldCap(s);
  assert.equal(cap, ECONOMY.baseCap + STORAGE[0].capBonus, 'mientras mejora conserva el nivel anterior');
  tickAll(s, T0 + 3 * 60 * 60 * 1000); // 3 h después
  assert.equal(building.level, 2);
  assert.equal(goldCap(s), ECONOMY.baseCap + STORAGE[1].capBonus);
});

test('la producción acumulada antes de empezar la mejora no se pierde', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0 + 10_000);
  assert.equal(building.stored, 5);
});

test('solo hay tantas mejoras simultáneas como obreros', () => {
  const s = stateWithGold(1000);
  const ids = [0, 1, 2].map((x) => place(s, 'mine', x, 0, T0).building.id);
  assert.equal(startUpgrade(s, ids[0], T0).ok, true);
  assert.equal(startUpgrade(s, ids[1], T0).ok, true);
  assert.equal(busyBuilders(s), ECONOMY.builders);
  assert.equal(startUpgrade(s, ids[2], T0).reason, 'Todos los obreros están ocupados');
  tickAll(s, T0 + 10 * 60 * 1000); // terminan las dos
  assert.equal(busyBuilders(s), 0);
  assert.equal(startUpgrade(s, ids[2], T0 + 10 * 60 * 1000).ok, true);
});

test('mejorar valida oro, nivel máximo, mejora repetida y existencia', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  assert.equal(startUpgrade(s, 999, T0).reason, 'No existe ese edificio');

  s.gold = 10;
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Oro insuficiente');

  s.gold = 1000;
  startUpgrade(s, building.id, T0);
  assert.equal(startUpgrade(s, building.id, T0).reason, 'Ya se está mejorando');

  tickAll(s, T0 + 60_000); // nivel 2
  startUpgrade(s, building.id, T0 + 60_000);
  tickAll(s, T0 + 60_000 + 10 * 60_000); // nivel 3 = máximo
  assert.equal(building.level, 3);
  assert.equal(startUpgrade(s, building.id, T0 + 20 * 60_000).reason, 'Ya está al nivel máximo');
});

test('un reloj o guardado manipulado no puede dejar una mejora más lejos que su duración', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  building.upgradeEndsAt = T0 + 1e12; // alguien lo editó a un futuro lejano
  tickAll(s, T0 + 5_000);
  assert.equal(building.upgradeEndsAt, T0 + 5_000 + MINE[1].upgradeSec * 1000);
});

test('no se puede demoler en plena mejora y el reembolso incluye lo invertido en mejoras', () => {
  const s = stateWithGold(1000);
  const { building } = place(s, 'mine', 0, 0, T0);
  startUpgrade(s, building.id, T0);
  assert.equal(demolish(s, building.id).reason, 'Espera a que termine la mejora');

  tickAll(s, T0 + 60_000); // nivel 2
  assert.equal(investedGold(building), BUILDINGS.mine.cost + MINE[1].upgradeCost);
  s.gold = 0;
  demolish(s, building.id);
  assert.equal(s.gold, Math.floor((BUILDINGS.mine.cost + MINE[1].upgradeCost) * ECONOMY.refundRate));
});

test('formatDuration muestra m:ss y h:mm:ss, redondeando hacia arriba', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(1), '0:01');
  assert.equal(formatDuration(59_000), '0:59');
  assert.equal(formatDuration(125_000), '2:05');
  assert.equal(formatDuration(3_600_000), '1:00:00');
  assert.equal(formatDuration(-5), '0:00');
});
