// Personajes de los Silvanos: los mismos modelos chibi de Kenney, con ropa verde y de madera, capuchas, cuernos de ciervo
// y armas de bosque. Uso:  const S = await import('/sheets.js'); const Y = await import('/designsSylvan.js');
//   await S.renderAll(null, true, Y.SYLVAN_UNITS);
import { base, palette } from './chars.js';
import { C, attach, bow, cape, flame, groundRing, halo, inHand, mat, mesh, onArm, oroGris, quiver, shield, shoulderPads, spear, staff, sword, wings, wizardHat, withCape } from './designs.js';

const I = window.iso;
const T = I.THREE;

const BOSQUE = 0x3f8f45;
const BOSQUE_OSC = 0x2a5d34;
const MADERA = 0x8a5a33;
const HOJA = 0x7ac46a;
const ASTA = 0xd9c7a0; // color de los cuernos de ciervo

/** Capucha de hojas (un cono verde sobre la cabeza). */
const hood = (color = BOSQUE) => mesh(new T.ConeGeometry(0.2, 0.28, 10), mat(color, { roughness: 0.9, metalness: 0 }));
/** Gorro de paja de los aldeanos. */
const straw = () => mesh(new T.CylinderGeometry(0.18, 0.22, 0.05, 12), mat(0xd9c27a));
/** Una hojita en el gorro. */
const leaf = (color = HOJA) => {
  const m = mesh(new T.ConeGeometry(0.035, 0.18, 5), mat(color));
  m.scale.z = 0.4;
  return m;
};
/** Cuernos de ciervo: una rama principal con dos puntas por lado. */
const antlers = (s = 1) => {
  const g = new T.Group();
  const m = mat(ASTA, { roughness: 0.8, metalness: 0 });
  for (const sx of [-1, 1]) {
    const main = mesh(new T.CylinderGeometry(0.016, 0.026, 0.3, 6), m, sx * 0.1, 0.13, 0);
    main.rotation.z = -sx * 0.45;
    g.add(main);
    for (const [k, h] of [[0, 0.17], [1, 0.14]]) {
      const tine = mesh(new T.CylinderGeometry(0.008, 0.016, h, 5), m, sx * (0.17 + k * 0.07), 0.22 + k * 0.11, 0);
      tine.rotation.z = sx * 0.35;
      g.add(tine);
    }
  }
  g.scale.setScalar(s);
  return g;
};
/** Los tonos fríos del modelo (azules, violetas) pasan a verde bosque. */
const aVerde = () => verdear;
/** Ropa y armadura al verde del bosque: tonos fríos (azul, violeta) y grises claros pasan a verde; la piel y el pelo se quedan. */
function verdear(r, g, b) {
  const [h, s, v] = I.hsv(r, g, b);
  if (h >= 190 && h <= 340 && s > 0.1) return I.rgb(125, Math.min(0.75, Math.max(0.4, s * 1.8)), Math.min(1, v * 1.0));
  if (s <= 0.1 && v > 0.45) return [r * 0.78 + 6, Math.min(255, g * 0.98 + 22), b * 0.72 + 4]; // blancos y grises → verde claro y musgo
  return [r, g, b];
}
const _musgo = (r, g, b) => [Math.min(255, r * 0.78 + 8), Math.min(255, g * 0.95 + 24), Math.min(255, b * 0.7 + 6)]; // grises de armadura → verde musgo

export const DESIGNS = {
  async unit_soldier() {
    // Lancero: túnica verde, lanza larga y escudo redondo de madera
    const o = await base('character-male-g', verdear);
    inHand(o, spear(0xcfd8c0, 0.78), 1.15);
    onArm(o, shield(MADERA, true, HOJA), 1.1);
    withCape(o, cape(BOSQUE_OSC, HOJA, 0.26, 0.3));
    attach(o, 'head', hood(), [0, 0.34, 0], [0, 0, 0], 1.1);
    return { obj: o, scale: 1.15 };
  },
  async unit_archer() {
    // Arquera: capucha verde, arco largo y aljaba
    const o = await base('character-female-e', verdear);
    inHand(o, bow(MADERA, 0.5), 1.25);
    attach(o, 'torso', quiver(0xe8e0c0), [0, 0.15, -0.1]);
    attach(o, 'head', hood(), [0, 0.34, 0], [0, 0, 0], 1.15);
    return { obj: o, scale: 1.15, ranged: true };
  },
  async unit_mage() {
    // Druida: gorro de hojas, bastón con cristal verde
    const o = await base('character-female-c', verdear);
    inHand(o, staff(0x6fe8a0, 0.72), 1.1);
    attach(o, 'head', wizardHat(BOSQUE, 0xd9b66a), [0, 0.28, 0], [0, 0, 0], 1.3);
    attach(o, 'head', leaf(0xb8e08a), [0.0, 0.62, 0.04], [0, 0, 30]);
    return { obj: o, scale: 1.15, ranged: true };
  },
  async unit_knight() {
    // Centinela: armadura de musgo, cuernos de ciervo, lanza y gran escudo verde
    const o = await base('character-knight', verdear);
    inHand(o, spear(0xe8d8a0, 0.64), 1.1);
    onArm(o, shield(BOSQUE, false, 0xd9b66a), 1.2);
    withCape(o, cape(BOSQUE_OSC, 0xd9b66a));
    attach(o, 'head', antlers(1.0), [0, 0.21, 0]);
    return { obj: o, scale: 1.3 };
  },
  async worker_1() {
    const o = await base('character-male-a');
    attach(o, 'head', straw(), [0, 0.3, 0], [0, 0, 0], 1.2);
    return { obj: o, scale: 1.1, worker: true };
  },
  async worker_2() {
    const o = await base('character-female-b');
    attach(o, 'head', hood(0x9a7a3a), [0, 0.34, 0], [0, 0, 0], 1.1);
    return { obj: o, scale: 1.1, worker: true };
  },
  async worker_3() {
    const o = await base('character-male-f');
    attach(o, 'head', straw(), [0, 0.3, 0], [0, 0, 0], 1.2);
    return { obj: o, scale: 1.1, worker: true };
  },
  async worker_4() {
    const o = await base('character-female-f');
    attach(o, 'head', hood(BOSQUE_OSC), [0, 0.34, 0], [0, 0, 0], 1.1);
    return { obj: o, scale: 1.1, worker: true };
  },
  // Héroes
  async unit_hero() {
    // Guardián: armadura de musgo y oro, cuernos de ciervo con halo, gran escudo y espada de luz verde
    const o = await base('character-knight', (r, g, b) => oroGris(...verdear(r, g, b)));
    inHand(o, sword(0xc8ffd8, C.oro, 0.4), 1.45);
    onArm(o, shield(BOSQUE, true, C.oro), 1.45);
    withCape(o, cape(BOSQUE, C.oro, 0.36, 0.46));
    attach(o, 'head', antlers(1.3), [0, 0.21, 0]);
    attach(o, 'torso', shoulderPads(MADERA), [0, 0.28, 0], [0, 0, 0], 1.15);
    attach(o, 'head', halo(0xa8ffc0), [0, 0.46, 0], [90, 0, 0]);
    o.add(groundRing(0x6fe8a0));
    return { obj: o, scale: 1.7 };
  },
  async hero_ranger() {
    // Montaraz: capa de hojas, arco enorme de madera clara y aljaba dorada
    const o = await base('character-female-e', verdear);
    inHand(o, bow(0xb08a50, 0.62), 1.5);
    withCape(o, cape(BOSQUE_OSC, HOJA, 0.34, 0.5));
    attach(o, 'torso', quiver(C.oro, -0.35), [0, 0.15, -0.1], [0, 0, 0], 1.2);
    attach(o, 'head', hood(BOSQUE_OSC), [0, 0.34, 0], [0, 0, 0], 1.3);
    attach(o, 'head', leaf(0xb8e08a), [0.1, 0.34, -0.04], [0, 0, -50]);
    o.add(groundRing(0x56e07a));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_priest() {
    // Sanadora: túnica crema y verde, alas de hojas, gran halo y bastón con cristal
    const o = await base('character-female-b', verdear);
    inHand(o, staff(0xa8ffc0, 0.78), 1.3);
    withCape(o, cape(0xe8f0d0, HOJA, 0.34, 0.48));
    attach(o, 'torso', wings(0xb8e08a, 0xf2d36a), [0, 0.2, -0.13], [0, 0, 0], 1.25);
    attach(o, 'head', halo(0xf2f0a8), [0, 0.4, 0], [90, 0, 0], 1.3);
    o.add(groundRing(0xb8ffc8));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_pyro() {
    // Pirómana: túnica dorada y naranja, sombrero de sol, llama en la mano
    const o = await base('character-female-d', (r, g, b) => { const [h, sa, v] = I.hsv(r, g, b); return sa > 0.1 && h >= 190 && h <= 340 ? I.rgb(30, 0.7, v) : [r, g, b]; });
    attach(o, 'arm-right', flame(), [0, -0.16, 0.14], [0, 0, 0], 1.3);
    attach(o, 'head', wizardHat(0xd9892a, C.oro), [0, 0.28, 0], [0, 0, 0], 1.35);
    withCape(o, cape(0xb85a1a, C.oro, 0.34, 0.5));
    o.add(groundRing(C.fuego));
    return { obj: o, scale: 1.65, ranged: true };
  },
  async hero_warlord() {
    // Capitán: gran cornamenta, hombreras de madera, lanza enorme y capa verde
    const o = await base('character-male-g', verdear);
    inHand(o, spear(0xe8d8a0, 0.9), 1.5);
    attach(o, 'torso', shoulderPads(MADERA), [0, 0.28, 0], [0, 0, 0], 1.3);
    attach(o, 'head', antlers(1.6), [0, 0.21, 0]);
    withCape(o, cape(BOSQUE, C.oro, 0.38, 0.5));
    o.add(groundRing(0x6fe8a0));
    return { obj: o, scale: 1.8 };
  },
};

const sylvanTint = (r, g, b) => {
  const [h, s, v] = I.hsv(r, g, b);
  if ((h < 14 || h > 340) && s > 0.45 && v > 0.4) return I.rgb(128, Math.min(1, s * 0.7), v * 0.9);
  return [r, g, b];
};

export const SYLVAN_UNITS = {
  dir: 'sylvan/',
  designs: DESIGNS,
  siege: { unit_catapult: ['siege-ballista', 0.62, sylvanTint], unit_ram: ['siege-ram', 0.62, sylvanTint] },
  keys: [...Object.keys(DESIGNS), 'unit_catapult', 'unit_ram'],
};
window.sylvanUnits = SYLVAN_UNITS;
