// Mapa de campaña: 10 puntos por mapa (cada uno es un enemigo), con sus estrellas. Se abre con el botón «Atacar».
// Tocar un punto abre la ventana del ataque; los puntos bloqueados esperan a que superes el anterior.
import { LAYOUT } from '../data/config.js';
import { NODES_PER_MAP, currentMap, isMapOpen, mapNodes, mapStars, themeOf } from '../game/campaignMap.js';
import { mulberry32 } from '../game/decor.js';
import * as store from '../game/store.js';
import { missionName } from '../game/missions.js';
import * as ui from './ui.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** `scene` es BaseScene. `map` = mapa a mostrar (por defecto el actual). */
export function openCampaignPanel(scene, map = currentMap(store.get())) {
  scene.closeModal();
  scene.closeBuildSheet?.();
  scene.selectBuilding?.(null);
  const state = store.get();
  const W = LAYOUT.width;
  const d = 700;
  const left = 8;
  const right = W - 8;
  const height = Math.min(LAYOUT.height - 16, 680);
  const top = (LAYOUT.height - height) / 2;
  const parts = [];
  scene.modal = parts;
  const add = (o) => {
    parts.push(o);
    return o;
  };
  const theme = themeOf(map);

  add(ui.veil(scene, d, 0.72));
  add(ui.panel(scene, W / 2, top + height / 2, right - left, height, 'card', d + 1)).setInteractive();
  add(ui.icon(scene, left + 30, top + 28, 'swords', 28, d + 3));
  add(ui.label(scene, left + 52, top + 17, `Mapa ${map + 1} · ${theme.name}`, { size: 16, bold: true, color: ui.TXT.gold, depth: d + 3, wrap: right - left - 120 })).setMaxLines?.(1);
  const stars = mapStars(state, map);
  add(ui.label(scene, left + 52, top + 38, `★ ${stars.got}/${stars.max}  ·  ${nodesDone(state, map)}/${NODES_PER_MAP} enemigos vencidos`, { size: 11, color: ui.TXT.dim, depth: d + 3 }));
  ui
    .button(scene, { x: right - 28, y: top + 28, w: 38, h: 34, kind: 'red', icon: 'close', iconSize: 16, depth: d + 3, onClick: () => {
      scene.play('close');
      scene.closeModal();
    } })
    .objs.forEach(add);

  // --- el mapa: un lienzo con degradado, adornos y el camino ---
  const mx = left + 10;
  const my = top + 60;
  const mw = right - left - 20;
  const mh = height - 60 - 62;
  const g = add(scene.add.graphics().setDepth(d + 2));
  g.fillGradientStyle(theme.top, theme.top, theme.bottom, theme.bottom, 1);
  g.fillRoundedRect(mx, my, mw, mh, 14);
  g.lineStyle(3, 0x2a1d12, 0.9);
  g.strokeRoundedRect(mx, my, mw, mh, 14);

  const nodes = mapNodes(state, map);
  const at = (n) => ({ x: mx + 20 + n.pos.x * (mw - 40), y: my + 24 + n.pos.y * (mh - 56) });

  // Adornos: árboles, rocas… repartidos sin tapar el camino (siempre los mismos para cada mapa).
  const rand = mulberry32(777 + map * 31);
  const spots = [];
  for (let tries = 0; spots.length < 16 && tries < 200; tries++) {
    const x = mx + 16 + rand() * (mw - 32);
    const y = my + 20 + rand() * (mh - 40);
    if (nodes.some((n) => Math.hypot(at(n).x - x, at(n).y - y) < 54)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 40)) continue;
    spots.push({ x, y, key: theme.decor[Math.floor(rand() * theme.decor.length)] });
  }
  spots
    .sort((a, b) => a.y - b.y)
    .forEach((s) => {
      if (scene.textures.exists(s.key)) add(scene.add.image(s.x, s.y - 6, s.key).setScale(0.34).setDepth(d + 2).setAlpha(0.92));
    });

  // El camino entre puntos: guiones dorados hasta el siguiente enemigo, grises después.
  const path = add(scene.add.graphics().setDepth(d + 2));
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = at(nodes[i]);
    const b = at(nodes[i + 1]);
    const open = nodes[i + 1].status !== 'locked';
    path.fillStyle(open ? 0xffe08a : 0x2a1d12, open ? 1 : 0.45);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.floor(len / 11);
    for (let k = 1; k < steps; k++) path.fillCircle(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps, open ? 2.6 : 2.2);
  }

  // Los puntos.
  nodes.forEach((n) => {
    const p = at(n);
    const r = n.boss ? 27 : 21;
    const color = n.status === 'done' ? 0x4fa84a : n.status === 'current' ? 0xd94a3a : 0x5c5248;
    const ring = scene.add.circle(p.x, p.y, r + 3, 0x2a1d12, 0.95).setDepth(d + 3);
    const dot = scene.add.circle(p.x, p.y, r, color).setStrokeStyle(2, n.status === 'locked' ? 0x3a3128 : 0xfff2c8).setDepth(d + 4);
    add(ring);
    add(dot);
    if (n.status === 'locked') add(ui.icon(scene, p.x, p.y, 'lock', n.boss ? 24 : 18, d + 5)).setAlpha(0.8);
    else add(ui.label(scene, p.x, p.y, String(n.index + 1), { size: n.boss ? 20 : 17, bold: true, color: '#ffffff', origin: [0.5, 0.5], depth: d + 5, stroke: 3 }));
    if (n.boss) add(ui.icon(scene, p.x, p.y - r - 9, 'crown', 22, d + 5)).setTint(n.status === 'locked' ? 0x6a6258 : 0xffffff);
    // Estrellas debajo del punto (solo en los superados).
    if (n.status === 'done') {
      for (let s = 0; s < 3; s++) {
        const st = add(ui.icon(scene, p.x + (s - 1) * 14, p.y + r + 10, 'star', 14, d + 5));
        if (s >= n.stars) st.setTint(0x2a2118).setAlpha(0.7);
      }
    } else if (n.status === 'current') {
      add(ui.icon(scene, p.x, p.y + r + 11, 'swords', 18, d + 5));
      scene.tweens.add({ targets: ring, scale: 1.25, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    }
    dot.setInteractive({ useHandCursor: true });
    dot.on('pointerdown', () => {
      ui.haptic();
      if (n.status === 'locked') {
        scene.play('error');
        scene.showToast(`Primero vence al enemigo ${n.index === 0 ? 'del mapa anterior' : n.index}`);
        return;
      }
      scene.play('select');
      scene.openAttackModal(n.level);
    });
  });

  // --- pie: cambiar de mapa ---
  const fy = top + height - 31;
  const prev = ui.button(scene, { x: left + 50, y: fy, w: 80, h: 38, kind: 'dark2', text: '◀ Mapa', size: 13, depth: d + 3, onClick: () => openCampaignPanel(scene, map - 1) });
  const next = ui.button(scene, { x: right - 50, y: fy, w: 80, h: 38, kind: 'dark2', text: 'Mapa ▶', size: 13, depth: d + 3, onClick: () => openCampaignPanel(scene, map + 1) });
  prev.objs.forEach(add);
  next.objs.forEach(add);
  prev.setEnabled(isMapOpen(state, map - 1));
  next.setEnabled(isMapOpen(state, map + 1));
  const done = nodesDone(state, map) === NODES_PER_MAP;
  add(ui.label(scene, W / 2, fy, map === currentMap(state) ? `Próximo: ${missionName(state.campaign.cleared + 1)}` : done ? 'Mapa completado' : '', { size: 12, color: hex(0xe9d7a8), origin: [0.5, 0.5], align: 'center', depth: d + 3 }));

  scene.play('select');
}

function nodesDone(state, map) {
  return mapNodes(state, map).filter((n) => n.status === 'done').length;
}
