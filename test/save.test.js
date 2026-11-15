import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../src/data/config.js';
import { TOWN_HALL_CELL, createNewState, place, startUpgrade, townHall } from '../src/game/logic.js';
import { MAX_SAVE_BYTES, SAVE_VERSION, checksum, parseSave, serialize } from '../src/game/save.js';

const T0 = 1_700_000_000_000;

// Índices en state.buildings de la partida de ejemplo: [0] Ayuntamiento, [1] mina, [2] torre.
const HALL = 0;
const MINE = 1;
const TOWER = 2;

function sampleState() {
  const s = createNewState(T0);
  s.gold = 1000;
  s.wood = 1000;
  townHall(s).level = 3;
  place(s, 'mine', 2, 2, T0);
  place(s, 'tower', 5, 5, T0);
  s.gold = 300; // dentro del tope de recursos sin almacenes
  s.wood = 200;
  return s;
}

/** Reescribe un guardado con datos alterados pero sin recalcular el checksum (como haría alguien torpe). */
function tamper(state, mutate) {
  const env = JSON.parse(serialize(state));
  mutate(env.data);
  return JSON.stringify(env);
}

// serialize() no valida: calcula el checksum del dato que le pasen, así podemos probar
// la validación con datos imposibles pero con checksum correcto (como haría un tramposo hábil).
const serializeRaw = (state) => serialize(state);

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
  const text = tamper(sampleState(), (d) => {
    d.gold = 999_999;
  });
  const r = parseSave(text);
  assert.equal(r.ok, false);
  assert.match(r.error, /dañada o fue modificada/);
});

test('rechaza una versión más nueva que la del juego', () => {
  const env = JSON.parse(serialize(sampleState()));
  env.v = SAVE_VERSION + 1;
  assert.equal(parseSave(JSON.stringify(env)).ok, false);
});

test('la validación rechaza datos con checksum correcto pero contenido imposible', () => {
  const cases = {
    'oro negativo': (s) => (s.gold = -5),
    'oro decimal': (s) => (s.gold = 1.5),
    'oro como texto': (s) => (s.gold = '100'),
    'madera negativa': (s) => (s.wood = -1),
    'madera como texto': (s) => (s.wood = '10'),
    'sin madera (undefined)': (s) => delete s.wood,
    'tipo desconocido': (s) => (s.buildings[MINE].type = 'dragon'),
    'tipo __proto__': (s) => (s.buildings[MINE].type = '__proto__'),
    'fuera del mapa': (s) => (s.buildings[MINE].x = 50),
    'casilla negativa': (s) => (s.buildings[MINE].y = -1),
    'misma casilla': (s) => ((s.buildings[TOWER].x = s.buildings[MINE].x), (s.buildings[TOWER].y = s.buildings[MINE].y)),
    'id repetido': (s) => (s.buildings[TOWER].id = s.buildings[MINE].id),
    'producción sobre capacidad': (s) => (s.buildings[MINE].stored = 99_999),
    'NaN en producción': (s) => (s.buildings[MINE].stored = NaN),
    'edificios no es lista': (s) => (s.buildings = {}),
    'nivel 0': (s) => (s.buildings[MINE].level = 0),
    'nivel sobre el máximo': (s) => (s.buildings[MINE].level = 4),
    'nivel decimal': (s) => (s.buildings[MINE].level = 1.5),
    'mejora sin fecha (undefined)': (s) => delete s.buildings[MINE].upgradeEndsAt,
    'fecha de mejora como texto': (s) => (s.buildings[MINE].upgradeEndsAt = '123'),
    'fecha de mejora negativa': (s) => (s.buildings[MINE].upgradeEndsAt = -1),
    'mejora en edificio de nivel máximo': (s) => ((s.buildings[HALL].level = 3), (s.buildings[HALL].upgradeEndsAt = T0 + 1000)),
    'más mejoras que obreros': (s) => {
      for (const b of s.buildings) b.upgradeEndsAt = T0 + 1000; // 3 a la vez, con 2 obreros
    },
    'misiones no es lista': (s) => (s.claimedQuests = 'q_sawmill'),
    'misión desconocida': (s) => (s.claimedQuests = ['no_existe']),
    'misión repetida': (s) => (s.claimedQuests = ['q_sawmill', 'q_sawmill']),
    'misión como número': (s) => (s.claimedQuests = [5]),
    'sin misiones (undefined)': (s) => delete s.claimedQuests,
    'más misiones de las que existen': (s) => (s.claimedQuests = Array.from({ length: 99 }, (_, i) => `q${i}`)),
    'sin Ayuntamiento': (s) => s.buildings.splice(HALL, 1),
    'dos Ayuntamientos': (s) => {
      s.buildings.push({ id: 9, type: 'townhall', level: 1, upgradeEndsAt: null, x: 20, y: 20, stored: 0, lastTick: T0 });
      s.nextId = 10;
    },
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
  s.buildings[MINE].admin = true;
  const r = parseSave(serializeRaw(s));
  assert.equal(r.ok, true);
  assert.equal('extra' in r.state, false);
  assert.equal('admin' in r.state.buildings[MINE], false);
});

test('una mejora en curso se guarda y se recupera igual', () => {
  const s = sampleState();
  s.gold = 400;
  startUpgrade(s, s.buildings[MINE].id, T0);
  const r = parseSave(serialize(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  assert.equal(r.state.buildings[MINE].upgradeEndsAt, s.buildings[MINE].upgradeEndsAt);
});

test('las misiones reclamadas se guardan y se recuperan', () => {
  const s = sampleState();
  s.claimedQuests = ['q_sawmill', 'q_mines'];
  const r = parseSave(serialize(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.claimedQuests, ['q_sawmill', 'q_mines']);
});

test('el oro y la madera que exceden el tope se recortan al cargar', () => {
  const s = sampleState();
  s.gold = 900_000;
  s.wood = 800_000;
  const r = parseSave(serializeRaw(s));
  assert.equal(r.ok, true);
  assert.equal(r.state.gold, ECONOMY.baseCap);
  assert.equal(r.state.wood, ECONOMY.baseCap);
});

/* ---------- migraciones ---------- */

/** Partida tal como la guardaba la versión 1 (sin nivel, mejoras, madera ni Ayuntamiento; mapa de 12×12). */
function v1Save(mutate = () => {}) {
  const data = {
    gold: 250,
    nextId: 3,
    savedAt: T0,
    buildings: [
      { id: 1, type: 'mine', x: 2, y: 2, stored: 12.5, lastTick: T0 },
      { id: 2, type: 'storage', x: 4, y: 4, stored: 0, lastTick: T0 },
    ],
  };
  mutate(data);
  return JSON.stringify({ v: 1, sum: checksum(data), data });
}

/** Partida v2: con niveles y mejoras, pero sin madera ni Ayuntamiento. */
function v2Save(buildings, extra = {}) {
  const data = { gold: 400, nextId: 20, savedAt: T0, buildings, ...extra };
  return JSON.stringify({ v: 2, sum: checksum(data), data });
}

const b2 = (id, type, x, y, level = 1, upgradeEndsAt = null, stored = 0) => ({ id, type, level, upgradeEndsAt, x, y, stored, lastTick: T0 });

test('migración v1 → v3: una partida de la fase 1 se abre centrada, con madera y Ayuntamiento', () => {
  const r = parseSave(v1Save());
  assert.equal(r.ok, true);
  assert.equal(r.state.gold, 250);
  assert.equal(r.state.wood, 60);

  const mine = r.state.buildings.find((b) => b.type === 'mine');
  const storage = r.state.buildings.find((b) => b.type === 'storage');
  assert.deepEqual([mine.x, mine.y], [8, 8], 'la base se centra: +6 en cada eje');
  assert.deepEqual([storage.x, storage.y], [10, 10]);
  assert.equal(mine.level, 1);
  assert.equal(mine.stored, 12.5, 'conserva lo que había');

  const hall = townHall(r.state);
  assert.ok(hall, 'tiene Ayuntamiento');
  assert.deepEqual([hall.x, hall.y], [TOWN_HALL_CELL.x, TOWN_HALL_CELL.y]);
  assert.equal(hall.level, 1);
  assert.equal(r.state.buildings.length, 3);
});

test('migración v2 → v3: conserva niveles y mejoras en curso, y el Ayuntamiento sube lo necesario', () => {
  const endsAt = T0 + 20_000;
  const r = parseSave(
    v2Save([b2(1, 'mine', 1, 1, 3), b2(2, 'storage', 2, 1, 2, endsAt), b2(3, 'tower', 3, 1, 1)]),
  );
  assert.equal(r.ok, true);
  const hall = townHall(r.state);
  assert.equal(hall.level, 3, 'hay una mina nivel 3: el Ayuntamiento no puede ser menor');
  assert.equal(r.state.buildings.find((b) => b.type === 'storage').upgradeEndsAt, endsAt);
  assert.equal(r.state.nextId, 21);
  assert.equal(hall.id, 20, 'el Ayuntamiento toma el siguiente id libre');
});

test('migración: el Ayuntamiento sube de nivel si no, la partida antigua rompería los límites', () => {
  // 5 minas de nivel 1: el nivel 1 solo permite 3, así que hace falta al menos el nivel 2.
  const mines = [1, 2, 3, 4, 5].map((i) => b2(i, 'mine', i, 0));
  const r = parseSave(v2Save(mines, { nextId: 10 }));
  assert.equal(r.ok, true);
  assert.equal(townHall(r.state).level, 2);
});

test('migración: si el centro está ocupado, el Ayuntamiento va a la casilla libre más cercana', () => {
  // (5,5) en el mapa viejo es (11,11) en el nuevo: justo donde nace el Ayuntamiento.
  const r = parseSave(v2Save([b2(1, 'mine', 5, 5)]));
  assert.equal(r.ok, true);
  const hall = townHall(r.state);
  assert.notDeepEqual([hall.x, hall.y], [TOWN_HALL_CELL.x, TOWN_HALL_CELL.y]);
  assert.ok(Math.max(Math.abs(hall.x - TOWN_HALL_CELL.x), Math.abs(hall.y - TOWN_HALL_CELL.y)) === 1);
});

test('migración v3 → v4: una partida con Ayuntamiento y madera sigue igual y empieza sin misiones reclamadas', () => {
  const data = {
    gold: 300,
    wood: 120,
    nextId: 4,
    savedAt: T0,
    buildings: [b2(1, 'townhall', 11, 11, 2), b2(2, 'mine', 8, 8, 3), b2(3, 'wall', 9, 9)],
  };
  const r = parseSave(JSON.stringify({ v: 3, sum: checksum(data), data }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.claimedQuests, []);
  assert.equal(r.state.wood, 120, 'no se toca la madera que ya tenía');
  assert.equal(r.state.buildings.length, 3);
  assert.equal(townHall(r.state).level, 2);
});

test('la migración no abre una partida antigua modificada, ni una con forma rara', () => {
  const env = JSON.parse(v1Save());
  env.data.gold = 500; // sin recalcular el checksum
  assert.equal(parseSave(JSON.stringify(env)).ok, false);

  // forma rara pero con checksum correcto: la migración no debe lanzar, la validación debe rechazar
  assert.equal(parseSave(v1Save((d) => (d.buildings = 'no soy una lista'))).ok, false);
  assert.equal(parseSave(v1Save((d) => (d.buildings = [null, 5, 'x']))).ok, false);
  assert.equal(parseSave(v1Save((d) => (d.nextId = 'x'))).ok, false);
  assert.equal(parseSave(v1Save((d) => (d.buildings[0].x = 'x'))).ok, false);
});
