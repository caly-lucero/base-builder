import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { IMAGES, SHEETS, SHEET_KEYS, SOUNDS } from '../src/data/assets.js';
import { BUILDINGS, ENEMY_UNITS, UNITS } from '../src/data/config.js';
import { HEROES } from '../src/data/heroes.js';
import { DECOR_KEYS, DECOR_SEED, generateDecor } from '../src/game/decor.js';
import { GRID } from '../src/data/config.js';
import { SHEET } from '../src/game/unitArt.js';

const ASSETS = new URL('../public/assets/', import.meta.url);

/** Tamaño de un PNG leído de su cabecera. */
function pngSize(url) {
  const head = readFileSync(url).subarray(16, 24);
  return { w: head.readUInt32BE(0), h: head.readUInt32BE(4) };
}

/** Todos los archivos de una carpeta (sin entrar en subcarpetas que no pasen el filtro). */
function listPngs(dir) {
  return readdirSync(new URL(`${dir}/`, ASSETS)).map((n) => `${dir}/${n}`);
}

test('todos los archivos del manifiesto existen en public/assets', () => {
  for (const file of [...Object.values(IMAGES), ...Object.values(SHEETS), ...Object.values(SOUNDS)]) {
    assert.ok(existsSync(new URL(file, ASSETS)), `falta ${file}`);
  }
});

test('no sobran imágenes ni sonidos sin declarar en el manifiesto', () => {
  const declared = new Set([...Object.values(IMAGES), ...Object.values(SHEETS), ...Object.values(SOUNDS)]);
  for (const dir of ['iso/buildings', 'iso/decor', 'iso/units', 'audio']) {
    for (const file of listPngs(dir)) assert.ok(declared.has(file), `${file} no está en assets.js`);
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

test('cada unidad, héroe y enemigo tiene su hoja de animación', () => {
  const sprites = [...Object.values(UNITS), ...Object.values(HEROES), ...Object.values(ENEMY_UNITS)].map((d) => d.sprite);
  for (const s of sprites) assert.ok(Object.hasOwn(SHEETS, s), `sin hoja para «${s}»`);
  for (const w of ['worker_1', 'worker_2']) assert.ok(SHEET_KEYS.includes(w));
});

test('las hojas de animación tienen el tamaño de la cuadrícula (8×4 cuadros)', () => {
  for (const file of Object.values(SHEETS)) {
    const { w, h } = pngSize(new URL(file, ASSETS));
    assert.equal(w, SHEET.cols * SHEET.frameWidth, `${file}: ancho`);
    assert.equal(h, 4 * SHEET.frameHeight, `${file}: alto`);
  }
});

test('los edificios miden 192×256 y la decoración 160×176 (el arte se ancla por esas medidas)', () => {
  for (const [key, file] of Object.entries(IMAGES)) {
    const { w, h } = pngSize(new URL(file, ASSETS));
    if (file.startsWith('iso/buildings/')) assert.deepEqual([w, h], [192, 256], key);
    else if (/^(flower_|tuft)/.test(key)) assert.deepEqual([w, h], [32, 24], key);
    else assert.deepEqual([w, h], [160, 176], key);
  }
});

test('la caja de obras y la decoración están en el manifiesto', () => {
  for (const key of ['crate', ...Object.values(DECOR_KEYS).flat(), 'flower_0', 'flower_1', 'flower_2', 'tuft']) {
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
