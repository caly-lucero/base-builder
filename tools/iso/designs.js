// Diseños propios de cada personaje (armas, escudos, sombreros y capas hechos a mano sobre los modelos de Kenney).
// Cada diseño devuelve { obj, scale, ranged? }. `scale` es el tamaño final (1 ≈ 35 px de alto a zoom 1).
import { base, palette } from './chars.js';

const I = window.iso;
const T = I.THREE;

function bone(obj, name) {
  let found = null;
  obj.traverse((o) => {
    if (o.isBone && o.name === name) found = o;
  });
  return found;
}

export const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...extra });
export const glow = (color, k = 1.2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });
export const mesh = (geo, m, x = 0, y = 0, z = 0) => {
  const o = new T.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
};
export const C = { azul: 0x3b6cc4, azulOsc: 0x24418a, oro: 0xf3c34f, marfil: 0xf3ecd8, acero: 0xdfe8f5, madera: 0x8a5a33, rojo: 0xb52a32, negro: 0x2b2631, verde: 0x3f8f45, violeta: 0x7a4ad8, cian: 0x6fe3ff, fuego: 0xff8a2a };

/* ---------- piezas ---------- */

export function sword(blade = C.acero, guard = C.oro, len = 0.34) {
  const g = new T.Group();
  g.add(mesh(new T.BoxGeometry(0.05, len, 0.016), mat(blade, { metalness: 0.4 }), 0, len / 2 + 0.04, 0));
  g.add(mesh(new T.BoxGeometry(0.15, 0.03, 0.04), mat(guard), 0, 0.04, 0));
  g.add(mesh(new T.CylinderGeometry(0.018, 0.018, 0.08, 8), mat(C.madera), 0, 0, 0));
  g.add(mesh(new T.SphereGeometry(0.03, 8, 6), mat(guard), 0, -0.045, 0));
  return g;
}
export function spear(tip = C.acero, len = 0.78) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.014, 0.014, len, 6), mat(C.madera), 0, len / 2 - 0.15, 0));
  g.add(mesh(new T.ConeGeometry(0.04, 0.14, 6), mat(tip, { metalness: 0.4 }), 0, len - 0.1, 0));
  return g;
}
export function axe(len = 0.55) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.018, 0.018, len, 6), mat(C.madera), 0, len / 2 - 0.15, 0));
  for (const s of [-1, 1]) {
    const head = mesh(new T.CylinderGeometry(0.14, 0.14, 0.03, 3), mat(C.acero, { metalness: 0.4 }), s * 0.1, len - 0.15, 0);
    head.rotation.set(Math.PI / 2, 0, (s * Math.PI) / 2 + Math.PI / 6);
    g.add(head);
  }
  return g;
}
export function club() {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.03, 0.05, 0.5, 7), mat(C.madera), 0, 0.2, 0));
  for (let k = 0; k < 6; k++) {
    const sp = mesh(new T.ConeGeometry(0.02, 0.07, 5), mat(0xcfd2d8), Math.cos(k) * 0.055, 0.34 + (k % 3) * 0.05, Math.sin(k) * 0.055);
    sp.rotation.set(Math.sin(k) * 1.4, 0, -Math.cos(k) * 1.4);
    g.add(sp);
  }
  return g;
}
export function bow(wood = C.madera, len = 0.5) {
  const g = new T.Group();
  const arc = mesh(new T.TorusGeometry(len / 2, 0.016, 6, 16, Math.PI), mat(wood), 0, 0, 0);
  arc.rotation.z = Math.PI / 2;
  g.add(arc);
  g.add(mesh(new T.CylinderGeometry(0.004, 0.004, len, 4), mat(0xf3ecd8), 0, 0, 0));
  return g;
}
export function staff(orb = C.cian, len = 0.7) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.015, 0.02, len, 6), mat(C.madera), 0, len / 2 - 0.15, 0));
  g.add(mesh(new T.TorusGeometry(0.05, 0.012, 6, 12), mat(C.oro), 0, len - 0.1, 0));
  g.add(mesh(new T.SphereGeometry(0.055, 12, 10), glow(orb), 0, len - 0.1, 0));
  return g;
}
export function shield(field = C.azul, round = true, trim = C.oro) {
  const g = new T.Group();
  if (round) {
    const d = mesh(new T.CylinderGeometry(0.17, 0.17, 0.035, 20), mat(field), 0, 0, 0);
    d.rotation.x = Math.PI / 2;
    g.add(d);
    g.add(mesh(new T.TorusGeometry(0.17, 0.016, 6, 24), mat(trim), 0, 0, 0.012));
    g.add(mesh(new T.SphereGeometry(0.045, 10, 8), mat(trim), 0, 0, 0.03));
  } else {
    g.add(mesh(new T.BoxGeometry(0.27, 0.36, 0.035), mat(field), 0, 0, 0));
    g.add(mesh(new T.BoxGeometry(0.29, 0.03, 0.045), mat(trim), 0, 0.17, 0));
    g.add(mesh(new T.BoxGeometry(0.03, 0.34, 0.045), mat(trim), 0, 0, 0.002));
  }
  return g;
}
export function wizardHat(color = C.azul, band = C.oro) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.2, 0.2, 0.025, 14), mat(color), 0, 0, 0));
  g.add(mesh(new T.ConeGeometry(0.13, 0.34, 12), mat(color), 0, 0.18, 0));
  g.add(mesh(new T.CylinderGeometry(0.135, 0.135, 0.04, 12), mat(band), 0, 0.03, 0));
  return g;
}
export function cape(color = C.azul, trim = C.oro, w = 0.28, h = 0.34) {
  const g = new T.Group();
  const c = mesh(new T.BoxGeometry(w, h, 0.02), mat(color, { roughness: 0.9, metalness: 0 }), 0, -h / 2, 0);
  c.rotation.x = 0.16;
  g.add(c);
  const edge = mesh(new T.BoxGeometry(w + 0.01, 0.03, 0.026), mat(trim), 0, -h + 0.005, -Math.sin(0.16) * h * 0.95);
  edge.rotation.x = 0.16;
  g.add(edge);
  return g;
}
export const halo = (color = C.oro) => mesh(new T.TorusGeometry(0.12, 0.014, 6, 24), glow(color, 0.9), 0, 0, 0);
export const shoulderPads = (color = C.acero) => {
  const g = new T.Group();
  for (const s of [-1, 1]) g.add(mesh(new T.SphereGeometry(0.09, 10, 8), mat(color, { metalness: 0.3 }), s * 0.17, 0, 0));
  return g;
};
export function quiver(arrowColor = C.marfil, tilt = 0.35) {
  const q = new T.Group();
  q.add(mesh(new T.CylinderGeometry(0.04, 0.035, 0.22, 8), mat(C.madera)));
  for (const x of [-0.015, 0.015, 0]) q.add(mesh(new T.ConeGeometry(0.014, 0.06, 4), mat(arrowColor), x, 0.14, 0));
  q.rotation.z = tilt;
  return q;
}

/* ---------- piezas de héroe: lo que los distingue a primera vista de las tropas ---------- */

/** Anillo luminoso en el suelo bajo el héroe (su color lo identifica de lejos). */
export function groundRing(color, r = 0.4) {
  const g = new T.Group();
  const ring = mesh(new T.TorusGeometry(r, 0.03, 8, 40), glow(color, 1.3), 0, 0.035, 0);
  ring.rotation.x = Math.PI / 2;
  const inner = mesh(new T.TorusGeometry(r * 0.62, 0.018, 8, 32), glow(color, 0.9), 0, 0.03, 0);
  inner.rotation.x = Math.PI / 2;
  const disc = mesh(new T.CircleGeometry(r, 36), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }), 0, 0.02, 0);
  disc.rotation.x = -Math.PI / 2;
  g.add(disc, ring, inner);
  return g;
}
/** Penacho de casco. */
export function plume(color = C.rojo) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.03, 0.04, 0.05, 8), mat(C.oro), 0, 0, 0));
  for (const [x, y, rot, h] of [[0, 0.12, 0.5, 0.26], [0, 0.1, 0.25, 0.22], [0, 0.07, 0.8, 0.18]]) {
    const f = mesh(new T.ConeGeometry(0.045, h, 6), mat(color, { roughness: 0.9, metalness: 0 }), x, y, -0.04);
    f.rotation.x = -rot;
    g.add(f);
  }
  return g;
}
/** Corona de oro con puntas. */
export function crown(gem = C.cian) {
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(0.1, 0.1, 0.05, 10, 1, true), mat(C.oro, { metalness: 0.5, side: T.DoubleSide }), 0, 0, 0));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.add(mesh(new T.ConeGeometry(0.022, 0.08, 5), mat(C.oro, { metalness: 0.5 }), Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1));
  }
  g.add(mesh(new T.OctahedronGeometry(0.03), glow(gem, 1.2), 0, 0.02, 0.1));
  return g;
}
/** Cuernos de casco. */
export function horns(color = C.marfil) {
  const g = new T.Group();
  for (const sx of [-1, 1]) {
    const h = mesh(new T.ConeGeometry(0.045, 0.24, 7), mat(color), sx * 0.15, 0.08, 0);
    h.rotation.z = -sx * 0.9;
    g.add(h);
  }
  return g;
}
/** Alas de plumas en la espalda. */
export function wings(color = C.marfil, tip = C.oro) {
  const g = new T.Group();
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const f = mesh(new T.BoxGeometry(0.2 - k * 0.015, 0.012, 0.07), mat(k === 3 ? tip : color, { roughness: 0.8, metalness: 0 }), sx * (0.15 + k * 0.06), 0.14 - k * 0.07, 0);
      f.rotation.z = -sx * (0.45 + k * 0.28);
      g.add(f);
    }
  }
  return g;
}
/** Llama que arde sobre la mano del piromante. */
export function flame() {
  const g = new T.Group();
  g.add(mesh(new T.SphereGeometry(0.075, 12, 10), glow(C.fuego, 1.6), 0, 0, 0));
  for (const [x, z, h, col] of [[0, 0, 0.24, 0xffcf4a], [0.05, 0.02, 0.16, C.fuego], [-0.05, -0.02, 0.18, C.fuego]]) g.add(mesh(new T.ConeGeometry(0.05, h, 7), glow(col, 1.4), x, 0.1 + h / 2 - 0.05, z));
  return g;
}

/** Cuelga `item` de un hueso: p = [x, y, z], r = [rx, ry, rz] en grados. */
export function attach(obj, boneName, item, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  item.position.set(...p);
  item.rotation.set(...r.map((d) => (d * Math.PI) / 180));
  item.scale.setScalar(s);
  bone(obj, boneName).add(item);
  return item;
}
const HAND = [0, -0.12, 0.04];
export const inHand = (obj, item, s = 1.25) => attach(obj, 'arm-right', item, HAND, [90, 0, 0], s);
export const onArm = (obj, item, s = 1.15) => attach(obj, 'arm-left', item, [0.075, -0.08, 0.02], [0, 90, 0], s);
export const withCape = (obj, c) => attach(obj, 'torso', c, [0, 0.26, -0.1]);

export const acero = (r, g, b) => [Math.min(255, r * 1.12 + 10), Math.min(255, g * 1.1 + 10), Math.min(255, b * 1.14 + 14)];
export const oroGris = (r, g, b) => [Math.min(255, r * 1.2 + 24), Math.min(255, g * 1.08 + 14), Math.min(255, b * 0.8)];

/* ---------- los personajes ---------- */

export const DESIGNS = {
  // Reino: tropas
  async unit_soldier() {
    const o = await base('character-knight', palette([[18, 40, 44, 1.1, 1.05]], acero));
    inHand(o, sword());
    onArm(o, shield(C.azul, true));
    withCape(o, cape(C.azulOsc));
    return { obj: o, scale: 1.15 };
  },
  async unit_archer() {
    const o = await base('character-soldier');
    inHand(o, bow(C.madera, 0.4), 1.2);
    attach(o, 'torso', quiver(), [0, 0.15, -0.1]);
    return { obj: o, scale: 1.15, ranged: true };
  },
  async unit_mage() {
    const o = await base('character-female-a', palette([[255, 330, 222, 1.0, 1.0], [260, 300, 224, 1.1, 1.0]]));
    inHand(o, staff(C.cian), 1.1);
    attach(o, 'head', wizardHat(C.azul), [0, 0.12, 0]);
    return { obj: o, scale: 1.15, ranged: true };
  },
  async unit_knight() {
    const o = await base('character-knight', palette([[200, 270, 355, 1.0, 1.05]], oroGris));
    inHand(o, spear(C.oro, 0.62), 1.1);
    onArm(o, shield(C.marfil, false, C.azul), 1.2);
    withCape(o, cape(C.rojo));
    return { obj: o, scale: 1.3 };
  },
  // Reino: aldeanos
  async worker_1() { return { obj: await base('character-worker'), scale: 1.1, worker: true }; },
  async worker_2() {
    const o = await base('character-male-d');
    attach(o, 'head', mesh(new T.CylinderGeometry(0.17, 0.2, 0.05, 12), mat(0xd9b66a)), [0, 0.2, 0]);
    return { obj: o, scale: 1.1, worker: true };
  },
  async worker_3() { return { obj: await base('character-female-b'), scale: 1.1, worker: true }; },
  async worker_4() { return { obj: await base('character-male-f'), scale: 1.1, worker: true }; },
  // Héroes: más grandes que las tropas, con anillo de luz en el suelo y piezas propias (penacho, alas, llamas, cuernos…)
  async unit_hero() {
    // Paladín: armadura dorada, casco con penacho, escudo con emblema, espada de luz y capa blanca
    const o = await base('character-knight', palette([[18, 40, 46, 1.2, 1.15]], oroGris));
    inHand(o, sword(0xbfe9ff, C.oro, 0.4), 1.45);
    onArm(o, shield(C.marfil, true, C.oro), 1.45);
    withCape(o, cape(C.marfil, C.oro, 0.36, 0.46));
    attach(o, 'head', plume(C.rojo), [0, 0.26, -0.02], [0, 0, 0], 1.2);
    attach(o, 'torso', shoulderPads(C.oro), [0, 0.28, 0], [0, 0, 0], 1.15);
    attach(o, 'head', halo(), [0, 0.42, 0], [90, 0, 0]);
    o.add(groundRing(C.oro));
    return { obj: o, scale: 1.7 };
  },
  async hero_ranger() {
    // Cazadora: verde bosque, capucha con pluma, gran arco, aljaba dorada y capa larga
    const o = await base('character-soldier', palette([[85, 170, 150, 1.3, 0.85]]));
    inHand(o, bow(0x5a3a22, 0.58), 1.45);
    withCape(o, cape(C.verde, C.oro, 0.34, 0.5));
    attach(o, 'torso', quiver(C.oro, -0.35), [0, 0.15, -0.1], [0, 0, 0], 1.2);
    attach(o, 'head', mesh(new T.ConeGeometry(0.2, 0.26, 10), mat(C.verde, { roughness: 0.9, metalness: 0 })), [0, 0.2, -0.02]);
    attach(o, 'head', mesh(new T.ConeGeometry(0.025, 0.3, 6), mat(C.rojo)), [0.1, 0.32, -0.04], [0, 0, -50]);
    o.add(groundRing(0x56e07a));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_priest() {
    // Sacerdotisa: túnica blanca y dorada, alas de plumas, gran halo y bastón con cristal
    const o = await base('character-female-c', palette([[200, 340, 48, 0.2, 1.4]]));
    inHand(o, staff(C.oro, 0.75), 1.3);
    withCape(o, cape(C.marfil, C.oro, 0.34, 0.48));
    attach(o, 'torso', wings(C.marfil, C.oro), [0, 0.2, -0.13], [0, 0, 0], 1.25);
    attach(o, 'head', halo(0xfff2a8), [0, 0.4, 0], [90, 0, 0], 1.3);
    o.add(groundRing(0xfff2a8));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_pyro() {
    // Piromante: túnica roja y negra, sombrero alto, llama en la mano y capa de brasas
    const o = await base('character-female-d', palette([[0, 360, 4, 1.2, 0.85]]));
    attach(o, 'arm-right', flame(), [0, -0.16, 0.14], [0, 0, 0], 1.3);
    attach(o, 'head', wizardHat(C.rojo, C.oro), [0, 0.12, 0], [0, 0, 0], 1.35);
    withCape(o, cape(0x7a1a1f, C.fuego, 0.34, 0.5));
    o.add(groundRing(C.fuego));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_warlord() {
    // Señor de la guerra: casco con cuernos, hombreras de acero, hacha enorme y capa roja
    const o = await base('character-raider', palette([[0, 60, 4, 1.2, 0.85]], oroGris));
    inHand(o, axe(0.62), 1.5);
    attach(o, 'torso', shoulderPads(C.acero), [0, 0.28, 0], [0, 0, 0], 1.3);
    attach(o, 'head', horns(), [0, 0.22, 0], [0, 0, 0], 1.3);
    withCape(o, cape(C.rojo, C.oro, 0.38, 0.5));
    o.add(groundRing(C.rojo));
    return { obj: o, scale: 1.8 };
  },
  // Horda (enemigos)
  async enemy_guard() {
    const o = await base('character-raider', palette([[0, 70, 355, 1.25, 0.75], [180, 300, 355, 1.0, 0.7]]));
    inHand(o, spear(0x9aa0aa, 0.62), 1.1);
    onArm(o, shield(C.negro, false, C.rojo), 1.1);
    return { obj: o, scale: 1.15 };
  },
  async enemy_brute() {
    const o = await base('character-zombie', palette([[70, 190, 104, 0.9, 0.85]]));
    inHand(o, club(), 1.2);
    attach(o, 'torso', shoulderPads(0x4a3a36), [0, 0.28, 0]);
    return { obj: o, scale: 1.6 };
  },
  async enemy_archer() {
    const o = await base('character-raider', palette([[0, 70, 352, 1.25, 0.7]]));
    inHand(o, bow(C.negro, 0.5), 1.3);
    return { obj: o, scale: 1.15, ranged: true };
  },
  async enemy_shaman() {
    const o = await base('character-zombie', palette([[70, 190, 280, 0.9, 0.9]]));
    inHand(o, staff(0xc07aff, 0.7), 1.15);
    attach(o, 'head', wizardHat(0x3a2358, 0xb06bff), [0, 0.12, 0]);
    return { obj: o, scale: 1.2, ranged: true };
  },
};
