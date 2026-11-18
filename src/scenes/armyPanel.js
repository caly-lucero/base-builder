// Ventana del ejército: qué tropas tienes (por tipo), su nivel y fuerza, cuántas están en camino y los héroes.
// Se abre tocando la población del HUD (o desde la ventana de ataque). Se redibuja entera cada vez que cambia algo.
import { ARMY_UNITS, BUILDINGS, LAYOUT, UNITS } from '../data/config.js';
import { HEROES, HERO_KEYS } from '../data/heroes.js';
import * as logic from '../game/logic.js';
import * as store from '../game/store.js';
import * as ui from './ui.js';

/** `scene` es BaseScene (usa scene.modal, closeModal, play, fitIcon). */
export function openArmyPanel(scene) {
  scene.closeModal();
  scene.closeBuildSheet?.();
  scene.selectBuilding?.(null);
  const W = LAYOUT.width;
  const d = 700;
  const left = 8;
  const right = W - 8;
  const height = Math.min(LAYOUT.height - 16, 580);
  const top = (LAYOUT.height - height) / 2;
  const parts = [];
  scene.modal = parts;
  const add = (o) => {
    parts.push(o);
    return o;
  };
  const text = (x, y, str, size = 12, color = ui.TXT.light, extra = {}) => add(ui.label(scene, x, y, str, { size, color, depth: d + 3, ...extra }));

  add(ui.veil(scene, d, 0.72));
  add(ui.panel(scene, W / 2, top + height / 2, right - left, height, 'card', d + 1)).setInteractive();
  add(ui.icon(scene, left + 30, top + 28, 'swords', 28, d + 3));
  add(ui.label(scene, left + 52, top + 28, 'Mi ejército', { size: 20, bold: true, color: ui.TXT.gold, origin: [0, 0.5], depth: d + 3 }));
  ui
    .button(scene, { x: right - 28, y: top + 28, w: 38, h: 34, kind: 'red', icon: 'close', iconSize: 16, depth: d + 3, onClick: () => {
      scene.play('close');
      scene.closeModal();
    } })
    .objs.forEach(add);

  const state = store.get();
  const used = logic.supplyUsed(state);
  const cap = logic.supplyCap(state);
  const inner = right - left - 24;
  const x0 = left + 14;

  // Resumen: población y total de tropas.
  const units = logic.armyCount(state);
  const coming = state.buildings.reduce((n, b) => n + (UNITS[b.training?.unit] ? (b.training.qty ?? 1) : 0), 0);
  text(x0, top + 54, `Población ${used}/${cap}  ·  ${units} ${units === 1 ? 'unidad' : 'unidades'}${coming ? `  ·  ${coming} en camino` : ''}`, 12, used >= cap ? ui.TXT.bad : ui.TXT.blue);

  // Una fila por tipo de unidad.
  const rowH = 58;
  const y0 = top + 78;
  ARMY_UNITS.forEach((key, i) => {
    const u = UNITS[key];
    const y = y0 + i * (rowH + 4);
    const have = state.army[key] ?? 0;
    const building = state.buildings.find((b) => b.type === u.building);
    const training = state.buildings.filter((b) => b.training?.unit === key);
    const incoming = training.reduce((n, b) => n + (b.training.qty ?? 1), 0);
    const known = have > 0 || incoming > 0;

    add(ui.panel(scene, W / 2, y + rowH / 2, inner, rowH, have > 0 ? 'dark' : 'card', d + 2));
    const img = add(scene.add.image(0, 0, u.sprite).setDepth(d + 3));
    scene.fitIcon(img, u.sprite, x0 + 28, y + rowH / 2 + 2, 46);
    img.setAlpha(known ? 1 : 0.4);

    const c = logic.unitCombat(state, key);
    text(x0 + 64, y + 8, `${u.name} · nv. ${logic.unitLevel(state, key)}`, 14, known ? '#ffffff' : ui.TXT.dim, { bold: true });
    if (!building) text(x0 + 64, y + 30, `Construye un ${BUILDINGS[u.building].name}`, 11, ui.TXT.faint);
    else text(x0 + 64, y + 30, `Vida ${c.hp} · Daño ${c.dmg} · Pob. ${u.supply}`, 11, ui.TXT.dim);
    if (incoming > 0) text(x0 + 64, y + 43, `+${incoming} entrenando · ${logic.formatDuration(Math.min(...training.map((b) => b.training.endsAt)) - Date.now())}`, 10, ui.TXT.good);

    text(right - 26, y + rowH / 2, `×${have}`, 22, have > 0 ? ui.TXT.gold : ui.TXT.faint, { bold: true, origin: [1, 0.5] });
  });

  // Héroes.
  const hy = y0 + ARMY_UNITS.length * (rowH + 4) + 6;
  text(x0, hy, `Héroes ${logic.heroCount(state)}/${HERO_KEYS.length} · salen a pelear ${state.squad.length}/2`, 13, ui.TXT.gold, { bold: true });
  const squad = logic.squadHeroes(state);
  if (!squad.length) text(x0, hy + 20, logic.heroCount(state) ? 'Ninguno en la escuadra: elígelos en Héroes' : 'Aún no tienes héroes: invócalos en el Altar', 11, ui.TXT.dim);
  squad.forEach((h, i) => {
    const hx = x0 + i * (inner / 2);
    const img = add(scene.add.image(0, 0, HEROES[h.key].sprite).setDepth(d + 3));
    scene.fitIcon(img, HEROES[h.key].sprite, hx + 16, hy + 40, 34);
    text(hx + 38, hy + 24, HEROES[h.key].name, 12, '#ffffff', { bold: true });
    text(hx + 38, hy + 40, `Nivel ${h.level}`, 11, ui.TXT.dim);
  });

  scene.play('select');
}
