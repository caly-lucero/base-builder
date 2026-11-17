import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMY } from '../src/data/config.js';
import { TOWN_HALL_CELL, createNewState, place, startTraining, startUpgrade, townHall } from '../src/game/logic.js';
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
    'nivel sobre el máximo': (s) => (s.buildings[MINE].level = 11),
    'nivel decimal': (s) => (s.buildings[MINE].level = 1.5),
    'mejora sin fecha (undefined)': (s) => delete s.buildings[MINE].upgradeEndsAt,
    'fecha de mejora como texto': (s) => (s.buildings[MINE].upgradeEndsAt = '123'),
    'fecha de mejora negativa': (s) => (s.buildings[MINE].upgradeEndsAt = -1),
    'mejora en edificio de nivel máximo': (s) => ((s.buildings[HALL].level = 10), (s.buildings[HALL].upgradeEndsAt = T0 + 1000)),
    'más mejoras que obreros': (s) => {
      for (const b of s.buildings) b.upgradeEndsAt = T0 + 1000; // 3 a la vez, con 2 obreros
    },
    'ejército no es objeto': (s) => (s.army = 5),
    'ejército sin un tipo': (s) => delete s.army.soldier,
    'soldados negativos': (s) => (s.army.soldier = -1),
    'soldados decimales': (s) => (s.army.soldier = 1.5),
    'soldados como texto': (s) => (s.army.soldier = '3'),
    'ejército imposible de sostener': (s) => (s.army.soldier = 999),
    'héroes como texto': (s) => (s.heroes = 'rey'),
    'héroe desconocido': (s) => (s.heroes = { dragon: { level: 1, xp: 0 } }),
    'héroe como texto': (s) => (s.heroes = { paladin: 'rey' }),
    'héroe sin nivel': (s) => (s.heroes = { paladin: { xp: 0 } }),
    'héroe con nivel absurdo': (s) => (s.heroes = { paladin: { level: 99, xp: 0 } }),
    'héroe sin experiencia': (s) => (s.heroes = { paladin: { level: 1 } }),
    'héroe con experiencia negativa': (s) => (s.heroes = { paladin: { level: 1, xp: -5 } }),
    'sin héroes (undefined)': (s) => delete s.heroes,
    'escuadra con un héroe que no tienes': (s) => (s.squad = ['paladin']),
    'escuadra de 3': (s) => ((s.heroes = { paladin: { level: 1, xp: 0 }, ranger: { level: 1, xp: 0 }, priestess: { level: 1, xp: 0 } }), (s.squad = ['paladin', 'ranger', 'priestess'])),
    'escuadra con repetidos': (s) => ((s.heroes = { paladin: { level: 1, xp: 0 } }), (s.squad = ['paladin', 'paladin'])),
    'escuadra no es lista': (s) => (s.squad = 'paladin'),
    'sin escuadra (undefined)': (s) => delete s.squad,
    'logros no es objeto': (s) => (s.achievements = 3),
    'logro con niveles de más': (s) => (s.achievements.builder = 99),
    'logro negativo': (s) => (s.achievements.army = -1),
    'logro decimal': (s) => (s.achievements.siege = 1.5),
    'sin logros (undefined)': (s) => delete s.achievements,
    'falta un logro': (s) => delete s.achievements.conquer,
    'investigación negativa': (s) => (s.research.weapons = -1),
    'investigación sobre el máximo': (s) => (s.research.armor = 11),
    'investigación decimal': (s) => (s.research.fortify = 1.5),
    'sin investigaciones (undefined)': (s) => delete s.research,
    'daño como texto': (s) => (s.buildings[MINE].damaged = 'si'),
    'daño sin campo (undefined)': (s) => delete s.buildings[MINE].damaged,
    'Ayuntamiento dañado': (s) => (s.buildings[HALL].damaged = true),
    'calendario no es objeto': (s) => (s.raid = 5),
    'calendario sin hora': (s) => (s.raid = { count: 0 }),
    'calendario con hora negativa': (s) => (s.raid = { nextAt: -1, count: 0 }),
    'calendario con cuenta decimal': (s) => (s.raid = { nextAt: T0, count: 1.5 }),
    'calendario con cuenta negativa': (s) => (s.raid = { nextAt: T0, count: -1 }),
    'sin calendario (undefined)': (s) => delete s.raid,
    'campaña no es objeto': (s) => (s.campaign = 3),
    'campaña sin progreso': (s) => (s.campaign = { stars: {} }),
    'campaña con progreso negativo': (s) => (s.campaign = { cleared: -1, stars: {} }),
    'campaña con progreso decimal': (s) => (s.campaign = { cleared: 1.5, stars: {} }),
    'campaña sin estrellas': (s) => (s.campaign = { cleared: 1 }),
    'estrellas no es objeto': (s) => (s.campaign.stars = 3),
    'estrellas de más (4)': (s) => (s.campaign.stars = { 1: 4 }),
    'estrellas negativas': (s) => (s.campaign.stars = { 1: -1 }),
    'estrellas con nivel raro': (s) => (s.campaign.stars = { abc: 1 }),
    'estrellas con nivel cero': (s) => (s.campaign.stars = { 0: 1 }),
    'sin campaña (undefined)': (s) => delete s.campaign,
    'entrenamiento sin campo (undefined)': (s) => delete s.buildings[MINE].training,
    'entrenamiento en un edificio que no entrena': (s) => (s.buildings[MINE].training = { unit: 'soldier', endsAt: T0 + 1000 }),
    'entrenamiento de una unidad que no corresponde': (s) => {
      s.buildings.push({ id: 7, type: 'barracks', level: 1, upgradeEndsAt: null, training: { unit: 'paladin', endsAt: T0 + 1000 }, damaged: false, x: 9, y: 9, stored: 0, lastTick: T0 });
      s.nextId = 8;
    },
    'entrenamiento con fecha inválida': (s) => {
      s.buildings.push({ id: 7, type: 'barracks', level: 1, upgradeEndsAt: null, training: { unit: 'soldier', endsAt: 'x' }, damaged: false, x: 9, y: 9, stored: 0, lastTick: T0 });
      s.nextId = 8;
    },
    'mejora y entrenamiento a la vez': (s) => {
      s.buildings.push({ id: 7, type: 'barracks', level: 1, upgradeEndsAt: T0 + 1000, training: { unit: 'soldier', endsAt: T0 + 1000 }, damaged: false, x: 9, y: 9, stored: 0, lastTick: T0 });
      s.nextId = 8;
    },
    'misiones no es lista': (s) => (s.claimedQuests = 'q_sawmill'),
    'misión desconocida': (s) => (s.claimedQuests = ['no_existe']),
    'misión repetida': (s) => (s.claimedQuests = ['q_sawmill', 'q_sawmill']),
    'misión como número': (s) => (s.claimedQuests = [5]),
    'sin misiones (undefined)': (s) => delete s.claimedQuests,
    'más misiones de las que existen': (s) => (s.claimedQuests = Array.from({ length: 99 }, (_, i) => `q${i}`)),
    'sin Ayuntamiento': (s) => s.buildings.splice(HALL, 1),
    'dos Ayuntamientos': (s) => {
      s.buildings.push({ id: 9, type: 'townhall', level: 1, upgradeEndsAt: null, training: null, damaged: false, x: 20, y: 20, stored: 0, lastTick: T0 });
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

test('el ejército, los héroes, las investigaciones y un entrenamiento en curso se guardan y se recuperan', () => {
  const s = sampleState();
  s.gold = 450; // dentro del tope de 500 y suficiente para lo que sigue
  s.wood = 300;
  townHall(s).level = 4;
  const barracks = place(s, 'barracks', 9, 9, T0).building;
  place(s, 'house', 10, 9, T0);
  s.army = { ...s.army, soldier: 3, archer: 2, mage: 1 };
  s.heroes = { paladin: { level: 2, xp: 35 }, priestess: { level: 7, xp: 120 } };
  s.squad = ['priestess', 'paladin'];
  s.research = { weapons: 2, armor: 0, fortify: 3 };
  s.achievements.builder = 2;
  s.achievements.conquer = 1;
  s.campaign = { cleared: 4, stars: { 1: 3, 2: 2, 3: 1, 4: 1 } };
  assert.equal(startTraining(s, barracks.id, 'soldier', T0).ok, true);

  const r = parseSave(serialize(s));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
  assert.equal(r.state.army.archer, 2);
  assert.deepEqual(r.state.heroes, { paladin: { level: 2, xp: 35 }, priestess: { level: 7, xp: 120 } });
  assert.deepEqual(r.state.squad, ['priestess', 'paladin'], 'conserva el orden de la escuadra');
  assert.deepEqual(r.state.research, { weapons: 2, armor: 0, fortify: 3 });
  assert.deepEqual(r.state.campaign, { cleared: 4, stars: { 1: 3, 2: 2, 3: 1, 4: 1 } }, 'conserva las estrellas');
  assert.deepEqual([r.state.achievements.builder, r.state.achievements.conquer], [2, 1], 'conserva los logros reclamados');
  assert.deepEqual(r.state.buildings.find((b) => b.type === 'barracks').training, { unit: 'soldier', endsAt: T0 + 15_000 });
});

test('los edificios dañados y el calendario de ataques se guardan y se recuperan', () => {
  const s = sampleState();
  s.buildings[MINE].damaged = true;
  s.raid = { nextAt: T0 + 123_456, count: 4 };
  const r = parseSave(serialize(s));
  assert.equal(r.ok, true);
  assert.equal(r.state.buildings[MINE].damaged, true);
  assert.equal(r.state.buildings[HALL].damaged, false);
  assert.deepEqual(r.state.raid, { nextAt: T0 + 123_456, count: 4 });
});

test('migración v6 → v7: nada queda dañado y el calendario queda «sin programar»', () => {
  const data = {
    gold: 300,
    wood: 120,
    nextId: 4,
    savedAt: T0,
    claimedQuests: [],
    army: { soldier: 1, mage: 0, knight: 0 },
    hero: null,
    campaign: { cleared: 2 },
    buildings: [
      { ...b2(1, 'townhall', 11, 11, 2), training: null },
      { ...b2(2, 'mine', 8, 8, 3), training: null },
      { ...b2(3, 'wall', 9, 9), training: null },
    ],
  };
  const r = parseSave(JSON.stringify({ v: 6, sum: checksum(data), data }));
  assert.equal(r.ok, true);
  assert.ok(r.state.buildings.every((b) => b.damaged === false));
  assert.deepEqual(r.state.raid, { nextAt: 0, count: 0 });
  assert.deepEqual(r.state.campaign, { cleared: 2, stars: { 1: 1, 2: 1 } }, 'conserva la campaña; cada nivel superado cuenta como 1 estrella');
  assert.equal(r.state.buildings.length, 3);
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

test('migración v4 → v5: una partida con misiones sigue igual y sin ejército, héroe ni entrenamientos', () => {
  const data = {
    gold: 300,
    wood: 120,
    nextId: 4,
    savedAt: T0,
    claimedQuests: ['q_sawmill'],
    buildings: [b2(1, 'townhall', 11, 11, 2), b2(2, 'mine', 8, 8, 1), b2(3, 'wall', 9, 9)],
  };
  const r = parseSave(JSON.stringify({ v: 4, sum: checksum(data), data }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.army, { soldier: 0, archer: 0, mage: 0, knight: 0, catapult: 0, ram: 0 });
  assert.deepEqual(r.state.heroes, {});
  assert.ok(r.state.buildings.every((b) => b.training === null));
  assert.deepEqual(r.state.claimedQuests, ['q_sawmill'], 'conserva las misiones');
  assert.equal(r.state.wood, 120);
});

test('migración v5 → v6: una partida con héroe conserva todo y añade campaña y experiencia', () => {
  const data = {
    gold: 300,
    wood: 120,
    nextId: 4,
    savedAt: T0,
    claimedQuests: ['q_sawmill'],
    army: { soldier: 2, mage: 0, knight: 0 },
    hero: { level: 2 },
    buildings: [{ ...b2(1, 'townhall', 11, 11, 2), training: null }, { ...b2(2, 'altar', 8, 8), training: null }],
  };
  const r = parseSave(JSON.stringify({ v: 5, sum: checksum(data), data }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.heroes, { paladin: { level: 2, xp: 0 } }, 'el héroe de antes es el paladín');
  assert.deepEqual(r.state.squad, ['paladin']);
  assert.deepEqual(r.state.campaign, { cleared: 0, stars: {} });
  assert.deepEqual(r.state.army, { soldier: 2, archer: 0, mage: 0, knight: 0, catapult: 0, ram: 0 });
  assert.deepEqual(r.state.claimedQuests, ['q_sawmill']);

  const noHero = { ...data, hero: null };
  const r2 = parseSave(JSON.stringify({ v: 5, sum: checksum(noHero), data: noHero }));
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.state.heroes, {});
  assert.deepEqual(r2.state.squad, []);
});

test('migración v7 → v8: granjas pasan a casas, el héroe pasa a ser el paladín y todo conserva su nivel', () => {
  const data = {
    gold: 300,
    wood: 120,
    nextId: 6,
    savedAt: T0,
    claimedQuests: ['q_sawmill'],
    army: { soldier: 2, mage: 1, knight: 0 },
    hero: { level: 4, xp: 55 },
    campaign: { cleared: 2 },
    raid: { nextAt: T0 + 5000, count: 1 },
    buildings: [
      { ...b2(1, 'townhall', 11, 11, 3), training: null, damaged: false },
      { ...b2(2, 'farm', 8, 8, 2), training: null, damaged: false },
      { ...b2(3, 'barracks', 9, 9, 3), training: null, damaged: false },
      { ...b2(4, 'altar', 6, 6, 1), training: { unit: 'hero', endsAt: T0 + 20_000 }, damaged: false },
      { ...b2(5, 'farm', 7, 7, 1), training: null, damaged: true },
    ],
  };
  const r = parseSave(JSON.stringify({ v: 7, sum: checksum(data), data }));
  assert.equal(r.ok, true, r.error);
  const types = r.state.buildings.map((b) => b.type);
  assert.deepEqual(types, ['townhall', 'house', 'barracks', 'altar', 'house']);
  assert.equal(r.state.buildings[1].level, 2, 'la casa conserva el nivel de la granja');
  assert.equal(r.state.buildings[4].damaged, true, 'y su daño');
  assert.deepEqual(r.state.buildings[3].training, { unit: 'paladin', endsAt: T0 + 20_000 }, 'el héroe en camino pasa a ser el paladín');
  assert.deepEqual(r.state.heroes, { paladin: { level: 4, xp: 55 } });
  assert.deepEqual(r.state.squad, ['paladin']);
  assert.deepEqual(r.state.research, { weapons: 0, armor: 0, fortify: 0 });
  assert.ok(Object.values(r.state.achievements).every((n) => n === 0), 'sin logros reclamados');
  assert.deepEqual(r.state.army, { soldier: 2, archer: 0, mage: 1, knight: 0, catapult: 0, ram: 0 });
  assert.equal(r.state.hero, undefined);
  assert.deepEqual(r.state.raid, { nextAt: T0 + 5000, count: 1 });
});

test('migración v7 → v8 sin héroe: queda sin héroes ni escuadra', () => {
  const data = {
    gold: 300, wood: 120, nextId: 3, savedAt: T0, claimedQuests: [], army: { soldier: 0, mage: 0, knight: 0 }, hero: null,
    campaign: { cleared: 0 }, raid: { nextAt: 0, count: 0 },
    buildings: [{ ...b2(1, 'townhall', 11, 11, 1), training: null, damaged: false }],
  };
  const r = parseSave(JSON.stringify({ v: 7, sum: checksum(data), data }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.state.heroes, {});
  assert.deepEqual(r.state.squad, []);
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

test('migración v8 → v9: cada nivel de campaña superado cuenta como 1 estrella y aparece el logro de estrellas', () => {
  const s = sampleState();
  const env = JSON.parse(serialize(s));
  const data = env.data;
  data.campaign = { cleared: 3 }; // como lo guardaba la v8
  delete data.achievements.stars;
  const r = parseSave(JSON.stringify({ v: 8, sum: checksum(data), data }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.state.campaign, { cleared: 3, stars: { 1: 1, 2: 1, 3: 1 } });
  assert.equal(r.state.achievements.stars, 0);
  assert.equal(r.state.achievements.builder, 0);
});
