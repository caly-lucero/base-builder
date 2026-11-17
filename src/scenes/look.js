// Aspecto visual compartido por las escenas: texturas generadas por código (sin archivos nuevos),
// sombras, viñeta, nubes, humo y brillo de la interfaz. Todo es decoración: no toca la lógica.
import Phaser from 'phaser';
import { LAYOUT } from '../data/config.js';

/** Crea una textura de lienzo una sola vez y deja que `draw(ctx, w, h)` la pinte. */
function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.context, w, h);
  tex.refresh();
}

/** Crea (si faltan) las texturas decorativas. Es seguro llamarlo en cada escena. */
export function ensureTextures(scene) {
  // Sombra: elipse suave, más oscura al centro.
  canvasTexture(scene, 'fx_shadow', 64, 32, (ctx, w, h) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Mancha blanda y blanca: sirve para humo, brillos y fuego (se tiñe al usarla).
  canvasTexture(scene, 'fx_soft', 32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Viñeta: oscurece suavemente los bordes de la ventana del mapa.
  canvasTexture(scene, 'fx_vignette', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.34, w / 2, h / 2, w * 0.78);
    g.addColorStop(0, 'rgba(8,20,10,0)');
    g.addColorStop(1, 'rgba(8,20,10,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Brillo para botones y paneles: luz arriba, sombra abajo.
  canvasTexture(scene, 'fx_gloss', 8, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Sombra de nube: mancha grande, muy suave.
  canvasTexture(scene, 'fx_cloud', 128, 64, (ctx, w, h) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, 'rgba(0,10,0,0.55)');
    g.addColorStop(1, 'rgba(0,10,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** Añade el brillo encima de un rectángulo (sin tapar su borde). Devuelve la imagen para ocultarla con él. */
export function addGloss(scene, rect, depth = rect.depth + 0.3, strength = 1) {
  return scene.add
    .image(rect.x, rect.y, 'fx_gloss')
    .setDisplaySize(Math.max(1, rect.width - 3), Math.max(1, rect.height - 3))
    .setAlpha(strength)
    .setDepth(depth);
}

/** Viñeta fija sobre la ventana del mapa. */
export function addVignette(scene, depth) {
  return scene.add
    .image(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, 'fx_vignette')
    .setDisplaySize(LAYOUT.width, LAYOUT.viewHeight)
    .setDepth(depth);
}

/** Pone una sombra elíptica de `w` × `h` píxeles con su centro en (x, y). */
export function placeShadow(img, x, y, w, h, alpha = 0.4) {
  return img.setPosition(x, y).setDisplaySize(w, h).setAlpha(alpha);
}

/** Nubes: sombras grandes que cruzan el mapa despacio. Se mueven por pantalla, no por el mapa. */
export function createClouds(scene, depth, count = 3) {
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const w = 260 + i * 70;
    const img = scene.add.image(0, 0, 'fx_cloud').setDisplaySize(w, w * 0.5).setAlpha(0.2).setDepth(depth).setAngle(-12 + i * 7);
    clouds.push({ img, speed: 5 + i * 2.5, x: (i * 330) % (LAYOUT.width + 300) - 100, y: LAYOUT.gridTop + 90 + i * 170 });
  }
  return clouds;
}

/** Mueve las nubes (px/s) y las hace reaparecer por el otro lado. */
export function stepClouds(clouds, dt) {
  const span = LAYOUT.width + 500;
  for (const c of clouds) {
    c.x = (c.x + c.speed * dt + 250) % span - 250;
    c.img.setPosition(c.x, c.y);
  }
}

/** Una voluta de humo que sube, crece y se desvanece. */
export function smokePuff(scene, x, y, depth, { color = 0xe8e8e0, rise = 34, size = 0.5, life = 1700, alpha = 0.5 } = {}) {
  const p = scene.add.image(x, y, 'fx_soft').setTint(color).setAlpha(alpha).setScale(size * 0.4).setDepth(depth);
  scene.tweens.add({
    targets: p,
    x: x + (Math.random() - 0.35) * 14,
    y: y - rise,
    scale: size,
    alpha: 0,
    duration: life,
    ease: 'Sine.easeOut',
    onComplete: () => p.destroy(),
  });
}

/** Llama pequeña con brillo (aditiva): para edificios dañados y efectos. */
export function emberPuff(scene, x, y, depth, color = 0xff8a30) {
  const p = scene.add.image(x, y, 'fx_soft').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9).setScale(0.35).setDepth(depth);
  scene.tweens.add({
    targets: p,
    x: x + (Math.random() - 0.5) * 8,
    y: y - 16 - Math.random() * 10,
    scale: 0.1,
    alpha: 0,
    duration: 600,
    onComplete: () => p.destroy(),
  });
}

/** Chispas que salen en abanico: al recolectar, mejorar, etc. */
export function sparkBurst(scene, x, y, depth, color = 0xffe08a, n = 9) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = 18 + Math.random() * 20;
    const p = scene.add.image(x, y, 'fx_soft').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setDepth(depth);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d - 8,
      scale: 0.05,
      alpha: 0,
      duration: 480 + Math.random() * 200,
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    });
  }
}
