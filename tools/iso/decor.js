// Decoración del mapa en vista isométrica: árboles, rocas, arbustos, tocones y flores. Solo para desarrollo.
// Uso (en la página de la herramienta):  const d = await import('/decor.js'); await d.renderAll(save = true)
const I = window.iso;
const T = I.THREE;

/** Pone un modelo dentro de un grupo. */
async function put(pack, name, { x = 0, y = 0, z = 0, ry = 0, s = 1 } = {}) {
  const o = await I.make(pack, name);
  o.position.set(x, y, z);
  o.rotation.y = (ry * Math.PI) / 180;
  o.scale.setScalar(s);
  return o;
}

/** Tonos de verde algo más vivos y variados que los del kit (la paleta del Reino no se aplica aquí). */
const verde = (shift = 0, sat = 1.05, val = 1.0) => (r, g, b) => {
  const [h, s, v] = I.hsv(r, g, b);
  if (h >= 70 && h <= 170 && s > 0.3) return I.rgb(h + shift, Math.min(1, s * sat), Math.min(1, v * val));
  return [r, g, b];
};

const TREES = {
  tree_a: ['town', 'tree-high-round', 0.85, verde(-8)],
  tree_b: ['castle', 'tree-large', 0.8, verde(6, 1.0, 1.02)],
  tree_c: ['town', 'tree-crooked', 0.95, verde(-16, 1.0, 0.95)],
};
const ROCKS = {
  rock_a: ['castle', 'rocks-large', 0.85],
  rock_b: ['castle', 'rocks-small', 1.1],
  rock_c: ['town', 'rock-large', 0.9],
  rock_d: ['town', 'rock-small', 1.0],
  rock_e: ['town', 'rock-wide', 0.8],
  rock_f: ['castle', 'rocks-small', 0.8, 70],
};

async function build(key) {
  const g = new T.Group();
  if (TREES[key]) {
    const [pack, name, s, fn] = TREES[key];
    const o = await put(pack, name, { s });
    I.recolor(o, fn);
    g.add(o);
  } else if (ROCKS[key]) {
    const [pack, name, s, ry = 0] = ROCKS[key];
    g.add(await put(pack, name, { s, ry }));
  } else if (key === 'bush_a' || key === 'bush_b') {
    // Mata: unas bolas facetadas de verde, con alguna baya.
    const blobs = key === 'bush_a' ? [[0, 0.2, 0, 0.26, 0x4f9a3d], [0.22, 0.14, 0.08, 0.18, 0x5fae48], [-0.2, 0.13, 0.1, 0.17, 0x438a36]] : [[0, 0.17, 0, 0.2, 0x5aa845], [-0.17, 0.12, -0.05, 0.14, 0x4a9640]];
    for (const [x, y, z, r, col] of blobs) {
      const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), new T.MeshStandardMaterial({ color: col, flatShading: true, roughness: 1 }));
      m.position.set(x, y, z);
      m.scale.y = 0.85;
      g.add(m);
    }
    if (key === 'bush_a') {
      for (const [x, y, z] of [[0.1, 0.34, 0.14], [-0.08, 0.3, 0.2], [0.24, 0.22, 0.14]]) {
        const m = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), new T.MeshStandardMaterial({ color: 0xd8484a, roughness: 0.6 }));
        m.position.set(x, y, z);
        g.add(m);
      }
    }
  } else if (key === 'stump') {
    g.add(await put('castle', 'tree-trunk', { s: 0.7 }));
  } else if (key === 'log') {
    g.add(await put('castle', 'tree-log', { s: 0.8, ry: 30 }));
  } else if (key === 'crate') {
    g.add(await put('town', 'planks', { s: 0.6 }));
    g.add(await put('town', 'planks-half', { s: 0.6, y: 0.15, x: 0.1, ry: 40 }));
  }
  return g;
}

export const KEYS = [...Object.keys(TREES), ...Object.keys(ROCKS), 'bush_a', 'bush_b', 'stump', 'log', 'crate'];

/** Flores (3 colores) y mata de hierba: dibujadas a mano, pequeñas (32×24, centro en 16,16). */
function flower(kind) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 24;
  const x = c.getContext('2d');
  const stem = '#3f7a35';
  const petals = ['#f4d34b', '#f08ab0', '#f4f4ee'][kind % 3];
  x.fillStyle = 'rgba(30,50,20,0.18)';
  x.beginPath();
  x.ellipse(16, 17, 8, 3, 0, 0, Math.PI * 2);
  x.fill();
  for (const [dx, dy] of [[-5, 0], [3, -1], [8, 1]]) {
    x.strokeStyle = stem;
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(16 + dx, 17 + dy);
    x.lineTo(16 + dx, 10 + dy);
    x.stroke();
    x.fillStyle = petals;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      x.beginPath();
      x.arc(16 + dx + Math.cos(a) * 2.2, 9 + dy + Math.sin(a) * 2.2, 1.7, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#e9a62a';
    x.beginPath();
    x.arc(16 + dx, 9 + dy, 1.4, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

function tuft() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 24;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(30,50,20,0.16)';
  x.beginPath();
  x.ellipse(16, 17, 8, 3, 0, 0, Math.PI * 2);
  x.fill();
  const cols = ['#4e9a3c', '#5fae48', '#3f8434'];
  for (let k = 0; k < 9; k++) {
    const dx = (k - 4) * 2.2;
    x.strokeStyle = cols[k % 3];
    x.lineWidth = 1.8;
    x.beginPath();
    x.moveTo(16 + dx, 18);
    x.quadraticCurveTo(16 + dx * 1.1, 12, 16 + dx * 1.7 + (k % 2 ? 2 : -2), 7 + (k % 3));
    x.stroke();
  }
  return c;
}

/** Dibuja todo, lo muestra y (si `save`) lo guarda en decor/<clave>.png. Lienzos de 160×176, el centro de la casilla en (80,128). */
export async function renderAll(save = true) {
  document.getElementById('out').innerHTML = '';
  for (const key of KEYS) {
    const o = await build(key);
    const c = I.render(o, { W: 160, H: 176, ox: 80, oy: 128, ground: true });
    I.show(c, key);
    if (save) await I.save(c, `decor/${key}.png`);
  }
  for (let k = 0; k < 3; k++) {
    const c = flower(k);
    I.show(c, `flower_${k}`);
    if (save) await I.save(c, `decor/flower_${k}.png`);
  }
  const t = tuft();
  I.show(t, 'tuft');
  if (save) await I.save(t, 'decor/tuft.png');
  return KEYS.length + 4;
}
