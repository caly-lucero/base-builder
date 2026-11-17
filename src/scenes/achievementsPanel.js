// Ventana de logros: cada familia con sus niveles, el avance y el botón para reclamar el premio.
import { ACHIEVEMENTS, LAYOUT, RESOURCE_NAMES } from '../data/config.js';
import { achievementStatus, claimAchievement } from '../game/achievements.js';
import * as store from '../game/store.js';
import { addGloss } from './look.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const GOLD = '#ffe9a0';

const rewardText = (r) =>
  Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${RESOURCE_NAMES[k]}`)
    .join(' · ');

/** Abre la ventana de logros. `scene` es BaseScene (usa scene.modal y doAction). */
export function openAchievementsPanel(scene) {
  scene.closeModal();
  const w = LAYOUT.width;
  const d = 700;
  const top = LAYOUT.gridTop + 4;
  const height = 548;
  const left = 10;
  const right = w - 10;
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

  keep(scene.add.rectangle(w / 2, LAYOUT.height / 2, w, LAYOUT.height, 0x000000, 0.7).setDepth(d).setInteractive());
  const frame = keep(scene.add.rectangle(w / 2, top + height / 2, right - left, height, 0x1a2a1a, 0.99).setStrokeStyle(3, 0xd4a017).setDepth(d + 1));
  keep(addGloss(scene, frame, d + 1.2, 0.5));
  keep(scene.add.text(left + 14, top + 10, '🏆 Logros', { fontFamily: FONT, fontSize: '22px', color: GOLD, fontStyle: 'bold' }).setDepth(d + 3));
  const close = keep(
    scene.add.text(right - 14, top + 8, '✕', { fontFamily: FONT, fontSize: '24px', color: '#ff9a8a' }).setOrigin(1, 0).setDepth(d + 3).setInteractive({ useHandCursor: true }),
  );
  close.on('pointerdown', () => {
    scene.play('close');
    scene.closeModal();
  });

  function render() {
    clear();
    const state = store.get();
    const rowH = 44;
    ACHIEVEMENTS.forEach((def, i) => {
      const y = top + 48 + i * (rowH + 1);
      const st = achievementStatus(state, def);
      const done = !st.next;
      const rect = add(scene.add.rectangle((left + right) / 2, y + rowH / 2, right - left - 20, rowH, st.claimable ? 0x3a4a2a : 0x243624).setStrokeStyle(2, st.claimable ? 0xd4a017 : 0x3a5a3a).setDepth(d + 2));
      add(addGloss(scene, rect, d + 2.3, 0.5));
      const pips = def.tiers.map((_, k) => (k < st.claimed ? '●' : '○')).join('');
      add(scene.add.text(left + 22, y + 5, def.name, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setDepth(d + 3));
      add(scene.add.text(left + 22 + 150, y + 6, pips, { fontFamily: FONT, fontSize: '12px', color: GOLD }).setDepth(d + 3));
      add(
        scene.add
          .text(left + 22, y + 24, done ? '¡Completo!' : `${def.text}: ${Math.min(st.current, st.next.target)}/${st.next.target}`, {
            fontFamily: FONT, fontSize: '11px', color: done ? '#9fe09f' : '#cfe0c8',
          })
          .setDepth(d + 3),
      );
      if (!done) {
        add(scene.add.text(right - 130, y + 5, rewardText(st.next.reward), { fontFamily: FONT, fontSize: '10px', color: '#e8c79a' }).setOrigin(1, 0).setDepth(d + 3));
        const btn = add(
          scene.add
            .rectangle(right - 76, y + rowH / 2, 100, 32, st.claimable ? 0x2f7f3f : 0x324a32)
            .setStrokeStyle(2, 0xffffff, st.claimable ? 0.6 : 0.15)
            .setDepth(d + 3)
            .setAlpha(st.claimable ? 1 : 0.55)
            .setInteractive({ useHandCursor: true }),
        );
        add(scene.add.text(btn.x, btn.y, st.claimable ? 'Reclamar' : 'En curso', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 4));
        btn.on('pointerdown', () => {
          if (!st.claimable) return scene.showToast(`${def.name}: ${st.current}/${st.next.target}`);
          scene.doAction(
            () => claimAchievement(store.get(), def.id),
            (r) => `${r.name} nivel ${r.tier}: ${rewardText(r.granted) || 'sin espacio para el premio'}`,
            'upgrade_done',
          );
          render();
        });
      }
    });
  }

  render();
  scene.play('select');
}
