// Kit de interfaz: paleta, iconos dibujados por código (vectoriales, sin archivos), paneles y botones
// redondeados. Todas las pantallas lo usan, así que todo se ve de la misma familia.
import { LAYOUT } from '../data/config.js';

export const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

/** Paleta «madera y pergamino»: marrones oscuros, oro y colores de acción. */
export const PAL = {
  wood0: 0x1f150c,
  wood1: 0x322212,
  wood2: 0x4a3320,
  wood3: 0x634629,
  gold: 0xe6b84f,
  goldDark: 0x8a6420,
  parchment: 0xf3e3b8,
  ink: 0x2b1d12,
  green: 0x4f9a42,
  blue: 0x3f7fc0,
  red: 0xc4493d,
  steel: 0x6a7783,
  violet: 0x7b52b8,
};
export const TXT = {
  light: '#f6ecd2',
  gold: '#ffd873',
  dim: '#c9b48c',
  faint: '#8d7a5a',
  good: '#9fe08a',
  bad: '#ff8f7d',
  blue: '#9ccaf2',
  wood: '#e8c79a',
};

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const mix = (a, b, t) => {
  const c = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [x, y] = [c(a), c(b)];
  return (Math.round(x[0] + (y[0] - x[0]) * t) << 16) | (Math.round(x[1] + (y[1] - x[1]) * t) << 8) | Math.round(x[2] + (y[2] - x[2]) * t);
};

/* ---------- texturas ---------- */

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.context, w, h);
  tex.refresh();
  return key;
}

function roundRect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/** Colores de cada tipo de panel: [arriba, abajo, borde]. */
const KINDS = {
  bar: { top: PAL.wood2, bottom: PAL.wood0, border: PAL.goldDark, r: 0 },
  card: { top: PAL.wood2, bottom: PAL.wood1, border: PAL.goldDark, r: 12 },
  sheet: { top: PAL.wood2, bottom: PAL.wood0, border: PAL.gold, r: [18, 18, 0, 0] },
  dark: { top: PAL.wood1, bottom: PAL.wood0, border: PAL.wood3, r: 10 },
  pill: { top: PAL.wood2, bottom: PAL.wood0, border: PAL.goldDark, r: 99 },
  green: { top: 0x6fbf5c, bottom: 0x2f6f2c, border: 0x1d4a1c, r: 10, button: true },
  blue: { top: 0x5a9bdc, bottom: 0x255a94, border: 0x16385e, r: 10, button: true },
  red: { top: 0xe1675a, bottom: 0x8e2a22, border: 0x5a1812, r: 10, button: true },
  gold: { top: 0xf4cf6a, bottom: 0xb07a22, border: 0x6a4a12, r: 10, button: true },
  dark2: { top: PAL.wood3, bottom: PAL.wood1, border: PAL.wood0, r: 10, button: true },
  violet: { top: 0x9a72d4, bottom: 0x4f2f86, border: 0x2e1a52, r: 10, button: true },
};

/** Textura de un panel de ese tipo y tamaño (se crea una vez y se reutiliza). */
export function panelTexture(scene, kind, w, h, line = null) {
  w = Math.round(w);
  h = Math.round(h);
  const key = `ui_${kind}_${w}x${h}${line ? `_${line}` : ''}`;
  const k = KINDS[kind];
  return canvasTexture(scene, key, w, h, (ctx) => {
    const radius = k.r === 99 ? Math.min(w, h) / 2 : k.r;
    const inset = 1.5;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, hex(k.top));
    g.addColorStop(1, hex(k.bottom));
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
    ctx.fillStyle = g;
    ctx.fill();
    if (k.button) {
      // Un reborde de luz arriba y una sombra gruesa abajo: se ve «alto» y se puede presionar.
      ctx.save();
      roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
      ctx.clip();
      const shine = ctx.createLinearGradient(0, 0, 0, h * 0.5);
      shine.addColorStop(0, 'rgba(255,255,255,0.38)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, w, h * 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, h - 6, w, 6);
      ctx.restore();
    }
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
    ctx.lineWidth = k.button ? 2.4 : 2.2;
    ctx.strokeStyle = hex(k.border);
    ctx.stroke();
    if (!k.button) {
      roundRect(ctx, inset + 2.2, inset + 2.2, w - (inset + 2.2) * 2, h - (inset + 2.2) * 2, Math.max(0, (radius === 0 ? 0 : radius) - 2));
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,235,180,0.16)';
      ctx.stroke();
    }
    if (line) {
      // Filo dorado en el borde de arriba o de abajo (barras).
      ctx.fillStyle = hex(PAL.gold);
      ctx.fillRect(0, line === 'top' ? 0 : h - 2.5, w, 2.5);
    }
  });
}

/* ---------- iconos ---------- */

const ICONS = {
  coin(ctx) {
    ctx.fillStyle = '#7a5410';
    circle(ctx, 24, 25, 19);
    const g = ctx.createRadialGradient(18, 16, 2, 24, 24, 20);
    g.addColorStop(0, '#fff0a0');
    g.addColorStop(1, '#e0a521');
    ctx.fillStyle = g;
    circle(ctx, 24, 24, 18);
    ctx.strokeStyle = '#a77515';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(24, 24, 12.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#b8801a';
    ctx.fillRect(22, 15, 4, 18);
    ctx.fillRect(18, 19, 12, 3.5);
  },
  wood(ctx) {
    const log = (x, y, w) => {
      ctx.fillStyle = '#6b4220';
      roundRect(ctx, x, y, w, 13, 6);
      ctx.fill();
      ctx.fillStyle = '#a8703a';
      roundRect(ctx, x + 1.5, y + 1.5, w - 3, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#d9a566';
      circle(ctx, x + w - 6, y + 6.5, 5);
      ctx.strokeStyle = '#8a5a2a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + w - 6, y + 6.5, 2.6, 0, Math.PI * 2);
      ctx.stroke();
    };
    log(3, 9, 36);
    log(9, 22, 36);
    log(3, 33, 30);
  },
  pop(ctx) {
    ctx.fillStyle = '#f0dcb0';
    circle(ctx, 24, 15, 8);
    ctx.beginPath();
    ctx.moveTo(8, 42);
    ctx.quadraticCurveTo(8, 25, 24, 25);
    ctx.quadraticCurveTo(40, 25, 40, 42);
    ctx.closePath();
    ctx.fill();
  },
  swords(ctx) {
    ctx.lineCap = 'round';
    for (const s of [1, -1]) {
      ctx.save();
      ctx.translate(24, 24);
      ctx.scale(s, 1);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#e8eef2';
      ctx.fillRect(-3, -20, 6, 26);
      ctx.fillStyle = '#aab6bf';
      ctx.fillRect(-1, -20, 2, 26);
      ctx.fillStyle = '#e6b84f';
      ctx.fillRect(-9, 6, 18, 4);
      ctx.fillStyle = '#7a4a22';
      ctx.fillRect(-2.5, 10, 5, 10);
      ctx.restore();
    }
  },
  hammer(ctx) {
    ctx.save();
    ctx.translate(24, 24);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(-3, -4, 6, 26);
    ctx.fillStyle = '#c0c8cf';
    roundRect(ctx, -14, -16, 28, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#8f9aa3';
    ctx.fillRect(-14, -8, 28, 5);
    ctx.restore();
  },
  crown(ctx) {
    ctx.fillStyle = '#b07a22';
    ctx.beginPath();
    ctx.moveTo(6, 36);
    ctx.lineTo(8, 14);
    ctx.lineTo(17, 24);
    ctx.lineTo(24, 10);
    ctx.lineTo(31, 24);
    ctx.lineTo(40, 14);
    ctx.lineTo(42, 36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4cf6a';
    ctx.beginPath();
    ctx.moveTo(9, 33);
    ctx.lineTo(10.5, 19);
    ctx.lineTo(18, 27);
    ctx.lineTo(24, 14);
    ctx.lineTo(30, 27);
    ctx.lineTo(37.5, 19);
    ctx.lineTo(39, 33);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d94a3f';
    circle(ctx, 24, 28, 3);
    ctx.fillStyle = '#7a5410';
    ctx.fillRect(6, 36, 36, 4);
  },
  trophy(ctx) {
    ctx.fillStyle = '#f4cf6a';
    ctx.beginPath();
    ctx.moveTo(12, 8);
    ctx.lineTo(36, 8);
    ctx.quadraticCurveTo(36, 28, 24, 30);
    ctx.quadraticCurveTo(12, 28, 12, 8);
    ctx.fill();
    ctx.strokeStyle = '#e0a521';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(11, 15, 5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(37, 15, 5, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#c98e1f';
    ctx.fillRect(21, 29, 6, 8);
    ctx.fillRect(14, 37, 20, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(16, 10, 3, 12);
  },
  gear(ctx) {
    ctx.fillStyle = '#c9b48c';
    ctx.translate(24, 24);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -21, 8, 9);
    }
    circle(ctx, 0, 0, 15);
    ctx.fillStyle = '#4a3320';
    circle(ctx, 0, 0, 7);
  },
  home(ctx) {
    ctx.fillStyle = '#e8d5a3';
    ctx.fillRect(11, 22, 26, 20);
    ctx.fillStyle = '#c4493d';
    ctx.beginPath();
    ctx.moveTo(5, 24);
    ctx.lineTo(24, 7);
    ctx.lineTo(43, 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(20, 29, 8, 13);
  },
  rotr(ctx) {
    // flecha circular hacia la derecha (gira la vista en el sentido de las agujas del reloj)
    ctx.strokeStyle = '#f6ecd2';
    ctx.fillStyle = '#f6ecd2';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(24, 26, 13, Math.PI * 1.15, Math.PI * 2.4);
    ctx.stroke();
    const a = Math.PI * 2.4;
    const px = 24 + 13 * Math.cos(a);
    const py = 26 + 13 * Math.sin(a);
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(px + tx * 11, py + ty * 11);
    ctx.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8);
    ctx.lineTo(px - Math.cos(a) * 8, py - Math.sin(a) * 8);
    ctx.closePath();
    ctx.fill();
  },
  rotl(ctx) {
    ctx.translate(48, 0);
    ctx.scale(-1, 1);
    ICONS.rotr(ctx);
  },
  plus(ctx) {
    ctx.fillStyle = '#f6ecd2';
    ctx.fillRect(21, 8, 6, 32);
    ctx.fillRect(8, 21, 32, 6);
  },
  minus(ctx) {
    ctx.fillStyle = '#f6ecd2';
    ctx.fillRect(8, 21, 32, 6);
  },
  close(ctx) {
    ctx.strokeStyle = '#f6ecd2';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(11, 11);
    ctx.lineTo(37, 37);
    ctx.moveTo(37, 11);
    ctx.lineTo(11, 37);
    ctx.stroke();
  },
  warning(ctx) {
    ctx.fillStyle = '#f4cf6a';
    ctx.beginPath();
    ctx.moveTo(24, 5);
    ctx.lineTo(44, 40);
    ctx.lineTo(4, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a2a1a';
    ctx.fillRect(22, 16, 4, 14);
    circle(ctx, 24, 35, 2.6);
  },
  wrench(ctx) {
    ctx.save();
    ctx.translate(24, 24);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#c0c8cf';
    ctx.fillRect(-4, -4, 8, 24);
    ctx.beginPath();
    ctx.arc(0, -12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3320';
    ctx.fillRect(-4, -26, 8, 14);
    ctx.restore();
  },
  scroll(ctx) {
    ctx.fillStyle = '#e8d5a3';
    roundRect(ctx, 9, 6, 30, 36, 5);
    ctx.fill();
    ctx.fillStyle = '#a8864a';
    for (const y of [15, 22, 29]) ctx.fillRect(14, y, 20, 3);
    ctx.fillStyle = '#c9a85c';
    circle(ctx, 24, 6, 5);
    circle(ctx, 24, 42, 5);
  },
  shield(ctx) {
    ctx.fillStyle = '#5a82ad';
    ctx.beginPath();
    ctx.moveTo(24, 5);
    ctx.lineTo(41, 11);
    ctx.quadraticCurveTo(41, 33, 24, 43);
    ctx.quadraticCurveTo(7, 33, 7, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9ccaf2';
    ctx.beginPath();
    ctx.moveTo(24, 10);
    ctx.lineTo(36, 14);
    ctx.quadraticCurveTo(36, 30, 24, 38);
    ctx.closePath();
    ctx.fill();
  },
  clock(ctx) {
    ctx.fillStyle = '#e8d5a3';
    circle(ctx, 24, 24, 19);
    ctx.fillStyle = '#4a3320';
    circle(ctx, 24, 24, 16);
    ctx.fillStyle = '#e8d5a3';
    ctx.fillRect(23, 11, 3, 14);
    ctx.fillRect(23, 23, 10, 3);
  },
  ff(ctx) {
    ctx.fillStyle = '#f6ecd2';
    ctx.beginPath();
    ctx.moveTo(6, 10);
    ctx.lineTo(24, 24);
    ctx.lineTo(6, 38);
    ctx.closePath();
    ctx.moveTo(24, 10);
    ctx.lineTo(42, 24);
    ctx.lineTo(24, 38);
    ctx.closePath();
    ctx.fill();
  },
  star(ctx) {
    ctx.fillStyle = '#f4cf6a';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 19 : 8;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(24 + Math.cos(a) * r, 25 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
  check(ctx) {
    ctx.strokeStyle = '#9fe08a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(10, 25);
    ctx.lineTo(20, 35);
    ctx.lineTo(39, 12);
    ctx.stroke();
  },
  auto(ctx) {
    ctx.strokeStyle = '#f6ecd2';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(24, 24, 14, Math.PI * 0.15, Math.PI * 1.55);
    ctx.stroke();
    ctx.fillStyle = '#f6ecd2';
    ctx.beginPath();
    ctx.moveTo(30, 6);
    ctx.lineTo(42, 14);
    ctx.lineTo(28, 20);
    ctx.closePath();
    ctx.fill();
  },
  flag(ctx) {
    ctx.fillStyle = '#d9c8a0';
    ctx.fillRect(10, 6, 4, 38);
    ctx.fillStyle = '#e1675a';
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(40, 15);
    ctx.lineTo(14, 26);
    ctx.closePath();
    ctx.fill();
  },
  box(ctx) {
    ctx.strokeStyle = '#f6ecd2';
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(9, 11, 30, 26);
    ctx.setLineDash([]);
    ctx.fillStyle = '#f6ecd2';
    ctx.fillRect(21, 21, 6, 6);
  },
  lock(ctx) {
    ctx.fillStyle = '#b8a47a';
    roundRect(ctx, 11, 21, 26, 21, 4);
    ctx.fill();
    ctx.strokeStyle = '#b8a47a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(24, 21, 8, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#4a3320';
    circle(ctx, 24, 31, 3);
  },
};

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Crea los iconos que falten (se llaman `ic_<nombre>`, de 48×48). Seguro en cada escena. */
export function ensureUi(scene) {
  for (const [name, draw] of Object.entries(ICONS)) {
    canvasTexture(scene, `ic_${name}`, 48, 48, (ctx) => {
      ctx.save();
      draw(ctx);
      ctx.restore();
    });
  }
}

export const hasIcon = (name) => Object.hasOwn(ICONS, name);

/* ---------- piezas ---------- */

/** Un panel con ese aspecto (`kind`: bar, card, sheet, dark, pill o un color de botón). Origen en el centro. */
export function panel(scene, x, y, w, h, kind = 'card', depth = 150, line = null) {
  return scene.add.image(x, y, panelTexture(scene, kind, w, h, line)).setDepth(depth);
}

/** Un icono de `size` px de lado, centrado en (x, y). */
export function icon(scene, x, y, name, size = 20, depth = 152) {
  return scene.add.image(x, y, `ic_${name}`).setDisplaySize(size, size).setDepth(depth);
}

/** Texto con el estilo del juego. `o`: size, color, bold, origin, align, wrap, depth, stroke. */
export function label(scene, x, y, str, o = {}) {
  const t = scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${o.size ?? 13}px`,
      color: o.color ?? TXT.light,
      fontStyle: o.bold ? 'bold' : 'normal',
      align: o.align ?? 'left',
      lineSpacing: o.lineSpacing ?? 2,
      wordWrap: o.wrap ? { width: o.wrap } : undefined,
      stroke: o.stroke ? '#1a120b' : undefined,
      strokeThickness: o.stroke ?? 0,
    })
    .setOrigin(...(o.origin ?? [0, 0]))
    .setDepth(o.depth ?? 153);
  return t;
}

/** Una pequeña vibración al tocar (en el celular; no hace nada donde no existe). */
export function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sin vibración */
  }
}

/**
 * Botón redondeado. `o`: x, y (centro), w, h, kind (color), text, icon, size, depth, onClick, hit (área
 * de toque extra). Devuelve { img, text, ic, objs, setEnabled, setText, setIcon, setVisible, destroy }.
 */
export function button(scene, o) {
  const w = o.w;
  const h = o.h;
  const depth = o.depth ?? 152;
  const img = panel(scene, o.x, o.y, w, h, o.kind ?? 'dark2', depth);
  const objs = [img];
  let ic = null;
  let text = null;
  const vertical = Boolean(o.vertical); // icono arriba y texto abajo (para la barra de abajo)
  if (o.icon) {
    const isize = o.iconSize ?? Math.min(24, h - 14);
    const cy = vertical ? o.y - h / 2 + isize / 2 + 7 : o.y;
    const cx = o.text && !vertical ? o.x - w / 2 + isize / 2 + 12 : o.x;
    ic = icon(scene, cx, cy, o.icon, isize, depth + 1);
    objs.push(ic);
  }
  if (o.text !== undefined) {
    const size = o.size ?? 13;
    const tx = vertical ? o.x : o.icon ? o.x + (o.iconSize ?? 24) / 2 + 4 : o.x;
    const ty = vertical ? o.y + h / 2 - size - 6 : o.y;
    text = label(scene, tx, ty, o.text, { size, bold: true, origin: vertical ? [0.5, 0] : [0.5, 0.5], align: 'center', depth: depth + 1, color: o.color ?? '#ffffff', wrap: w - 10 });
    text.setShadow(0, 1, '#00000088', 2);
    objs.push(text);
  }
  const state = { enabled: true };
  img.setInteractive({ useHandCursor: true });
  if (o.hit) img.input.hitArea.setTo(-o.hit, -o.hit, w + o.hit * 2, h + o.hit * 2);
  img.on('pointerdown', () => {
    if (!state.enabled) return o.onDisabled?.();
    scene.tweens.add({ targets: objs, scale: 0.93, duration: 60, yoyo: true });
    haptic();
    o.onClick?.();
  });
  return {
    img,
    text,
    ic,
    objs,
    setEnabled(on) {
      state.enabled = on;
      for (const p of objs) p.setAlpha(on ? 1 : 0.5);
    },
    setText(t) {
      text?.setText(t);
    },
    setIcon(name) {
      ic?.setTexture(`ic_${name}`);
    },
    setVisible(v) {
      for (const p of objs) p.setVisible(v);
      if (img.input) img.input.enabled = v;
    },
    setDepth(d) {
      for (const p of objs) p.setDepth(d + (p === img ? 0 : 1));
    },
    destroy() {
      for (const p of objs) p.destroy();
    },
  };
}

/** Pantalla completa translúcida que absorbe los toques (detrás de una ventana). */
export function veil(scene, depth, alpha = 0.62) {
  return scene.add.rectangle(LAYOUT.width / 2, LAYOUT.height / 2, LAYOUT.width, LAYOUT.height, 0x0e0905, alpha).setDepth(depth).setInteractive();
}

/**
 * Ventana con título, texto y botones, para cualquier escena (usa scene.modal, scene.closeModal y scene.play).
 * `o`: title, icon, lines (texto), buttons [{ text, kind, icon, onClick, close }], tone ('good' | 'bad'),
 * width, vertical. Devuelve sus piezas.
 */
export function dialog(scene, o) {
  scene.closeModal();
  const W = LAYOUT.width;
  const d = 600;
  const w = Math.min(o.width ?? 380, W - 24);
  const lines = o.lines ?? [];
  const buttons = o.buttons ?? [];
  const textH = lines.length ? Math.max(40, lines.length * 24 + 8) : 0;
  const vertical = o.vertical ?? buttons.length > 2;
  const btnH = 46;
  const btnArea = vertical ? buttons.length * (btnH + 8) : buttons.length ? btnH + 8 : 0;
  const starH = o.stars === undefined ? 0 : 50;
  const h = 64 + starH + textH + btnArea + 20;
  const cx = W / 2;
  const cy = LAYOUT.gridTop + LAYOUT.viewHeight / 2 - 10;
  const top = cy - h / 2;
  const parts = [];
  const add = (p) => {
    parts.push(p);
    return p;
  };
  add(veil(scene, d));
  add(panel(scene, cx, cy, w, h, 'card', d + 1)).setInteractive();
  const tone = o.tone === 'good' ? TXT.good : o.tone === 'bad' ? TXT.bad : TXT.gold;
  if (o.icon) add(icon(scene, cx - w / 2 + 34, top + 34, o.icon, 32, d + 2));
  add(label(scene, o.icon ? cx - w / 2 + 62 : cx, top + 34, o.title, { size: 19, bold: true, color: tone, origin: o.icon ? [0, 0.5] : [0.5, 0.5], depth: d + 2, wrap: w - 90 }));
  if (o.stars !== undefined) {
    // Tres estrellas grandes: las ganadas en dorado y las que faltan apagadas.
    for (let i = 0; i < 3; i++) {
      const star = add(icon(scene, cx + (i - 1) * 50, top + 88, 'star', i === 1 ? 46 : 38, d + 2));
      if (i >= o.stars) star.setTint(0x2a2118).setAlpha(0.55);
      else scene.tweens?.add({ targets: star, scale: star.scale * 1.18, duration: 220, delay: 120 + i * 160, yoyo: true });
    }
  }
  lines.forEach((line, i) => add(label(scene, cx, top + 66 + starH + i * 24, line, { size: 13, origin: [0.5, 0], align: 'center', depth: d + 2, wrap: w - 36 })));
  const by = top + 64 + starH + textH;
  buttons.forEach((b, i) => {
    const bw = vertical ? w - 36 : (w - 36 - (buttons.length - 1) * 10) / buttons.length;
    const x = vertical ? cx : cx - (w - 36) / 2 + bw / 2 + i * (bw + 10);
    const y = vertical ? by + btnH / 2 + i * (btnH + 8) : by + btnH / 2;
    const btn = button(scene, { x, y, w: bw, h: btnH, kind: b.kind ?? 'dark2', text: b.text, icon: b.icon, size: b.text.length > 18 ? 11 : 14, depth: d + 2, onClick: () => {
      if (b.close !== false) scene.closeModal();
      b.onClick?.();
    } });
    btn.objs.forEach(add);
  });
  scene.modal = parts;
  scene.play?.(o.tone === 'bad' ? 'lose' : 'select');
  return parts;
}

/** Mezcla dos colores (0-1). */
export { mix };
