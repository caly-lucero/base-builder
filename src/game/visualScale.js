/**
 * El combate sigue simulando cada unidad por separado. Esta capa solo decide cuántas
 * figuras conviene dibujar para que un ejército grande siga siendo legible.
 */
export function unitBucketSize(aliveCount, zoom = 1) {
  if (aliveCount <= 18 || zoom >= 1.05) return 1;
  if (aliveCount <= 48 || zoom >= 0.82) return 2;
  if (aliveCount <= 96 || zoom >= 0.62) return 3;
  return 4;
}

/** Agrupa unidades cercanas del mismo bando y tipo. Los héroes siempre quedan solos. */
export function visualUnitGroups(units, zoom = 1) {
  const alive = units.filter((u) => u.alive);
  const bucket = unitBucketSize(alive.length, zoom);
  const groups = new Map();

  for (const u of alive) {
    const key = u.type === 'hero'
      ? `hero:${u.id}`
      : `${u.side}:${u.type}:${Math.floor(u.x / bucket)}:${Math.floor(u.y / bucket)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, representativeId: u.id, ids: [], count: 0, hp: 0, maxHp: 0 };
      groups.set(key, group);
    }
    group.ids.push(u.id);
    group.count += 1;
    group.hp += Math.max(0, u.hp ?? 0);
    group.maxHp += Math.max(1, u.maxHp ?? 1);
  }
  return [...groups.values()];
}

/** Devuelve un cuarto de vuelta cuando el giro de dos dedos supera el umbral. */
export function twistQuarterTurn(from, to, threshold = Math.PI / 5) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) < threshold) return 0;
  return delta > 0 ? 1 : -1;
}
