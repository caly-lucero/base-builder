// Edificios de los Silvanos (la gente del bosque): casas de madera con techos de hojas, árboles, setos y cristales.
// Usa las mismas piezas de Kenney que el Reino pero armadas y pintadas distinto (ver buildings.js).
// Uso (en la página de la herramienta):
//   const S = await import('/sylvan.js');  await buildings.renderAll(buildings.TYPES, true, [0,1,2,3], S.SYLVAN);
import { put, walls } from './buildings.js';

const I = window.iso;
const T = I.THREE;

/* ---------- paleta ---------- */

/**
 * Lo que hace «silvano» a cada pieza: los tejados rojos pasan a verde hoja y el yeso lila de los muros a crema cálido
 * (el Reino, al revés, los hace azules). Las maderas y los árboles quedan como en el original.
 */
export function sylvanPalette(r, g, b) {
  const [h, s, v] = I.hsv(r, g, b);
  if ((h < 12 || h > 340) && s > 0.45 && v > 0.45) return I.rgb(132, Math.min(1, s * 0.75), v * 0.88); // rojos y naranjas → verde hoja
  if (h >= 190 && h <= 290 && s >= 0.09 && s <= 0.45) return I.rgb(38, Math.min(0.34, s * 1.5), Math.min(1, v * 1.06)); // el yeso lila de los muros → crema cálido
  if (h >= 190 && h <= 260 && s > 0.45) return I.rgb(168, Math.min(1, s * 0.85), v * 0.95); // azules fuertes (agua) → verde agua
  return [r, g, b]; // maderas, árboles y el verde de los tejados verdes se quedan como están
}

const crystalMat = (color, k = 1.0) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.25, metalness: 0.1 });
/** Un cristal (octaedro alargado) que brilla. */
function crystal(color, x, y, z, s = 1, tilt = 0) {
  const m = new T.Mesh(new T.OctahedronGeometry(0.12 * s), crystalMat(color));
  m.scale.y = 1.9;
  m.position.set(x, y + 0.12 * s * 1.9, z);
  m.rotation.z = tilt;
  m.userData.keep = true; // no se recolorea (no tiene textura)
  return m;
}
/** Roca sin textura (así la paleta no la recolorea): piedra gris verdosa. */
function rock(obj, color = 0x8c968c) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.material.map = null;
      o.material.color.set(color);
      o.material.needsUpdate = true;
    }
  });
  return obj;
}
const GREEN = 0x6fe8a0;
const TEAL = 0x5fe0d8;
const GOLD = 0xf2d36a;

/* ---------- los edificios ---------- */

export const BUILDERS = {
  async townhall(stage) {
    const g = new T.Group();
    if (stage === 1) {
      const top = await walls(g, { floors: 2, wood: true, faces: ['wall-door', 'wall-window-shutters', 'wall', 'wall'], upper: ['wall-window-shutters', 'wall-window-small', 'wall', 'wall'] });
      await put(g, 'town', 'roof-high-point', { y: top });
      await put(g, 'town', 'tree-high-round', { x: -0.55, z: -0.5, s: 1.0 });
      await put(g, 'town', 'banner-green', { y: 0.35, x: 0.06 });
    } else {
      // Un tronco de torre hexagonal de madera coronado por un gran árbol.
      await put(g, 'castle', 'tower-hexagon-base', { s: 1.1 });
      await put(g, 'castle', 'tower-hexagon-mid', { y: 1.31 * 1.1, s: 1.1 });
      await put(g, 'castle', 'tower-hexagon-mid', { y: 1.31 * 1.1 + 0.46 * 1.1, s: 1.1 });
      if (stage === 3) await put(g, 'castle', 'tower-hexagon-mid', { y: 1.31 * 1.1 + 0.92 * 1.1, s: 1.1 });
      const y = (1.31 + 0.46 * (stage === 3 ? 3 : 2)) * 1.1;
      await put(g, 'castle', 'tower-hexagon-top-wood', { y, s: 1.1 });
      await put(g, 'castle', 'tower-hexagon-roof', { y: y + 0.14 * 1.1, s: 1.1 });
      await put(g, 'castle', 'tree-large', { x: -0.7, z: -0.7, s: stage === 3 ? 1.5 : 1.2 });
      await put(g, 'castle', 'flag-banner-long', { x: 0.1, y: y + 0.6, z: 0, s: 0.8 });
    }
    return g;
  },

  async mine(stage) {
    const g = new T.Group();
    rock(await put(g, 'castle', 'rocks-large', { s: stage === 1 ? 1.1 : 1.35, x: -0.1, z: -0.1, y: -0.02 }));
    await put(g, 'town', 'wall-wood-doorway-square', { ry: -90, x: 0.0, z: 0.28, s: 0.7 });
    g.add(crystal(TEAL, 0.35, 0.05, -0.3, 1.1, 0.2));
    g.add(crystal(GREEN, 0.5, 0.05, -0.1, 0.8, -0.3));
    if (stage >= 2) {
      g.add(crystal(TEAL, -0.45, 0.05, 0.15, 1.0, 0.25));
      await put(g, 'town', 'lantern', { x: -0.4, z: 0.4, s: 0.7 });
    }
    if (stage >= 3) {
      g.add(crystal(GREEN, 0.15, 0.05, -0.45, 1.5, 0));
      await put(g, 'town', 'cart', { x: 0.38, z: 0.4, ry: 40, s: 0.55 });
    }
    return g;
  },

  async sawmill(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-door', 'wall-window-shutters', 'wall', 'wall'] });
    await put(g, 'town', stage === 1 ? 'roof-point' : 'roof-high-point', { y: top, s: stage === 1 ? 1 : 0.85 });
    await put(g, 'town', 'wheel', { x: 0.52, y: 0.5, z: 0, ry: 90, s: 0.8 });
    await put(g, 'castle', 'tree-log', { x: -0.3, z: 0.6, ry: 20, s: 0.8 });
    if (stage >= 2) await put(g, 'town', 'planks', { x: 0.2, z: 0.55, s: 0.7 });
    if (stage >= 3) await put(g, 'town', 'tree-high', { x: -0.6, z: -0.55, s: 0.9 });
    return g;
  },

  async storage(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', stage === 1 ? 'roof-point' : 'roof-high-point', { y: top, s: stage === 1 ? 1 : 0.85 });
    await put(g, 'town', 'cart-high', { x: 0.4, z: 0.55, ry: 70, s: 0.55 });
    if (stage >= 2) await put(g, 'town', 'stall-bench', { x: -0.5, z: 0.55, s: 0.6 });
    if (stage >= 3) await put(g, 'town', 'hedge', { x: 0.45, z: -0.55, s: 0.8 });
    return g;
  },

  async tower(stage) {
    // Atalaya: una casita de vigía sobre un tronco alto, con techo de hojas.
    const g = new T.Group();
    for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) await put(g, 'town', 'pillar-wood', { x, z, s: 1.0, sy: stage === 1 ? 1.2 : 1.9 });
    const y = stage === 1 ? 0.62 : 0.95;
    await put(g, 'castle', 'tower-hexagon-top-wood', { y, s: 0.85 });
    await put(g, 'castle', 'tower-hexagon-roof', { y: y + 0.12, s: 0.85 });
    if (stage >= 2) await put(g, 'town', 'stairs-wood', { x: 0.0, z: 0.45, ry: 90, s: 0.6 });
    await put(g, 'castle', 'flag', { x: 0.05, y: y + 0.75 });
    if (stage === 3) await put(g, 'castle', 'tree-small', { x: -0.5, z: 0.4, s: 0.9 });
    return g;
  },

  async wall(stage) {
    // Seto: un seto bajo (etapa 1), alto (2) y con postes de madera (3).
    const g = new T.Group();
    await put(g, 'town', stage === 1 ? 'hedge' : 'hedge-large', { s: 1 });
    if (stage === 3) for (const x of [-0.42, 0.42]) await put(g, 'town', 'pillar-wood', { x, z: 0, s: 0.55 });
    return g;
  },

  async gate(stage) {
    const g = new T.Group();
    // Portón de madera con arco entre dos postes (y, más adelante, estandarte y farol).
    await put(g, 'town', 'wall-wood-doorway-round', { ry: 90, s: stage === 1 ? 0.9 : 1.0 });
    if (stage >= 2) for (const z of [-0.5, 0.5]) await put(g, 'town', 'pillar-wood', { x: 0, z, s: 0.9 });
    if (stage === 3) {
      await put(g, 'castle', 'flag-pennant', { x: 0, y: 1.05, z: 0.5, s: 0.7 });
      await put(g, 'town', 'lantern', { x: 0.2, z: 0.55, s: 0.6 });
    }
    return g;
  },

  async house(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: stage === 1 ? 1 : 2, wood: true });
    await put(g, 'town', stage === 3 ? 'roof-high-point' : 'roof-point', { y: top });
    if (stage >= 2) await put(g, 'town', 'chimney', { x: -0.05, y: top + 0.1, z: 0.25, s: 0.8 });
    if (stage >= 3) await put(g, 'castle', 'tree-small', { x: -0.55, z: 0.45, s: 0.8 });
    else await put(g, 'town', 'hedge', { x: 0.1, z: 0.6, s: 0.5 });
    return g;
  },

  async barracks(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-point', { y: top });
    await put(g, 'chars', 'weapon-spear', { x: 0.52, y: 0.5, z: -0.22, ry: 90, s: 1.5 });
    await put(g, 'chars', 'shield-rectangle', { x: 0.52, y: 0.5, z: 0.22, ry: 90, s: 1.0 });
    if (stage >= 2) await put(g, 'castle', 'flag-banner-short', { x: 0.1, y: top + 0.2, z: 0.1 });
    if (stage >= 3) await put(g, 'castle', 'tree-small', { x: -0.55, z: -0.55, s: 0.8 });
    return g;
  },

  async archery(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-high-point', { y: top, s: 0.9 });
    await put(g, 'chars', 'weapon-bow', { x: 0.53, y: 0.55, z: 0, ry: 90, s: 1.7 });
    await put(g, 'town', 'balcony-wall', { x: 0.0, y: top - 0.25, z: 0.5, s: 0.6 });
    if (stage >= 2) await put(g, 'chars', 'weapon-arrow', { x: 0.55, y: 0.3, z: 0.32, ry: 90, s: 1.5 });
    if (stage >= 3) await put(g, 'town', 'tree-high', { x: -0.6, z: 0.5, s: 0.8 });
    return g;
  },

  async atelier(stage) {
    // Santuario arcano: torre hexagonal con cristales alrededor.
    const g = new T.Group();
    await put(g, 'castle', 'tower-hexagon-base', {});
    let y = 1.31;
    for (let i = 0; i < stage; i++) { await put(g, 'castle', 'tower-hexagon-mid', { y }); y += 0.46; }
    if (stage >= 2) { await put(g, 'castle', 'tower-hexagon-top-wood', { y }); y += 0.13; }
    await put(g, 'castle', 'tower-hexagon-roof', { y });
    g.add(crystal(TEAL, 0.62, 0, 0.3, 1.0, 0.15));
    g.add(crystal(GREEN, 0.5, 0, 0.62, 0.8, -0.2));
    if (stage >= 2) g.add(crystal(TEAL, -0.6, 0, 0.45, 1.1, 0.1));
    if (stage >= 3) g.add(crystal(GOLD, 0.7, 0, -0.35, 0.9, -0.1));
    return g;
  },

  async stable(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-gable', { y: top });
    await put(g, 'town', 'fence', { x: 0, z: 0.55, ry: -90 });
    await put(g, 'town', 'fence', { x: 0.55, z: 0, ry: 0 });
    if (stage >= 2) await put(g, 'town', 'stall-bench', { x: -0.45, z: 0.6, s: 0.6 });
    if (stage >= 3) await put(g, 'town', 'banner-green', { x: 0.06, y: 0.25, z: 0.25 });
    return g;
  },

  async siege(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, wood: true, faces: ['wall-doorway-square-wide', 'wall-window-small', 'wall', 'wall'] });
    await put(g, 'town', 'roof-point', { y: top });
    await put(g, 'castle', 'siege-trebuchet', { x: 0.1, z: 0.66, ry: -30, s: 0.38 });
    if (stage >= 2) await put(g, 'town', 'planks', { x: -0.45, z: 0.55, s: 0.7 });
    if (stage >= 3) await put(g, 'castle', 'siege-ballista', { x: 0.62, z: 0.1, ry: 80, s: 0.45 });
    return g;
  },

  async forge(stage) {
    const g = new T.Group();
    const top = await walls(g, { floors: 1, faces: ['wall-doorway-square-wide', 'wall-window-stone', 'wall', 'wall'] });
    await put(g, 'town', 'roof-point', { y: top });
    await put(g, 'town', 'chimney-base', { x: -0.1, y: top - 0.1, z: 0.2, s: 1.2 });
    await put(g, 'town', 'chimney', { x: -0.1, y: top + 0.6, z: 0.2, s: 1.2 });
    await put(g, 'town', 'blade', { x: 0.6, y: 0.1, z: 0.4, s: 0.5, ry: 20 });
    if (stage >= 3) await put(g, 'town', 'lantern', { x: 0.55, z: -0.45, s: 0.7 });
    return g;
  },

  async altar(stage) {
    // Santuario del héroe: fuente, árboles jóvenes y un cristal verde.
    const g = new T.Group();
    await put(g, 'town', 'fountain-round', { s: stage === 1 ? 0.9 : 1.1 });
    for (const [x, z] of [[0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) await put(g, stage === 1 ? 'castle' : 'town', stage === 1 ? 'tree-small' : 'tree-high-round', { x, z, s: stage === 1 ? 0.8 : 0.65 });
    const c = crystal(GREEN, 0, stage === 1 ? 0.55 : 0.7, 0, stage === 1 ? 1.4 : 1.9);
    g.add(c);
    return g;
  },
};

/* ---------- suelo y adornos ---------- */

// Losas de madera y musgo en vez de piedra.
const COLORS = {
  yard: { border: 0x6b4f2d, slab: 0x8fa066, accent: 0x5e7040 },
  plaza: { border: 0x8a6a3a, slab: 0xb8d09a, accent: 0x6f9a5a },
  castle: { border: 0x5a7a3a, slab: 0x7fa05a, accent: 0x4f6e3a },
};

/** Adornos del patio: arbolitos en las esquinas y un par de bultos según el edificio. */
async function yardProps(root, type, w, h) {
  const g = new T.Group();
  const W = (w * 0.5) / 2 - 0.16;
  const D = (h * 0.5) / 2 - 0.16;
  for (const [x, z] of [[W, D], [-W, D]]) await put(g, 'town', 'lantern', { x, z, y: 0.09, s: 0.8 });
  await put(g, 'castle', 'tree-small', { x: W, z: -D, y: 0.09, s: 0.8 });
  if (type === 'barracks') {
    await put(g, 'chars', 'weapon-spear', { x: W - 0.25, z: 0.3, y: 0.1, ry: 40, s: 1.4 });
    await put(g, 'chars', 'shield-rectangle', { x: W - 0.3, z: -0.35, y: 0.1, ry: 90, s: 1.0 });
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
    g.add(crystal(TEAL, W - 0.35, 0.1, D - 0.3, 0.9, 0.1));
  }
  I.recolor(g, sylvanPalette);
  root.add(g);
}

/** Patio del Árbol Madre: un anillo de árboles y setos con estandartes (en vez de torreones y murallas). */
async function castleProps(root, stage, w, h) {
  const g = new T.Group();
  const W = (w * 0.5) / 2 - 0.3;
  const D = (h * 0.5) / 2 - 0.3;
  for (const [x, z] of [[W, -D], [-W, D], [-W, -D]]) await put(g, 'town', 'tree-high-round', { x, z, y: 0.09, s: 0.85 });
  await put(g, 'castle', 'flag', { x: W, z: D, y: 0.09, s: 0.9 });
  if (stage >= 2) for (const x of [-0.9, 0.9]) await put(g, 'castle', 'flag-banner-short', { x, z: D, y: 0.09, s: 0.8 });
  // Setos bajos entre los árboles (con hueco de puerta por delante).
  const piece = 0.5;
  const n = Math.round((2 * W) / piece);
  for (let i = 1; i < n; i++) {
    const t = -W + (i * 2 * W) / n;
    await put(g, 'town', 'hedge-large', { x: t, z: -D, y: 0.09, s: piece * 0.9 });
    await put(g, 'town', 'hedge-large', { x: -W, z: t, y: 0.09, s: piece * 0.9, ry: 90 });
    if (Math.abs(t) > 0.45) {
      await put(g, 'town', 'hedge-large', { x: t, z: D, y: 0.09, s: piece * 0.9 });
      await put(g, 'town', 'hedge-large', { x: W, z: t, y: 0.09, s: piece * 0.9, ry: 90 });
    }
  }
  I.recolor(g, sylvanPalette);
  root.add(g);
}

export const SYLVAN = { dir: 'sylvan/', palette: sylvanPalette, builders: BUILDERS, colors: COLORS, castleProps, yardProps };
window.buildingsSylvan = SYLVAN;
