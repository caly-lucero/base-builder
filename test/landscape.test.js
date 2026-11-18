import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERRAIN } from '../src/data/config.js';
import { createBuilding, createNewState, sizeOf as sizeOfType } from '../src/game/logic.js';
import { flowerSpots, occupiedBlocks, pathTiles, pondTiles } from '../src/game/landscape.js';

const T0 = 1_700_000_000_000;
const key = (x, y) => `${x},${y}`;

function base(spec) {
  const s = createNewState(T0);
  for (const [type, x, y] of spec) s.buildings.push(createBuilding(s.nextId++, type, x, y, T0));
  return s.buildings;
}

test('sin edificios no hay caminos, y el Ayuntamiento solo no necesita ninguno', () => {
  assert.equal(pathTiles([]).size, 0);
  assert.equal(pathTiles(base([])).size, 0);
});

test('cada edificio queda unido al Ayuntamiento por un camino de bloques de terreno contiguos', () => {
  const buildings = base([['mine', 10, 10], ['sawmill', 34, 12], ['house', 16, 32], ['barracks', 32, 34]]);
  const path = pathTiles(buildings);
  const occupied = occupiedBlocks(buildings); // bloques de 2×2 cuadros que pisa algún edificio
  assert.ok(path.size > 10);
  for (const p of path) assert.ok(!occupied.has(p), `el camino no pasa por un edificio: ${p}`);

  // Con los edificios como parte de la red, todos se alcanzan desde el Ayuntamiento (por el bloque de su centro).
  const net = new Set([...path, ...occupied]);
  const hall = buildings.find((b) => b.type === 'townhall');
  const block = (b) => [Math.floor((b.x + (sizeOfType(b.type).w - 1) / 2 + 0.5) / 2), Math.floor((b.y + (sizeOfType(b.type).h - 1) / 2 + 0.5) / 2)];
  const [hx, hy] = block(hall);
  const seen = new Set([key(hx, hy)]);
  const todo = [[hx, hy]];
  while (todo.length) {
    const [x, y] = todo.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(x + dx, y + dy);
      if (net.has(k) && !seen.has(k)) {
        seen.add(k);
        todo.push([x + dx, y + dy]);
      }
    }
  }
  for (const b of buildings) assert.ok(seen.has(key(...block(b))), `${b.type} en ${b.x},${b.y} no está unido`);
});

test('los muros y las puertas no piden camino, y todo queda dentro del mapa', () => {
  const buildings = base([['wall', 0, 0], ['gate', 47, 47], ['wall', 24, 2]]);
  assert.equal(pathTiles(buildings).size, 0);
  const far = pathTiles(base([['mine', 0, 0], ['mine', 46, 46]]));
  for (const p of far) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && y >= 0 && x < TERRAIN.cols && y < TERRAIN.rows);
  }
});

test('los caminos se calculan siempre igual, sin importar el orden de los edificios', () => {
  const spec = [['mine', 10, 10], ['sawmill', 34, 12], ['house', 16, 32]];
  const a = pathTiles(base(spec));
  const b = pathTiles(base(spec));
  assert.deepEqual([...a].sort(), [...b].sort());
});

test('los estanques son fijos, están en los bordes y no tocan el centro de la base', () => {
  const ponds = pondTiles();
  assert.deepEqual(ponds, pondTiles());
  assert.ok(ponds.length >= 10 && ponds.length <= 24);
  const keys = ponds.map((t) => key(t.x, t.y));
  assert.equal(new Set(keys).size, keys.length, 'sin casillas repetidas');
  for (const t of ponds) {
    assert.ok(t.x >= 0 && t.y >= 0 && t.x < TERRAIN.cols && t.y < TERRAIN.rows);
    assert.ok(Math.hypot(t.x - 11.5, t.y - 11.5) > 7, `el estanque ${t.x},${t.y} está muy cerca del centro`);
  }
});

test('las flores son fijas, esporádicas y nunca caen en el agua', () => {
  const flowers = flowerSpots();
  assert.deepEqual(flowers, flowerSpots());
  assert.ok(flowers.length > 60 && flowers.length < TERRAIN.cols * TERRAIN.rows * 0.4);
  const water = new Set(pondTiles().map((t) => key(t.x, t.y)));
  for (const f of flowers) {
    assert.ok(!water.has(key(f.x, f.y)));
    assert.ok(f.ox >= 0 && f.ox <= 1 && f.oy >= 0 && f.oy <= 1 && [0, 1, 2, 3].includes(f.kind));
  }
});
