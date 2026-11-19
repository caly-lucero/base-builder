// Personajes del Reino: modelos chibi de Kenney (Mini Characters, CC0) con colores, armas y capas propias,
// dibujados en vista isométrica desde 2 direcciones (las otras 2 se sacan volteando la imagen).
// Uso: const c = await import('/chars.js'); await c.preview(['soldier','archer'])
const I = window.iso;
const T = I.THREE;

export const FRAME = { W: 96 * I.ART, H: 120 * I.ART, ox: 48 * I.ART, oy: 98 * I.ART }; // tamaño de cada cuadro y el píxel donde pisa el personaje
export const DIRS = { SE: 90, NE: 180 }; // giro (grados) del modelo: miran hacia +x (abajo-derecha) y -z (arriba-derecha)

/** Un hueso del esqueleto por nombre. */
function bone(obj, name) {
  let found = null;
  obj.traverse((o) => {
    if (o.isBone && o.name === name) found = o;
  });
  return found;
}

/** Cuelga un modelo suelto (arma, escudo…) de un hueso de la mano. */
async function hold(obj, boneName, pack, model, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, tint } = {}) {
  const b = bone(obj, boneName);
  const item = await I.make(pack, model);
  item.position.set(x, y, z);
  item.rotation.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180);
  item.scale.setScalar(s);
  if (tint) I.recolor(item, tint);
  b.add(item);
  return item;
}

/** Cambia el matiz de un grupo de colores: `rules` = [[hMin, hMax, nuevoH, satMul, valMul], …] (los grises quedan igual salvo `grey`). */
export const palette = (rules, grey) => (r, g, b) => {
  const [h, s, v] = I.hsv(r, g, b);
  if (s < 0.16 && grey) return grey(r, g, b);
  for (const [h0, h1, nh, sm = 1, vm = 1] of rules) {
    const inRange = h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1;
    if (inRange && s >= 0.3) return I.rgb(nh === null ? h : nh, Math.min(1, s * sm), Math.min(1, v * vm));
  }
  return [r, g, b];
};

export async function base(model, tint) {
  const o = await I.make('chars', model);
  if (tint) I.recolor(o, tint);
  return o;
}

/** Dibuja un cuadro: `obj` ya armado, animación `clip` en el instante `t`, mirando `dir` (SE/NE). */
export function frame(obj, clip, t, dir = 'SE', scale = 0.7) {
  const holder = new T.Group();
  holder.add(obj);
  holder.scale.setScalar(scale);
  holder.rotation.y = (DIRS[dir] * Math.PI) / 180;
  I.pose(obj, clip, t);
  const c = I.render(holder, { ...FRAME, SS: 4, ground: true });
  holder.remove(obj);
  return c;
}
