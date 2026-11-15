import Phaser from 'phaser';
import { ASSET_BASE, IMAGES, SOUNDS } from '../data/assets.js';
import { ART_SIZE, ARMY_UNITS, BUILDINGS, CAMERA, ECONOMY, GRID, HERO_MAX_LEVEL, LAYOUT, TOOL_PAGES, UNITS, heroXpToNext } from '../data/config.js';
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
import { wallConnectors } from '../game/walls.js';
import { renderConnectors } from './connectors.js';
import { canAttack, nextCampaignLevel } from '../game/campaign.js';
import { generateMission, missionName } from '../game/missions.js';
import { raidCountdownMs, raidLevel } from '../game/raids.js';
import * as quests from '../game/quests.js';
import { contentBounds } from '../game/sprites.js';
import * as store from '../game/store.js';
import { createWorker, plannedWorkers, stepWorker, workerPosition } from '../game/workers.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

// Capas de dibujado (mayor = más arriba). Lo del HUD va por encima del mundo para tapar
// lo que sobresalga de la ventana del mapa al desplazarse o hacer zoom.
const DAMAGED_TINT = 0x6a5a55;
const DEPTH = { terrain: 0, world: 10, ghost: 100, selector: 101, ui: 150, zoomButtons: 160, panel: 200, toast: 300 };

// Cuánto se agrandan los dibujos respecto a la casilla (el pack los trae pequeños en su lienzo).
const BUILDING_GROW = 1.25;
const DECOR_GROW = 1.15;
const WORKER_GROW = 1.6;
const POP_MS = 320; // duración de la animación al construir

const joinParts = (parts) => parts.filter(Boolean).join(' · ');
const rewardText = (r, sign = '') =>
  joinParts([r.gold > 0 && `${sign}${r.gold} oro`, r.wood > 0 && `${sign}${r.wood} madera`]);

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
  if (stats.supply) return `+${stats.supply} de población`;
  return null;
}

const spriteOf = (b) => logic.statsOf(b.type, b.level).sprite;
const iconKey = (tool) => BUILDINGS[tool].levels[0].sprite;

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('BaseScene');
    this.resetFields();
  }

  /** Phaser reutiliza esta misma instancia al volver de una batalla: hay que partir siempre de cero. */
  init() {
    this.resetFields();
  }

  resetFields() {
    this.views = new Map(); // id de edificio -> objetos de Phaser
    this.tool = null;
    this.selectedId = null;
    this.movingId = null; // edificio que se está arrastrando
    this.toolButtons = new Map();
    this.welcome = []; // líneas pendientes del resumen de bienvenida
    this.gesture = null; // gesto en curso (toque, arrastre, pellizco…)
    this.viewDirty = true; // la cámara cambió: hay que recolocar el mundo
    this.lastSound = {};
    this.workers = new Map(); // id de edificio -> aldeano (adorno animado)
    this.pop = new Map(); // id de edificio -> instante en que se construyó (animación)
    this.firstBuild = true; // la primera vez los edificios ya existían: no hacen «pop»
    this.questInit = false; // para no avisar de misiones que ya venían cumplidas
    this.notifiedQuest = null;
    this.army = []; // unidades dibujadas (ver syncArmy)
    this.armySignature = null;
    this.heroView = null;
    this.camp = null;
    this.shrine = null;
    this.modal = null;
    this.toolPage = 0;
    this.connectors = new Map(); // enlaces entre muros contiguos (ver renderWorld)
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
    this.createQuestBanner();
    this.createRaidBanner();
    this.createTrainStrip();
    store.holdRaids(false); // de vuelta en la base, los ataques enemigos se reanudan

    this.ghost = this.add.image(0, 0, iconKey('mine')).setAlpha(0.7).setVisible(false).setDepth(DEPTH.ghost);
    this.selector = this.add
      .rectangle(0, 0, GRID.tile, GRID.tile)
      .setStrokeStyle(3, 0xffffff, 1)
      .setVisible(false)
      .setDepth(DEPTH.selector);
    this.toast = this.add
      .text(LAYOUT.width / 2, LAYOUT.gridTop + 104, '', {
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
    if (data?.report) {
      const r = data.report;
      this.welcome.push(
        `${missionName(r.level)}: ${r.won ? '¡Victoria!' : 'Derrota'} · ${rewardText(r.loot, '+') || 'sin botín'}${r.heroLevelUps ? ' · ¡el héroe sube de nivel!' : ''}`,
      );
    }
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

  /**
   * Barra de herramientas con 7 casillas: hasta 5 edificios de la página actual, «Demoler» y el
   * botón que cambia de página (Economía / Militar). Cada herramienta tiene su casilla fija, así que
   * cambiar de página solo muestra u oculta botones.
   */
  createToolbar() {
    const slots = 7;
    const w = LAYOUT.width / slots;
    const cy = LAYOUT.barTop + LAYOUT.barHeight / 2;
    this.ui(this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, LAYOUT.barHeight, COLORS.hud));
    this.toolPage = 0;

    const makeButton = (slot, tool, page) => {
      const def = BUILDINGS[tool]; // undefined para «demolish»
      const cx = slot * w + w / 2;
      const parts = [];
      const add = (obj) => {
        parts.push(obj);
        return obj;
      };

      const rect = add(
        this.ui(
          this.add
            .rectangle(cx, cy, w - 6, LAYOUT.barHeight - 14, COLORS.button)
            .setStrokeStyle(2, 0x4a6a4a)
            .setInteractive({ useHandCursor: true }),
          DEPTH.ui + 1,
        ),
      );

      if (def) add(this.ui(this.fitIcon(this.add.image(0, 0, iconKey(tool)), iconKey(tool), cx, cy - 30, 28), DEPTH.ui + 2));
      else add(this.ui(this.add.text(cx, cy - 30, '✕', { fontFamily: FONT, fontSize: '22px', color: '#ff9a8a' }).setOrigin(0.5), DEPTH.ui + 2));

      const label = add(
        this.ui(
          this.add
            .text(cx, cy - 6, def ? (def.shortName ?? def.name) : 'Demoler', { fontFamily: FONT, fontSize: '11px', color: TEXT.normal, align: 'center', lineSpacing: 2 })
            .setOrigin(0.5),
          DEPTH.ui + 2,
        ),
      );

      // Costos: un ícono + número por cada recurso que cueste.
      const costs = [];
      if (def) {
        const items = ['gold', 'wood'].filter((r) => (def.cost[r] ?? 0) > 0);
        items.forEach((res, k) => {
          const x = items.length === 1 ? cx : cx + (k === 0 ? -20 : 20);
          const icon = [].concat(res === 'gold' ? this.goldIcon(x - 12, cy + 25, 5) : this.woodIcon(x - 12, cy + 25, 11));
          const text = add(
            this.ui(this.add.text(x - 5, cy + 25, String(def.cost[res]), { fontFamily: FONT, fontSize: '11px', color: TEXT[res] }).setOrigin(0, 0.5), DEPTH.ui + 2),
          );
          icon.forEach(add);
          costs.push({ res, text });
        });
      } else {
        add(this.ui(this.add.text(cx, cy + 25, '50 % devuelto', { fontFamily: FONT, fontSize: '9px', color: TEXT.gold }).setOrigin(0.5), DEPTH.ui + 2));
      }

      rect.on('pointerdown', () => {
        this.play('select');
        this.selectTool(this.tool === tool ? null : tool);
      });
      this.toolButtons.set(tool, { rect, label, costs, def, parts, page });
    };

    TOOL_PAGES.forEach((p, pageIndex) => p.tools.forEach((tool, slot) => makeButton(slot, tool, pageIndex)));
    makeButton(5, 'demolish', null);

    // Botón para cambiar de página.
    const cx = 6 * w + w / 2;
    const pageRect = this.ui(
      this.add.rectangle(cx, cy, w - 6, LAYOUT.barHeight - 14, 0x2a3f5a).setStrokeStyle(2, 0x5a82ad).setInteractive({ useHandCursor: true }),
      DEPTH.ui + 1,
    );
    this.pageLabel = this.ui(
      this.add.text(cx, cy, '', { fontFamily: FONT, fontSize: '12px', color: '#cfe3ff', align: 'center', lineSpacing: 4 }).setOrigin(0.5),
      DEPTH.ui + 2,
    );
    pageRect.on('pointerdown', () => {
      this.play('select');
      this.setToolPage((this.toolPage + 1) % TOOL_PAGES.length);
    });
    this.setToolPage(0);
  }

  /** Muestra los botones de una página de la barra (y quita la herramienta si queda oculta). */
  setToolPage(page) {
    this.toolPage = page;
    for (const [tool, b] of this.toolButtons) {
      const visible = b.page === null || b.page === page;
      for (const p of b.parts) p.setVisible(visible);
      if (!visible && this.tool === tool) this.selectTool(null);
    }
    const next = TOOL_PAGES[(page + 1) % TOOL_PAGES.length];
    this.pageLabel.setText(`${next.name}\n▶`);
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
    make(top + 146, '⚔', '18px', () => this.openAttackModal());
  }

  /** Ventana para confirmar el ataque: muestra al enemigo y tus tropas. */
  openAttackModal() {
    if (this.modal) return;
    const state = store.get();
    const level = nextCampaignLevel(state);
    const mission = generateMission(level);
    const ready = canAttack(state);
    const w = LAYOUT.width;
    const d = DEPTH.panel + 100;
    const cx = w / 2;
    const cy = LAYOUT.gridTop + 230;
    const a = state.army;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const lines = [
      missionName(level),
      `Enemigo: ${plural(mission.buildings.filter((b) => b.type !== 'wall').length, 'edificio', 'edificios')} · ${plural(mission.buildings.filter((b) => b.type === 'tower').length, 'torre', 'torres')} · ${plural(mission.defenders.length, 'defensor', 'defensores')}`,
      ready
        ? `Tus tropas: ${a.soldier} soldados · ${a.mage} hechiceros · ${a.knight} caballeros${state.hero ? ` · héroe nv. ${state.hero.level}` : ''}`
        : 'No tienes tropas: entrénalas en el cuartel',
    ];

    const parts = [];
    const add = (o) => {
      parts.push(o);
      return o;
    };
    add(this.add.rectangle(w / 2, LAYOUT.height / 2, w, LAYOUT.height, 0x000000, 0.6).setDepth(d).setInteractive());
    add(this.add.rectangle(cx, cy, 480, 250, 0x1a2a1a, 0.98).setStrokeStyle(3, 0xd4a017).setDepth(d + 1));
    add(this.add.text(cx, cy - 92, '⚔  Atacar', { fontFamily: FONT, fontSize: '26px', color: '#ffe9a0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 2));
    add(
      this.add
        .text(cx, cy - 10, lines.join('\n'), { fontFamily: FONT, fontSize: '15px', color: '#e8eee0', align: 'center', lineSpacing: 9, wordWrap: { width: 440 } })
        .setOrigin(0.5)
        .setDepth(d + 2),
    );

    const button = (x, label, fill, onClick) => {
      const r = add(this.add.rectangle(x, cy + 88, ready ? 200 : 240, 46, fill).setStrokeStyle(2, 0xffffff, 0.5).setInteractive({ useHandCursor: true }).setDepth(d + 2));
      add(this.add.text(x, cy + 88, label, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 3));
      r.on('pointerdown', onClick);
    };
    if (ready) {
      button(cx - 108, 'Atacar', 0x9a3a2a, () => this.startBattle(level));
      button(cx + 108, 'Cancelar', 0x324a32, () => this.closeModal());
    } else {
      button(cx, 'Cerrar', 0x324a32, () => this.closeModal());
    }
    this.modal = parts;
    this.play('select');
  }

  closeModal() {
    for (const p of this.modal ?? []) p.destroy();
    this.modal = null;
  }

  startBattle(level) {
    store.persist(); // guarda la base antes de salir
    this.closeModal();
    this.scene.start('BattleScene', { level });
  }

  /** Cartel de la misión en curso, arriba a la izquierda de la ventana del mapa. */
  createQuestBanner() {
    const x = 8;
    const y = LAYOUT.gridTop + 6;
    const w = 400;
    const h = 44;
    const d = DEPTH.zoomButtons;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0x1a2a1a, 0.9)
      .setStrokeStyle(2, COLORS.gold)
      .setInteractive({ useHandCursor: true })
      .setDepth(d);
    const title = this.add
      .text(x + 10, y + 6, '', { fontFamily: FONT, fontSize: '12px', color: TEXT.gold, fontStyle: 'bold' })
      .setDepth(d + 1);
    const detail = this.add.text(x + 10, y + 24, '', { fontFamily: FONT, fontSize: '11px', color: '#cfe0c8' }).setDepth(d + 1);
    bg.on('pointerdown', () => this.onQuestClick());
    this.questBanner = { bg, title, detail, parts: [bg, title, detail] };
  }

  updateQuestBanner() {
    const state = store.get();
    const { bg, title, detail, parts } = this.questBanner;
    const quest = quests.currentQuest(state);
    for (const p of parts) p.setVisible(Boolean(quest));
    if (!quest) return;

    const progress = quests.questProgress(state, quest);
    const { claimed, total } = quests.questCounts(state);
    title.setText(`Misión ${claimed + 1}/${total} · ${quest.text}`);
    detail.setText(
      progress.done
        ? `¡Cumplida! Toca aquí para reclamar: ${rewardText(quest.reward, '+')}`
        : `${progress.current}/${progress.target} · Premio: ${rewardText(quest.reward)}`,
    );
    bg.setStrokeStyle(2, progress.done ? COLORS.ok : COLORS.gold);
    detail.setColor(progress.done ? '#b8f0b8' : '#cfe0c8');

    // Avisa una sola vez cuando se cumple; las que ya venían cumplidas al abrir el juego no avisan.
    if (progress.done && this.questInit && this.notifiedQuest !== quest.id) {
      this.showToast('¡Misión cumplida! Toca el cartel para reclamar el premio', 2400);
      this.play('upgrade_done');
    }
    if (progress.done) this.notifiedQuest = quest.id;
    this.questInit = true;
  }

  onQuestClick() {
    const state = store.get();
    const quest = quests.currentQuest(state);
    if (!quest) return;
    const progress = quests.questProgress(state, quest);
    if (!progress.done) {
      this.showToast(`${quest.text}: ${progress.current}/${progress.target}`);
      this.play('select');
      return;
    }
    this.doAction(
      () => quests.claimQuest(store.get(), quest.id),
      (r) => `Misión cumplida · ${rewardText(r.granted, '+') || 'sin espacio para el premio'}`,
      'collect_all',
    );
  }

  /* ---------- ataques enemigos: aviso, reparación e informe ---------- */

  /** Cartel bajo el de la misión: cuenta regresiva del próximo ataque y, si hay, lo dañado (se toca para reparar). */
  createRaidBanner() {
    const x = 8;
    const y = LAYOUT.gridTop + 54;
    const w = 400;
    const h = 42;
    const d = DEPTH.zoomButtons;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, 0x2a1a1a, 0.9)
      .setStrokeStyle(2, 0xdd5555)
      .setInteractive({ useHandCursor: true })
      .setDepth(d);
    const line1 = this.add.text(x + 10, y + 5, '', { fontFamily: FONT, fontSize: '12px', color: '#ffb0a0', fontStyle: 'bold' }).setDepth(d + 1);
    const line2 = this.add.text(x + 10, y + 22, '', { fontFamily: FONT, fontSize: '11px', color: '#e8c79a' }).setDepth(d + 1);
    bg.on('pointerdown', () => this.onRaidBannerClick());
    this.raidBanner = { bg, line1, line2 };
  }

  updateRaidBanner() {
    const state = store.get();
    const ms = raidCountdownMs(state, Date.now());
    const imminent = ms <= 60_000;
    const damaged = logic.damagedBuildings(state);
    const { bg, line1, line2 } = this.raidBanner;

    line1.setText(imminent ? `¡Ataque enemigo inminente! ${logic.formatDuration(ms)}` : `Ataque enemigo en ${logic.formatDuration(ms)} · fuerza ${raidLevel(state)}`);
    line1.setColor(imminent ? '#ffe08a' : '#ffb0a0');
    line2.setText(
      damaged.length
        ? `Dañados: ${damaged.length} · toca para reparar todo (${logic.formatCost(logic.repairAllCost(state))})`
        : 'Tus torres, muros y tropas defienden la base',
    );
    line2.setColor(damaged.length ? '#ffcf8a' : '#cfe0c8');
    bg.setStrokeStyle(2, imminent ? 0xffd24d : damaged.length ? 0xe08a3a : 0xdd5555);
  }

  onRaidBannerClick() {
    const state = store.get();
    if (logic.damagedBuildings(state).length) {
      this.doAction(
        () => logic.repairAll(store.get(), Date.now()),
        (r) => `Reparados ${r.repaired}${r.left ? ` · quedan ${r.left} (faltan recursos)` : ''}`,
        'upgrade_done',
      );
    } else {
      this.showToast(`Próximo ataque: fuerza ${raidLevel(state)}. Torres, muros y tropas ayudan a defender.`, 2400);
      this.play('select');
    }
  }

  /** Informe de un ataque enemigo ya resuelto. */
  openRaidReport(r) {
    this.closeModal();
    const state = store.get();
    const w = LAYOUT.width;
    const d = DEPTH.panel + 100;
    const cx = w / 2;
    const cy = LAYOUT.gridTop + 250;
    const good = r.outcome === 'repelled';
    const title = { repelled: '¡Rechazaste el ataque!', retreated: 'El enemigo se retiró', raided: '¡Tumbaron tu Ayuntamiento!' }[r.outcome];
    const stolen = rewardText(r.stolen);
    const lines = [
      `Fuerza ${r.level} · atacantes derrotados: ${r.kills}`,
      r.damaged ? `Edificios dañados: ${r.damaged}` : 'Ningún edificio dañado',
      stolen ? `Robaron: ${stolen}` : 'No robaron nada',
      r.hero && r.xp ? `Héroe: +${r.xp} XP · nivel ${r.hero.level}${r.heroLevelUps ? ' · ¡SUBE DE NIVEL!' : ''}` : null,
    ].filter(Boolean);

    const parts = [];
    const add = (o) => {
      parts.push(o);
      return o;
    };
    add(this.add.rectangle(w / 2, LAYOUT.height / 2, w, LAYOUT.height, 0x000000, 0.62).setDepth(d).setInteractive());
    add(this.add.rectangle(cx, cy, 480, 270, 0x1a2a1a, 0.98).setStrokeStyle(3, good ? 0x66dd66 : 0xdd5555).setDepth(d + 1));
    add(this.add.text(cx, cy - 100, `⚠ ${title}`, { fontFamily: FONT, fontSize: '24px', color: good ? '#b8f0b8' : '#ffb0a0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 2));
    add(this.add.text(cx, cy - 15, lines.join('\n'), { fontFamily: FONT, fontSize: '15px', color: '#e8eee0', align: 'center', lineSpacing: 9 }).setOrigin(0.5).setDepth(d + 2));

    const button = (x, width, label, fill, onClick) => {
      const rect = add(this.add.rectangle(x, cy + 100, width, 44, fill).setStrokeStyle(2, 0xffffff, 0.5).setInteractive({ useHandCursor: true }).setDepth(d + 2));
      add(this.add.text(x, cy + 100, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setDepth(d + 3));
      rect.on('pointerdown', onClick);
    };
    if (logic.damagedBuildings(state).length) {
      button(cx - 120, 220, `Reparar todo\n${logic.formatCost(logic.repairAllCost(state))}`, 0x9a6a2a, () => {
        this.closeModal();
        this.onRaidBannerClick();
      });
      button(cx + 120, 180, 'Cerrar', 0x324a32, () => this.closeModal());
    } else {
      button(cx, 220, 'Cerrar', 0x324a32, () => this.closeModal());
    }
    this.modal = parts;
    this.play(good ? 'win' : 'lose');
  }

  /* ---------- entrenar unidades ---------- */

  /** Tarjetas para entrenar: aparecen sobre el mapa cuando se elige un cuartel o el altar. */
  createTrainStrip() {
    const cardW = 182;
    const cardH = 64;
    const y = LAYOUT.barTop - cardH - 10;
    const d = DEPTH.panel - 5;
    this.trainCards = [0, 1, 2].map((i) => {
      const left = 8 + i * (cardW + 6);
      const cx = left + cardW / 2;
      const cy = y + cardH / 2;
      const rect = this.add
        .rectangle(cx, cy, cardW, cardH, 0x1a2a1a, 0.94)
        .setStrokeStyle(2, 0x8cc4f5)
        .setInteractive({ useHandCursor: true })
        .setDepth(d);
      const icon = this.add.image(0, 0, 'unit_soldier').setDepth(d + 1);
      const text = (dy, size, color, bold) =>
        this.add.text(left + 54, y + dy, '', { fontFamily: FONT, fontSize: size, color, fontStyle: bold ? 'bold' : 'normal' }).setDepth(d + 1);
      const name = text(8, '13px', '#ffffff', true);
      const cost = text(27, '11px', TEXT.gold, false);
      const info = text(44, '11px', '#9fc8ef', false);
      const card = { rect, icon, name, cost, info, unit: null, ix: left + 28, iy: cy, parts: [rect, icon, name, cost, info] };
      rect.on('pointerdown', () => this.onTrainClick(card.unit));
      for (const p of card.parts) p.setVisible(false);
      return card;
    });
  }

  /** Muestra las unidades que entrena el edificio elegido (o esconde las tarjetas si no entrena). */
  updateTrainStrip(b) {
    const state = store.get();
    const units = b ? (BUILDINGS[b.type].trains ?? []) : [];
    this.trainCards.forEach((card, i) => {
      const key = units[i];
      card.unit = key ?? null;
      for (const p of card.parts) p.setVisible(Boolean(key));
      if (!key) return;

      const u = UNITS[key];
      const locked = b.level < u.minLevel;
      const busy = logic.isTraining(b) || logic.isUpgrading(b) || b.damaged;
      const heroTaken = u.hero && (state.hero || state.buildings.some((x) => x.training?.unit === key));
      const affordable = logic.canAfford(state, u.cost) && logic.supplyUsed(state) + u.supply <= logic.supplyCap(state);
      const usable = !locked && !busy && !heroTaken && affordable;

      this.fitIcon(card.icon, u.sprite, card.ix, card.iy, 38);
      card.name.setText(u.hero && heroTaken ? `${u.name} (invocado)` : u.name);
      card.cost.setText(locked ? `Requiere nivel ${u.minLevel}` : logic.formatCost(u.cost));
      const seconds = u.trainSec * (logic.statsOf(b.type, b.level).trainFactor ?? 1);
      card.info.setText(`${logic.formatDuration(seconds * 1000)} · Población ${u.supply}`);
      for (const p of card.parts) p.setAlpha(usable ? 1 : 0.5);
      card.rect.setStrokeStyle(2, usable ? 0x8cc4f5 : 0x4a6a4a);
    });
  }

  onTrainClick(unit) {
    const id = this.selectedId;
    if (id === null || !unit) return;
    this.doAction(
      () => logic.startTraining(store.get(), id, unit, Date.now()),
      (r) => `Entrenando ${UNITS[unit].name}: ${logic.formatDuration(r.endsAt - Date.now())}`,
      'upgrade_start',
    );
    this.updatePanel();
  }

  /* ---------- efectos ---------- */

  /** Texto que sube y se desvanece (por ejemplo «+44» al recolectar). */
  floatText(x, y, text, color = TEXT.gold) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(DEPTH.toast - 10);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** Nube de polvo al construir. */
  dust(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const puff = this.add.circle(x, y + 10, 3 + Math.random() * 2, 0xe8e0c8, 0.85).setDepth(DEPTH.ghost - 5);
      this.tweens.add({
        targets: puff,
        x: x + Math.cos(a) * (16 + Math.random() * 10),
        y: y + 10 + Math.sin(a) * 8,
        alpha: 0,
        scale: 0.4,
        duration: 420,
        onComplete: () => puff.destroy(),
      });
    }
  }

  /* ---------- aldeanos ---------- */

  /** Crea o quita aldeanos para que haya uno por edificio productor, y actualiza su ruta. */
  syncWorkers() {
    const plan = new Map(plannedWorkers(store.get()).map((p) => [p.buildingId, p]));
    for (const [id, w] of this.workers) {
      if (plan.has(id)) continue;
      w.img.destroy();
      w.bundle.destroy();
      this.workers.delete(id);
    }
    for (const [id, p] of plan) {
      let w = this.workers.get(id);
      if (!w) {
        const key = p.resource === 'gold' ? 'worker_1' : 'worker_2';
        const img = this.add.image(0, 0, key).setVisible(false);
        const bundle = this.add
          .rectangle(0, 0, 8, 6, p.resource === 'gold' ? COLORS.gold : COLORS.wood)
          .setStrokeStyle(1, 0x000000, 0.7)
          .setVisible(false);
        w = { id, key, img, bundle, state: createWorker(id), plan: p };
        this.workers.set(id, w);
      }
      w.plan = p; // el edificio pudo haberse movido
    }
  }

  /** Mueve y dibuja a los aldeanos (cada cuadro). */
  animateWorkers(dt, timeMs) {
    const zoom = view.zoom;
    for (const w of this.workers.values()) {
      const { home, site } = w.plan;
      stepWorker(w.state, dt, home, site);
      const pos = workerPosition(w.state, home, site);

      if (!isTileVisible(Math.round(pos.x), Math.round(pos.y))) {
        w.img.setVisible(false);
        w.bundle.setVisible(false);
        continue;
      }
      const bob = pos.moving ? Math.abs(Math.sin(timeMs / 110 + w.id)) * 3 * zoom : 0;
      const dirX = (site.x - home.x) * (w.state.phase === 'back' ? -1 : 1);

      this.placeOnTile(w.img, w.key, pos.x, pos.y, WORKER_GROW)
        .setDepth(DEPTH.world + pos.y + 0.6)
        .setFlipX(dirX < 0)
        .setVisible(true);
      w.img.y -= bob;

      // El bulto va sobre la cabeza: se usa el alto real del dibujo, no el del lienzo de 64 px.
      const headroom = contentBounds(this.textures, w.key).h * spriteScale() * WORKER_GROW;
      w.bundle
        .setPosition(w.img.x, w.img.y - headroom - 2 * zoom)
        .setScale(zoom)
        .setDepth(w.img.depth + 0.01)
        .setVisible(pos.carrying);
    }
  }

  /* ---------- ejército y héroe ---------- */

  /**
   * El ejército se ve formado cerca del primer cuartel (o del Ayuntamiento si no hay), y el héroe
   * junto al altar. Es solo la representación de `state.army` y `state.hero`.
   */
  syncArmy() {
    const state = store.get();
    const first = (type) => state.buildings.filter((b) => b.type === type).sort((a, b) => a.id - b.id)[0];
    const camp = first('barracks') ?? logic.townHall(state);
    const shrine = first('altar') ?? camp;
    this.camp = camp ? { x: camp.x, y: camp.y } : null;
    this.shrine = shrine ? { x: shrine.x, y: shrine.y } : null;

    // Se muestran como mucho 24 unidades para no saturar la pantalla.
    const want = [];
    for (const u of ARMY_UNITS) for (let i = 0; i < (state.army[u] ?? 0) && want.length < 24; i++) want.push(u);
    const signature = want.join(',');
    if (signature !== this.armySignature) {
      this.armySignature = signature;
      for (const a of this.army ?? []) a.img.destroy();
      this.army = want.map((type, slot) => ({ type, slot, img: this.add.image(0, 0, UNITS[type].sprite).setVisible(false) }));
    }

    if (state.hero && !this.heroView) {
      this.heroView = {
        img: this.add.image(0, 0, UNITS.hero.sprite).setVisible(false),
        label: this.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: '#ffe9a0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
          .setOrigin(0.5)
          .setVisible(false),
      };
    } else if (!state.hero && this.heroView) {
      this.heroView.img.destroy();
      this.heroView.label.destroy();
      this.heroView = null;
    }
    if (this.heroView) this.heroView.label.setText(`Héroe nv. ${state.hero.level}`);
  }

  /** Coloca (cada cuadro) al ejército en formación y al héroe, con un leve balanceo. */
  animateArmy(timeMs) {
    const zoom = view.zoom;
    if (this.camp) {
      for (const a of this.army ?? []) {
        const col = a.slot % 4;
        const row = Math.floor(a.slot / 4);
        const x = this.camp.x + 1.1 + col * 0.42;
        const y = this.camp.y + 0.55 + row * 0.36;
        if (!isTileVisible(Math.round(x), Math.round(y))) {
          a.img.setVisible(false);
          continue;
        }
        const sway = Math.sin(timeMs / 700 + a.slot * 1.7) * 1.2 * zoom;
        this.placeOnTile(a.img, UNITS[a.type].sprite, x, y, WORKER_GROW).setDepth(DEPTH.world + y + 0.55).setVisible(true);
        a.img.x += sway;
      }
    }
    const h = this.heroView;
    if (h && this.shrine) {
      const x = this.shrine.x + 0.55;
      const y = this.shrine.y + 1.25;
      const visible = isTileVisible(Math.round(x), Math.round(y));
      h.img.setVisible(visible);
      h.label.setVisible(visible);
      if (visible) {
        this.placeOnTile(h.img, UNITS.hero.sprite, x, y, WORKER_GROW * 1.35).setDepth(DEPTH.world + y + 0.6);
        h.img.y -= Math.abs(Math.sin(timeMs / 600)) * 2 * zoom;
        const headroom = contentBounds(this.textures, UNITS.hero.sprite).h * spriteScale() * WORKER_GROW * 1.35;
        h.label.setPosition(h.img.x, h.img.y - headroom - 6 * zoom).setScale(zoom).setDepth(h.img.depth + 0.01);
      }
    }
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
    } else {
      this.updateTrainStrip(null); // sin edificio elegido, fuera las tarjetas de entrenar
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
      lines.push(`${lim('mine', 'Minas')} · ${lim('sawmill', 'Aserraderos')} · ${lim('farm', 'Granjas')}`);
      lines.push(`${lim('storage', 'Almacenes')} · ${lim('barracks', 'Cuarteles')} · ${lim('altar', 'Altar')}`);
      lines.push(`${lim('tower', 'Torres')} · ${lim('wall', 'Muros')} · ${lim('gate', 'Puertas')}`);
      return lines;
    }

    const own = {
      barracks: `Entrena: ${logic.trainableUnits(b).map((u) => UNITS[u].name).join(', ')}${
        stats.trainFactor ? ` · ${Math.round((1 - stats.trainFactor) * 100)} % más rápido` : ''
      }`,
      altar: state.hero
        ? `Héroe nivel ${state.hero.level} · ${state.hero.level >= HERO_MAX_LEVEL ? 'nivel máximo' : `experiencia ${state.hero.xp}/${heroXpToNext(state.hero.level)}`}`
        : 'Invoca a tu héroe (solo puede haber uno)',
      wall: 'Bloquea el paso (en el combate frenará al enemigo)',
      gate: 'Paso para tus unidades (en el combate)',
      tower: 'Defensa: se activa en la fase de combate',
    }[b.type];
    lines.push(own ?? describe(stats) ?? '');

    if (!next) lines.push('Nivel máximo');
    else if (b.level >= logic.townHallLevel(state)) lines.push(`Para el nivel ${b.level + 1}, sube antes el Ayuntamiento`);
    else if (b.type === 'barracks') {
      const unlocks = (BUILDINGS.barracks.trains ?? []).filter((u) => UNITS[u].minLevel === b.level + 1).map((u) => UNITS[u].name);
      const faster = next.trainFactor ? `entrena ${Math.round((1 - next.trainFactor) * 100)} % más rápido` : null;
      lines.push(`Nivel ${b.level + 1}: ${unlocks.length ? `desbloquea ${unlocks.join(', ')}` : (faster ?? 'más resistencia')}`);
    } else lines.push(`Nivel ${b.level + 1}: ${describe(next) ?? 'más resistencia'}`);
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
    const arrow = b.type === 'townhall' && next ? ` → ${logic.displayName('townhall', b.level + 1)}` : '';
    title.setText(`${logic.displayName(b.type, b.level)} · Nivel ${b.level}/${logic.maxLevel(b.type)}${arrow}`);
    this.updateTrainStrip(b);

    const hideButton = () => {
      upgradeBtn.setVisible(false);
      upgradeLabel.setVisible(false);
    };

    if (logic.isUpgrading(b)) {
      detail.setText(`Mejorando al nivel ${b.level + 1}…\nTermina en ${logic.formatDuration(b.upgradeEndsAt - Date.now())}`);
      hideButton();
      return;
    }
    if (logic.isTraining(b)) {
      const unit = UNITS[b.training.unit];
      detail.setText(`Entrenando ${unit.name}…\nTermina en ${logic.formatDuration(b.training.endsAt - Date.now())}`);
      hideButton();
      return;
    }

    if (b.damaged) {
      const cost = logic.repairCost(b);
      detail.setText('Dañado en un ataque enemigo.\nNo produce, ni entrena ni mejora hasta repararlo.');
      this.panel.hint.setVisible(false);
      upgradeBtn.setVisible(true).setAlpha(logic.canAfford(state, cost) ? 1 : 0.5);
      upgradeLabel.setText(`Reparar\n${logic.formatCost(cost)}`).setVisible(true).setAlpha(logic.canAfford(state, cost) ? 1 : 0.5);
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
    if (store.get().buildings.find((b) => b.id === id)?.damaged) {
      this.doAction(
        () => {
          const r = logic.repairBuilding(store.get(), id);
          if (r.ok) store.get().buildings.find((b) => b.id === id).lastTick = Date.now();
          return r;
        },
        () => 'Reparado',
        'upgrade_done',
      );
      this.updatePanel();
      return;
    }
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
        const c = tileCenter(b.x, b.y);
        this.floatText(c.x, c.y - tileSize() / 2, `+${r.amount}`, r.resource === 'gold' ? TEXT.gold : TEXT.wood);
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
      } else if (e.type === 'raid') {
        this.openRaidReport(e.report); // se muestra tras recorrer los demás avisos
      } else if (e.type === 'trained') {
        out.push(e.unit === 'hero' ? '¡Tu héroe ha llegado!' : `${UNITS[e.unit].name} listo para el combate`);
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

      if (!this.firstBuild) {
        // Un edificio nuevo «salta» al aparecer y levanta polvo.
        this.pop.set(b.id, this.time.now);
        const c = tileCenter(b.x, b.y);
        this.dust(c.x, c.y);
      }
    }
    this.firstBuild = false;
    this.refresh();
  }

  /** Lo que cambia con el tiempo y el estado: recursos, avisos, panel y mundo. */
  refresh() {
    const now = Date.now();
    store.tick(now);
    this.announce();
    this.updateHud();
    this.updateQuestBanner();
    this.updateRaidBanner();
    this.syncWorkers();
    this.syncArmy();
    if (this.selectedId !== null) this.updatePanel();
    this.renderWorld();
  }

  updateHud() {
    const state = store.get();
    const cap = logic.resourceCap(state);
    this.goldText.setText(`${state.gold}/${cap}`);
    this.woodText.setText(`${state.wood}/${cap}`);
    const used = logic.supplyUsed(state);
    const supply = logic.supplyCap(state);
    this.buildersText
      .setText(`Obreros ${logic.busyBuilders(state)}/${ECONOMY.builders} · Población ${used}/${supply} · Ayuntamiento ${logic.townHallLevel(state)}`)
      .setColor(used >= supply ? TEXT.bad : '#9fc8ef');

    for (const [tool, b] of this.toolButtons) {
      if (!b.def) continue;
      const count = logic.countOf(state, tool);
      const limit = logic.limitFor(state, tool);
      const full = count >= limit;
      b.label.setText(`${b.def.shortName ?? b.def.name}\n${count}/${limit}`).setColor(full ? TEXT.bad : TEXT.normal);
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

      // Animación de «pop» al construir: crece con un pequeño rebote.
      let grow = BUILDING_GROW;
      const born = this.pop.get(b.id);
      if (born !== undefined) {
        const k = (this.time.now - born) / POP_MS;
        if (k >= 1) this.pop.delete(b.id);
        else grow *= 0.55 + 0.45 * (1 - (1 - k) ** 3) + 0.14 * Math.sin(k * Math.PI);
      }
      this.placeOnTile(v.sprite, stats.sprite, b.x, b.y, grow);
      if (b.damaged) v.sprite.setTint(DAMAGED_TINT); // dañado: oscuro y chamuscado
      else if (stats.tint) v.sprite.setTint(stats.tint); // los niveles 4 y 5 se ven dorados
      else v.sprite.clearTint();
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

      if (b.damaged) {
        v.bar.fillStyle(0xcc3333, 1).fillRect(bx, by, bw * 0.3, bh);
        v.sub.setText('Dañado');
      } else if (upgrading) {
        const total = logic.nextLevelOf(b).upgradeSec * 1000;
        const remaining = Math.max(0, b.upgradeEndsAt - Date.now());
        v.bar.fillStyle(COLORS.progress, 1).fillRect(bx, by, bw * (1 - remaining / total), bh);
        v.sub.setText(logic.formatDuration(remaining));
      } else if (logic.isTraining(b)) {
        const total = UNITS[b.training.unit].trainSec * 1000 * (stats.trainFactor ?? 1);
        const remaining = Math.max(0, b.training.endsAt - Date.now());
        v.bar.fillStyle(0xffb86b, 1).fillRect(bx, by, bw * (1 - remaining / total), bh);
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

    // Los muros y puertas contiguos se dibujan unidos, como una sola pared.
    const hurt = new Set(state.buildings.filter((b) => b.damaged).map((b) => `${b.x},${b.y}`));
    const isHurt = (c) => {
      const [x, y] = [Math.floor(c.x), Math.floor(c.y)];
      return hurt.has(`${x},${y}`) || hurt.has(c.orient === 'h' ? `${x + 1},${y}` : `${x},${y + 1}`);
    };
    renderConnectors(this, this.connectors, wallConnectors(state.buildings), {
      grow: BUILDING_GROW,
      tintFor: (c) => (isHurt(c) ? DAMAGED_TINT : (BUILDINGS.wall.levels[Math.min(c.level, 5) - 1]?.tint ?? null)),
    });

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

    this.animateWorkers(Math.min(delta, 250) / 1000, this.time.now);
    this.animateArmy(this.time.now);

    if (this.pop.size) this.viewDirty = true; // hay animaciones de construcción en curso
    if (this.viewDirty) {
      this.viewDirty = false;
      this.renderWorld();
    }
  }
}
