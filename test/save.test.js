import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewState, place } from '../src/game/logic.js';
import { MAX_SAVE_BYTES, parseSave, serialize } from '../src/game/save.js';

const T0 = 1_700_000_000_000;

function sampleState() {
  const s = createNewState(T0);
  s.gold = 1000;
  place(s, 'mine', 2, 2, T0);
  place(s, 'tower', 5, 5, T0);
  s.gold = 300; // dentro del límite de oro sin almacenes
  return s;
}

/** Reescribe un guardado con datos alterados pero con checksum "válido" (como haría un tramposo). */
function tamper(state, mutate) {
  const env = JSON.parse(serialize(state));
  mutate(env.data);
  // Recalcular el checksum importando la misma función indirectamente: serializamos de nuevo.
  return JSON.stringify(env);
}

test('ida y vuelta: lo que se guarda se recupera igual', () => {
  const s = sampleState();
  const r = parseSave(serialize(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
});

test('rechaza texto vacío, no JSON y archivos enormes', () => {
  assert.equal(parseSave('').ok, false);
  assert.equal(parseSave('{no es json').ok, false);
  assert.equal(parseSave('x'.repeat(MAX_SAVE_BYTES + 1)).ok, false);
  assert.equal(parseSave('null').ok, false);
  assert.equal(parseSave('[]').ok, false);
});

test('un cambio manual sin recalcular el checksum se detecta', () => {
  const s = sampleState();
  const text = tamper(s, (d) => {
    d.gold = 999_999;
  });
  const r = parseSave(text);
  assert.equal(r.ok, false);
  assert.match(r.error, /dañada o fue modificada/);
});

test('rechaza una versión más nueva que la del juego', () => {
  const env = JSON.parse(serialize(sampleState()));
  env.v = 99;
  assert.equal(parseSave(JSON.stringify(env)).ok, false);
});

// Para probar la validación saltando el checksum construimos el sobre con la misma
// función de serialización de un estado ya inválido en memoria.
function serializeRaw(state) {
  return serialize(state); // serialize no valida: calcula el checksum del dato que le pasen
}

test('la validación rechaza datos con checksum correcto pero contenido imposible', () => {
  const cases = {
    'oro negativo': (s) => (s.gold = -5),
    'oro decimal': (s) => (s.gold = 1.5),
    'oro como texto': (s) => (s.gold = '100'),
    'tipo desconocido': (s) => (s.buildings[0].type = 'dragon'),
    'tipo __proto__': (s) => (s.buildings[0].type = '__proto__'),
    'fuera del mapa': (s) => (s.buildings[0].x = 50),
    'misma casilla': (s) => ((s.buildings[1].x = s.buildings[0].x), (s.buildings[1].y = s.buildings[0].y)),
    'id repetido': (s) => (s.buildings[1].id = s.buildings[0].id),
    'producción sobre capacidad': (s) => (s.buildings[0].stored = 99_999),
    'NaN en producción': (s) => (s.buildings[0].stored = NaN),
    'edificios no es lista': (s) => (s.buildings = {}),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const s = sampleState();
    mutate(s);
    // NaN se serializa como null en JSON, que tampoco es un número válido.
    const r = parseSave(serializeRaw(s));
    assert.equal(r.ok, false, `debería rechazar: ${name}`);
  }
});

test('descarta campos desconocidos del archivo', () => {
  const s = sampleState();
  s.extra = 'inyectado';
  s.buildings[0].admin = true;
  const r = parseSave(serializeRaw(s));
  assert.equal(r.ok, true);
  assert.equal('extra' in r.state, false);
  assert.equal('admin' in r.state.buildings[0], false);
});

test('el oro que excede la capacidad se recorta al cargar', () => {
  const s = sampleState();
  s.gold = 900_000;
  const r = parseSave(serializeRaw(s));
  assert.equal(r.ok, true);
  assert.equal(r.state.gold, 500); // límite base sin almacenes
});
