import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { IMAGES, SOUNDS } from '../src/data/assets.js';
import { BUILDINGS } from '../src/data/config.js';
import { DECOR_KEYS, DECOR_SEED, generateDecor } from '../src/game/decor.js';
import { GRID } from '../src/data/config.js';

const ASSETS = new URL('../public/assets/', import.meta.url);

test('todos los archivos del manifiesto existen en public/assets', () => {
  for (const file of [...Object.values(IMAGES), ...Object.values(SOUNDS)]) {
    assert.ok(existsSync(new URL(file, ASSETS)), `falta ${file}`);
  }
});

test('no sobran imágenes ni sonidos sin declarar en el manifiesto', () => {
  const declared = new Set([...Object.values(IMAGES), ...Object.values(SOUNDS)]);
  for (const dir of ['art', 'audio']) {
    for (const name of readdirSync(new URL(`${dir}/`, ASSETS))) {
      assert.ok(declared.has(`${dir}/${name}`), `${dir}/${name} no está en assets.js`);
    }
  }
});

test('cada nivel de cada edificio usa un sprite que existe', () => {
  for (const [type, def] of Object.entries(BUILDINGS)) {
    def.levels.forEach((level, i) => {
      assert.ok(level.sprite, `${type} nivel ${i + 1} no tiene sprite`);
      assert.ok(Object.hasOwn(IMAGES, level.sprite), `${type} nivel ${i + 1}: sprite desconocido «${level.sprite}»`);
    });
  }
});

test('la hierba, la caja de obras y la decoración están en el manifiesto', () => {
  for (const key of ['grass_a', 'grass_b', 'crate', ...Object.values(DECOR_KEYS).flat()]) {
    assert.ok(Object.hasOwn(IMAGES, key), `falta la clave ${key}`);
  }
});

test('hay créditos y una licencia por cada pack usado', () => {
  assert.ok(existsSync(new URL('CREDITS.md', ASSETS)));
  const licenses = readdirSync(new URL('licenses/', ASSETS));
  assert.ok(licenses.length >= 3);
  for (const name of licenses) {
    assert.match(readFileSync(new URL(`licenses/${name}`, ASSETS), 'utf8'), /CC0|Creative Commons Zero/);
  }
});

test('la decoración es determinista, está dentro del mapa y no repite casilla', () => {
  const a = generateDecor();
  assert.deepEqual(a, generateDecor(), 'misma semilla, mismo resultado');
  assert.notDeepEqual(a, generateDecor(DECOR_SEED + 1), 'otra semilla, otro resultado');
  assert.ok(a.length > 5 && a.length < GRID.cols * GRID.rows * 0.4, `cantidad razonable (${a.length})`);

  const seen = new Set();
  const valid = new Set(Object.values(DECOR_KEYS).flat());
  for (const d of a) {
    assert.ok(d.x >= 0 && d.x < GRID.cols && d.y >= 0 && d.y < GRID.rows);
    assert.ok(valid.has(d.key));
    assert.ok(!seen.has(`${d.x},${d.y}`), 'casilla repetida');
    seen.add(`${d.x},${d.y}`);
  }
});

test('el centro del mapa queda más despejado que los bordes', () => {
  const items = generateDecor();
  const cx = (GRID.cols - 1) / 2;
  const cy = (GRID.rows - 1) / 2;
  const radius = GRID.cols / 6; // «centro» = el sexto central del mapa
  const inCenter = (d) => Math.abs(d.x - cx) <= radius && Math.abs(d.y - cy) <= radius;
  const centerCells = (Math.floor(radius) * 2 + 1) ** 2;
  const mid = items.filter(inCenter).length;
  const edge = items.filter((d) => d.x === 0 || d.y === 0 || d.x === GRID.cols - 1 || d.y === GRID.rows - 1).length;
  const edgeCells = 4 * (GRID.cols - 1);
  assert.ok(mid / centerCells < edge / edgeCells, `centro ${mid}/${centerCells} vs borde ${edge}/${edgeCells}`);
});
