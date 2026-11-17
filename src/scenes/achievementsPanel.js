// Ventana de logros: cada familia con sus niveles, el avance y el botón para reclamar el premio.
import { ACHIEVEMENTS, LAYOUT, RESOURCE_NAMES } from '../data/config.js';
import { achievementStatus, claimAchievement } from '../game/achievements.js';
import * as store from '../game/store.js';
import * as ui from './ui.js';

const rewardText = (r) =>
  Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${RESOURCE_NAMES[k]}`)
    .join(' · ');

/** Abre la ventana de logros. `scene` es BaseScene (usa scene.modal y doAction). */
export function openAchievementsPanel(scene) {
  scene.closeModal();
  scene.closeBuildSheet?.();
  const W = LAYOUT.width;
  const d = 700;
  const left = 8;
  const right = W - 8;
  const rowH = 46;
  const height = Math.min(LAYOUT.height - 16, 64 + ACHIEVEMENTS.length * (rowH + 4) + 12);
  const top = (LAYOUT.height - height) / 2;
  const parts = [];
  scene.modal = parts;
  let dyn = [];

  const keep = (o) => {
    parts.push(o);
    return o;
  };
  const add = (o) => {
    dyn.push(o);
    parts.push(o);
    return o;
  };
  const clear = () => {
    for (const o of dyn) {
      o.destroy();
      const i = parts.indexOf(o);
      if (i >= 0) parts.splice(i, 1);
    }
    dyn = [];
  };

  keep(ui.veil(scene, d, 0.72));
  keep(ui.panel(scene, W / 2, top + height / 2, right - left, height, 'card', d + 1)).setInteractive();
  keep(ui.icon(scene, left + 30, top + 28, 'trophy', 28, d + 3));
  keep(ui.label(scene, left + 52, top + 28, 'Logros', { size: 20, bold: true, color: ui.TXT.gold, origin: [0, 0.5], depth: d + 3 }));
  const close = ui.button(scene, { x: right - 28, y: top + 28, w: 38, h: 34, kind: 'red', icon: 'close', iconSize: 16, depth: d + 3, onClick: () => {
    scene.play('close');
    scene.closeModal();
  } });
  close.objs.forEach(keep);

  function render() {
    clear();
    const state = store.get();
    ACHIEVEMENTS.forEach((def, i) => {
      const y = top + 58 + i * (rowH + 4);
      const st = achievementStatus(state, def);
      const done = !st.next;
      const rect = add(ui.panel(scene, W / 2, y + rowH / 2, right - left - 20, rowH, st.claimable ? 'gold' : 'dark', d + 2));
      if (st.claimable) rect.setTint(0xd8f0b0);
      const nameColor = st.claimable ? '#2b1d12' : '#ffffff';
      const subColor = st.claimable ? '#4a3320' : done ? ui.TXT.good : ui.TXT.dim;
      add(ui.label(scene, left + 22, y + 7, def.name, { size: 13, bold: true, color: nameColor, depth: d + 3 }));
      const pips = def.tiers.map((_, k) => (k < st.claimed ? '●' : '○')).join('');
      add(ui.label(scene, left + 22 + 128, y + 8, pips, { size: 11, color: st.claimable ? '#7a5410' : ui.TXT.gold, depth: d + 3 }));
      add(ui.label(scene, left + 22, y + 26, done ? '¡Completo!' : `${def.text}: ${Math.min(st.current, st.next.target)}/${st.next.target}`, { size: 11, color: subColor, depth: d + 3, wrap: 230 }));
      if (!done) {
        add(ui.label(scene, right - 108, y + 6, rewardText(st.next.reward), { size: 9, color: st.claimable ? '#4a3320' : ui.TXT.wood, origin: [1, 0], depth: d + 3 }));
        const btn = ui.button(scene, { x: right - 64, y: y + rowH / 2, w: 88, h: 32, kind: st.claimable ? 'green' : 'dark2', text: st.claimable ? 'Reclamar' : 'En curso', size: 12, depth: d + 3, onClick: () => {
          scene.doAction(
            () => claimAchievement(store.get(), def.id),
            (r) => `${r.name} nivel ${r.tier}: ${rewardText(r.granted) || 'sin espacio para el premio'}`,
            'upgrade_done',
          );
          render();
        }, onDisabled: () => scene.showToast(`${def.name}: ${st.current}/${st.next.target}`) });
        btn.setEnabled(st.claimable);
        btn.objs.forEach(add);
      }
    });
  }

  render();
  scene.play('select');
}
