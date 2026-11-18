// Ventana de héroes: los 5 héroes, quién sale a pelear (solo 2) y sus dos árboles de poder.
// Se abre desde la barra de abajo. Se dibuja entera de nuevo cada vez que algo cambia (son pocas cosas).
import { BUILDINGS, LAYOUT } from '../data/config.js';
import { ABILITY_RANKS, HEROES, HERO_KEYS, PASSIVE_LEVELS, SQUAD_SIZE, abilityAt, heroStats, heroXpToNext } from '../data/heroes.js';
import * as logic from '../game/logic.js';
import * as store from '../game/store.js';
import * as ui from './ui.js';

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
 * Abre la ventana. `altarId` es el altar desde el que se invoca (null si aún no tienes uno: solo se mira).
 * `scene` es BaseScene. Usa scene.modal (para cerrarla con scene.closeModal) y sus ayudas (doAction, play).
 */
export function openHeroPanel(scene, altarId) {
  scene.closeModal();
  scene.closeBuildSheet?.();
  const W = LAYOUT.width;
  const d = 700;
  const left = 8;
  const right = W - 8;
  const height = Math.min(LAYOUT.height - 16, 660);
  const top = (LAYOUT.height - height) / 2;
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
  const text = (x, y, str, size = 12, color = ui.TXT.light, extra = {}) => add(ui.label(scene, x, y, str, { size, color, depth: d + 3, ...extra }));

  keep(ui.veil(scene, d, 0.72));
  keep(ui.panel(scene, W / 2, top + height / 2, right - left, height, 'card', d + 1)).setInteractive();
  keep(ui.icon(scene, left + 30, top + 28, 'crown', 28, d + 3));
  keep(ui.label(scene, left + 52, top + 28, 'Héroes', { size: 20, bold: true, color: ui.TXT.gold, origin: [0, 0.5], depth: d + 3 }));
  const close = ui.button(scene, { x: right - 28, y: top + 28, w: 38, h: 34, kind: 'red', icon: 'close', iconSize: 16, depth: d + 3, onClick: () => {
    scene.play('close');
    scene.closeModal();
  } });
  close.objs.forEach(keep);

  function render() {
    clear();
    const state = store.get();
    const altar = altarId === null ? null : state.buildings.find((b) => b.id === altarId);
    const cap = logic.heroLevelCap(state);
    const training = state.buildings.map((b) => b.training?.unit).filter((k) => HEROES[k]);
    const inner = right - left - 24;

    // Sin Altar y sin héroes todavía: en vez de todo el detalle de habilidades, una explicación corta y el botón para construirlo.
    if (!altar && !logic.heroCount(state)) {
      const altarDef = BUILDINGS.altar;
      const open = logic.limitFor(state, 'altar') > 0;
      const need = logic.unlockLevel('altar');
      const cardTop = top + 56;
      add(ui.panel(scene, W / 2, cardTop + 120, inner, 240, 'dark', d + 2));
      const pics = HERO_KEYS.slice(0, 5);
      pics.forEach((key, i) => {
        const px = left + 12 + (inner / pics.length) * (i + 0.5);
        const img = add(scene.add.image(0, 0, HEROES[key].sprite).setDepth(d + 3));
        scene.fitIcon(img, HEROES[key].sprite, px + 0, cardTop + 44, 52);
      });
      text(W / 2, cardTop + 92, 'Los héroes son tus campeones', 16, ui.TXT.gold, { bold: true, origin: [0.5, 0.5] });
      text(W / 2, cardTop + 120, 'Salen a pelear junto a tu ejército (hasta 2 a la vez), suben de nivel y tienen habilidades propias.', 12, ui.TXT.light, { origin: [0.5, 0], align: 'center', wrap: inner - 40 });
      text(W / 2, cardTop + 176, open ? `Para invocarlos construye un Altar.\nCuesta ${logic.formatCost(altarDef.cost)}.` : `El Altar se abre con el ${logic.displayName('townhall', need)} (nivel ${need}).`, 12, open ? ui.TXT.good : ui.TXT.bad, { origin: [0.5, 0], align: 'center', wrap: inner - 40 });
      const build = ui.button(scene, { x: W / 2, y: cardTop + 290, w: inner, h: 48, kind: open ? 'green' : 'dark2', text: open ? 'Construir el Altar' : 'Aún no disponible', icon: 'hammer', iconSize: 20, size: 15, depth: d + 3, onClick: () => {
        scene.closeModal();
        scene.selectTool('altar');
      }, onDisabled: () => scene.showToast(`El Altar se abre con el Ayuntamiento nivel ${need}`) });
      build.setEnabled(open);
      build.objs.forEach(add);
      return;
    }

    text(right - 76, top + 28, `Escuadra ${state.squad.length}/${SQUAD_SIZE}`, 12, ui.TXT.blue, { origin: [1, 0.5] });

    // --- los 5 héroes en una fila ---
    const gap = 6;
    const cw = (inner - gap * 4) / 5;
    const rowY = top + 58;
    HERO_KEYS.forEach((key, i) => {
      const def = HEROES[key];
      const owned = state.heroes[key];
      const inSquad = state.squad.includes(key);
      const x = left + 12 + cw / 2 + i * (cw + gap);
      const sel = key === selected;
      const card = add(ui.panel(scene, x, rowY + 42, cw, 84, sel ? 'gold' : 'dark', d + 2));
      card.setInteractive({ useHandCursor: true });
      const img = add(scene.add.image(0, 0, def.sprite).setDepth(d + 3));
      scene.fitIcon(img, def.sprite, x, rowY + 28, 40);
      img.setAlpha(owned ? 1 : 0.4);
      text(x, rowY + 56, def.name.length > 9 ? def.name.slice(0, 8) + '.' : def.name, 10, sel ? '#2b1d12' : ui.TXT.light, { origin: [0.5, 0.5], bold: true });
      text(x, rowY + 71, owned ? `Nv ${owned.level}${inSquad ? ' ★' : ''}` : training.includes(key) ? 'Viene…' : `Altar ${def.altarLevel}`, 10, sel ? '#4a3320' : inSquad ? ui.TXT.gold : ui.TXT.dim, { origin: [0.5, 0.5] });
      card.on('pointerdown', () => {
        ui.haptic();
        scene.play('select');
        selected = key;
        render();
      });
    });

    // --- el héroe elegido ---
    const x0 = left + 14;
    const colW = inner - 4;
    const def = HEROES[selected];
    const owned = state.heroes[selected];
    const level = owned?.level ?? 1;
    const y1 = rowY + 98;
    add(ui.panel(scene, W / 2, y1 + 38, inner, 76, 'dark', d + 2));
    const icon = add(scene.add.image(0, 0, def.sprite).setDepth(d + 3));
    scene.fitIcon(icon, def.sprite, x0 + 30, y1 + 38, 56);
    text(x0 + 68, y1 + 8, def.name, 18, '#ffffff', { bold: true });
    text(x0 + 68, y1 + 31, def.title, 12, ui.TXT.blue);
    const stats = heroStats(selected, level);
    text(x0 + 68, y1 + 49, `Vida ${stats.hp} · Daño ${stats.dmg} · Pob. ${def.supply}`, 11, ui.TXT.dim);

    // nivel y experiencia
    const y2 = y1 + 86;
    if (owned) {
      const next = heroXpToNext(owned.level);
      const capped = owned.level >= cap;
      text(x0, y2, `Nivel ${owned.level}  ·  tope ${cap} (el doble del Ayuntamiento)`, 12, capped ? '#ffb86b' : ui.TXT.light);
      add(scene.add.rectangle(x0, y2 + 24, colW, 9, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(d + 2));
      const ratio = Math.min(1, owned.xp / next);
      add(scene.add.rectangle(x0, y2 + 24, Math.max(2, colW * ratio), 9, capped ? 0xe6b84f : 0x6fb7ff).setOrigin(0, 0.5).setDepth(d + 3));
      text(x0, y2 + 32, capped ? `En el tope: sube el Ayuntamiento para seguir (${owned.xp}/${next})` : `Experiencia ${owned.xp}/${next}`, 11, ui.TXT.blue);
    } else {
      text(x0, y2, `Cuesta ${logic.formatCost(def.cost)} · ${logic.formatDuration(def.trainSec * 1000)}`, 12, ui.TXT.gold);
      const ok = altar && altar.level >= def.altarLevel;
      text(x0, y2 + 18, altar ? `Pide el Altar en nivel ${def.altarLevel}` : 'Construye un Altar (Defensa) para invocar héroes', 12, ok ? ui.TXT.good : ui.TXT.bad);
    }

    // acción
    const by = y2 + 54;
    const action = (label, kind, onClick, enabled = true) => {
      const b = ui.button(scene, { x: W / 2, y: by + 22, w: inner, h: 44, kind, text: label, size: 14, depth: d + 3, onClick, onDisabled: () => scene.showToast(label) });
      b.setEnabled(enabled);
      b.objs.forEach(add);
    };
    if (!owned) {
      const busy = training.includes(selected);
      const lock = !altar || altar.level < def.altarLevel;
      action(busy ? 'Invocando…' : lock ? (altar ? `Mejora el Altar al nivel ${def.altarLevel}` : 'Necesitas un Altar') : `Invocar · ${logic.formatCost(def.cost)}`, 'gold', () => {
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
      action(inSquad ? 'Sacar de la escuadra' : full ? 'Escuadra llena: saca a otro' : 'Sumar a la escuadra', inSquad ? 'red' : 'blue', () => {
        scene.doAction(() => logic.toggleSquad(store.get(), selected), () => (inSquad ? `${def.name} se queda en la base` : `${def.name} saldrá a pelear`), 'select');
        render();
      }, !full);
    }

    // árbol 1: habilidad
    const t1 = by + 58;
    text(x0, t1, `Árbol 1 · ${def.ability.name}`, 13, ui.TXT.gold, { bold: true });
    text(x0, t1 + 17, def.ability.text, 11, ui.TXT.dim, { wrap: colW });
    ABILITY_RANKS.forEach((r, i) => {
      const y = t1 + 38 + i * 23;
      const on = owned && level >= r.level;
      add(ui.icon(scene, x0 + 8, y + 8, on ? 'check' : 'lock', 14, d + 3));
      text(x0 + 20, y, `Nv ${r.level}`, 12, on ? ui.TXT.good : ui.TXT.faint, { bold: true });
      text(x0 + 66, y + 1, abilityLine(abilityAt(selected, r.level)), 11, on ? ui.TXT.light : ui.TXT.faint, { wrap: colW - 66 });
    });

    // árbol 2: pasivas
    const t2 = t1 + 38 + ABILITY_RANKS.length * 23 + 8;
    text(x0, t2, 'Árbol 2 · Pasivas', 13, ui.TXT.gold, { bold: true });
    def.passives.forEach((p, i) => {
      const y = t2 + 22 + i * 21;
      const on = owned && level >= PASSIVE_LEVELS[i];
      add(ui.icon(scene, x0 + 8, y + 8, on ? 'check' : 'lock', 14, d + 3));
      text(x0 + 20, y, `Nv ${PASSIVE_LEVELS[i]}`, 12, on ? ui.TXT.good : ui.TXT.faint, { bold: true });
      text(x0 + 66, y + 1, p.text, 11, on ? ui.TXT.light : ui.TXT.faint);
    });
  }

  render();
  scene.play('select');
  return { render };
}
