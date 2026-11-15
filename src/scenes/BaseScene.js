import Phaser from 'phaser';
import { ASSET_BASE, IMAGES, SOUNDS } from '../data/assets.js';
import { ART_SIZE, BUILDABLE, BUILDINGS, CAMERA, ECONOMY, GRID, LAYOUT } from '../data/config.js';
import { generateDecor } from '../game/decor.js';
import * as logic from '../game/logic.js';
import * as prefs from '../game/prefs.js';
import {
  depthOf,
  inViewport,
  isTileVisible,
  panBy,
  resetView,
  screenToTile,
  spriteScale,
  tileBase,
  tileCenter,
  tileSize,
  tileTopLeft,
  view,
  zoomAt,
} from '../game/projection.js';
import { contentBounds } from '../game/sprites.js';
import * as store from '../game/store.js';

const TOOLS = [...BUILDABLE, 'demolish'];
const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

// Capas de dibujado (mayor = más arriba). Lo del HUD va por encima del mundo para tapar
// lo que sobresalga de la ventana del mapa al desplazarse o hacer zoom.
const DEPTH = { terrain: 0, world: 10, ghost: 100, selector: 101, ui: 150, zoomButtons: 160, panel: 200, toast: 300 };

// Cuánto se agrandan los dibujos respecto a la casilla (el pack los trae pequeños en su lienzo).
const BUILDING_GROW = 1.25;
const DECOR_GROW = 1.15;

const COLORS = {
  hud: 0x243624,
  panel: 0x1a2a1a,
  button: 0x324a32,
  buttonSelected: 0x5a7a3a,
  upgrade: 0x2f5f8f,
  ok: 0x66dd66,
  bad: 0xdd5555,
  progress: 0x6fb7ff,
  gold: 0xd4a017,
  wood: 0x9a6a3a,
};

const TEXT = { gold: '#ffe9a0', wood: '#e8c79a', bad: '#ff8a7a', normal: '#e8eee0' };

function describe(stats) {
  if (stats.produces === 'gold') return `Produce ${stats.ratePerSec} oro/s · guarda ${stats.capacity}`;
  if (stats.produces === 'wood') return `Produce ${stats.ratePerSec} madera/s · guarda ${stats.capacity}`;
  if (stats.capBonus) return `+${stats.capBonus} de tope de oro y de madera`;
  return null;
}

const spriteOf = (b) => logic.statsOf(b.type, b.level).sprite;
const iconKey = (tool) => BUILDINGS[tool].levels[0].sprite;

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('BaseScene');
    this.views = new Map(); // id de edificio -> objetos de Phaser
    this.tool = null;
    this.selectedId = null;
    this.movingId = null; // edificio que se está arrastrando
    this.toolButtons = new Map();
    this.welcome = []; // líneas pendientes del resumen de bienvenida
    this.gesture = null; // gesto en curso (toque, arrastre, pellizco…)
    this.viewDirty = true; // la cámara cambió: hay que recolocar el mundo
    this.lastSound = {};
  }

  preload() {
    this.load.setPath(ASSET_BASE);
    for (const [key, file] of Object.entries(IMAGES)) this.load.image(key, file);
    for (const [key, file] of Object.entries(SOUNDS)) this.load.audio(key, file);
  }

  create(data) {
    this.sound.mute = prefs.get().muted;
    this.input.addPointer(1); // permite pellizcar con dos dedos
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D');

    resetView(logic.townHall(store.get()) ?? undefined);

    this.createTerrain();
    this.createDecor();
    this.createHud();
    this.createToolbar();
    this.createPanel();
    this.createZoomButtons();

    this.ghost = this.add.image(0, 0, iconKey('mine')).setAlpha(0.7).setVisible(false).setDepth(DEPTH.ghost);
    this.selector = this.add
      .rectangle(0, 0, GRID.tile, GRID.tile)
      .setStrokeStyle(3, 0xffffff, 1)
      .setVisible(false)
      .setDepth(DEPTH.selector);
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
      .setDepth(DEPTH.toast);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.input.on('pointerout', () => !this.gesture && this.ghost.setVisible(false));

    // La UI HTML (importar / nueva partida) avisa cuando cambia el estado completo.
    const unsubscribe = store.onChange(() => this.rebuildViews());
    this.events.once('shutdown', unsubscribe);

    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refresh() });
    this.time.addEvent({ delay: 5000, loop: true, callback: () => store.persist() });

    // Resumen de lo ocurrido mientras no estabas. Se guarda antes del primer refresh(),
    // que es quien lo muestra junto con las mejoras que terminaron en ese tiempo.
    const g = data?.gained ?? {};
    const parts = [];
    if (g.gold >= 1) parts.push(`${Math.floor(g.gold)} de oro`);
    if (g.wood >= 1) parts.push(`${Math.floor(g.wood)} de madera`);
    if (parts.length) this.welcome.push(`Mientras no estabas, tus edificios produjeron ${parts.join(' y ')}.`);
    this.rebuildViews();
  }

  /** Reproduce un efecto (si el sonido está activado y el archivo cargó). `gap` evita repeticiones seguidas. */
  play(name, gap = 0) {
    if (this.sound.mute || !this.cache.audio.exists(name)) return;
    const now = this.time.now;
    if (now - (this.lastSound[name] ?? -1e9) < gap) return;
    this.lastSound[name] = now;
    this.sound.play(name, { volume: 0.6 });
  }

  /* ---------- colocar dibujos en pantalla ---------- */

  /** Apoya un dibujo sobre una casilla: su base queda al pie de la casilla, centrada, con el zoom actual. */
  placeOnTile(img, key, x, y, grow) {
    const b = contentBounds(this.textures, key);
    const p = tileBase(x, y);
    return img
      .setTexture(key)
      .setOrigin(b.cx / ART_SIZE, b.bottom / ART_SIZE)
      .setPosition(p.x, p.y)
      .setScale(spriteScale() * grow);
  }

  /** Dibuja un icono centrado en (cx, cy) que cabe en un cuadrado de `size` px (en pantalla, sin zoom). */
  fitIcon(img, key, cx, cy, size) {
    const b = contentBounds(this.textures, key);
    return img
      .setTexture(key)
      .setOrigin(b.cx / ART_SIZE, b.cy / ART_SIZE)
      .setPosition(cx, cy)
      .setScale(size / Math.max(b.w, b.h));
  }

  /* ---------- creación del mundo ---------- */

  createTerrain() {
    this.terrain = [];
    for (let y = 0; y < GRID.rows; y++) {
      for (let x = 0; x < GRID.cols; x++) {
        const key = (x * 7 + y * 13) % 3 === 0 ? 'grass_b' : 'grass_a';
        this.terrain.push({ x, y, img: this.add.image(0, 0, key).setDepth(DEPTH.terrain) });
      }
    }
  }

  /** Árboles, rocas y arbustos: solo adorno. Se ocultan bajo los edificios (ver renderWorld). */
  createDecor() {
    this.decor = generateDecor().map((d) => ({
      ...d,
      img: this.add.image(0, 0, d.key).setDepth(DEPTH.world + depthOf(d.x, d.y)),
    }));
  }

  /* ---------- HUD, barra, panel y botones de zoom ---------- */

  ui(obj, depth = DEPTH.ui) {
    return obj.setDepth(depth);
  }

  goldIcon(x, y, r = 9) {
    return this.ui(this.add.circle(x, y, r, COLORS.gold).setStrokeStyle(2, 0x8a6a10), DEPTH.ui + 1);
  }

  woodIcon(x, y, w = 18) {
    const h = w * 0.62;
    const parts = [
      this.ui(this.add.rectangle(x, y, w, h, COLORS.wood).setStrokeStyle(2, 0x5a3a1a), DEPTH.ui + 1),
      this.ui(this.add.rectangle(x - w * 0.18, y, w * 0.16, h * 0.7, 0xc58b55), DEPTH.ui + 2),
    ];
    return parts;
  }

  createHud() {
    this.ui(this.add.rectangle(LAYOUT.width / 2, LAYOUT.hudHeight / 2, LAYOUT.width, LAYOUT.hudHeight, COLORS.hud));

    this.goldIcon(26, 21);
    this.goldText = this.ui(
      this.add.text(44, 21, '', { fontFamily: FONT, fontSize: '20px', color: TEXT.gold, fontStyle: 'bold' }).setOrigin(0, 0.5),
      DEPTH.ui + 1,
    );

    this.woodIcon(184, 21, 20);
    this.woodText = this.ui(
      this.add.text(202, 21, '', { fontFamily: FONT, fontSize: '20px', color: TEXT.wood, fontStyle: 'bold' }).setOrigin(0, 0.5),
      DEPTH.ui + 1,
    );

    this.buildersText = this.ui(
      this.add.text(16, 47, '', { fontFamily: FONT, fontSize: '13px', color: '#9fc8ef' }).setOrigin(0, 0.5),
      DEPTH.ui + 1,
    );

    const btn = this.ui(
      this.add
        .rectangle(LAYOUT.width - 90, LAYOUT.hudHeight / 2, 160, 40, COLORS.button)
        .setStrokeStyle(2, 0x4a6a4a)
        .setInteractive({ useHandCursor: true }),
      DEPTH.ui + 1,
    );
    this.ui(
      this.add.text(btn.x, btn.y, 'Recolectar todo', { fontFamily: FONT, fontSize: '16px', color: TEXT.normal }).setOrigin(0.5),
      DEPTH.ui + 2,
    );
    btn.on('pointerdown', () =>
      this.doAction(
        () => logic.collectAll(store.get()),
        (r) => [r.gold > 0 && `+${r.gold} de oro`, r.wood > 0 && `+${r.wood} de madera`].filter(Boolean).join(' · '),
        'collect_all',
      ),
    );
  }

  createToolbar() {
    const w = LAYOUT.width / TOOLS.length;
    const top = LAYOUT.barTop;
    const cy = top + LAYOUT.barHeight / 2;
    this.ui(this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, LAYOUT.barHeight, COLORS.hud));

    TOOLS.forEach((tool, i) => {
      const def = BUILDINGS[tool];
      const cx = i * w + w / 2;

      const rect = this.ui(
        this.add
          .rectangle(cx, cy, w - 6, LAYOUT.barHeight - 14, COLORS.button)
          .setStrokeStyle(2, 0x4a6a4a)
          .setInteractive({ useHandCursor: true }),
        DEPTH.ui + 1,
      );

      if (def) this.ui(this.fitIcon(this.add.image(0, 0, iconKey(tool)), iconKey(tool), cx, cy - 24, 32), DEPTH.ui + 2);
      else this.ui(this.add.text(cx, cy - 24, '✕', { fontFamily: FONT, fontSize: '24px', color: '#ff9a8a' }).setOrigin(0.5), DEPTH.ui + 2);

      const label = this.ui(
        this.add.text(cx, cy + 2, '', { fontFamily: FONT, fontSize: '13px', color: TEXT.normal }).setOrigin(0.5),
        DEPTH.ui + 2,
      );

      // Costos: un ícono + número por cada recurso que cueste.
      const costs = [];
      if (def) {
        const items = ['gold', 'wood'].filter((r) => (def.cost[r] ?? 0) > 0);
        items.forEach((res, k) => {
          const x = items.length === 1 ? cx : cx + (k === 0 ? -24 : 24);
          const icon = res === 'gold' ? [this.goldIcon(x - 13, cy + 22, 5)] : this.woodIcon(x - 13, cy + 22, 11);
          const text = this.ui(
            this.add.text(x - 6, cy + 22, String(def.cost[res]), { fontFamily: FONT, fontSize: '12px', color: TEXT[res] }).setOrigin(0, 0.5),
            DEPTH.ui + 2,
          );
          costs.push({ res, text, icon });
        });
      } else {
        this.ui(this.add.text(cx, cy + 22, '50 % devuelto', { fontFamily: FONT, fontSize: '11px', color: TEXT.gold }).setOrigin(0.5), DEPTH.ui + 2);
      }

      rect.on('pointerdown', () => {
        this.play('select');
        this.selectTool(this.tool === tool ? null : tool);
      });
      this.toolButtons.set(tool, { rect, label, costs, def });
    });
  }

  /** Panel de un edificio seleccionado: ocupa el lugar de la barra de herramientas. */
  createPanel() {
    const top = LAYOUT.barTop;
    const h = LAYOUT.barHeight;
    const cy = top + h / 2;
    const textX = 76;
    const d = DEPTH.panel;

    // El fondo es interactivo para que los clics no atraviesen hacia la barra de abajo.
    const bg = this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, h, COLORS.panel).setStrokeStyle(2, 0xd4a017).setInteractive();
    const icon = this.add.image(0, 0, iconKey('mine'));
    this.fitIcon(icon, iconKey('mine'), 40, cy - 4, 52);
    const title = this.add
      .text(textX, top + 7, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0, 0);
    const detail = this.add
      .text(textX, top + 29, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cfe0c8',
        lineSpacing: 3,
        wordWrap: { width: LAYOUT.width - textX - 184 },
      })
      .setOrigin(0, 0);
    const hint = this.add
      .text(textX, top + h - 14, 'Arrastra el edificio para moverlo', { fontFamily: FONT, fontSize: '10px', color: '#86a083' })
      .setOrigin(0, 0.5);

    const upgradeBtn = this.add
      .rectangle(LAYOUT.width - 96, cy + 8, 160, 54, COLORS.upgrade)
      .setStrokeStyle(2, 0x8cc4f5)
      .setInteractive({ useHandCursor: true });
    const upgradeLabel = this.add
      .text(upgradeBtn.x, upgradeBtn.y, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', align: 'center', lineSpacing: 3, wordWrap: { width: 150 } })
      .setOrigin(0.5);
    const close = this.add
      .text(LAYOUT.width - 14, top + 5, '✕', { fontFamily: FONT, fontSize: '20px', color: '#ff9a8a' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    const parts = [bg, icon, title, detail, hint, upgradeBtn, upgradeLabel, close];
    parts.forEach((p) => p.setDepth(d).setVisible(false));

    upgradeBtn.on('pointerdown', () => this.onUpgradeClick());
    close.on('pointerdown', () => {
      this.play('close');
      this.selectBuilding(null);
    });

    this.panel = { parts, icon, title, detail, hint, upgradeBtn, upgradeLabel, cy };
  }

  createZoomButtons() {
    const x = LAYOUT.width - 24;
    const top = LAYOUT.gridTop;
    const make = (y, label, size, onClick) => {
      const rect = this.add
        .rectangle(x, y, 34, 34, 0x1a2a1a, 0.82)
        .setStrokeStyle(2, 0x86a083)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.zoomButtons);
      this.add.text(x, y, label, { fontFamily: FONT, fontSize: size, color: '#e8eee0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(DEPTH.zoomButtons + 1);
      rect.on('pointerdown', onClick);
    };
    const center = () => ({ x: LAYOUT.width / 2, y: LAYOUT.gridTop + LAYOUT.viewHeight / 2 });
    const zoom = (factor) => {
      const c = center();
      zoomAt(c.x, c.y, view.zoom * factor);
      this.viewDirty = true;
    };
    make(top + 26, '+', '22px', () => zoom(1.25));
    make(top + 66, '−', '22px', () => zoom(0.8));
    make(top + 106, '⌂', '18px', () => {
      resetView(logic.townHall(store.get()) ?? undefined);
      this.viewDirty = true;
    });
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
      this.selectTool(null);
      this.updatePanel();
    }
    this.viewDirty = true;
  }

  /** Líneas de detalle de un edificio para el panel. */
  detailLines(state, b) {
    const stats = logic.statsOf(b.type, b.level);
    const next = logic.nextLevelOf(b);
    const lines = [];

    if (b.type === 'townhall') {
      const lim = (type, label) => `${label} ${logic.countOf(state, type)}/${logic.limitFor(state, type)}`;
      lines.push(`${lim('mine', 'Minas')} · ${lim('sawmill', 'Aserraderos')} · ${lim('storage', 'Almacenes')}`);
      lines.push(`${lim('tower', 'Torres')} · ${lim('wall', 'Muros')}`);
      lines.push(next ? `Nivel ${b.level + 1} (${logic.displayName('townhall', b.level + 1)}): más edificios y mejoras` : 'Nivel máximo');
      return lines;
    }

    const own = describe(stats);
    if (own) lines.push(own);
    else lines.push(b.type === 'wall' ? 'Bloquea el paso (en el combate frenará al enemigo)' : 'Defensa: se activa en la fase de combate');

    if (!next) lines.push('Nivel máximo');
    else if (b.level >= logic.townHallLevel(state)) lines.push(`Para el nivel ${b.level + 1}, sube antes el Ayuntamiento`);
    else lines.push(`Nivel ${b.level + 1}: ${describe(next) ?? 'más resistencia'}`);
    return lines;
  }

  updatePanel() {
    const state = store.get();
    const b = state.buildings.find((x) => x.id === this.selectedId);
    if (!b) {
      this.selectBuilding(null);
      return;
    }
    const { icon, title, detail, upgradeBtn, upgradeLabel, cy } = this.panel;
    const next = logic.nextLevelOf(b);
    this.panel.hint.setVisible(true);

    this.fitIcon(icon, spriteOf(b), 40, cy - 4, 52);
    title.setText(`${logic.displayName(b.type, b.level)} · Nivel ${b.level}/${logic.maxLevel(b.type)}`);

    const hideButton = () => {
      upgradeBtn.setVisible(false);
      upgradeLabel.setVisible(false);
    };

    if (logic.isUpgrading(b)) {
      detail.setText(`Mejorando al nivel ${b.level + 1}…\nTermina en ${logic.formatDuration(b.upgradeEndsAt - Date.now())}`);
      hideButton();
      return;
    }

    const lines = this.detailLines(state, b);
    detail.setText(lines.join('\n'));
    this.panel.hint.setVisible(lines.length <= 2); // con 3 líneas no hay sitio para el aviso
    if (!next) {
      hideButton();
      return;
    }

    const capped = b.type !== 'townhall' && b.level >= logic.townHallLevel(state);
    const affordable = logic.canAfford(state, next.upgradeCost) && logic.busyBuilders(state) < ECONOMY.builders && !capped;
    upgradeBtn.setVisible(true).setAlpha(affordable ? 1 : 0.5);
    upgradeLabel
      .setText(`Mejorar · ${logic.formatDuration(next.upgradeSec * 1000)}\n${logic.formatCost(next.upgradeCost)}`)
      .setVisible(true)
      .setAlpha(affordable ? 1 : 0.5);
  }

  onUpgradeClick() {
    const id = this.selectedId;
    if (id === null) return;
    this.doAction(
      () => logic.startUpgrade(store.get(), id, Date.now()),
      (r) => `Mejora iniciada: ${logic.formatDuration(r.endsAt - Date.now())}`,
      'upgrade_start',
    );
    this.updatePanel();
  }

  /* ---------- gestos: tocar, arrastrar, pellizcar ---------- */

  onPointerDown(pointer, currentlyOver) {
    if (currentlyOver?.length) return; // lo atiende un botón o el panel
    if (!inViewport(pointer.x, pointer.y)) return;
    store.tick();

    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
      this.startPinch();
      return;
    }

    const tile = screenToTile(pointer.x, pointer.y);
    const target = tile ? logic.buildingAt(store.get(), tile.x, tile.y) : null;
    const g = {
      id: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      lastX: pointer.x,
      lastY: pointer.y,
      mode: 'pending', // pending → (toque) | pan | move | paint | pinch
      intent: 'ground',
      tile,
      buildingId: target?.id ?? null,
      paintedKey: null,
    };
    this.gesture = g;

    if (this.tool === 'wall') {
      g.mode = 'paint'; // los muros se pintan arrastrando
      this.paintAt(tile);
    } else if (this.tool === 'demolish') g.intent = 'demolish';
    else if (this.tool) g.intent = 'place';
    else if (target) g.intent = 'building';

    if (g.intent === 'place') this.updateHoverGhost(pointer);
  }

  onPointerMove(pointer) {
    const g = this.gesture;
    if (g?.mode === 'pinch') {
      this.updatePinch();
      return;
    }
    if (!g || g.id !== pointer.id) {
      this.updateHoverGhost(pointer);
      return;
    }

    if (g.mode === 'pending') {
      if (Math.hypot(pointer.x - g.startX, pointer.y - g.startY) < CAMERA.dragThreshold) return;
      if (g.intent === 'building') this.beginMove(g);
      else g.mode = 'pan';
    }

    if (g.mode === 'pan') {
      panBy(pointer.x - g.lastX, pointer.y - g.lastY);
      this.viewDirty = true;
    } else if (g.mode === 'move') {
      this.updateMoveGhost(pointer);
    } else if (g.mode === 'paint') {
      this.paintLine(g, screenToTile(pointer.x, pointer.y));
    }
    g.lastX = pointer.x;
    g.lastY = pointer.y;
  }

  onPointerUp(pointer) {
    const g = this.gesture;
    if (!g) return;
    if (g.mode === 'pinch') {
      if (!(this.input.pointer1.isDown && this.input.pointer2.isDown)) this.gesture = null;
      return;
    }
    if (g.id !== pointer.id) return;
    this.gesture = null;
    store.tick();

    if (g.mode === 'pending') this.completeTap(g);
    else if (g.mode === 'move') this.completeMove(pointer);
    this.updateHoverGhost(pointer);
  }

  onWheel(pointer, _over, _dx, dy) {
    if (!inViewport(pointer.x, pointer.y) || !dy) return;
    zoomAt(pointer.x, pointer.y, view.zoom * (dy < 0 ? 1.12 : 1 / 1.12));
    this.viewDirty = true;
  }

  /** Un toque corto (sin arrastre) según lo que haya debajo y la herramienta elegida. */
  completeTap(g) {
    const state = store.get();
    const { tile } = g;

    if (g.intent === 'place' && tile) {
      this.doAction(() => logic.place(state, this.tool, tile.x, tile.y, Date.now()), () => null, 'place');
    } else if (g.intent === 'demolish' && g.buildingId !== null) {
      this.doAction(() => logic.demolish(state, g.buildingId), () => 'Edificio demolido', 'demolish');
    } else if (g.intent === 'building') {
      const b = state.buildings.find((x) => x.id === g.buildingId);
      if (!b) return;
      // Tocar un edificio lo selecciona; si tiene producción lista, también la recolecta.
      const r = logic.collect(state, b);
      if (r.ok) {
        store.commit();
        this.showToast(`+${r.amount} de ${r.resource === 'gold' ? 'oro' : 'madera'}`);
        this.play('collect');
      } else {
        this.play('select');
      }
      this.selectBuilding(b.id);
    } else if (g.intent === 'ground') {
      if (this.selectedId !== null) this.play('close');
      this.selectBuilding(null);
    }
  }

  /* ---- mover un edificio arrastrándolo ---- */

  beginMove(g) {
    g.mode = 'move';
    this.movingId = g.buildingId;
    this.selectBuilding(g.buildingId);
    this.updateMoveGhost({ x: g.lastX, y: g.lastY });
    this.viewDirty = true;
  }

  updateMoveGhost(pointer) {
    const state = store.get();
    const b = state.buildings.find((x) => x.id === this.movingId);
    const tile = screenToTile(pointer.x, pointer.y);
    if (!b || !tile) {
      this.ghost.setVisible(false);
      return;
    }
    const other = logic.buildingAt(state, tile.x, tile.y);
    const ok = !other || other.id === b.id;
    this.placeOnTile(this.ghost, spriteOf(b), tile.x, tile.y, BUILDING_GROW).setTint(ok ? COLORS.ok : COLORS.bad).setVisible(true);
  }

  completeMove(pointer) {
    const id = this.movingId;
    this.movingId = null;
    this.ghost.setVisible(false);
    this.viewDirty = true;
    const tile = screenToTile(pointer.x, pointer.y);
    if (id === null || !tile) return;

    const state = store.get();
    const b = state.buildings.find((x) => x.id === id);
    if (!b || (b.x === tile.x && b.y === tile.y)) return; // soltó donde estaba
    this.doAction(() => logic.moveBuilding(state, id, tile.x, tile.y), () => null, 'move');
  }

  /* ---- pintar muros arrastrando ---- */

  /** Pone un muro en `tile` si no se acaba de poner allí; si falla por algo que no sea casilla ocupada, corta el trazo. */
  paintAt(tile, g = this.gesture) {
    if (!tile || !g || g.mode === 'done') return;
    const key = `${tile.x},${tile.y}`;
    if (g.paintedKey === key) return;
    g.paintedKey = key;

    const state = store.get();
    const r = logic.place(state, 'wall', tile.x, tile.y, Date.now());
    if (r.ok) {
      store.commit();
      this.play('place', 90);
    } else if (r.reason !== 'Casilla ocupada') {
      this.showToast(r.reason);
      this.play('error', 300);
      g.mode = 'done'; // no seguir intentando en cada casilla
    }
  }

  /** Une la casilla anterior con la nueva sin dejar huecos si el puntero salta varias casillas. */
  paintLine(g, tile) {
    if (!tile) return;
    const from = g.paintedKey ? g.paintedKey.split(',').map(Number) : [tile.x, tile.y];
    const [x, y] = from;
    const steps = Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y));
    for (let i = 1; i <= steps; i++) {
      this.paintAt({ x: Math.round(x + ((tile.x - x) * i) / steps), y: Math.round(y + ((tile.y - y) * i) / steps) }, g);
    }
  }

  /* ---- pellizcar con dos dedos ---- */

  pinchState() {
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  startPinch() {
    const p = this.pinchState();
    this.movingId = null;
    this.ghost.setVisible(false);
    this.gesture = { mode: 'pinch', dist: p.dist, zoom: view.zoom, x: p.x, y: p.y };
  }

  updatePinch() {
    const g = this.gesture;
    const p = this.pinchState();
    zoomAt(p.x, p.y, g.zoom * (p.dist / g.dist));
    panBy(p.x - g.x, p.y - g.y);
    g.x = p.x;
    g.y = p.y;
    this.viewDirty = true;
  }

  /** Vista previa verde/roja de dónde caería el edificio elegido, al pasar el puntero. */
  updateHoverGhost(pointer) {
    const tile = this.tool && this.tool !== 'demolish' && !this.gesture?.movingId ? screenToTile(pointer.x, pointer.y) : null;
    if (!tile || this.gesture?.mode === 'pan' || this.gesture?.mode === 'move') {
      if (this.gesture?.mode !== 'move') this.ghost.setVisible(false);
      return;
    }
    const ok = logic.placementError(store.get(), this.tool, tile.x, tile.y) === null;
    this.placeOnTile(this.ghost, iconKey(this.tool), tile.x, tile.y, BUILDING_GROW).setTint(ok ? COLORS.ok : COLORS.bad).setVisible(true);
  }

  /* ---------- acciones, avisos y sonido ---------- */

  /** Ejecuta una acción de lógica; si sale bien guarda, suena y redibuja; si no, muestra el motivo. */
  doAction(run, successMessage, sound) {
    store.tick();
    const result = run();
    if (result.ok) {
      store.commit();
      const msg = successMessage(result);
      if (msg) this.showToast(msg);
      if (sound) this.play(sound);
    } else {
      this.showToast(result.reason);
      this.play('error');
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
    let finished = false;
    for (const e of store.drainEvents()) {
      if (e.type === 'upgraded') {
        out.push(`${logic.displayName(e.building, e.level)}: ¡mejora completada! Nivel ${e.level}`);
        finished = true;
      }
    }
    if (finished) this.play('upgrade_done');
    if (out.length) this.showToast(out.join('\n'), 1800 + out.length * 800);
  }

  /* ---------- sincronizar el mundo con el estado ---------- */

  /** Crea o destruye las vistas de edificios para que coincidan con el estado. */
  rebuildViews() {
    const state = store.get();
    const keyOf = (b) => `${b.type}@${b.x},${b.y}`;
    const current = new Map(state.buildings.map((b) => [b.id, b]));

    for (const [id, view] of this.views) {
      const b = current.get(id);
      if (!b || b.type !== view.type) {
        for (const obj of view.objects) obj.destroy();
        this.views.delete(id);
      }
    }
    if (this.selectedId !== null && !current.has(this.selectedId)) this.selectBuilding(null);

    for (const b of state.buildings) {
      if (this.views.has(b.id)) continue;
      const depth = DEPTH.world + depthOf(b.x, b.y);
      const sprite = this.add.image(0, 0, spriteOf(b)).setDepth(depth);
      const crate = this.add.image(0, 0, 'crate').setDepth(depth + 0.2).setVisible(false);
      const badge = this.add.circle(0, 0, 8, 0x1a2a1a, 0.9).setStrokeStyle(1, 0xffffff, 0.8).setDepth(depth + 0.3);
      const level = this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(depth + 0.4);
      const sub = this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(depth + 0.4);
      const bar = this.add.graphics().setDepth(depth + 0.4);
      this.views.set(b.id, { type: b.type, objects: [sprite, crate, badge, level, sub, bar], sprite, crate, badge, level, sub, bar, depth });
    }
    this.refresh();
  }

  /** Lo que cambia con el tiempo y el estado: recursos, avisos, panel y mundo. */
  refresh() {
    const now = Date.now();
    store.tick(now);
    this.announce();
    this.updateHud();
    if (this.selectedId !== null) this.updatePanel();
    this.renderWorld();
  }

  updateHud() {
    const state = store.get();
    const cap = logic.resourceCap(state);
    this.goldText.setText(`${state.gold}/${cap}`);
    this.woodText.setText(`${state.wood}/${cap}`);
    this.buildersText.setText(`Obreros ${logic.busyBuilders(state)}/${ECONOMY.builders} · Ayuntamiento nivel ${logic.townHallLevel(state)}`);

    for (const [tool, b] of this.toolButtons) {
      if (!b.def) continue;
      const count = logic.countOf(state, tool);
      const limit = logic.limitFor(state, tool);
      const full = count >= limit;
      b.label.setText(`${b.def.shortName ?? b.def.name} ${count}/${limit}`).setColor(full ? TEXT.bad : TEXT.normal);
      for (const c of b.costs) c.text.setColor(state[c.res] < (b.def.cost[c.res] ?? 0) ? TEXT.bad : TEXT[c.res]);
      b.rect.setAlpha(full ? 0.6 : 1);
    }
  }

  /**
   * Coloca todo el mundo según la cámara y el estado: terreno, adornos, edificios y selección.
   * Se llama cuando cambia el estado (cada 250 ms o tras una acción) y cuando se mueve la cámara.
   */
  renderWorld() {
    const state = store.get();
    const ts = tileSize();
    const zoom = view.zoom;
    const scale = spriteScale();

    for (const t of this.terrain) {
      const visible = isTileVisible(t.x, t.y, 0);
      t.img.setVisible(visible);
      if (!visible) continue;
      const c = tileCenter(t.x, t.y);
      t.img.setPosition(c.x, c.y).setScale(scale * 1.02); // un poco más grande: evita líneas entre casillas
    }

    const occupied = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
    for (const d of this.decor) {
      const visible = isTileVisible(d.x, d.y) && !occupied.has(`${d.x},${d.y}`);
      d.img.setVisible(visible);
      if (visible) this.placeOnTile(d.img, d.key, d.x, d.y, DECOR_GROW);
    }

    for (const b of state.buildings) {
      const v = this.views.get(b.id);
      if (!v) continue;
      const visible = isTileVisible(b.x, b.y);
      for (const obj of v.objects) obj.setVisible(visible);
      if (!visible) continue;

      const stats = logic.statsOf(b.type, b.level);
      const upgrading = logic.isUpgrading(b);
      const c = tileCenter(b.x, b.y);
      const tl = tileTopLeft(b.x, b.y);

      // La capa depende de la casilla: se recalcula si el edificio se movió (y solo entonces, porque reordena).
      const depth = DEPTH.world + depthOf(b.x, b.y);
      if (v.depth !== depth) {
        v.depth = depth;
        v.sprite.setDepth(depth);
        v.crate.setDepth(depth + 0.2);
        v.badge.setDepth(depth + 0.3);
        for (const o of [v.level, v.sub, v.bar]) o.setDepth(depth + 0.4);
      }

      this.placeOnTile(v.sprite, stats.sprite, b.x, b.y, BUILDING_GROW);
      v.sprite.setAlpha(this.movingId === b.id ? 0.35 : upgrading ? 0.35 : 1);
      v.crate.setPosition(c.x, c.y).setScale(scale * 0.7).setVisible(upgrading);

      v.badge.setPosition(c.x + ts / 2 - 8 * zoom, c.y - ts / 2 + 8 * zoom).setScale(zoom);
      v.level.setPosition(v.badge.x, v.badge.y).setScale(zoom).setText(String(b.level));
      v.sub.setPosition(c.x, c.y + ts / 2 - 16 * zoom).setScale(zoom);

      const bx = tl.x + 4 * zoom;
      const by = tl.y + ts - 7 * zoom;
      const bw = ts - 8 * zoom;
      const bh = 5 * zoom;
      v.bar.clear();
      v.bar.fillStyle(0x000000, 0.5).fillRect(bx, by, bw, bh);

      if (upgrading) {
        const total = logic.nextLevelOf(b).upgradeSec * 1000;
        const remaining = Math.max(0, b.upgradeEndsAt - Date.now());
        v.bar.fillStyle(COLORS.progress, 1).fillRect(bx, by, bw * (1 - remaining / total), bh);
        v.sub.setText(logic.formatDuration(remaining));
      } else if (stats.capacity) {
        const ratio = b.stored / stats.capacity;
        v.bar.fillStyle(ratio >= 1 ? 0x55cc55 : 0xfff2b0, 1).fillRect(bx, by, bw * ratio, bh);
        v.sub.setText(b.stored >= 1 ? String(Math.floor(b.stored)) : '');
      } else {
        v.sub.setText('');
        v.bar.clear(); // sin barra: no produce
      }
    }

    const selected = this.selectedId !== null && state.buildings.find((b) => b.id === this.selectedId);
    if (selected) {
      const c = tileCenter(selected.x, selected.y);
      this.selector.setPosition(c.x, c.y).setSize(ts, ts).setVisible(isTileVisible(selected.x, selected.y, 0));
    } else {
      this.selector.setVisible(false);
    }
  }

  /* ---------- bucle: teclado y cámara ---------- */

  update(_time, delta) {
    let dx = 0;
    let dy = 0;
    const k = this.cursors;
    const w = this.wasd;
    if (k?.left.isDown || w?.A.isDown) dx += 1;
    if (k?.right.isDown || w?.D.isDown) dx -= 1;
    if (k?.up.isDown || w?.W.isDown) dy += 1;
    if (k?.down.isDown || w?.S.isDown) dy -= 1;
    if (dx || dy) {
      const step = (CAMERA.keyPanSpeed * delta) / 1000;
      panBy(dx * step, dy * step);
      this.viewDirty = true;
    }

    // Al arrastrar un edificio cerca del borde de la ventana, la cámara lo sigue.
    const g = this.gesture;
    if (g?.mode === 'move') {
      const margin = 36;
      const p = this.input.activePointer;
      const step = (CAMERA.keyPanSpeed * delta) / 1000;
      let ex = 0;
      let ey = 0;
      if (p.x < margin) ex = 1;
      else if (p.x > LAYOUT.width - margin) ex = -1;
      if (p.y < LAYOUT.gridTop + margin) ey = 1;
      else if (p.y > LAYOUT.barTop - margin) ey = -1;
      if (ex || ey) {
        panBy(ex * step, ey * step);
        this.updateMoveGhost(p);
        this.viewDirty = true;
      }
    }

    if (this.viewDirty) {
      this.viewDirty = false;
      this.renderWorld();
    }
  }
}
