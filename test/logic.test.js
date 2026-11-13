import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, ECONOMY } from '../src/data/config.js';
import {
  collect,
  collectAll,
  createNewState,
  demolish,
  goldCap,
  place,
  tickAll,
} from '../src/game/logic.js';

const T0 = 1_700_000_000_000;

test('colocar un edificio descuenta oro y ocupa la casilla', () => {
  const s = createNewState(T0);
  const r = place(s, 'mine', 3, 4, T0);
  assert.equal(r.ok, true);
  assert.equal(s.gold, ECONOMY.startGold - BUILDINGS.mine.cost);
  assert.equal(place(s, 'mine', 3, 4, T0).reason, 'Casilla ocupada');
});

test('no se puede construir sin oro, fuera del mapa ni con tipos inventados', () => {
  const s = createNewState(T0);
  s.gold = 10;
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
  assert.equal(building.stored, BUILDINGS.mine.capacity);
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
  const s = createNewState(T0);
  s.gold = 1000;
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
  const s = createNewState(T0);
  s.gold = 400;
  const a = place(s, 'mine', 0, 0, T0).building;
  const b = place(s, 'mine', 1, 0, T0).building;
  a.stored = 10;
  b.stored = 20;
  assert.equal(collectAll(s).amount, 30);
});

test('el almacén sube el límite y no se puede demoler si el oro no cabría', () => {
  const s = createNewState(T0);
  s.gold = 1000;
  const { building } = place(s, 'storage', 0, 0, T0);
  assert.equal(goldCap(s), ECONOMY.baseCap + BUILDINGS.storage.capBonus);
  s.gold = ECONOMY.baseCap + 100;
  assert.equal(demolish(s, building.id).ok, false);
  s.gold = 100;
  assert.equal(demolish(s, building.id).ok, true);
  assert.equal(s.gold, 100 + Math.floor(BUILDINGS.storage.cost * ECONOMY.refundRate));
});
