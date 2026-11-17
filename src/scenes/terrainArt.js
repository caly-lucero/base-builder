// Terreno isométrico dibujado por código: rombos de césped, tierra, arena y agua, y el borde de roca de la isla.
// Todo es adorno y no se guarda. Las texturas miden 96×48 (una casilla a zoom 1).
import { CLIFF, TILE_H, TILE_W, tileCorners } from '../game/projection.js';
import { GRID } from '../data/config.js';

const GRASS_VARIANTS = 4;

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.context, w, h);
  tex.refresh();
}

/** Traza el rombo de una casilla (un poco más grande para que no queden rendijas entre vecinas). */
function diamond(ctx, w, h, grow = 0) {
  ctx.beginPath();
  ctx.moveTo(w / 2, -grow);
  ctx.lineTo(w + grow * 2, h / 2);
  ctx.lineTo(w / 2, h + grow);
  ctx.lineTo(-grow * 2, h / 2);
  ctx.closePath();
}

const rng = (seed) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/** Mota de color con transparencia dentro del rombo. */
function speckle(ctx, w, h, seed, n, colors, size = 1.6) {
  const rnd = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    // solo dentro del rombo
    if (Math.abs(x - w / 2) / (w / 2) + Math.abs(y - h / 2) / (h / 2) > 0.92) continue;
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.fillRect(x, y, size + rnd() * size, size * 0.6 + rnd());
  }
}

/** Crea (si faltan) las texturas del terreno. Es seguro llamarlo en cada escena. */
export function ensureTerrainTextures(scene) {
  const W = TILE_W;
  const H = TILE_H;
  for (let v = 0; v < GRASS_VARIANTS; v++) {
    canvasTexture(scene, `iso_grass_${v}`, W, H, (ctx) => {
      const base = ['#6aa84f', '#71ae54', '#66a24b', '#76b258'][v];
      ctx.save();
      diamond(ctx, W, H, 0.6);
      ctx.fillStyle = base;
      ctx.fill();
      ctx.clip();
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,255,220,0.10)');
      g.addColorStop(1, 'rgba(20,50,20,0.10)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      speckle(ctx, W, H, 11 + v * 7, 38, ['rgba(255,255,200,0.16)', 'rgba(30,80,30,0.20)', 'rgba(120,190,90,0.26)']);
      ctx.restore();
    });
  }
  canvasTexture(scene, 'iso_dirt', W, H, (ctx) => {
    ctx.save();
    diamond(ctx, W, H, 0.6);
    ctx.fillStyle = '#b08d5e';
    ctx.fill();
    ctx.clip();
    speckle(ctx, W, H, 5, 46, ['rgba(120,88,54,0.5)', 'rgba(222,194,150,0.5)', 'rgba(150,112,72,0.45)'], 1.8);
    // borde suave hacia el césped
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120,150,70,0.45)';
    diamond(ctx, W, H, 0);
    ctx.stroke();
    ctx.restore();
  });
  canvasTexture(scene, 'iso_sand', W, H, (ctx) => {
    ctx.save();
    diamond(ctx, W, H, 0.6);
    ctx.fillStyle = '#e1cd98';
    ctx.fill();
    ctx.clip();
    speckle(ctx, W, H, 9, 30, ['rgba(255,244,200,0.5)', 'rgba(190,160,100,0.4)']);
    ctx.restore();
  });
  canvasTexture(scene, 'iso_water', W, H, (ctx) => {
    ctx.save();
    diamond(ctx, W, H, 0.6);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#6fb8e8');
    g.addColorStop(1, '#3f86c8');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(230,246,255,0.6)';
    ctx.lineWidth = 1.5;
    for (const [x, y, len] of [[28, 20, 16], [50, 28, 18], [36, 34, 12]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - 2.5, x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  });
  // Resalte del borde de una casilla (selección, colocar).
  canvasTexture(scene, 'iso_cell', W, H, (ctx) => {
    ctx.save();
    diamond(ctx, W, H, -1);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.restore();
  });
}

/** Qué textura y qué tinte lleva el césped de cada casilla (variantes repartidas de forma estable). */
export const grassKey = (x, y) => `iso_grass_${Math.abs((x * 73856093) ^ (y * 19349663)) % GRASS_VARIANTS}`;

/**
 * Dibuja el borde de roca y tierra bajo la isla (los dos lados que se ven) y un filo de hierba arriba.
 * `g` es un Graphics que se limpia y se vuelve a pintar cuando cambia la cámara.
 */
export function drawCliff(g, zoom) {
  g.clear();
  const [top, right, bottom, left] = tileCornersOfMap();
  const h = CLIFF * zoom;
  const faces = [
    { a: left, b: bottom, color: 0x6a4a30, shade: 0x553a26 },
    { a: bottom, b: right, color: 0x7d5937, shade: 0x65452b },
  ];
  for (const f of faces) {
    g.fillStyle(f.color, 1);
    g.fillPoints([{ x: f.a.x, y: f.a.y }, { x: f.b.x, y: f.b.y }, { x: f.b.x, y: f.b.y + h }, { x: f.a.x, y: f.a.y + h }], true);
    // franjas de roca para que no sea un bloque liso
    g.fillStyle(f.shade, 0.55);
    for (let k = 1; k <= 3; k++) {
      const t0 = k * 0.25 - 0.1;
      const t1 = k * 0.25 - 0.02;
      const p = (t) => ({ x: f.a.x + (f.b.x - f.a.x) * t, y: f.a.y + (f.b.y - f.a.y) * t });
      const s = p(t0);
      const e = p(t1);
      g.fillPoints([{ x: s.x, y: s.y + h * 0.15 }, { x: e.x, y: e.y + h * 0.15 }, { x: e.x, y: e.y + h * 0.7 }, { x: s.x, y: s.y + h * 0.7 }], true);
    }
    g.fillStyle(0x4b8a3a, 1); // el filo de hierba
    g.fillPoints([{ x: f.a.x, y: f.a.y }, { x: f.b.x, y: f.b.y }, { x: f.b.x, y: f.b.y + 5 * zoom }, { x: f.a.x, y: f.a.y + 5 * zoom }], true);
  }
  void top;
}

/** Los cuatro vértices del mapa entero en pantalla: [arriba, derecha, abajo, izquierda]. */
function tileCornersOfMap() {
  const a = tileCorners(0, 0)[0]; // arriba
  const b = tileCorners(GRID.cols - 1, 0)[1]; // derecha
  const c = tileCorners(GRID.cols - 1, GRID.rows - 1)[2]; // abajo
  const d = tileCorners(0, GRID.rows - 1)[3]; // izquierda
  return [a, b, c, d];
}

/** Rombo relleno de una casilla (para el selector y la vista previa de colocar). */
export function strokeCell(g, x, y, color, alpha = 1, width = 3, fill = 0.25) {
  const [a, b, c, d] = tileCorners(x, y);
  const pts = [a, b, c, d];
  if (fill > 0) {
    g.fillStyle(color, fill);
    g.fillPoints(pts, true);
  }
  g.lineStyle(width, color, alpha);
  g.strokePoints(pts, true);
}
