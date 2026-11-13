import Phaser from 'phaser';
import { BUILDINGS, ECONOMY, GRID, LAYOUT } from '../data/config.js';
import * as logic from '../game/logic.js';
import * as store from '../game/store.js';

const TILE = GRID.tile;
const TOOLS = [...Object.keys(BUILDINGS), 'demolish'];
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

const COLORS = {
  tileA: 0x2f4a2f,
  tileB: 0x345234,
  hud: 0x243624,
  panel: 0x1a2a1a,
  button: 0x324a32,
  buttonSelected: 0x5a7a3a,
  upgrade: 0x2f5f8f,
  ok: 0x55cc55,
  bad: 0xcc5555,
  progress: 0x6fb7ff,
};

// Borde del edificio según su nivel: se nota a simple vista cuál está más avanzado.
const LEVEL_STROKE = [
  { width: 2, color: 0x000000, alpha: 0.45 },
  { width: 3, color: 0xffffff, alpha: 0.9 },
  { width: 3, color: 0xffd700, alpha: 1 },
];

function describe(stats) {
  if (stats.ratePerSec) return `Produce ${stats.ratePerSec} oro/s · guarda ${stats.capacity}`;
  if (stats.capBonus) return `+${stats.capBonus} de capacidad de oro`;
  return 'Defensa: se activa en la fase de combate';
}

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('BaseScene');
    this.views = new Map(); // id de edificio -> objetos de Phaser
    this.tool = null;
    this.selectedId = null;
    this.toolButtons = new Map();
    this.welcome = []; // líneas pendientes del resumen de bienvenida
  }

  create(data) {
    this.drawGrid();
    this.createHud();
    this.createToolbar();
    this.createPanel();

    this.ghost = this.add
      .rectangle(0, 0, TILE - 4, TILE - 4, COLORS.ok, 0.45)
      .setVisible(false)
      .setDepth(5);

    this.selector = this.add
      .rectangle(0, 0, TILE, TILE)
      .setStrokeStyle(3, 0xffffff, 1)
      .setVisible(false)
      .setDepth(6);

    this.toast = this.add
      .text(LAYOUT.width / 2, LAYOUT.gridTop + 24, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 10, y: 6 },
        align: 'center',
        wordWrap: { width: LAYOUT.width - 40 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(20);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerout', () => this.ghost.setVisible(false));

    // La UI HTML (importar / nueva partida) avisa cuando cambia el estado completo.
    const unsubscribe = store.onChange(() => this.rebuildViews());
    this.events.once('shutdown', unsubscribe);

    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refresh() });
    this.time.addEvent({ delay: 5000, loop: true, callback: () => store.persist() });

    // Resumen de lo ocurrido mientras no estabas. Se guarda antes del primer refresh(),
    // que es quien lo muestra junto con las mejoras que terminaron en ese tiempo.
    if (data?.gained >= 1) this.welcome.push(`Mientras no estabas, tus minas produjeron ${Math.floor(data.gained)} de oro.`);
    this.rebuildViews();
  }

  /* ---------- dibujo estático ---------- */

  drawGrid() {
    const g = this.add.graphics();
    for (let y = 0; y < GRID.rows; y++) {
      for (let x = 0; x < GRID.cols; x++) {
        g.fillStyle((x + y) % 2 === 0 ? COLORS.tileA : COLORS.tileB, 1);
        g.fillRect(x * TILE, LAYOUT.gridTop + y * TILE, TILE, TILE);
      }
    }
  }

  createHud() {
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.hudHeight / 2, LAYOUT.width, LAYOUT.hudHeight, COLORS.hud);

    this.add.circle(30, LAYOUT.hudHeight / 2, 12, 0xd4a017).setStrokeStyle(2, 0x8a6a10);
    this.goldText = this.add
      .text(52, LAYOUT.hudHeight / 2, '', { fontFamily: FONT, fontSize: '22px', color: '#ffe9a0', fontStyle: 'bold' })
      .setOrigin(0, 0.5);

    this.buildersText = this.add
      .text(300, LAYOUT.hudHeight / 2, '', { fontFamily: FONT, fontSize: '14px', color: '#9fc8ef' })
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(LAYOUT.width - 90, LAYOUT.hudHeight / 2, 160, 40, COLORS.button)
      .setStrokeStyle(2, 0x4a6a4a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(btn.x, btn.y, 'Recolectar todo', { fontFamily: FONT, fontSize: '16px', color: '#e8efe0' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => this.doAction(() => logic.collectAll(store.get()), (r) => `+${r.amount} de oro`));
  }

  createToolbar() {
    const w = LAYOUT.width / TOOLS.length;
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.barTop + LAYOUT.barHeight / 2, LAYOUT.width, LAYOUT.barHeight, COLORS.hud);

    TOOLS.forEach((tool, i) => {
      const def = BUILDINGS[tool];
      const cx = i * w + w / 2;
      const cy = LAYOUT.barTop + LAYOUT.barHeight / 2;

      const rect = this.add
        .rectangle(cx, cy, w - 10, LAYOUT.barHeight - 16, COLORS.button)
        .setStrokeStyle(2, 0x4a6a4a)
        .setInteractive({ useHandCursor: true });

      if (def) this.add.rectangle(cx, cy - 22, 26, 26, def.color).setStrokeStyle(2, 0x000000, 0.4);
      else this.add.text(cx, cy - 22, '✕', { fontFamily: FONT, fontSize: '24px', color: '#ff9a8a' }).setOrigin(0.5);

      const label = this.add
        .text(cx, cy + 6, def ? def.name : 'Demoler', { fontFamily: FONT, fontSize: '15px', color: '#e8efe0' })
        .setOrigin(0.5);
      const cost = this.add
        .text(cx, cy + 26, def ? String(def.cost) : '50 % devuelto', { fontFamily: FONT, fontSize: '13px', color: '#ffe9a0' })
        .setOrigin(0.5);

      rect.on('pointerdown', () => this.selectTool(this.tool === tool ? null : tool));
      this.toolButtons.set(tool, { rect, label, cost, def });
    });
  }

  /** Panel de un edificio seleccionado: ocupa el lugar de la barra de herramientas. */
  createPanel() {
    const top = LAYOUT.barTop;
    const h = LAYOUT.barHeight;
    const cy = top + h / 2;
    const depth = 10;

    // El fondo es interactivo para que los clics no atraviesen hacia la barra de abajo.
    const bg = this.add
      .rectangle(LAYOUT.width / 2, cy, LAYOUT.width, h, COLORS.panel)
      .setStrokeStyle(2, 0xd4a017)
      .setInteractive();

    const title = this.add
      .text(14, top + 9, '', { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0, 0);
    const detail = this.add
      .text(14, top + 34, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfe0c8',
        lineSpacing: 4,
        wordWrap: { width: LAYOUT.width - 210 },
      })
      .setOrigin(0, 0);

    const upgradeBtn = this.add
      .rectangle(LAYOUT.width - 104, cy + 6, 168, 54, COLORS.upgrade)
      .setStrokeStyle(2, 0x8cc4f5)
      .setInteractive({ useHandCursor: true });
    const upgradeLabel = this.add
      .text(upgradeBtn.x, upgradeBtn.y, '', { fontFamily: FONT, fontSize: '14px', color: '#ffffff', align: 'center', lineSpacing: 3 })
      .setOrigin(0.5);

    const close = this.add
      .text(LAYOUT.width - 16, top + 6, '✕', { fontFamily: FONT, fontSize: '20px', color: '#ff9a8a' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    const parts = [bg, title, detail, upgradeBtn, upgradeLabel, close];
    parts.forEach((p) => p.setDepth(depth).setVisible(false));

    upgradeBtn.on('pointerdown', () => this.onUpgradeClick());
    close.on('pointerdown', () => this.selectBuilding(null));

    this.panel = { parts, title, detail, upgradeBtn, upgradeLabel };
  }

  /* ---------- selección ---------- */

  selectTool(tool) {
    this.tool = tool;
    for (const [name, b] of this.toolButtons) {
      const selected = name === tool;
      b.rect.setFillStyle(selected ? COLORS.buttonSelected : COLORS.button);
      b.rect.setStrokeStyle(selected ? 3 : 2, selected ? 0xd4a017 : 0x4a6a4a);
    }
    this.ghost.setVisible(false);
    if (tool) this.selectBuilding(null);
  }

  selectBuilding(id) {
    this.selectedId = id;
    const state = store.get();
    const b = id === null ? null : state.buildings.find((x) => x.id === id);
    if (!b) this.selectedId = null;

    for (const p of this.panel.parts) p.setVisible(this.selectedId !== null);
    this.selector.setVisible(this.selectedId !== null);
    if (b) {
      this.selector.setPosition(b.x * TILE + TILE / 2, LAYOUT.gridTop + b.y * TILE + TILE / 2);
      this.selectTool(null);
      this.ghost.setVisible(false);
      this.updatePanel();
    }
  }

  updatePanel() {
    const state = store.get();
    const b = state.buildings.find((x) => x.id === this.selectedId);
    if (!b) {
      this.selectBuilding(null);
      return;
    }
    const def = BUILDINGS[b.type];
    const { title, detail, upgradeBtn, upgradeLabel } = this.panel;
    const next = logic.nextLevelOf(b);
    const upgrading = logic.isUpgrading(b);

    title.setText(`${def.name} · Nivel ${b.level}/${logic.maxLevel(b.type)}`);

    if (upgrading) {
      const remaining = b.upgradeEndsAt - Date.now();
      detail.setText(`Mejorando al nivel ${b.level + 1}…\nTermina en ${logic.formatDuration(remaining)}`);
      upgradeBtn.setVisible(false);
      upgradeLabel.setVisible(false);
      return;
    }

    if (!next) {
      detail.setText(`${describe(logic.statsOf(b.type, b.level))}\nNivel máximo`);
      upgradeBtn.setVisible(false);
      upgradeLabel.setVisible(false);
      return;
    }

    detail.setText(`${describe(logic.statsOf(b.type, b.level))}\nNivel ${b.level + 1}: ${describe(next)}`);
    const affordable = state.gold >= next.upgradeCost && logic.busyBuilders(state) < ECONOMY.builders;
    upgradeBtn.setVisible(true).setAlpha(affordable ? 1 : 0.5);
    upgradeLabel
      .setText(`Mejorar\n${next.upgradeCost} oro · ${logic.formatDuration(next.upgradeSec * 1000)}`)
      .setVisible(true)
      .setAlpha(affordable ? 1 : 0.5);
  }

  onUpgradeClick() {
    const id = this.selectedId;
    if (id === null) return;
    this.doAction(
      () => logic.startUpgrade(store.get(), id, Date.now()),
      (r) => `Mejora iniciada: ${logic.formatDuration(r.endsAt - Date.now())}`,
    );
    this.updatePanel();
  }

  /* ---------- entrada ---------- */

  tileFromPointer(pointer) {
    const x = Math.floor(pointer.x / TILE);
    const y = Math.floor((pointer.y - LAYOUT.gridTop) / TILE);
    return logic.inBounds(x, y) ? { x, y } : null;
  }

  onPointerMove(pointer) {
    const tile = this.tool && this.tool !== 'demolish' ? this.tileFromPointer(pointer) : null;
    if (!tile) {
      this.ghost.setVisible(false);
      return;
    }
    const state = store.get();
    const free = !logic.buildingAt(state, tile.x, tile.y);
    const affordable = state.gold >= BUILDINGS[this.tool].cost;
    this.ghost
      .setPosition(tile.x * TILE + TILE / 2, LAYOUT.gridTop + tile.y * TILE + TILE / 2)
      .setFillStyle(free && affordable ? COLORS.ok : COLORS.bad, 0.45)
      .setVisible(true);
  }

  onPointerDown(pointer) {
    const tile = this.tileFromPointer(pointer);
    if (!tile) return; // los botones tienen sus propios manejadores
    store.tick();
    const state = store.get();
    const target = logic.buildingAt(state, tile.x, tile.y);

    if (this.tool === 'demolish') {
      if (!target) return;
      this.doAction(() => logic.demolish(state, target.id), () => 'Edificio demolido');
    } else if (this.tool) {
      this.doAction(() => logic.place(state, this.tool, tile.x, tile.y, Date.now()), () => null);
    } else if (target) {
      // Tocar un edificio lo selecciona; si es una mina con oro listo, también lo recolecta.
      const r = logic.collect(state, target);
      if (r.ok) {
        store.commit();
        this.showToast(`+${r.amount} de oro`);
      }
      this.selectBuilding(target.id);
    } else {
      this.selectBuilding(null);
    }
    this.onPointerMove(pointer);
  }

  /** Ejecuta una acción de lógica; si sale bien guarda y redibuja, si no muestra el motivo. */
  doAction(run, successMessage) {
    store.tick();
    const result = run();
    if (result.ok) {
      store.commit();
      const msg = successMessage(result);
      if (msg) this.showToast(msg);
    } else {
      this.showToast(result.reason);
    }
  }

  showToast(text, hold = 1400) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: hold, duration: 400 });
  }

  /** Muestra avisos pendientes (mejoras terminadas) junto con las líneas que se le pasen. */
  announce(lines = []) {
    const out = [...this.welcome, ...lines];
    this.welcome = [];
    for (const e of store.drainEvents()) {
      if (e.type === 'upgraded') out.push(`${BUILDINGS[e.building].name}: ¡mejora completada! Nivel ${e.level}`);
    }
    if (out.length) this.showToast(out.join('\n'), 1800 + out.length * 800);
  }

  /* ---------- sincronizar vistas con el estado ---------- */

  rebuildViews() {
    const state = store.get();
    const keyOf = (b) => `${b.type}@${b.x},${b.y}`;
    const current = new Map(state.buildings.map((b) => [b.id, keyOf(b)]));

    // Quita las vistas de edificios que ya no existen o que cambiaron (p. ej. tras importar).
    for (const [id, view] of this.views) {
      if (current.get(id) !== view.key) {
        for (const obj of view.objects) obj.destroy();
        this.views.delete(id);
      }
    }
    if (this.selectedId !== null && !state.buildings.some((b) => b.id === this.selectedId)) this.selectBuilding(null);

    for (const b of state.buildings) {
      if (this.views.has(b.id)) continue;
      const def = BUILDINGS[b.type];
      const cx = b.x * TILE + TILE / 2;
      const cy = LAYOUT.gridTop + b.y * TILE + TILE / 2;

      const rect = this.add.rectangle(cx, cy, TILE - 4, TILE - 4, def.color);
      const label = this.add
        .text(cx, cy - 6, def.short, { fontFamily: FONT, fontSize: '22px', color: '#1b1b1b', fontStyle: 'bold' })
        .setOrigin(0.5);
      const level = this.add
        .text(b.x * TILE + TILE - 5, LAYOUT.gridTop + b.y * TILE + 4, '', { fontFamily: FONT, fontSize: '11px', color: '#1b1b1b', fontStyle: 'bold' })
        .setOrigin(1, 0);
      const sub = this.add
        .text(cx, cy + 11, '', { fontFamily: FONT, fontSize: '11px', color: '#1b1b1b' })
        .setOrigin(0.5);
      const bar = this.add.graphics();

      this.views.set(b.id, { objects: [rect, label, level, sub, bar], rect, level, sub, bar, key: keyOf(b), lvl: 0 });
    }
    this.refresh();
  }

  refresh() {
    const state = store.get();
    const now = Date.now();
    store.tick(now);
    this.announce();

    this.goldText.setText(`${state.gold} / ${logic.goldCap(state)}`);
    this.buildersText.setText(`Obreros ${logic.busyBuilders(state)}/${ECONOMY.builders}`);

    for (const b of this.toolButtons.values()) {
      const affordable = !b.def || state.gold >= b.def.cost;
      b.label.setAlpha(affordable ? 1 : 0.5);
      b.cost.setAlpha(affordable ? 1 : 0.5);
    }

    for (const b of state.buildings) {
      const view = this.views.get(b.id);
      if (!view) continue;

      const stats = logic.statsOf(b.type, b.level);
      const upgrading = logic.isUpgrading(b);
      const x = b.x * TILE + 4;
      const y = LAYOUT.gridTop + b.y * TILE + TILE - 9;

      view.level.setText(String(b.level));
      if (view.lvl !== b.level) {
        const s = LEVEL_STROKE[Math.min(b.level, LEVEL_STROKE.length) - 1];
        view.rect.setStrokeStyle(s.width, s.color, s.alpha);
        view.lvl = b.level;
      }
      view.rect.setAlpha(upgrading ? 0.55 : 1);

      view.bar.clear();
      view.bar.fillStyle(0x000000, 0.4).fillRect(x, y, TILE - 8, 5);

      if (upgrading) {
        const total = logic.nextLevelOf(b).upgradeSec * 1000;
        const remaining = Math.max(0, b.upgradeEndsAt - now);
        view.bar.fillStyle(COLORS.progress, 1).fillRect(x, y, (TILE - 8) * (1 - remaining / total), 5);
        view.sub.setText(logic.formatDuration(remaining));
      } else if (stats.capacity) {
        const ratio = b.stored / stats.capacity;
        view.bar.fillStyle(ratio >= 1 ? 0x55cc55 : 0xfff2b0, 1).fillRect(x, y, (TILE - 8) * ratio, 5);
        view.sub.setText(String(Math.floor(b.stored)));
      } else {
        view.sub.setText('');
      }
    }

    if (this.selectedId !== null) this.updatePanel();
  }
}
