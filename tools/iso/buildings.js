// Catálogo de edificios del Reino (los humanos): cada uno se arma juntando piezas 3D de Kenney (CC0) y se
// pinta con la paleta propia del reino. `BUILDERS[tipo](etapa)` devuelve el edificio (1, 2 o 3: cuanto más
// avanzado, más grande y adornado). Las etapas 4 a 10 usan la 3 con un tinte, como hasta ahora.
const I = window.iso;
const T = I.THREE;

/** Pone una pieza en un grupo. o: x, y, z, ry (giro en grados), s (escala), sx/sy/sz (escalas por eje). */
export async function put(g, pack, name, o = {}) {
  const m = await I.make(pack, name);
  const h = new T.Group();
  h.add(m);
  h.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  h.rotation.y = ((o.ry ?? 0) * Math.PI) / 180;
  h.scale.set((o.sx ?? o.s ?? 1), (o.sy ?? o.s ?? 1), (o.sz ?? o.s ?? 1));
  g.add(h);
  return h;
}

/** Cuatro paredes alrededor de una casilla (la cara +x es la 0 y la +z la 1: las dos que se ven). */
export async function walls(g, { floors = 1, faces = ['wall-door', 'wall-window-shutters', 'wall', 'wall'], upper = ['wall-window-shutters', 'wall-window-small', 'wall', 'wall'], wood = false, y0 = 0, size = 1 } = {}) {
  const pre = wood ? 'wall-wood' : 'wall';
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < 4; k++) {
      const name = (f === 0 ? faces[k] : upper[k]).replace(/^wall/, pre);
      await put(g, 'town', name, { ry: -k * 90, y: y0 + f * size, s: size });
    }
  }
  return y0 + floors * size;
}

/* ---------- paleta del Reino ---------- */

const hsvOf = I.hsv;
/** Tejados azul pizarra, madera cálida, piedra clara: lo que hace «del Reino» a cada pieza. */
export function reino(r, g, b) {
  const [h, s, v] = hsvOf(r, g, b);
  if ((h < 42 || h > 340) && s > 0.5 && v > 0.55) return I.rgb(216, Math.min(1, s * 0.78), v * 0.82); // rojos y naranjas fuertes → azul
  if (h >= 85 && h <= 170 && s > 0.35) return I.rgb(214, s * 0.7, v * 0.8); // verdes → azul también
  return [r, g, b];
}
const dorado = (r, g, b) => (I.hsv(r, g, b)[1] > 0.6 && I.hsv(r, g, b)[0] > 30 && I.hsv(r, g, b)[0] < 55 ? I.rgb(44, 0.75, Math.min(1, I.hsv(r, g, b)[2] * 1.1)) : [r, g, b]);

/* ---------- los edificios ---------- */

export const BUILDERS = {
  async townhall(stage) {
    const g = new T.Group();
    if (stage === 1) {
      const top = await walls(g, { floors: 2, faces: ['wall-door', 'wall-window-shutters', 'wall', 'wall'], upper: ['wall-window-shutters', 'wall-window-small', 'wall', 'wall'] });
      await put(g, 'town', 'roof-high-gable', { y: top });
      await put(g, 'town', 'chimney', { x: -0.05, y: top + 0.1, z: 0.25, s: 0.8 });
      await put(g, 'town', 'banner-red', { y: 0.35, x: 0.06 });
    } else {
      await put(g, 'castle', 'tower-square-base', { s: 1.02 });
      await put(g, 'castle', 'tower-square-mid-door', { y: 1, s: 1.02 });
      await put(g, 'castle', 'tower-square-mid-windows', { y: 2 });
      if (stage === 2) {
        await put(g, 'castle', 'tower-square-top-roof-high', { y: 3 });
      } else {
        await put(g, 'castle', 'tower-square-mid-windows', { y: 3 });
        await put(g, 'castle', 'tower-square-top-roof-high-windows', { y: 4 });
        await put(g, 'castle', 'flag-banner-long', { x: 0, y: 5.2, z: -0.1, s: 0.8 });
        for (const [x, z] of [[-0.62, -0.62], [0.62, 0.62]]) await put(g, 'castle', 'tower-hexagon-base', { x, z, s: 0.55 });
      }
      await put(g, 'castle', 'flag', { x: 0.1, y: stage === 2 ? 4.4 : 5.0, z: 0 });
    }
    return g;
  },

  async mine(stage) {
    const g = new T.Group();
    await put(g, 'castle', 'rocks-large', { s: stage === 1 ? 1.1 : 1.35, x: -0.1, z: -0.1, y: -0.02 });
    await put(g, 'town', 'wall-wood-doorway-square', { ry: -90, x: 0.0, z: 0.28, s: 0.7 });
    await put(g, 'town', 'cart', { x: 0.38, z: 0.4, ry: 40, s: 0.55 });
    if (stage >= 2) await put(g, 'town', 'lantern', { x: -0.4, z: 0.4, s: 0.7 });
    if (stage >= 3) {
      await put(g, 'castle', 'rocks-small', { x: 0.45, z: -0.3, s: 1.2 });
      await put(g, 'town', 'poles', { x: -0.3, z: 0.1, s: 0.8 });
    }
    return g;
  },

  async sawmill(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-door', 'wall-window-shutters', 'wall', 'wall'] });
    await put(g, 'town', stage === 1 ? 'roof-gable' : 'roof-high-gable', { y: top, s: stage === 1 ? 1 : 0.8 });
    await put(g, 'town', 'wheel', { x: 0.52, y: 0.5, z: 0, ry: 90, s: 0.8 });
    await put(g, 'castle', 'tree-log', { x: -0.3, z: 0.6, ry: 20, s: 0.8 });
    if (stage >= 2) await put(g, 'town', 'planks', { x: 0.2, z: 0.55, s: 0.7 });
    if (stage >= 3) await put(g, 'castle', 'tree-log', { x: 0.5, z: 0.5, ry: 80, s: 0.7 });
    return g;
  },

  async storage(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', stage === 1 ? 'roof-flat' : 'roof-gable', { y: top });
    await put(g, 'town', 'cart-high', { x: 0.4, z: 0.55, ry: 70, s: 0.55 });
    if (stage >= 2) await put(g, 'town', 'stall-bench', { x: -0.5, z: 0.55, s: 0.6 });
    if (stage >= 3) await put(g, 'town', 'lantern', { x: 0.5, z: -0.5, s: 0.7 });
    return g;
  },

  async tower(stage) {
    const g = new T.Group();
    await put(g, 'castle', 'tower-square-base', {});
    await put(g, 'castle', stage === 1 ? 'tower-square-mid' : 'tower-square-mid-windows', { y: 1 });
    if (stage >= 2) await put(g, 'castle', 'tower-square-mid-open', { y: 2 });
    await put(g, 'castle', stage === 3 ? 'tower-square-top-roof-high-windows' : 'tower-square-top-roof', { y: stage >= 2 ? 3 : 2 });
    await put(g, 'castle', 'flag', { x: 0.1, y: stage >= 2 ? 4.2 : 3.4 });
    return g;
  },

  async wall(stage) {
    const g = new T.Group();
    if (stage === 1) await put(g, 'town', 'wall-wood-block-half', { s: 1 });
    else if (stage === 2) await put(g, 'town', 'wall-block', { s: 1 });
    else await put(g, 'castle', 'wall', { s: 1 });
    return g;
  },

  async gate(stage) {
    const g = new T.Group();
    await put(g, 'castle', stage === 1 ? 'wall-narrow-gate' : 'wall-doorway', { ry: 90 });
    if (stage >= 2) await put(g, 'castle', 'gate', { ry: 90 });
    if (stage === 3) await put(g, 'castle', 'flag', { x: 0, y: 1.3, z: 0.4, s: 0.7 });
    return g;
  },

  async house(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: stage === 1 ? 1 : 2 });
    await put(g, 'town', stage === 3 ? 'roof-high-gable' : 'roof-gable', { y: top });
    await put(g, 'town', 'chimney', { x: -0.05, y: top + 0.1, z: 0.25, s: 0.8 });
    if (stage >= 3) await put(g, 'town', 'banner-green', { y: 0.2, x: 0.06 });
    return g;
  },

  async barracks(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'], size: 1 });
    await put(g, 'town', 'roof-gable', { y: top });
    await put(g, 'chars', 'weapon-sword', { x: 0.52, y: 0.5, z: -0.22, ry: 90, s: 1.5 });
    await put(g, 'chars', 'shield-round', { x: 0.52, y: 0.5, z: 0.22, ry: 90, s: 1.0 });
    if (stage >= 2) await put(g, 'castle', 'flag-banner-short', { x: 0.1, y: top + 0.2, z: 0.1 });
    if (stage >= 3) await put(g, 'castle', 'tower-square-top', { x: -0.55, z: -0.55, s: 0.4 });
    return g;
  },

  async archery(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-point', { y: top });
    await put(g, 'chars', 'weapon-bow', { x: 0.53, y: 0.55, z: 0, ry: 90, s: 1.7 });
    await put(g, 'town', 'wheel', { x: 0.45, z: 0.62, s: 0.5, ry: 90, y: 0.3 });
    if (stage >= 2) await put(g, 'chars', 'weapon-arrow', { x: 0.55, y: 0.3, z: 0.32, ry: 90, s: 1.5 });
    if (stage >= 3) await put(g, 'town', 'hedge', { x: -0.4, z: 0.55, s: 0.7 });
    return g;
  },

  async atelier(stage) {
    const g = new T.Group();
    await put(g, 'castle', 'tower-hexagon-base', {});
    let y = 1.31;
    for (let i = 0; i < stage; i++) { await put(g, 'castle', 'tower-hexagon-mid', { y }); y += 0.46; }
    if (stage >= 2) { await put(g, 'castle', 'tower-hexagon-top', { y }); y += 0.13; }
    await put(g, 'castle', 'tower-hexagon-roof', { y });
    await put(g, 'town', 'lantern', { x: 0.5, z: 0.45, s: 0.7 });
    return g;
  },

  async stable(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-gable', { y: top, sx: 1, sz: 1 });
    await put(g, 'town', 'fence', { x: 0, z: 0.55, ry: -90 });
    await put(g, 'town', 'fence', { x: 0.55, z: 0, ry: 0 });
    if (stage >= 2) await put(g, 'town', 'cart', { x: -0.4, z: 0.6, ry: 100, s: 0.5 });
    if (stage >= 3) await put(g, 'town', 'banner-red', { x: 0.06, y: 0.25, z: 0.25 });
    return g;
  },

  async siege(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-gable', { y: top });
    await put(g, 'castle', 'siege-catapult', { x: 0.1, z: 0.62, ry: -30, s: 0.5 });
    if (stage >= 2) await put(g, 'town', 'planks', { x: -0.45, z: 0.55, s: 0.7 });
    if (stage >= 3) await put(g, 'castle', 'siege-ballista', { x: 0.62, z: 0.1, ry: 80, s: 0.45 });
    return g;
  },

  async forge(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, faces: ['wall-doorway-square-wide', 'wall-window-stone', 'wall', 'wall'] });
    await put(g, 'town', 'roof-gable', { y: top });
    await put(g, 'town', 'chimney-base', { x: -0.1, y: top - 0.1, z: 0.2, s: 1.2 });
    await put(g, 'town', 'chimney', { x: -0.1, y: top + 0.6, z: 0.2, s: 1.2 });
    await put(g, 'town', 'blade', { x: 0.6, y: 0.1, z: 0.4, s: 0.5, ry: 20 });
    if (stage >= 3) await put(g, 'town', 'lantern', { x: 0.55, z: -0.45, s: 0.7 });
    return g;
  },

  async altar(stage) {
    const g = new T.Group();
    await put(g, 'town', 'fountain-round', { s: stage === 1 ? 0.9 : 1.1 });
    for (const [x, z] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]]) await put(g, 'town', 'pillar-stone', { x, z, s: stage === 1 ? 0.9 : 1.4 });
    const crystal = new T.Mesh(new T.OctahedronGeometry(0.22), new T.MeshStandardMaterial({ color: 0x9a6aff, emissive: 0x7a4aff, emissiveIntensity: 1.1, roughness: 0.3 }));
    crystal.position.y = stage === 1 ? 0.75 : 0.95;
    crystal.scale.y = 1.5;
    g.add(crystal);
    return g;
  },
};

// Altura máxima (en casillas) de cada edificio por etapa: así los más altos no se comen el mapa.
export const HEIGHT = {
  townhall: [2.1, 2.5, 3.0], tower: [1.9, 2.2, 2.6], house: [1.3, 1.6, 1.9], mine: [1.1, 1.2, 1.3], sawmill: [1.4, 1.5, 1.6],
  storage: [1.3, 1.4, 1.5], wall: [0.9, 1.1, 1.3], gate: [1.2, 1.4, 1.6], barracks: [1.5, 1.7, 1.9], archery: [1.5, 1.6, 1.8],
  atelier: [1.9, 2.3, 2.7], stable: [1.4, 1.5, 1.7], siege: [1.5, 1.7, 1.9], forge: [1.7, 1.8, 2.0], altar: [1.2, 1.5, 1.7],
};

/** Reduce el modelo si pasa de `maxH` de alto o de `maxW` de ancho (nunca lo agranda). */
function fit(g, maxH, maxW = 1.5) {
  const box = new T.Box3().setFromObject(g);
  const h = box.max.y - box.min.y;
  const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const k = Math.min(1, maxH / h, maxW / w);
  if (k < 1) g.scale.multiplyScalar(k);
  return g;
}

/** Arma un edificio, lo pinta con la paleta del reino y lo ajusta a su altura. */
export async function build(type, stage, palette = reino, builders = BUILDERS) {
  const g = await builders[type](stage);
  if (palette) I.recolor(g, palette);
  const wrap = new T.Group();
  wrap.add(g);
  fit(g, HEIGHT[type][stage - 1]);
  return wrap;
}

export const TYPES = Object.keys(BUILDERS);
window.buildings = { BUILDERS, build, TYPES, reino, dorado };

/* ---------- tamaño en el mapa: cada edificio pisa varios cuadros ---------- */

// Cuántos cuadros pisa cada edificio (los mismos que `size` en src/data/config.js), cuánto se agranda su modelo
// y qué suelo lleva debajo: así se ve que ocupa su sitio y los grandes se distinguen de los chicos.
// Un cuadro mide medio «lado de modelo» (la casilla vieja era de 2×2 cuadros).
const CELL = 0.5;
const PLAN = {
  townhall: { w: 7, h: 7, body: [1.8, 1.6, 1.3], plate: 'castle' }, // más pequeño en las etapas altas, que ya son una torre
  mine: { w: 2, h: 2, body: 1, plate: null },
  sawmill: { w: 2, h: 2, body: 1, plate: null },
  house: { w: 2, h: 2, body: 1, plate: null },
  tower: { w: 2, h: 2, body: 1, plate: null },
  storage: { w: 4, h: 3, body: 1.3, plate: 'yard' },
  barracks: { w: 5, h: 5, body: 1.8, plate: 'yard' },
  archery: { w: 5, h: 5, body: 1.8, plate: 'yard' },
  atelier: { w: 4, h: 4, body: 1.5, plate: 'yard' },
  stable: { w: 5, h: 4, body: 1.55, plate: 'yard' },
  siege: { w: 6, h: 5, body: 1.7, plate: 'yard' },
  forge: { w: 4, h: 3, body: 1.3, plate: 'yard' },
  altar: { w: 3, h: 3, body: 1.4, plate: 'plaza' },
  wall: { w: 1, h: 1, body: 0.5, plate: null },
  gate: { w: 1, h: 1, body: 0.5, plate: null },
};

const COLORS = {
  yard: { border: 0x7d7468, slab: 0xb7ad9a, accent: 0x8a8070 },
  plaza: { border: 0xb8b4c8, slab: 0xe4e0ee, accent: 0x9a96b0 },
  castle: { border: 0xd8a83a, slab: 0xa9a3a0, accent: 0x7a7470 },
};

/** Suelo del edificio: una losa con borde, del tamaño de su rectángulo. */
function plate(kind, w, h, colors = COLORS) {
  const g = new T.Group();
  const c = colors[kind];
  const W = w * CELL;
  const D = h * CELL;
  const border = new T.Mesh(new T.BoxGeometry(W, 0.07, D), new T.MeshStandardMaterial({ color: c.border, roughness: 0.9 }));
  border.position.y = 0.035;
  const slab = new T.Mesh(new T.BoxGeometry(W - 0.14, 0.09, D - 0.14), new T.MeshStandardMaterial({ color: c.slab, roughness: 0.95 }));
  slab.position.y = 0.045;
  g.add(border, slab);
  // Juntas de las losas: rayitas más oscuras cada medio lado.
  const lineMat = new T.MeshStandardMaterial({ color: c.accent, roughness: 1 });
  for (let i = 1; i < w; i++) {
    const line = new T.Mesh(new T.BoxGeometry(0.018, 0.095, D - 0.16), lineMat);
    line.position.set(-W / 2 + i * CELL, 0.05, 0);
    g.add(line);
  }
  for (let j = 1; j < h; j++) {
    const line = new T.Mesh(new T.BoxGeometry(W - 0.16, 0.095, 0.018), lineMat);
    line.position.set(0, 0.05, -D / 2 + j * CELL);
    g.add(line);
  }
  return g;
}

/** Adornos del patio: faroles en las esquinas de adelante y unos bultos (armas, carros…) según el edificio. */
async function yardProps(g, type, w, h) {
  const W = (w * CELL) / 2 - 0.16;
  const D = (h * CELL) / 2 - 0.16;
  for (const [x, z] of [[W, D], [W, -D], [-W, D]]) await put(g, 'town', 'lantern', { x, z, y: 0.09, s: 0.8 });
  if (type === 'barracks') {
    await put(g, 'chars', 'weapon-sword', { x: W - 0.25, z: -0.35, y: 0.1, ry: 40, s: 1.4 });
    await put(g, 'chars', 'shield-round', { x: W - 0.3, z: 0.35, y: 0.1, ry: 90, s: 1.1 });
  } else if (type === 'archery') {
    await put(g, 'chars', 'weapon-bow', { x: W - 0.25, z: 0.3, y: 0.1, ry: 90, s: 1.6 });
    await put(g, 'town', 'hedge', { x: 0, z: -D, y: 0.09, s: 0.9 });
  } else if (type === 'stable' || type === 'storage') {
    await put(g, 'town', 'cart', { x: W - 0.4, z: D - 0.45, y: 0.09, ry: 30, s: 0.6 });
    await put(g, 'town', 'planks', { x: -W + 0.3, z: D - 0.2, y: 0.09, s: 0.6 });
  } else if (type === 'siege') {
    await put(g, 'castle', 'siege-ballista', { x: W - 0.5, z: D - 0.5, y: 0.09, ry: 70, s: 0.5 });
    await put(g, 'town', 'planks', { x: -W + 0.3, z: D - 0.3, y: 0.09, s: 0.6 });
  } else if (type === 'forge') {
    await put(g, 'town', 'blade', { x: W - 0.3, z: D - 0.3, y: 0.1, s: 0.5, ry: 20 });
  } else if (type === 'atelier') {
    await put(g, 'town', 'wheel', { x: W - 0.35, z: D - 0.3, y: 0.1, s: 0.45, ry: 90 });
  }
}

/** Torreones y banderas del patio del Ayuntamiento: las esquinas lo hacen parecer un castillo. */
async function castleProps(g, stage, w, h) {
  const W = (w * CELL) / 2 - 0.3;
  const D = (h * CELL) / 2 - 0.3;
  for (const [x, z] of [[W, D], [W, -D], [-W, D], [-W, -D]]) {
    await put(g, 'castle', 'tower-square-base', { x, z, y: 0.09, s: 0.42 });
    await put(g, 'castle', 'tower-square-mid', { x, z, y: 0.09 + 0.42, s: 0.42 });
    await put(g, 'castle', 'tower-square-top-roof', { x, z, y: 0.09 + 0.84, s: 0.42 });
    await put(g, 'castle', 'flag', { x: x + 0.02, z, y: 0.09 + 1.3, s: 0.45 });
  }
  if (stage >= 2) for (const x of [-0.9, 0.9]) await put(g, 'castle', 'flag-banner-short', { x, z: D, y: 0.09, s: 0.8 });
  // Murallas bajas entre los torreones (con un hueco de puerta por delante).
  const piece = 0.5;
  const n = Math.round((2 * W) / piece);
  for (let i = 1; i < n; i++) {
    const t = -W + (i * 2 * W) / n;
    await put(g, 'castle', 'wall', { x: t, z: -D, y: 0.09, s: piece });
    await put(g, 'castle', 'wall', { x: -W, z: t, y: 0.09, s: piece, ry: 90 });
    if (Math.abs(t) > 0.45) {
      await put(g, 'castle', 'wall', { x: t, z: D, y: 0.09, s: piece });
      await put(g, 'castle', 'wall', { x: W, z: t, y: 0.09, s: piece, ry: 90 });
    }
  }
}

/** El edificio tal como se ve en el mapa: su modelo (agrandado) sobre su suelo, centrado en el medio de su rectángulo. */
// `race` (opcional) cambia las piezas, la paleta y los adornos: { palette, builders, colors, castleProps, yardProps } (ver sylvan.js).
export async function buildSized(type, stage, race = null) {
  const plan = PLAN[type];
  const model = await build(type, stage, race?.palette ?? reino, race?.builders ?? BUILDERS);
  const g = new T.Group();
  if (plan.plate) {
    const pl = plate(plan.plate, plan.w, plan.h, race?.colors ?? COLORS);
    g.add(pl);
  }
  model.scale.multiplyScalar(Array.isArray(plan.body) ? plan.body[stage - 1] : plan.body);
  if (plan.plate) model.position.y = 0.09;
  g.add(model);
  if (plan.plate === 'castle') await (race?.castleProps ?? castleProps)(g, stage, plan.w, plan.h);
  else if (plan.plate === 'yard') await (race?.yardProps ?? yardProps)(g, type, plan.w, plan.h);
  return g;
}

/**
 * Dibuja un edificio girado `turns` cuartos de vuelta (0–3) y lo recorta a lo que ocupa. Devuelve
 * { canvas, box: { w, h, x, y } } donde (x, y) es el píxel donde cae el centro de su rectángulo en el suelo.
 */
export function renderSized(group, turns = 0) {
  const wrap = new T.Group();
  wrap.add(group);
  wrap.rotation.y = (turns * Math.PI) / 2;
  const A = I.ART;
  const BIG = { W: 900 * A, H: 900 * A, ox: 450 * A, oy: 620 * A, SS: 2, ground: true };
  const big = I.render(wrap, BIG);
  const ctx = big.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, BIG.W, BIG.H);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const pad = 4;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(big, x0, y0, w, h, 0, 0, w, h);
  wrap.remove(group);
  return { canvas: out, box: { w, h, x: BIG.ox - x0, y: BIG.oy - y0 } };
}

export const SIZES = Object.fromEntries(Object.entries(PLAN).map(([t, p]) => [t, { w: p.w, h: p.h }]));

/** Dibuja y guarda todos los edificios: 3 etapas × 4 giros. Escribe también boxes.json con el apoyo de cada imagen. */
export async function renderAll(types = TYPES, save = true, turnsList = [0, 1, 2, 3], race = null) {
  const dir = race?.dir ?? ''; // carpeta de salida de la raza («sylvan/»)
  const boxes = {};
  const out = document.getElementById('out');
  out.innerHTML = '';
  for (const type of types) {
    for (const stage of [1, 2, 3]) {
      for (const turns of turnsList) {
        const g = await buildSized(type, stage, race);
        const { canvas, box } = renderSized(g, turns);
        const key = turns ? `${type}_${stage}_r${turns}` : `${type}_${stage}`;
        boxes[key] = box;
        if (save) await I.save(canvas, `${dir}buildings/${key}.png`);
        if (turns === 0) I.show(canvas, key);
      }
    }
  }
  if (save) await fetch(`/save?name=${dir}buildings/boxes.json`, { method: 'POST', body: JSON.stringify(boxes) });
  return boxes;
}
window.buildings.buildSized = buildSized;
window.buildings.renderSized = renderSized;
window.buildings.renderAll = renderAll;
window.buildings.SIZES = SIZES;
