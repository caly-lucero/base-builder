import Phaser from 'phaser';
import { BUILDINGS, GRID, LAYOUT } from '../data/config.js';
import * as logic from '../game/logic.js';
import * as store from '../game/store.js';

const TILE = GRID.tile;
const TOOLS = [...Object.keys(BUILDINGS), 'demolish'];
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

const COLORS = {
  tileA: 0x2f4a2f,
  tileB: 0x345234,
  hud: 0x243624,
  button: 0x324a32,
  buttonSelected: 0x5a7a3a,
  ok: 0x55cc55,
  bad: 0xcc5555,
};

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('BaseScene');
    this.views = new Map(); // id de edificio -> objetos de Phaser
    this.tool = null;
    this.toolButtons = new Map();
  }

  create(data) {
    this.drawGrid();
    this.createHud();
    this.createToolbar();

    this.ghost = this.add
      .rectangle(0, 0, TILE - 4, TILE - 4, COLORS.ok, 0.45)
      .setVisible(false)
      .setDepth(5);

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

    this.rebuildViews();

    if (data?.gained >= 1) {
      this.showToast(`Mientras no estabas, tus minas produjeron ${Math.floor(data.gained)} de oro.`, 4000);
    }
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

  /* ---------- herramientas ---------- */

  selectTool(tool) {
    this.tool = tool;
    for (const [name, b] of this.toolButtons) {
      const selected = name === tool;
      b.rect.setFillStyle(selected ? COLORS.buttonSelected : COLORS.button);
      b.rect.setStrokeStyle(selected ? 3 : 2, selected ? 0xd4a017 : 0x4a6a4a);
    }
    this.ghost.setVisible(false);
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
    const state = store.get();
    const target = logic.buildingAt(state, tile.x, tile.y);

    if (this.tool === 'demolish') {
      if (!target) return;
      this.doAction(() => logic.demolish(state, target.id), () => 'Edificio demolido');
    } else if (this.tool) {
      this.doAction(() => logic.place(state, this.tool, tile.x, tile.y, Date.now()), () => null);
    } else if (target) {
      this.doAction(() => logic.collect(state, target), (r) => `+${r.amount} de oro`);
    }
    this.onPointerMove(pointer);
  }

  /** Ejecuta una acción de lógica; si sale bien guarda y redibuja, si no muestra el motivo. */
  doAction(run, successMessage) {
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

    for (const b of state.buildings) {
      if (this.views.has(b.id)) continue;
      const def = BUILDINGS[b.type];
      const cx = b.x * TILE + TILE / 2;
      const cy = LAYOUT.gridTop + b.y * TILE + TILE / 2;

      const rect = this.add.rectangle(cx, cy, TILE - 4, TILE - 4, def.color).setStrokeStyle(2, 0x000000, 0.45);
      const label = this.add
        .text(cx, cy - 4, def.short, { fontFamily: FONT, fontSize: '22px', color: '#1b1b1b', fontStyle: 'bold' })
        .setOrigin(0.5);
      const objects = [rect, label];
      const view = { objects, key: keyOf(b) };

      if (def.capacity) {
        view.bar = this.add.graphics();
        view.count = this.add
          .text(cx, cy + 14, '', { fontFamily: FONT, fontSize: '11px', color: '#1b1b1b' })
          .setOrigin(0.5);
        objects.push(view.bar, view.count);
      }
      this.views.set(b.id, view);
    }
    this.refresh();
  }

  refresh() {
    const state = store.get();
    logic.tickAll(state, Date.now());

    this.goldText.setText(`${state.gold} / ${logic.goldCap(state)}`);

    for (const [name, b] of this.toolButtons) {
      const affordable = !b.def || state.gold >= b.def.cost;
      b.label.setAlpha(affordable ? 1 : 0.5);
      b.cost.setAlpha(affordable ? 1 : 0.5);
    }

    for (const b of state.buildings) {
      const view = this.views.get(b.id);
      if (!view?.bar) continue;
      const def = BUILDINGS[b.type];
      const ratio = b.stored / def.capacity;
      const x = b.x * TILE + 4;
      const y = LAYOUT.gridTop + b.y * TILE + TILE - 9;
      view.bar.clear();
      view.bar.fillStyle(0x000000, 0.4).fillRect(x, y, TILE - 8, 5);
      view.bar.fillStyle(ratio >= 1 ? 0x55cc55 : 0xfff2b0, 1).fillRect(x, y, (TILE - 8) * ratio, 5);
      view.count.setText(String(Math.floor(b.stored)));
    }
  }
}
