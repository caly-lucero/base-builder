import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, UNITS } from '../src/data/config.js';
import { HEROES } from '../src/data/heroes.js';
import { DEFAULT_RACE, RACES, RACE_KEYS, applyRace, current } from '../src/data/races.js';
import { IMAGES, SHEETS, imageFile, sheetFile } from '../src/data/assets.js';
import { createNewState } from '../src/game/logic.js';
import { SAVE_VERSION, checksum, parseSave, serialize } from '../src/game/save.js';

const T0 = 1_700_000_000_000;

test('cada raza nombra todo lo que existe y las estadísticas no cambian', () => {
  const before = JSON.stringify({ b: Object.values(BUILDINGS).map((d) => d.size), u: Object.values(UNITS).map((d) => [d.cost, d.trainSec]) });
  for (const id of RACE_KEYS) {
    const { names } = RACES[id];
    if (id === DEFAULT_RACE) continue;
    assert.deepEqual(Object.keys(names.buildings).sort(), Object.keys(BUILDINGS).sort(), `${id}: edificios`);
    assert.deepEqual(Object.keys(names.units).sort(), Object.keys(UNITS).sort(), `${id}: unidades`);
    assert.deepEqual(Object.keys(names.heroes).sort(), Object.keys(HEROES).sort(), `${id}: héroes`);
    assert.equal(names.townhallLevels.length, BUILDINGS.townhall.levelNames.length, `${id}: niveles del Ayuntamiento`);
    for (const n of [...Object.values(names.buildings), ...Object.values(names.units)]) assert.ok(n.length <= 22, `nombre largo: ${n}`);
  }
  applyRace('sylvan');
  assert.equal(current.race, 'sylvan');
  assert.equal(BUILDINGS.townhall.name, 'Árbol Madre');
  assert.equal(UNITS.soldier.name, 'Lancero');
  assert.equal(HEROES.paladin.name, 'Guardián');
  const after = JSON.stringify({ b: Object.values(BUILDINGS).map((d) => d.size), u: Object.values(UNITS).map((d) => [d.cost, d.trainSec]) });
  assert.equal(after, before, 'solo cambian los nombres');
  applyRace('kingdom');
  assert.equal(BUILDINGS.townhall.name, 'Ayuntamiento');
  assert.equal(UNITS.soldier.name, 'Soldado');
  assert.equal(HEROES.paladin.name, 'Paladín');
  applyRace('no-existe');
  assert.equal(current.race, DEFAULT_RACE);
});

test('la raza va en el guardado: se conserva, la vieja es del Reino y una inválida se rechaza', () => {
  const s = createNewState(T0, 'sylvan');
  assert.equal(s.race, 'sylvan');
  const r = parseSave(serialize(s));
  assert.ok(r.ok, r.error);
  assert.equal(r.state.race, 'sylvan');
  assert.equal(createNewState(T0, 'otra').race, DEFAULT_RACE);

  // Una partida v13 (sin raza) se abre como del Reino.
  const data = JSON.parse(serialize(createNewState(T0))).data;
  delete data.race;
  const old = parseSave(JSON.stringify({ v: 13, sum: checksum(data), data }));
  assert.ok(old.ok, old.error);
  assert.equal(old.state.race, DEFAULT_RACE);
  assert.ok(SAVE_VERSION >= 14);
  const bad = JSON.parse(serialize(createNewState(T0)));
  bad.data.race = 'orcos';
  assert.equal(parseSave(JSON.stringify(bad)).ok, false);
});

test('las rutas del arte cambian con la raza (y los enemigos y la decoración son comunes)', () => {
  assert.equal(imageFile('house_1', 'kingdom'), 'iso/buildings/house_1.png');
  assert.equal(imageFile('house_1_r2', 'sylvan'), 'iso/sylvan/buildings/house_1_r2.png');
  assert.equal(sheetFile('unit_soldier', 'sylvan'), 'iso/sylvan/units/unit_soldier.png');
  assert.equal(sheetFile('hero_ranger', 'kingdom'), 'iso/units/hero_ranger.png');
  assert.equal(sheetFile('enemy_guard', 'sylvan'), SHEETS.enemy_guard);
  assert.equal(imageFile('tree_a', 'sylvan'), IMAGES.tree_a);
});

test('el arte de cada raza está completo y las medidas de sus edificios son las de sus dibujos', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const { ART_BOXES } = await import('../src/data/artBoxesSylvan.js');
  const { SHEET } = await import('../src/game/unitArt.js');
  const root = new URL('../public/assets/', import.meta.url);
  const size = (file) => {
    const head = readFileSync(new URL(file, root)).subarray(16, 24);
    return [head.readUInt32BE(0), head.readUInt32BE(4)];
  };
  for (const race of RACE_KEYS) {
    for (const key of Object.keys(IMAGES)) {
      const file = imageFile(key, race);
      assert.ok(existsSync(new URL(file, root)), `${race}: falta ${file}`);
      if (race === 'sylvan' && file.includes('/buildings/')) {
        const box = ART_BOXES[key];
        assert.ok(box, `sylvan: ${key} sin medidas`);
        assert.deepEqual(size(file), [box.w, box.h], `sylvan: ${key}`);
      }
    }
    for (const key of Object.keys(SHEETS)) {
      const file = sheetFile(key, race);
      assert.ok(existsSync(new URL(file, root)), `${race}: falta ${file}`);
      assert.deepEqual(size(file), [SHEET.cols * SHEET.frameWidth, 4 * SHEET.frameHeight], `${race}: ${key}`);
    }
  }
});
