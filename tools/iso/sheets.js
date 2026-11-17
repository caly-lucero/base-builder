// Hojas de animación de cada personaje: 4 filas × 8 columnas de cuadros FRAME.W × FRAME.H.
//   fila 0: caminar SE (6 cuadros)        fila 1: caminar NE (6)
//   fila 2: atacar SE (4) + atacar NE (4) fila 3: quieto SE, quieto NE, caído SE, caído NE
// Las direcciones SO y NO se sacan volteando SE y NE en el juego.
import { DIRS, FRAME } from './chars.js';
import { DESIGNS } from './designs.js';

const I = window.iso;
const T = I.THREE;
export const COLS = 8;
export const ROWS = 4;
export const WALK_FRAMES = 6;
export const ATTACK_FRAMES = 4;

/** Araña de la Horda, hecha a mano: cuerpo, cabeza, ojos y 8 patas que se mueven por pares. */
function spider() {
  const g = new T.Group();
  const dark = new T.MeshStandardMaterial({ color: 0x3a2230, roughness: 0.7 });
  const red = new T.MeshStandardMaterial({ color: 0x8c2a3a, roughness: 0.6 });
  const body = new T.Mesh(new T.SphereGeometry(0.2, 14, 10), dark);
  body.scale.set(1.1, 0.8, 1.35);
  body.position.set(0, 0.24, -0.1);
  g.add(body);
  const mark = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), red);
  mark.scale.set(1, 0.4, 1.4);
  mark.position.set(0, 0.36, -0.12);
  g.add(mark);
  const head = new T.Mesh(new T.SphereGeometry(0.13, 12, 10), dark);
  head.position.set(0, 0.24, 0.16);
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), new T.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1.4 }));
    eye.position.set(s * 0.06, 0.29, 0.26);
    g.add(eye);
    const fang = new T.Mesh(new T.ConeGeometry(0.02, 0.07, 5), new T.MeshStandardMaterial({ color: 0xe9e3d0 }));
    fang.position.set(s * 0.04, 0.17, 0.27);
    fang.rotation.x = Math.PI;
    g.add(fang);
  }
  const legs = [];
  for (let k = 0; k < 8; k++) {
    const side = k < 4 ? -1 : 1;
    const i = k % 4;
    const pivot = new T.Group();
    pivot.position.set(side * 0.1, 0.24, 0.12 - i * 0.11);
    const upper = new T.Mesh(new T.CylinderGeometry(0.018, 0.014, 0.3, 6), dark);
    upper.rotation.z = (side * Math.PI) / 2.6;
    upper.position.set(side * 0.12, 0.06, 0);
    pivot.add(upper);
    const lower = new T.Mesh(new T.CylinderGeometry(0.014, 0.008, 0.3, 6), dark);
    lower.rotation.z = (-side * Math.PI) / 8;
    lower.position.set(side * 0.27, -0.06, 0);
    pivot.add(lower);
    pivot.userData = { base: (i - 1.5) * 0.28, side, phase: (i + (side > 0 ? 0 : 1)) % 2 };
    pivot.rotation.y = pivot.userData.base;
    legs.push(pivot);
    g.add(pivot);
  }
  g.userData.legs = legs;
  return g;
}

function poseSpider(g, clip, t) {
  const walk = clip === 'walk' ? Math.sin(t * Math.PI * 2) : 0;
  const hit = clip === 'attack' ? Math.sin(t * Math.PI) : 0;
  for (const l of g.userData.legs) {
    l.rotation.y = l.userData.base + walk * 0.35 * (l.userData.phase ? 1 : -1);
    l.position.y = 0.24 + Math.max(0, walk * (l.userData.phase ? 1 : -1)) * 0.05;
  }
  g.position.y = 0;
  g.rotation.x = clip === 'attack' ? -hit * 0.25 : 0; // se alza al morder
  g.children[0].position.y = clip === 'die' ? 0.08 : 0.24;
  if (clip === 'die') {
    g.rotation.z = Math.PI; // patas arriba
    g.position.y = 0.4;
  } else g.rotation.z = 0;
}

/** Siege: un modelo del kit del castillo, sin esqueleto. */
async function siege(name, scale) {
  const o = await I.make('castle', name);
  const inner = new T.Group();
  inner.add(o);
  inner.userData.siege = true;
  return { obj: inner, scale, siege: true };
}

const designFor = async (key) => {
  if (key === 'enemy_spider') return { obj: spider(), scale: 1.2, spider: true };
  if (key === 'unit_catapult') return siege('siege-catapult', 0.62);
  if (key === 'unit_ram') return siege('siege-ram', 0.62);
  return DESIGNS[key]();
};

export const ALL_KEYS = [...Object.keys(DESIGNS), 'enemy_spider', 'unit_catapult', 'unit_ram'];

function drawFrame(d, clip, t, dir) {
  const holder = new T.Group();
  holder.add(d.obj);
  holder.scale.setScalar(d.scale * 0.95);
  holder.rotation.y = (DIRS[dir] * Math.PI) / 180;
  if (d.spider) poseSpider(d.obj, clip, t);
  else if (d.siege) {
    d.obj.position.y = clip === 'walk' ? Math.abs(Math.sin(t * Math.PI * 2)) * 0.02 : 0;
    d.obj.rotation.z = clip === 'attack' ? Math.sin(t * Math.PI) * -0.05 : 0;
    d.obj.rotation.x = clip === 'die' ? 0.35 : 0;
  } else I.pose(d.obj, { walk: 'walk', attack: 'attack-melee-right', idle: 'idle', die: 'die' }[clip], t * (clip === 'idle' ? 1.33 : clip === 'walk' ? 0.67 : clip === 'attack' ? 0.42 : 0.33));
  const c = I.render(holder, { ...FRAME, SS: 4, ground: true });
  holder.remove(d.obj);
  return c;
}

/** Hoja completa de un personaje (canvas COLS×FRAME.W por ROWS×FRAME.H). */
export async function sheet(key) {
  const d = await designFor(key);
  const out = document.createElement('canvas');
  out.width = COLS * FRAME.W;
  out.height = ROWS * FRAME.H;
  const ctx = out.getContext('2d');
  const put = (c, col, row) => ctx.drawImage(c, col * FRAME.W, row * FRAME.H);
  ['SE', 'NE'].forEach((dir, r) => {
    for (let i = 0; i < WALK_FRAMES; i++) put(drawFrame(d, 'walk', i / WALK_FRAMES, dir), i, r);
  });
  ['SE', 'NE'].forEach((dir, r) => {
    for (let i = 0; i < ATTACK_FRAMES; i++) put(drawFrame(d, 'attack', i / (ATTACK_FRAMES - 1), dir), r * ATTACK_FRAMES + i, 2);
  });
  put(drawFrame(d, 'idle', 0, 'SE'), 0, 3);
  put(drawFrame(d, 'idle', 0, 'NE'), 1, 3);
  put(drawFrame(d, 'die', 1, 'SE'), 2, 3);
  put(drawFrame(d, 'die', 1, 'NE'), 3, 3);
  return out;
}

export async function renderAll(keys = ALL_KEYS, save = true) {
  document.getElementById('out').innerHTML = '';
  let n = 0;
  for (const k of keys) {
    const c = await sheet(k);
    if (save) await I.save(c, `units/${k}.png`);
    c.style.width = '640px';
    I.show(c, k);
    n++;
  }
  return n;
}
