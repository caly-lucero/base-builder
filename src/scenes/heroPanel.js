// Ventana de héroes: los 5 héroes, quién sale a pelear (solo 2) y sus dos árboles de poder.
// Se abre desde el Altar. Se dibuja entera de nuevo cada vez que algo cambia (son pocas cosas).
import { LAYOUT } from '../data/config.js';
import {
  ABILITY_RANKS, HEROES, HERO_KEYS, PASSIVE_LEVELS, SQUAD_SIZE, abilityAt, heroCap, heroStats, heroXpToNext,
} from '../data/heroes.js';
import * as logic from '../game/logic.js';
import * as store from '../game/store.js';
import { addGloss } from './look.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const GOLD = '#ffe9a0';

/** Efecto de cada tipo de habilidad, en una frase corta con sus números. */
function abilityLine(a) {
  const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const base = {
    shield: `evita ${Math.round(a.power * 100)} % del daño ${a.dur} s`,
    volley: `${num(a.power)} de daño en área`,
    fire: `${num(a.power)} de daño en área`,
    heal: `cura ${num(a.power)} de vida`,
    warcry: `+${Math.round(a.power * 100)} % de daño ${a.dur} s`,
  }[a.kind];
  return `${base} · radio ${num(a.radius)} · recarga ${num(a.cdSec)} s`;
}

/**
 * Abre la ventana. `altarId` es el altar desde el que se invoca. `scene` es BaseScene.
 * Usa scene.modal (para cerrarla con scene.closeModal) y sus ayudas (doAction, play).
 */
export function openHeroPanel(scene, altarId) {
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
  let selected = store.get().squad[0] ?? Object.keys(store.get().heroes)[0] ?? 'paladin';

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
  const text = (x, y, str, size = 12, color = '#e8eee0', extra = {}) =>
    add(scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, ...extra }).setDepth(d + 3));
  const button = (x, y, bw, bh, label, fill, onClick, enabled = true) => {
    const rect = add(scene.add.rectangle(x + bw / 2, y + bh / 2, bw, bh, fill).setStrokeStyle(2, 0xffffff, enabled ? 0.55 : 0.2).setDepth(d + 2));
    add(addGloss(scene, rect, d + 2.3));
    add(
      scene.add
        .text(x + bw / 2, y + bh / 2, label, { fontFamily: FONT, fontSize: '13px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: bw - 12 } })
        .setOrigin(0.5)
        .setDepth(d + 3),
    );
    rect.setAlpha(enabled ? 1 : 0.5);
    rect.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    return rect;
  };

  // Fondo fijo
  keep(scene.add.rectangle(w / 2, LAYOUT.height / 2, w, LAYOUT.height, 0x000000, 0.7).setDepth(d).setInteractive());
  const frame = keep(scene.add.rectangle(w / 2, top + height / 2, right - left, height, 0x1a2a1a, 0.99).setStrokeStyle(3, 0xd4a017).setDepth(d + 1));
  keep(addGloss(scene, frame, d + 1.2, 0.5));
  keep(scene.add.text(left + 14, top + 10, 'Héroes', { fontFamily: FONT, fontSize: '22px', color: GOLD, fontStyle: 'bold' }).setDepth(d + 3));
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
    const altar = state.buildings.find((b) => b.id === altarId);
    const cap = logic.heroLevelCap(state);
    const training = state.buildings.map((b) => b.training?.unit).filter((k) => HEROES[k]);

    add(scene.add.text(right - 52, top + 16, `Escuadra ${state.squad.length}/${SQUAD_SIZE}`, { fontFamily: FONT, fontSize: '13px', color: '#9fc8ef' }).setOrigin(1, 0).setDepth(d + 3));

    // --- columna izquierda: los 5 héroes ---
    const listX = left + 10;
    const rowH = 68;
    HERO_KEYS.forEach((key, i) => {
      const y = top + 50 + i * (rowH + 4);
      const def = HEROES[key];
      const owned = state.heroes[key];
      const inSquad = state.squad.includes(key);
      const rect = add(
        scene.add
          .rectangle(listX + 84, y + rowH / 2, 168, rowH, key === selected ? 0x3a5a3a : 0x243624)
          .setStrokeStyle(key === selected ? 3 : 2, key === selected ? 0xd4a017 : 0x4a6a4a)
          .setDepth(d + 2)
          .setInteractive({ useHandCursor: true }),
      );
      add(addGloss(scene, rect, d + 2.3, 0.6));
      const icon = add(scene.add.image(0, 0, def.sprite).setDepth(d + 3));
      scene.fitIcon(icon, def.sprite, listX + 28, y + rowH / 2, 46);
      icon.setAlpha(owned ? 1 : 0.45);
      add(scene.add.text(listX + 58, y + 10, def.name, { fontFamily: FONT, fontSize: '14px', color: owned ? '#ffffff' : '#9aa89a', fontStyle: 'bold' }).setDepth(d + 3));
      const status = owned ? `Nivel ${owned.level}${inSquad ? '  ★' : ''}` : training.includes(key) ? 'Invocando…' : `Altar nv. ${def.altarLevel}`;
      add(scene.add.text(listX + 58, y + 32, status, { fontFamily: FONT, fontSize: '12px', color: inSquad ? GOLD : '#9fc8ef' }).setDepth(d + 3));
      rect.on('pointerdown', () => {
        scene.play('select');
        selected = key;
        render();
      });
    });
    text(left + 14, top + 50 + 5 * (rowH + 4) + 6, '★ = sale a pelear', 11, '#9aa89a');

    // --- columna derecha: el héroe elegido ---
    const x0 = left + 190;
    const colW = right - 12 - x0;
    const def = HEROES[selected];
    const owned = state.heroes[selected];
    const level = owned?.level ?? 1;
    const icon = add(scene.add.image(0, 0, def.sprite).setDepth(d + 3));
    scene.fitIcon(icon, def.sprite, x0 + 30, top + 80, 56);
    text(x0 + 70, top + 52, def.name, 20, '#ffffff', { fontStyle: 'bold' });
    text(x0 + 70, top + 76, def.title, 12, '#9fc8ef');
    const stats = heroStats(selected, level);
    text(x0 + 70, top + 94, `Vida ${stats.hp} · Daño ${stats.dmg} · Pob. ${def.supply}`, 11, '#cfe0c8');

    // nivel y experiencia
    if (owned) {
      const next = heroXpToNext(owned.level);
      const capped = owned.level >= cap;
      text(x0, top + 120, `Nivel ${owned.level}  (tope ${cap}: el doble del Ayuntamiento)`, 12, capped ? '#ffb86b' : '#e8eee0');
      add(scene.add.rectangle(x0 + colW / 2, top + 150, colW, 10, 0x000000, 0.6).setDepth(d + 2));
      const ratio = Math.min(1, owned.xp / next);
      add(scene.add.rectangle(x0 + (colW * ratio) / 2, top + 150, Math.max(1, colW * ratio), 10, capped ? 0xd4a017 : 0x6fb7ff).setDepth(d + 2.5));
      text(x0, top + 158, capped ? `En el tope: sube el Ayuntamiento para seguir (${owned.xp}/${next})` : `Experiencia ${owned.xp}/${next}`, 11, '#9fc8ef');
    } else {
      text(x0, top + 120, `Cuesta ${logic.formatCost(def.cost)} · ${logic.formatDuration(def.trainSec * 1000)}`, 12, GOLD);
      text(x0, top + 138, `Pide el Altar en nivel ${def.altarLevel}`, 12, altar && altar.level >= def.altarLevel ? '#9fe09f' : '#ff9a8a');
    }

    // acción
    const by = top + 180;
    if (!owned) {
      const busy = training.includes(selected);
      const lock = altar && altar.level < def.altarLevel;
      const label = busy ? 'Invocando…' : lock ? `Mejora el Altar al nivel ${def.altarLevel}` : `Invocar · ${logic.formatCost(def.cost)}`;
      button(x0, by, colW, 36, label, 0x9a6a2a, () => {
        if (busy || lock) return scene.showToast(busy ? 'Ya viene en camino' : `Mejora el Altar al nivel ${def.altarLevel}`);
        scene.doAction(
          () => logic.startTraining(store.get(), altarId, selected, Date.now()),
          (r) => `Invocando a ${def.name}: ${logic.formatDuration(r.endsAt - Date.now())}`,
          'upgrade_start',
        );
        render();
      }, !busy && !lock);
    } else {
      const inSquad = state.squad.includes(selected);
      const full = !inSquad && state.squad.length >= SQUAD_SIZE;
      button(x0, by, colW, 36, inSquad ? 'Sacar de la escuadra' : full ? 'Escuadra llena: saca a otro' : 'Sumar a la escuadra', inSquad ? 0x6a3a2a : 0x2f5f8f, () => {
        scene.doAction(() => logic.toggleSquad(store.get(), selected), () => (inSquad ? `${def.name} se queda en la base` : `${def.name} saldrá a pelear`), 'select');
        render();
      }, !full);
    }

    // árbol 1: habilidad
    const t1 = top + 228;
    text(x0, t1, `Árbol 1 · Habilidad: ${def.ability.name}`, 13, GOLD, { fontStyle: 'bold' });
    text(x0, t1 + 18, def.ability.text, 11, '#cfe0c8', { wordWrap: { width: colW } });
    ABILITY_RANKS.forEach((r, i) => {
      const y = t1 + 40 + i * 21;
      const on = owned && level >= r.level;
      const a = abilityAt(selected, r.level);
      text(x0, y, `${on ? '✔' : '🔒'} Nv ${r.level}`, 12, on ? '#9fe09f' : '#7d8a7d');
      text(x0 + 62, y, abilityLine(a), 11, on ? '#e8eee0' : '#7d8a7d', { wordWrap: { width: colW - 62 } });
    });

    // árbol 2: pasivas
    const t2 = t1 + 40 + ABILITY_RANKS.length * 21 + 10;
    text(x0, t2, 'Árbol 2 · Pasivas', 13, GOLD, { fontStyle: 'bold' });
    def.passives.forEach((p, i) => {
      const y = t2 + 22 + i * 21;
      const on = owned && level >= PASSIVE_LEVELS[i];
      text(x0, y, `${on ? '✔' : '🔒'} Nv ${PASSIVE_LEVELS[i]}`, 12, on ? '#9fe09f' : '#7d8a7d');
      text(x0 + 62, y, p.text, 11, on ? '#e8eee0' : '#7d8a7d');
    });
  }

  render();
  scene.play('select');
  return { render };
}
