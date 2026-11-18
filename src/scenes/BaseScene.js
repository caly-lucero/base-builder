import Phaser from 'phaser';
import { ASSET_BASE, IMAGES, SHEETS, SOUNDS } from '../data/assets.js';
import { ARMY_UNITS, BUILDINGS, CAMERA, ECONOMY, GRID, LAYOUT, RESEARCH, TOOL_PAGES, UNITS, researchStep } from '../data/config.js';
import { HEROES, HERO_KEYS, heroXpToNext } from '../data/heroes.js';
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
  tileCorners,
  tileSize,
  view,
  zoomAt,
} from '../game/projection.js';
import { fitIcon as fitIconArt, placeOnTile as placeOnTileArt } from './artPlace.js';
import { drawCliff, ensureTerrainTextures, grassKey, strokeCell } from './terrainArt.js';
import { SHEET, unitFrame } from '../game/unitArt.js';
import { canAttack, nextCampaignLevel } from '../game/campaign.js';
import { generateMission, missionName } from '../game/missions.js';
import { raidCountdownMs, raidLevel } from '../game/raids.js';
import * as quests from '../game/quests.js';
import * as store from '../game/store.js';
import { flowerSpots, pathTiles, pondTiles } from '../game/landscape.js';
import { createWorker, plannedWorkers, stepWorker, workerPosition } from '../game/workers.js';
import { claimableCount } from '../game/achievements.js';
import { openAchievementsPanel } from './achievementsPanel.js';
import { isSoundOn, onNotice, runMenu } from '../game/menu.js';
import { openHeroPanel } from './heroPanel.js';
import * as ui from './ui.js';
import { addGloss, addVignette, createClouds, emberPuff, ensureTextures, smokePuff, sparkBurst, stepClouds } from './look.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

// Capas de dibujado (mayor = más arriba). Lo del HUD va por encima del mundo para tapar
// lo que sobresalga de la ventana del mapa al desplazarse o hacer zoom.
const DAMAGED_TINT = 0x8a7a72;
const DEPTH = { terrain: 0, shadow: 8, world: 10, clouds: 80, vignette: 90, ghost: 100, selector: 101, ui: 150, zoomButtons: 160, panel: 200, toast: 800 };

// Sombras bajo los dibujos: ancho y alto como fracción de la casilla.
const SHADOW = {
  building: { w: 1.05, h: 0.4, alpha: 0.55 },
  tree: { w: 0.85, h: 0.32, alpha: 0.45 },
  rock: { w: 0.6, h: 0.24, alpha: 0.34 },
  bush: { w: 0.5, h: 0.2, alpha: 0.3 },
  unit: { w: 0.34, h: 0.13, alpha: 0.22 },
};
const shadowKindOf = (key) => (key.startsWith('tree') ? 'tree' : key.startsWith('rock') ? 'rock' : key.startsWith('bush') ? 'bush' : null);
const SMOKING = new Set(['townhall', 'barracks', 'sawmill', 'altar', 'forge', 'atelier']); // edificios con chimenea o fogata

// Cuánto se agrandan los dibujos respecto a la casilla (el pack los trae pequeños en su lienzo).
const BUILDING_GROW = 1; // el arte isométrico ya viene al tamaño final
const DECOR_GROW = 1;
const WORKER_GROW = 1;
const POP_MS = 320; // duración de la animación al construir

const joinParts = (parts) => parts.filter(Boolean).join(' · ');

/** «5 soldados · 2 arqueros · Paladín nv. 3, Cazadora nv. 1» */
function armyText(state) {
  const units = ARMY_UNITS.filter((k) => (state.army[k] ?? 0) > 0).map((k) => `${state.army[k]} ${UNITS[k].name.toLowerCase()}${state.army[k] === 1 ? '' : 's'}`);
  const heroes = logic.squadHeroes(state).map((h) => `${HEROES[h.key].name} nv. ${h.level}`);
  return joinParts([...units, ...heroes]) || 'ninguna';
}
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

/** Nombre a mostrar de lo que se entrena en un edificio: unidad, héroe o investigación. */
const trainName = (key) => UNITS[key]?.name ?? HEROES[key]?.name ?? RESEARCH[key]?.name ?? key;
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
    this.heroViews = new Map(); // clave de héroe -> dibujo junto al altar
    this.camp = null;
    this.shrine = null;
    this.modal = null;
    this.toolPage = 0;
    this.leaving = false; // ya se está pasando a otra escena
    this.sheet = null; // hoja de construcción abierta
    this.sheetTab = 0;
  }

  preload() {
    this.load.setPath(ASSET_BASE);
    for (const [key, file] of Object.entries(IMAGES)) this.load.image(key, file);
    for (const [key, file] of Object.entries(SHEETS)) this.load.spritesheet(key, file, { frameWidth: SHEET.frameWidth, frameHeight: SHEET.frameHeight });
    for (const [key, file] of Object.entries(SOUNDS)) this.load.audio(key, file);
  }

  create(data) {
    this.sound.mute = prefs.get().muted;
    this.input.addPointer(1); // permite pellizcar con dos dedos
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D');

    resetView(logic.townHall(store.get()) ?? undefined);

    this.cameras.main.setBackgroundColor(0x8fc0e4); // lo que queda fuera de la isla: cielo
    ensureTextures(this);
    ensureTerrainTextures(this);
    ui.ensureUi(this);
    this.createTerrain();
    this.createDecor();
    this.createLandscape();
    this.clouds = createClouds(this, DEPTH.clouds);
    addVignette(this, DEPTH.vignette);
    this.createHud();
    this.createToolbar();
    this.createPanel();
    this.createZoomButtons();
    this.createQuestBanner();
    this.createRaidBanner();
    this.createTrainStrip();
    this.createToolHint();
    store.holdRaids(false); // de vuelta en la base, los ataques enemigos se reanudan

    this.ghost = this.add.image(0, 0, iconKey('mine')).setAlpha(0.7).setVisible(false).setDepth(DEPTH.ghost);
    this.ghostCell = this.add.graphics().setVisible(false).setDepth(DEPTH.ghost - 1); // rombo verde/rojo bajo la vista previa
    this.selector = this.add.graphics().setVisible(false).setDepth(DEPTH.selector); // rombo blanco de la selección
    this.selectorCell = null;
    this.toast = this.add
      .text(LAYOUT.width / 2, LAYOUT.gridTop + 126, '', {
        fontFamily: ui.FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: ui.TXT.light,
        backgroundColor: '#2b1d12f2',
        padding: { x: 14, y: 8 },
        align: 'center',
        wordWrap: { width: LAYOUT.width - 48 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(DEPTH.toast);
    // Los avisos de la página (exportar, importar…) también salen aquí.
    const off = onNotice((text) => this.showToast(text, 2400));
    this.events.once('shutdown', off);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    this.input.on('pointerout', () => !this.gesture && this.hideGhost());

    // La UI HTML (importar / nueva partida) avisa cuando cambia el estado completo.
    const unsubscribe = store.onChange(() => this.rebuildViews());
    this.events.once('shutdown', unsubscribe);

    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refresh() });
    this.time.addEvent({ delay: 5000, loop: true, callback: () => store.persist() });
    this.time.addEvent({ delay: 420, loop: true, callback: () => this.ambientTick() });

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
        `${missionName(r.level)}: ${r.won ? '¡Victoria!' : 'Derrota'} · ${rewardText(r.loot, '+') || 'sin botín'}${r.heroLevelUps ? ' · ¡un héroe sube de nivel!' : ''}`,
      );
    }
    this.rebuildViews();
    // De vuelta de ver la defensa: el informe del ataque.
    if (data?.raidReport) this.time.delayedCall(350, () => this.openRaidReport(data.raidReport));
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

  /** Apoya un dibujo sobre una casilla (ver artPlace.js): su punto de apoyo cae en el centro del rombo. */
  placeOnTile(img, key, x, y, grow) {
    return placeOnTileArt(img, key, x, y, grow);
  }

  /** Dibuja un icono centrado en (cx, cy) que cabe en un cuadrado de `size` px (en pantalla, sin zoom). */
  fitIcon(img, key, cx, cy, size) {
    return fitIconArt(this, img, key, cx, cy, size);
  }

  /* ---------- creación del mundo ---------- */

  createTerrain() {
    this.terrain = [];
    for (let y = 0; y < GRID.rows; y++) {
      for (let x = 0; x < GRID.cols; x++) {
        const img = this.add.image(0, 0, grassKey(x, y)).setDepth(DEPTH.terrain);
        this.terrain.push({ x, y, img });
      }
    }
  }

  /** Árboles, rocas y arbustos: solo adorno. Se ocultan bajo los edificios (ver renderWorld). */
  createDecor() {
    const water = new Set(pondTiles().map((t) => `${t.x},${t.y}`));
    this.decor = generateDecor().filter((d) => !water.has(`${d.x},${d.y}`)).map((d) => {
      const kind = shadowKindOf(d.key);
      return {
        ...d,
        kind,
        img: this.add.image(0, 0, d.key).setDepth(DEPTH.world + depthOf(d.x, d.y)),
        shadow: kind ? this.add.image(0, 0, 'fx_shadow').setDepth(DEPTH.shadow).setVisible(false) : null,
      };
    });
  }

  /** Estanques, flores, caminos de tierra y el borde oscuro del mapa. Todo adorno, bajo los edificios. */
  createLandscape() {
    const T = DEPTH.terrain;
    this.ponds = pondTiles().map((t) => ({ ...t, sand: this.add.image(0, 0, 'iso_sand').setDepth(T + 0.2), water: this.add.image(0, 0, 'iso_water').setDepth(T + 0.3) }));
    this.flowers = flowerSpots().map((f) => ({ ...f, img: this.add.image(0, 0, f.kind === 3 ? 'tuft' : `flower_${f.kind}`).setDepth(T + 0.6) }));
    this.pathImgs = [];
    this.pathList = [];
    this.pathSet = new Set();
    this.pathSig = null;
    this.cliff = this.add.graphics().setDepth(T - 1); // el borde de roca bajo la isla
  }

  /** Recalcula los caminos cuando cambian los edificios (cuesta poco, pero no hace falta cada cuadro). */
  refreshPaths(state) {
    const sig = state.buildings.map((b) => `${b.id}:${b.x},${b.y}`).join('|');
    if (sig === this.pathSig) return;
    this.pathSig = sig;
    this.pathSet = pathTiles(state.buildings);
    this.pathList = [...this.pathSet].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
    while (this.pathImgs.length < this.pathList.length) this.pathImgs.push(this.add.image(0, 0, 'iso_dirt').setDepth(DEPTH.terrain + 0.4));
  }

  /** Coloca el paisaje según la cámara. */
  renderLandscape(state) {
    const z = view.zoom;
    const occupied = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
    this.refreshPaths(state);

    for (const p of this.ponds) {
      const hidden = !isTileVisible(p.x, p.y) || occupied.has(`${p.x},${p.y}`);
      p.sand.setVisible(!hidden);
      p.water.setVisible(!hidden);
      if (hidden) continue;
      const c = tileCenter(p.x, p.y);
      p.sand.setPosition(c.x, c.y).setScale(z * 1.4);
      p.water.setPosition(c.x, c.y).setScale(z * 1.03);
    }
    this.pathImgs.forEach((img, i) => {
      const t = this.pathList[i];
      const show = t && isTileVisible(t.x, t.y);
      img.setVisible(Boolean(show));
      if (show) {
        const c = tileCenter(t.x, t.y);
        img.setPosition(c.x, c.y).setScale(z * 1.03);
      }
    });
    for (const f of this.flowers) {
      const k = `${f.x},${f.y}`;
      const show = isTileVisible(f.x, f.y) && !occupied.has(k) && !this.pathSet.has(k);
      f.img.setVisible(show);
      if (show) this.placeOnTile(f.img, f.kind === 3 ? 'tuft' : `flower_${f.kind}`, f.x + f.ox - 0.5, f.y + f.oy - 0.5, 0.9);
    }
    drawCliff(this.cliff, z);
  }

  /** El agua brilla un poco (el reflejo sube y baja). */
  shimmerWater(timeMs) {
    const t = timeMs / 1000;
    this.ponds.forEach((p, i) => {
      if (p.water.visible) p.water.setAlpha(0.88 + 0.1 * Math.sin(t * 1.7 + i * 1.3));
    });
  }

  /** Crea la sombra de una unidad (aldeano, soldado, héroe). */
  unitShadow() {
    return this.add.image(0, 0, 'fx_shadow').setDepth(DEPTH.shadow).setVisible(false);
  }

  /** Coloca una sombra bajo el punto de apoyo (x, y casillas) de algo. `kind` es una clave de SHADOW. */
  putShadow(shadow, _x, _y, _kind, _scale = 1, _alphaMul = 1) {
    shadow.setVisible(false); // el arte isométrico ya trae su sombra dibujada
  }

  /** Brillo sobre un rectángulo de la interfaz. Se agrega a `parts` si se pasa, para ocultarlo con el resto. */
  gloss(rect, parts, strength = 1) {
    const g = addGloss(this, rect, rect.depth + 0.3, strength);
    parts?.push(g);
    return g;
  }

  /* ---------- interfaz: HUD, barra de abajo, hoja de construcción, panel y carteles ---------- */

  /** Números cortos para el HUD: 12 400 → «12,4k». */
  fmt(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
    if (n >= 10_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
    return String(Math.floor(n));
  }

  createHud() {
    const W = LAYOUT.width;
    const H = LAYOUT.hudHeight;
    const d = DEPTH.ui;
    ui.panel(this, W / 2, H / 2, W, H, 'bar', d, 'bottom');

    // Tres bloques: oro, madera y población. Cada uno con su icono, su cifra y una barrita de llenado.
    const block = (x0, iconName) => {
      ui.icon(this, x0 + 13, 20, iconName, 26, d + 2);
      const amount = ui.label(this, x0 + 32, 20, '', { size: 17, bold: true, color: ui.TXT.gold, origin: [0, 0.5], depth: d + 2 });
      const cap = ui.label(this, x0 + 32, 21, '', { size: 11, color: ui.TXT.dim, origin: [0, 0.5], depth: d + 2 });
      const barBg = this.add.rectangle(x0 + 2, 40, 112, 6, 0x000000, 0.55).setOrigin(0, 0.5).setDepth(d + 2);
      const bar = this.add.rectangle(x0 + 2, 40, 1, 6, 0xffffff).setOrigin(0, 0.5).setDepth(d + 3);
      return { amount, cap, bar, barBg };
    };
    this.hudGold = block(8, 'coin');
    this.hudWood = block(152, 'wood');
    this.hudPop = block(296, 'pop');
    this.buildersText = ui.label(this, W - 8, 47, '', { size: 10, color: ui.TXT.blue, origin: [1, 0.5], depth: d + 2 });
  }

  /** Actualiza las cifras y barritas del HUD. */
  updateHudBlocks(state) {
    const cap = logic.resourceCap(state);
    const fill = (blk, value, max, color, label) => {
      blk.amount.setText(label);
      blk.cap.setX(blk.amount.x + blk.amount.width + 3);
      blk.bar.setFillStyle(color).setSize(Math.max(1, 112 * Math.min(1, value / max)), 6);
    };
    fill(this.hudGold, state.gold, cap, state.gold >= cap ? 0xff8f7d : 0xe6b84f, this.fmt(state.gold));
    this.hudGold.cap.setText(`/${this.fmt(cap)}`);
    fill(this.hudWood, state.wood, cap, state.wood >= cap ? 0xff8f7d : 0xb8864a, this.fmt(state.wood));
    this.hudWood.cap.setText(`/${this.fmt(cap)}`);
    const used = logic.supplyUsed(state);
    const supply = logic.supplyCap(state);
    fill(this.hudPop, used, supply, used >= supply ? 0xff8f7d : 0x9fc8ef, String(used));
    this.hudPop.cap.setText(`/${supply}`);
    this.hudGold.amount.setColor(state.gold >= cap ? ui.TXT.bad : ui.TXT.gold);
    this.hudWood.amount.setColor(state.wood >= cap ? ui.TXT.bad : ui.TXT.wood);
    this.hudPop.amount.setColor(used >= supply ? ui.TXT.bad : ui.TXT.light);
    this.buildersText.setText(`Obreros ${logic.busyBuilders(state)}/${ECONOMY.builders} · Ayunt. ${logic.townHallLevel(state)}`);
  }

  /** Barra de abajo: cinco botones grandes. Construir abre la hoja de edificios. */
  createToolbar() {
    const W = LAYOUT.width;
    const top = LAYOUT.barTop;
    const H = LAYOUT.barHeight;
    const d = DEPTH.ui;
    ui.panel(this, W / 2, top + H / 2, W, H, 'bar', d, 'top');
    const defs = [
      { id: 'build', text: 'Construir', icon: 'hammer', kind: 'green', onClick: () => this.toggleBuildSheet() },
      { id: 'attack', text: 'Atacar', icon: 'swords', kind: 'red', onClick: () => this.openAttackModal() },
      { id: 'heroes', text: 'Héroes', icon: 'crown', kind: 'violet', onClick: () => this.openHeroes() },
      { id: 'quests', text: 'Logros', icon: 'trophy', kind: 'gold', onClick: () => openAchievementsPanel(this) },
      { id: 'menu', text: 'Menú', icon: 'gear', kind: 'dark2', onClick: () => this.openMenu() },
    ];
    const bw = (W - 6 * 6) / 5;
    this.barButtons = {};
    defs.forEach((def, i) => {
      const x = 6 + bw / 2 + i * (bw + 6);
      this.barButtons[def.id] = ui.button(this, { x, y: top + H / 2 + 1, w: bw, h: H - 12, kind: def.kind, icon: def.icon, text: def.text, size: 11, vertical: true, iconSize: 26, depth: d + 1, onClick: def.onClick });
    });
    // Puntito rojo cuando hay un premio de logros listo para reclamar.
    const q = this.barButtons.quests.img;
    this.achievementDot = this.add.circle(q.x + bw / 2 - 8, q.y - (H - 12) / 2 + 8, 6, 0xdd3333).setStrokeStyle(2, 0xffffff).setDepth(d + 4).setVisible(false);
  }

  /** Las ventanas de héroes: con el Altar si hay uno (para invocar), o solo para mirar. */
  openHeroes() {
    const altar = store.get().buildings.find((b) => b.type === 'altar');
    openHeroPanel(this, altar?.id ?? null);
  }

  /* ---- hoja de construcción ---- */

  toggleBuildSheet() {
    if (this.sheet) this.closeBuildSheet();
    else this.openBuildSheet(this.sheetTab ?? 0);
  }

  closeBuildSheet() {
    for (const p of this.sheet?.parts ?? []) p.destroy();
    this.sheet = null;
  }

  openBuildSheet(tab = 0) {
    this.closeBuildSheet();
    this.closeModal();
    this.selectBuilding(null);
    this.sheetTab = tab;
    const W = LAYOUT.width;
    const d = DEPTH.ui + 30;
    const rows = 2;
    const cardH = 108;
    const H = 20 + 38 + 10 + rows * cardH + (rows - 1) * 8 + 14;
    const top = LAYOUT.barTop - H;
    const parts = [];
    const add = (o) => {
      parts.push(o);
      return o;
    };
    this.sheet = { parts };

    // Tocar el mapa fuera de la hoja la cierra.
    add(this.add.rectangle(W / 2, (LAYOUT.gridTop + top) / 2, W, top - LAYOUT.gridTop, 0x000000, 0.01).setDepth(d - 1).setInteractive()).on('pointerdown', () => this.closeBuildSheet());
    const bg = add(ui.panel(this, W / 2, top + H / 2, W, H, 'sheet', d));
    bg.setInteractive();

    const state = store.get();
    const names = TOOL_PAGES.map((p) => p.name);
    const tabW = (W - 24 - 3 * 6) / 4;
    names.forEach((name, i) => {
      const b = ui.button(this, { x: 12 + tabW / 2 + i * (tabW + 6), y: top + 38, w: tabW, h: 34, kind: i === tab ? 'gold' : 'dark2', text: name, size: 12, depth: d + 1, onClick: () => this.openBuildSheet(i) });
      b.objs.forEach(add);
    });
    const del = ui.button(this, { x: 12 + tabW / 2 + 3 * (tabW + 6), y: top + 38, w: tabW, h: 34, kind: this.tool === 'demolish' ? 'red' : 'dark2', text: 'Demoler', icon: 'close', iconSize: 14, size: 12, depth: d + 1, onClick: () => {
      this.closeBuildSheet();
      this.selectTool('demolish');
    } });
    del.objs.forEach(add);

    const tools = TOOL_PAGES[tab].tools;
    const cw = (W - 24 - 2 * 8) / 3;
    tools.forEach((tool, i) => {
      const def = BUILDINGS[tool];
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 12 + cw / 2 + col * (cw + 8);
      const y = top + 62 + cardH / 2 + row * (cardH + 8);
      const count = logic.countOf(state, tool);
      const limit = logic.limitFor(state, tool);
      const locked = limit === 0;
      const full = !locked && count >= limit;
      const can = logic.canAfford(state, def.cost);
      const card = add(ui.panel(this, x, y, cw, cardH, 'dark', d + 1));
      card.setInteractive({ useHandCursor: true });
      const icon = add(this.add.image(0, 0, iconKey(tool)).setDepth(d + 2));
      this.fitIcon(icon, iconKey(tool), x, y - 22, 50);
      add(ui.label(this, x, y + 14, def.shortName ?? def.name, { size: 13, bold: true, origin: [0.5, 0.5], align: 'center', depth: d + 2, color: locked ? ui.TXT.faint : ui.TXT.light }));
      // costos
      const items = ['gold', 'wood'].filter((r) => (def.cost[r] ?? 0) > 0);
      items.forEach((res, k) => {
        const cx = items.length === 1 ? x : x + (k === 0 ? -(cw / 4) : cw / 4);
        add(ui.icon(this, cx - 15, y + 34, res === 'gold' ? 'coin' : 'wood', 14, d + 2));
        add(ui.label(this, cx - 5, y + 34, this.fmt(def.cost[res]), { size: 12, bold: true, origin: [0, 0.5], depth: d + 2, color: state[res] < def.cost[res] ? ui.TXT.bad : res === 'gold' ? ui.TXT.gold : ui.TXT.wood }));
      });
      add(ui.label(this, x + cw / 2 - 8, y - cardH / 2 + 8, locked ? '' : `${count}/${limit}`, { size: 11, bold: true, origin: [1, 0], depth: d + 2, color: full ? ui.TXT.bad : ui.TXT.dim }));
      if (locked) {
        const need = logic.unlockLevel(tool);
        add(this.add.rectangle(x, y, cw - 4, cardH - 4, 0x000000, 0.55).setDepth(d + 3));
        add(ui.icon(this, x, y - 14, 'lock', 24, d + 4));
        add(ui.label(this, x, y + 12, need ? `Ayuntamiento ${need}` : '—', { size: 11, bold: true, origin: [0.5, 0.5], depth: d + 4, color: ui.TXT.gold }));
      } else if (full || !can) card.setAlpha(0.8);
      card.on('pointerdown', () => {
        ui.haptic();
        if (locked) {
          const need = logic.unlockLevel(tool);
          this.showToast(need ? `${def.name}: pide ${logic.displayName('townhall', need)} (nivel ${need})` : `Aún no puedes construir ${def.name}`);
          this.play('error');
        } else if (full) {
          this.showToast(`Límite de ${def.name}: ${limit}. Mejora el Ayuntamiento`);
          this.play('error');
        } else {
          this.play('select');
          this.closeBuildSheet();
          this.selectTool(tool);
        }
      });
    });
    this.play('select');
  }

  /** Aviso fijo mientras estás colocando algo: qué es y cómo cancelar. */
  createToolHint() {
    const W = LAYOUT.width;
    const y = LAYOUT.gridTop + 76;
    const d = DEPTH.zoomButtons;
    const bg = ui.panel(this, W / 2 - 24, y, 288, 34, 'pill', d);
    const text = ui.label(this, W / 2 - 24, y, '', { size: 12, bold: true, origin: [0.5, 0.5], align: 'center', depth: d + 1 });
    const cancel = ui.button(this, { x: W / 2 + 142, y, w: 38, h: 34, kind: 'red', icon: 'close', iconSize: 16, depth: d + 1, onClick: () => this.selectTool(null) });
    this.toolHint = { parts: [bg, text, ...cancel.objs], text, cancel };
    for (const p of this.toolHint.parts) p.setVisible(false);
  }

  showToolHint() {
    const tool = this.tool;
    const show = Boolean(tool);
    for (const p of this.toolHint.parts) p.setVisible(show);
    if (!show) return;
    this.toolHint.text.setText(tool === 'demolish' ? 'Demoler: toca un edificio' : tool === 'wall' || tool === 'gate' ? `${BUILDINGS[tool].name}: toca o arrastra` : `${BUILDINGS[tool].name}: toca una casilla`);
  }

  /** Panel del edificio elegido: una hoja sobre la barra, con su detalle y el botón de mejorar. */
  createPanel() {
    const W = LAYOUT.width;
    const H = 136;
    const top = LAYOUT.barTop - H;
    const d = DEPTH.panel;
    const parts = [];
    const add = (o) => {
      parts.push(o);
      return o;
    };

    const bg = add(ui.panel(this, W / 2, top + H / 2, W, H, 'sheet', d));
    bg.setInteractive(); // para que los toques no atraviesen hacia el mapa
    const icon = add(this.add.image(0, 0, iconKey('mine')).setDepth(d + 1));
    const title = add(ui.label(this, 86, top + 14, '', { size: 16, bold: true, depth: d + 1, color: ui.TXT.gold }));
    const detail = add(ui.label(this, 86, top + 38, '', { size: 12, color: ui.TXT.light, depth: d + 1, wrap: W - 86 - 134, lineSpacing: 4 }));
    const hint = add(ui.label(this, 86, top + H - 14, 'Mantén pulsado y arrastra para moverlo', { size: 10, color: ui.TXT.faint, origin: [0, 0.5], depth: d + 1 }));

    const up = ui.button(this, { x: W - 76, y: top + 86, w: 124, h: 66, kind: 'blue', text: '', size: 12, depth: d + 1, onClick: () => this.onUpgradeClick() });
    up.objs.forEach(add);
    const close = ui.button(this, { x: W - 26, y: top + 22, w: 34, h: 30, kind: 'red', icon: 'close', iconSize: 14, depth: d + 1, onClick: () => {
      this.play('close');
      this.selectBuilding(null);
    } });
    close.objs.forEach(add);
    parts.forEach((p) => p.setVisible(false));

    // El botón de mejorar se maneja como un solo objeto (ver updatePanel).
    const upgradeBtn = {
      get visible() {
        return up.img.visible;
      },
      setVisible(v) {
        up.setVisible(v);
        return upgradeBtn;
      },
      setAlpha(a) {
        up.setEnabled(a >= 1);
        return upgradeBtn;
      },
    };
    const upgradeLabel = {
      setText(t) {
        up.setText(t);
        return upgradeLabel;
      },
      setVisible() {
        return upgradeLabel;
      },
      setAlpha() {
        return upgradeLabel;
      },
    };
    this.panel = { parts, icon, title, detail, hint, upgradeBtn, upgradeLabel, cy: top + 46, top };
  }

  /** Botones redondos a la derecha del mapa (zoom, centrar) y el de recolectar. */
  createZoomButtons() {
    const W = LAYOUT.width;
    const x = W - 26;
    const top = LAYOUT.gridTop + 116;
    const d = DEPTH.zoomButtons;
    const center = () => ({ x: W / 2, y: LAYOUT.gridTop + LAYOUT.viewHeight / 2 });
    const zoom = (factor) => {
      const c = center();
      zoomAt(c.x, c.y, view.zoom * factor);
      this.viewDirty = true;
    };
    const round = (y, name, onClick) => ui.button(this, { x, y, w: 40, h: 40, kind: 'dark2', icon: name, iconSize: 20, depth: d, onClick });
    round(top, 'plus', () => zoom(1.25));
    round(top + 46, 'minus', () => zoom(0.8));
    round(top + 92, 'home', () => {
      resetView(logic.townHall(store.get()) ?? undefined);
      this.viewDirty = true;
    });

    // Recolectar todo: abajo a la derecha, a mano del pulgar.
    this.collectBtn = ui.button(this, { x: W - 66, y: LAYOUT.barTop - 36, w: 116, h: 46, kind: 'gold', icon: 'coin', iconSize: 22, text: 'Recolectar', size: 12, depth: d, onClick: () => this.doAction(
      () => logic.collectAll(store.get()),
      (r) => [r.gold > 0 && `+${r.gold} de oro`, r.wood > 0 && `+${r.wood} de madera`].filter(Boolean).join(' · '),
      'collect_all',
    ) });
  }

  /* ---- ventanas ---- */

  /** Ventana con título, texto y botones (ver ui.dialog). */
  dialog(o) {
    return ui.dialog(this, o);
  }

  /** Ventana para confirmar el ataque: muestra al enemigo y tus tropas. */
  openAttackModal() {
    if (this.modal) return;
    const state = store.get();
    const level = nextCampaignLevel(state);
    const mission = generateMission(level);
    const ready = canAttack(state);
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const lines = [
      `Enemigo: ${plural(mission.buildings.filter((b) => b.type !== 'wall').length, 'edificio', 'edificios')} · ${plural(mission.buildings.filter((b) => b.type === 'tower').length, 'torre', 'torres')} · ${plural(mission.defenders.length, 'defensor', 'defensores')}`,
      `Mejor: ${'★'.repeat(state.campaign.stars[level] ?? 0)}${'☆'.repeat(3 - (state.campaign.stars[level] ?? 0))}  (Ayuntamiento · 50 % · 100 %)`,
      ready ? `Tus tropas: ${armyText(state)}` : 'No tienes tropas: entrénalas en tus edificios militares',
    ];
    this.dialog({
      title: missionName(level),
      icon: 'swords',
      lines,
      buttons: ready
        ? [{ text: 'Atacar', kind: 'red', onClick: () => this.startBattle(level), close: false }, { text: 'Cancelar', kind: 'dark2' }]
        : [{ text: 'Cerrar', kind: 'dark2' }],
    });
  }

  /** Menú: sonido, exportar, importar y empezar de nuevo (usa los botones de la página, que están ocultos). */
  openMenu() {
    this.dialog({
      title: 'Menú',
      icon: 'gear',
      vertical: true,
      width: 330,
      buttons: [
        { text: `Sonido: ${isSoundOn() ? 'sí' : 'no'}`, kind: 'dark2', onClick: () => runMenu('toggleSound') },
        { text: 'Exportar partida', kind: 'blue', onClick: () => runMenu('export') },
        { text: 'Importar partida', kind: 'blue', onClick: () => runMenu('import') },
        { text: 'Nueva partida', kind: 'red', onClick: () => runMenu('reset') },
        { text: 'Cerrar', kind: 'dark2' },
      ],
    });
  }

  closeModal() {
    for (const p of this.modal ?? []) p.destroy();
    this.modal = null;
  }

  /** Un ataque enemigo llegó mientras jugabas: se ve cómo tu base se defiende. */
  startDefense(report) {
    if (this.leaving) return;
    this.leaving = true;
    store.persist();
    this.closeModal();
    this.closeBuildSheet();
    this.scene.start('BattleScene', { report });
  }

  startBattle(level) {
    store.persist(); // guarda la base antes de salir
    this.closeModal();
    this.closeBuildSheet();
    this.scene.start('BattleScene', { level });
  }

  /* ---- carteles: misión y ataque enemigo ---- */

  /** Etiqueta de la misión en curso, arriba a la izquierda del mapa. */
  createQuestBanner() {
    const W = LAYOUT.width;
    const x = 6;
    const y = LAYOUT.gridTop + 6;
    const w = W - 12 - 104;
    const h = 40;
    const d = DEPTH.zoomButtons;
    const bg = ui.panel(this, x + w / 2, y + h / 2, w, h, 'card', d).setInteractive({ useHandCursor: true });
    const ic = ui.icon(this, x + 22, y + h / 2, 'scroll', 24, d + 1);
    const title = ui.label(this, x + 42, y + 6, '', { size: 12, bold: true, color: ui.TXT.gold, depth: d + 1, wrap: w - 50 });
    const detail = ui.label(this, x + 42, y + 23, '', { size: 11, color: ui.TXT.dim, depth: d + 1, wrap: w - 50 });
    title.setMaxLines(1);
    detail.setMaxLines(1);
    bg.on('pointerdown', () => {
      ui.haptic();
      this.onQuestClick();
    });
    this.questBanner = { bg, title, detail, ic, parts: [bg, ic, title, detail] };
  }

  updateQuestBanner() {
    const state = store.get();
    const { bg, title, detail, ic, parts } = this.questBanner;
    const quest = quests.currentQuest(state);
    for (const p of parts) p.setVisible(Boolean(quest));
    if (!quest) return;

    const progress = quests.questProgress(state, quest);
    const { claimed, total } = quests.questCounts(state);
    title.setText(`Misión ${claimed + 1}/${total} · ${quest.text}`);
    detail.setText(progress.done ? `¡Cumplida! Toca para reclamar ${rewardText(quest.reward, '+')}` : `${progress.current}/${progress.target} · Premio: ${rewardText(quest.reward)}`);
    detail.setColor(progress.done ? ui.TXT.good : ui.TXT.dim);
    bg.setTint(progress.done ? 0xb8ffb8 : 0xffffff);
    ic.setTexture(progress.done ? 'ic_check' : 'ic_scroll');

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

  /** A la derecha de la misión: cuenta regresiva del próximo ataque y, si hay, lo dañado (se toca para reparar). */
  createRaidBanner() {
    const W = LAYOUT.width;
    const w = 96;
    const x = W - 6 - w;
    const y = LAYOUT.gridTop + 6;
    const d = DEPTH.zoomButtons;
    const bg = ui.panel(this, x + w / 2, y + 20, w, 40, 'card', d).setInteractive({ useHandCursor: true });
    const ic = ui.icon(this, x + 18, y + 20, 'warning', 22, d + 1);
    const line1 = ui.label(this, x + 33, y + 20, '', { size: 14, bold: true, color: ui.TXT.bad, origin: [0, 0.5], depth: d + 1 });
    const fix = ui.panel(this, x + w / 2, y + 62, w, 30, 'card', d).setInteractive({ useHandCursor: true });
    const fixIc = ui.icon(this, x + 18, y + 62, 'wrench', 18, d + 1);
    const fixText = ui.label(this, x + 32, y + 62, '', { size: 12, bold: true, color: '#ffcf8a', origin: [0, 0.5], depth: d + 1 });
    const click = () => {
      ui.haptic();
      this.onRaidBannerClick();
    };
    bg.on('pointerdown', click);
    fix.on('pointerdown', click);
    this.raidBanner = { bg, line1, ic, fix, fixIc, fixText };
  }

  updateRaidBanner() {
    const state = store.get();
    const ms = raidCountdownMs(state, Date.now());
    const imminent = ms <= 60_000;
    const damaged = logic.damagedBuildings(state);
    const { bg, line1, ic, fix, fixIc, fixText } = this.raidBanner;
    line1.setText(logic.formatDuration(ms));
    line1.setColor(imminent ? '#ffe08a' : ui.TXT.bad);
    bg.setTint(imminent ? 0xffe9a0 : 0xffffff);
    ic.setTint(imminent ? 0xffd24d : 0xffffff);
    const anyDamage = damaged.length > 0;
    for (const p of [fix, fixIc, fixText]) p.setVisible(anyDamage);
    if (anyDamage) fixText.setText(`${damaged.length} · reparar`);
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
      this.showToast(`Próximo ataque enemigo: fuerza ${raidLevel(state)}. Torres, muros y tropas ayudan a defender.`, 2600);
      this.play('select');
    }
  }

  /** Informe de un ataque enemigo ya resuelto. */
  openRaidReport(r) {
    const state = store.get();
    const good = r.outcome === 'repelled';
    const title = { repelled: '¡Rechazaste el ataque!', retreated: 'El enemigo se retiró', raided: '¡Tumbaron tu Ayuntamiento!' }[r.outcome];
    const stolen = rewardText(r.stolen);
    const lines = [
      `Fuerza ${r.level} · atacantes derrotados: ${r.kills}`,
      r.damaged ? `Edificios dañados: ${r.damaged}` : 'Ningún edificio dañado',
      stolen ? `Robaron: ${stolen}` : 'No robaron nada',
      r.heroes?.length && r.xp ? `Héroes: +${r.xp} XP${r.heroLevelUps ? ' · ¡SUBEN DE NIVEL!' : ''}` : null,
    ].filter(Boolean);
    const hurt = logic.damagedBuildings(state).length > 0;
    this.dialog({
      title,
      icon: good ? 'shield' : 'warning',
      tone: good ? 'good' : 'bad',
      lines,
      buttons: hurt
        ? [{ text: `Reparar todo\n${logic.formatCost(logic.repairAllCost(state))}`, kind: 'gold', onClick: () => this.onRaidBannerClick() }, { text: 'Cerrar', kind: 'dark2' }]
        : [{ text: 'Cerrar', kind: 'dark2' }],
    });
  }

  /* ---------- entrenar unidades ---------- */

  /** Tarjetas para entrenar: aparecen sobre el panel al elegir un edificio militar, el altar o la herrería. */
  createTrainStrip() {
    const W = LAYOUT.width;
    const gap = 6;
    const cardW = (W - 12 - 2 * gap) / 3;
    const cardH = 88;
    const y = this.panel.top - cardH / 2 - 6;
    const d = DEPTH.panel - 5;
    this.trainCards = [0, 1, 2].map((i) => {
      const left = 6 + i * (cardW + gap);
      const cx = left + cardW / 2;
      const rect = ui.panel(this, cx, y, cardW, cardH, 'card', d).setInteractive({ useHandCursor: true });
      const icon = this.add.image(0, 0, 'unit_soldier').setDepth(d + 1);
      const name = ui.label(this, left + 40, y - cardH / 2 + 8, '', { size: 12, bold: true, depth: d + 1, wrap: cardW - 46 });
      const cost = ui.label(this, left + 8, y - cardH / 2 + 42, '', { size: 11, bold: true, color: ui.TXT.gold, depth: d + 1 });
      const info = ui.label(this, left + 8, y - cardH / 2 + 57, '', { size: 11, color: ui.TXT.blue, depth: d + 1 });
      const stats = ui.label(this, left + 8, y - cardH / 2 + 71, '', { size: 11, color: ui.TXT.dim, depth: d + 1 });
      const card = { rect, icon, name, cost, info, stats, unit: null, ix: left + 22, iy: y - cardH / 2 + 24, parts: [rect, icon, name, cost, info, stats] };
      rect.on('pointerdown', () => {
        ui.haptic();
        this.onTrainClick(card.unit);
      });
      for (const p of card.parts) p.setVisible(false);
      return card;
    });
  }

  /** Muestra lo que entrena el edificio elegido (o esconde las tarjetas si no entrena nada). */
  updateTrainStrip(b) {
    const state = store.get();
    const keys = !b ? [] : b.type === 'altar' ? ['__heroes'] : (BUILDINGS[b.type].trains ?? []);
    const pct = (v) => `${Math.round(v * 100)} %`;
    this.trainCards.forEach((card, i) => {
      const key = keys[i];
      card.unit = key ?? null;
      for (const p of card.parts) p.setVisible(Boolean(key));
      if (!key) return;

      const busy = logic.isTraining(b) || logic.isUpgrading(b) || b.damaged;
      const factor = logic.statsOf(b.type, b.level).trainFactor ?? 1;
      let usable = true;

      if (key === '__heroes') {
        // Un solo botón: abre la ventana de héroes (invocar, escuadra y árboles de poder).
        this.fitIcon(card.icon, 'unit_hero', card.ix, card.iy, 34);
        card.name.setText('Héroes');
        card.cost.setText(`${logic.heroCount(state)}/${HERO_KEYS.length} invocados`);
        card.info.setText(`Escuadra ${state.squad.length}/2`);
        card.stats.setText('Toca para elegir');
      } else if (UNITS[key]) {
        const u = UNITS[key];
        const locked = b.level < u.minLevel;
        const affordable = logic.canAfford(state, u.cost) && logic.supplyUsed(state) + u.supply <= logic.supplyCap(state);
        usable = !locked && !busy && affordable;
        const c = logic.unitCombat(state, key);
        this.fitIcon(card.icon, u.sprite, card.ix, card.iy, 34);
        card.name.setText(`${u.name} nv. ${logic.unitLevel(state, key)}`);
        card.cost.setText(locked ? `Pide nivel ${u.minLevel}` : logic.formatCost(u.cost));
        card.info.setText(`${logic.formatDuration(u.trainSec * factor * 1000)} · Población ${u.supply}`);
        card.stats.setText(`Vida ${c.hp} · Daño ${c.dmg}`);
      } else if (RESEARCH[key]) {
        const r = RESEARCH[key];
        const level = logic.researchLevel(state, key);
        const maxed = level >= Math.min(b.level, 10);
        const step = researchStep(key, level);
        usable = !maxed && !busy && logic.canAfford(state, step.cost);
        this.fitIcon(card.icon, key === 'weapons' ? 'unit_knight' : key === 'armor' ? 'wall_3' : 'tower_2', card.ix, card.iy, 34);
        card.name.setText(`${r.name} ${level}`);
        card.cost.setText(maxed ? (level >= 10 ? 'Al máximo' : 'Mejora la Herrería') : logic.formatCost(step.cost));
        card.info.setText(maxed ? '' : logic.formatDuration(step.sec * factor * 1000));
        card.stats.setText(`Ahora +${pct(level * r.perLevel)}${maxed ? '' : ` → +${pct((level + 1) * r.perLevel)}`}`);
      }
      for (const p of card.parts) p.setAlpha(usable ? 1 : 0.5);
      card.rect.setTint(usable ? 0xffffff : 0x9a8a7a);
    });
  }

  onTrainClick(key) {
    const id = this.selectedId;
    if (id === null || !key) return;
    if (key === '__heroes') {
      openHeroPanel(this, id);
      return;
    }
    this.doAction(
      () => logic.startTraining(store.get(), id, key, Date.now()),
      (r) => `${RESEARCH[key] ? 'Investigando' : 'Entrenando'} ${trainName(key)}: ${logic.formatDuration(r.endsAt - Date.now())}`,
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

  /* ---------- ambiente: viento, humo y fuego ---------- */

  /** Los árboles se mecen con el viento (giran un poco sobre su base). */
  swayTrees(timeMs) {
    const t = timeMs / 1000;
    for (const d of this.decor) {
      if (d.kind === 'tree' && d.img.visible) d.img.setAngle(Math.sin(t * 1.3 + d.x * 0.9 + d.y * 0.6) * 1.6);
      else if (d.kind === 'bush' && d.img.visible) d.img.setAngle(Math.sin(t * 1.6 + d.x * 0.7 + d.y) * 1.0);
    }
  }

  /** Humo en chimeneas y fogatas, y llamas en los edificios dañados. Se llama cada ~400 ms. */
  ambientTick() {
    const z = view.zoom;
    for (const b of store.get().buildings) {
      if (!isTileVisible(b.x, b.y, 0)) continue;
      const c = tileCenter(b.x, b.y);
      const depth = DEPTH.world + depthOf(b.x, b.y) + 0.5;
      const roof = (60 + b.level * 2) * z; // altura aproximada del tejado sobre el centro del rombo
      const spread = (dx) => c.x + (Math.random() - 0.5) * dx * z;
      if (b.damaged) {
        emberPuff(this, spread(30), c.y - 14 * z, depth);
        if (Math.random() < 0.6) smokePuff(this, spread(22), c.y - 26 * z, depth, { color: 0x3a3430, size: 0.8, rise: 46 * z, alpha: 0.6, life: 1900 });
      } else if (logic.isUpgrading(b)) {
        // obras: polvo y astillas
        if (Math.random() < 0.6) smokePuff(this, spread(40), c.y + 4 * z, depth, { color: 0xd8cdb0, size: 0.4, rise: 16 * z, alpha: 0.7, life: 600 });
      } else if (SMOKING.has(b.type) && b.type !== 'forge' && b.type !== 'altar' && Math.random() < 0.55) {
        smokePuff(this, c.x + 8 * z, c.y - roof, depth, { size: 0.55, rise: 36 * z });
      } else if (b.type === 'forge') {
        // la fragua: brasas y chispas
        emberPuff(this, spread(14) + 6 * z, c.y - 22 * z, depth, 0xff8a30);
        if (Math.random() < 0.3) sparkBurst(this, c.x + 8 * z, c.y - 28 * z, depth, 0xffc060, 3);
        if (Math.random() < 0.45) smokePuff(this, c.x - 4 * z, c.y - roof - 10 * z, depth, { color: 0x6a625a, size: 0.5, rise: 40 * z, alpha: 0.5 });
      } else if (b.type === 'altar') {
        // el altar brilla con una luz violeta que sube
        if (Math.random() < 0.7) emberPuff(this, spread(16), c.y - 34 * z, depth, 0xb894ff);
      } else if (b.type === 'mine' && b.stored >= 1 && Math.random() < 0.18) {
        sparkBurst(this, spread(30), c.y - 12 * z, depth, 0xfff0a0, 3); // destellos de oro
      } else if (b.type === 'sawmill' && b.stored >= 1 && Math.random() < 0.3) {
        smokePuff(this, spread(34), c.y + 6 * z, depth, { color: 0xc89a5a, size: 0.25, rise: 16 * z, alpha: 0.8, life: 650 }); // astillas
      }
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
      w.shadow.destroy();
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
        w = { id, key, img, bundle, shadow: this.unitShadow(), state: createWorker(id), plan: p };
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
        w.shadow.setVisible(false);
        continue;
      }
      w.shadow.setVisible(false);
      const sign = w.state.phase === 'back' ? -1 : 1;
      const dx = (site.x - home.x) * sign;
      const dy = (site.y - home.y) * sign;
      const f = pos.moving ? unitFrame('walk', dx, dy, timeMs / 600 + w.id * 0.37) : unitFrame('idle', dx, dy);
      this.placeOnTile(w.img, w.key, pos.x, pos.y, WORKER_GROW)
        .setFrame(f.frame)
        .setDepth(DEPTH.world + depthOf(pos.x, pos.y) + 0.06)
        .setFlipX(f.flipX)
        .setVisible(true);

      // El bulto va sobre la cabeza.
      w.bundle
        .setPosition(w.img.x, w.img.y - 56 * zoom)
        .setScale(zoom)
        .setDepth(w.img.depth + 0.01)
        .setVisible(pos.carrying);
    }
  }

  /* ---------- ejército y héroes ---------- */

  /**
   * El ejército se ve formado cerca del primer cuartel (o del Ayuntamiento si no hay), y los héroes de la
   * escuadra junto al altar. Es solo la representación de `state.army` y `state.squad`.
   */
  syncArmy() {
    const state = store.get();
    const first = (type) => state.buildings.filter((b) => b.type === type).sort((a, b) => a.id - b.id)[0];
    const camp = first('barracks') ?? logic.townHall(state);
    const shrine = first('altar') ?? camp;
    this.camp = camp ? { x: camp.x, y: camp.y } : null;
    this.shrine = shrine ? { x: shrine.x, y: shrine.y } : null;

    // Se muestran como mucho 12 unidades para no saturar la pantalla (las armas de asedio, aparte).
    const want = [];
    for (const u of ARMY_UNITS) for (let i = 0; i < (state.army[u] ?? 0) && want.length < 12; i++) want.push(u);
    const signature = want.join(',');
    if (signature !== this.armySignature) {
      this.armySignature = signature;
      for (const a of this.army ?? []) {
        a.img.destroy();
        a.shadow.destroy();
      }
      this.army = want.map((type, slot) => ({ type, slot, img: this.add.image(0, 0, UNITS[type].sprite, 0).setVisible(false), shadow: this.unitShadow() }));
    }

    // Héroes de la escuadra (como mucho 2).
    const squad = logic.squadHeroes(state);
    for (const [key, v] of this.heroViews) {
      if (squad.some((h) => h.key === key)) continue;
      v.img.destroy();
      v.label.destroy();
      v.shadow.destroy();
      this.heroViews.delete(key);
    }
    squad.forEach((h, slot) => {
      let v = this.heroViews.get(h.key);
      if (!v) {
        v = {
          slot,
          img: this.add.image(0, 0, HEROES[h.key].sprite, 0).setVisible(false),
          shadow: this.unitShadow(),
          label: this.add
            .text(0, 0, '', { fontFamily: FONT, fontSize: '10px', color: '#ffe9a0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
            .setOrigin(0.5)
            .setVisible(false),
        };
        this.heroViews.set(h.key, v);
      }
      v.slot = slot;
      v.key = h.key;
      v.label.setText(`${HEROES[h.key].name} nv. ${h.level}`);
    });
  }

  /**
   * Hace pasear a alguien alrededor de su puesto: camina a un punto cercano, descansa un rato y elige otro.
   * `who` guarda su estado ({ x, y, target, wait, phase }); `home` es su puesto y `radius` cuánto se aleja (casillas).
   * Devuelve { moving, flip } para dibujarlo.
   */
  wander(who, home, radius, dt, speed = 0.5) {
    if (who.x === undefined) {
      who.x = home.x;
      who.y = home.y;
      who.wait = Math.random() * 3;
      who.phase = Math.random() * 6.28;
      who.flip = false;
    }
    let moving = false;
    if (who.wait > 0) who.wait -= dt;
    else if (!who.target) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      who.target = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r * 0.7 };
    } else {
      const dx = who.target.x - who.x;
      const dy = who.target.y - who.y;
      const dist = Math.hypot(dx, dy);
      const move = speed * dt;
      if (dist <= move) {
        who.x = who.target.x;
        who.y = who.target.y;
        who.target = null;
        who.wait = 1.2 + Math.random() * 3.5;
      } else {
        who.x += (dx / dist) * move;
        who.y += (dy / dist) * move;
        who.dx = dx;
        who.dy = dy;
        moving = true;
      }
    }
    // Si el puesto cambió (se movió el cuartel), vuelve poco a poco.
    if (Math.hypot(who.x - home.x, who.y - home.y) > radius * 2.5 + 0.5) {
      who.x += (home.x - who.x) * Math.min(1, dt * 1.5);
      who.y += (home.y - who.y) * Math.min(1, dt * 1.5);
    }
    who.phase += dt * (moving ? 9 : 2);
    return moving;
  }

  /** Coloca (cada cuadro) al ejército y a los héroes: pasean alrededor de su puesto, rebotando al caminar. */
  animateArmy(timeMs, dt = 0.016) {
    const zoom = view.zoom;
    if (this.camp) {
      for (const a of this.army ?? []) {
        const col = a.slot % 4;
        const row = Math.floor(a.slot / 4);
        const home = { x: this.camp.x + 1.3 + col * 0.75, y: this.camp.y + 0.2 + row * 0.8 };
        const moving = this.wander(a, home, 0.25, dt, 0.4);
        if (!isTileVisible(Math.round(a.x), Math.round(a.y))) {
          a.img.setVisible(false);
          a.shadow.setVisible(false);
          continue;
        }
        a.shadow.setVisible(false);
        const f = moving ? unitFrame('walk', a.dx ?? 1, a.dy ?? 0, a.phase / (Math.PI * 2)) : unitFrame('idle', a.dx ?? 1, a.dy ?? 0);
        this.placeOnTile(a.img, UNITS[a.type].sprite, a.x, a.y, WORKER_GROW).setFrame(f.frame).setDepth(DEPTH.world + depthOf(a.x, a.y) + 0.06).setVisible(true).setFlipX(f.flipX);
      }
    }
    if (!this.shrine) return;
    for (const [key, h] of this.heroViews) {
      const sprite = HEROES[key].sprite;
      const home = { x: this.shrine.x + 0.55 + h.slot * 0.7, y: this.shrine.y + 1.25 };
      const moving = this.wander(h, home, 0.4, dt, 0.4);
      const visible = isTileVisible(Math.round(h.x), Math.round(h.y));
      h.img.setVisible(visible);
      h.label.setVisible(visible);
      if (!visible) h.shadow.setVisible(false);
      if (visible) {
        h.shadow.setVisible(false);
        const f = moving ? unitFrame('walk', h.dx ?? 1, h.dy ?? 0, h.phase / (Math.PI * 2)) : unitFrame('idle', h.dx ?? 1, h.dy ?? 0);
        this.placeOnTile(h.img, sprite, h.x, h.y, WORKER_GROW).setFrame(f.frame).setDepth(DEPTH.world + depthOf(h.x, h.y) + 0.06).setFlipX(f.flipX);
        h.label.setPosition(h.img.x, h.img.y - 70 * zoom).setScale(zoom).setDepth(h.img.depth + 0.01);
      }
    }
  }

  /* ---------- selección ---------- */

  selectTool(tool) {
    this.tool = tool;
    this.hideGhost();
    this.showToolHint();
    if (tool) this.selectBuilding(null);
  }

  selectBuilding(id) {
    this.selectedId = id;
    const state = store.get();
    const b = id === null ? null : state.buildings.find((x) => x.id === id);
    if (!b) this.selectedId = null;

    if (this.selectedId !== null) this.closeBuildSheet();
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
      lines.push(`${lim('mine', 'Minas')} · ${lim('sawmill', 'Aserraderos')} · ${lim('house', 'Casas')}`);
      lines.push(`${lim('storage', 'Almacenes')} · ${lim('tower', 'Torres')} · ${lim('wall', 'Muros')}`);
      const unlocked = ['barracks', 'archery', 'atelier', 'stable', 'siege'].filter((t) => logic.limitFor(state, t) > 0).length;
      lines.push(`Militar ${unlocked}/5 tipos · Héroes hasta el nivel ${logic.heroLevelCap(state)}`);
      return lines;
    }

    const unitKinds = BUILDINGS[b.type].trains?.filter((k) => UNITS[k]) ?? [];
    let own = null;
    if (unitKinds.length) {
      const c = logic.unitCombat(state, unitKinds[0]);
      const faster = stats.trainFactor ? ` · ${Math.round((1 - stats.trainFactor) * 100)} % más rápido` : '';
      own = `Unidades nivel ${logic.unitLevel(state, unitKinds[0])}: vida ${c.hp}, daño ${c.dmg}${faster}`;
    } else if (b.type === 'forge') {
      const r = (k, label) => `${label} ${logic.researchLevel(state, k)}`;
      own = `${r('weapons', 'Armas')} · ${r('armor', 'Armaduras')} · ${r('fortify', 'Fortif.')} (máx. nv. ${b.level})`;
    } else if (b.type === 'altar') {
      own = `Héroes ${logic.heroCount(state)}/${HERO_KEYS.length} · escuadra ${state.squad.length}/2 · invocas con el Altar nv. ${b.level}`;
    } else {
      own = {
        wall: 'Bloquea el paso y frena al enemigo',
        gate: 'Paso para tus unidades',
        tower: 'Dispara a los atacantes de tu base',
      }[b.type];
    }
    lines.push(own ?? describe(stats) ?? '');

    if (!next) lines.push('Nivel máximo');
    else if (b.level >= logic.townHallLevel(state)) lines.push(`Para el nivel ${b.level + 1}, sube antes el Ayuntamiento`);
    else if (unitKinds.length) {
      const unlocks = unitKinds.filter((u) => UNITS[u].minLevel === b.level + 1).map((u) => UNITS[u].name);
      const faster = next.trainFactor ? `entrena ${Math.round((1 - next.trainFactor) * 100)} % más rápido` : null;
      lines.push(`Nivel ${b.level + 1}: ${unlocks.length ? `desbloquea ${unlocks.join(', ')}` : `unidades más fuertes${faster ? `, ${faster}` : ''}`}`);
    } else if (b.type === 'altar') {
      const heroes = HERO_KEYS.filter((k) => HEROES[k].altarLevel === b.level + 1).map((k) => HEROES[k].name);
      lines.push(`Nivel ${b.level + 1}: ${heroes.length ? `desbloquea a ${heroes.join(', ')}` : 'más resistencia'}`);
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

    this.fitIcon(icon, spriteOf(b), 44, cy, 64);
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
      const verb = RESEARCH[b.training.unit] ? 'Investigando' : HEROES[b.training.unit] ? 'Invocando a' : 'Entrenando';
      detail.setText(`${verb} ${trainName(b.training.unit)}…\nTermina en ${logic.formatDuration(b.training.endsAt - Date.now())}`);
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

    // Con el dedo, un edificio solo se mueve tras mantenerlo pulsado (si no, arrastrar desplaza el mapa).
    g.armed = !pointer.wasTouch;
    if (g.intent === 'building' && !g.armed) {
      this.time.delayedCall(CAMERA.holdToMoveMs, () => {
        if (this.gesture !== g || g.mode !== 'pending') return;
        g.armed = true;
        this.selectBuilding(g.buildingId);
        this.play('select');
        try {
          navigator.vibrate?.(25);
        } catch {
          /* sin vibración */
        }
      });
    }
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
      if (g.intent === 'building' && g.armed) this.beginMove(g);
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
        sparkBurst(this, c.x, c.y - tileSize() * 0.2, DEPTH.ghost - 5, r.resource === 'gold' ? 0xffe08a : 0xe0b070);
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
      this.hideGhost();
      return;
    }
    const other = logic.buildingAt(state, tile.x, tile.y);
    const ok = !other || other.id === b.id;
    this.showGhost(spriteOf(b), tile, ok);
  }

  completeMove(pointer) {
    const id = this.movingId;
    this.movingId = null;
    this.hideGhost();
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
    this.hideGhost();
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
      if (this.gesture?.mode !== 'move') this.hideGhost();
      return;
    }
    const ok = logic.placementError(store.get(), this.tool, tile.x, tile.y) === null;
    this.showGhost(iconKey(this.tool), tile, ok);
  }

  hideGhost() {
    this.ghost.setVisible(false);
    this.ghostCell.clear().setVisible(false);
  }

  /** Vista previa de un edificio sobre una casilla: el dibujo semitransparente y el rombo verde (cabe) o rojo (no cabe). */
  showGhost(key, tile, ok) {
    this.placeOnTile(this.ghost, key, tile.x, tile.y, BUILDING_GROW).setAlpha(0.78).setDepth(DEPTH.ghost).setVisible(true).clearTint();
    this.ghostCell.clear().setVisible(true);
    strokeCell(this.ghostCell, tile.x, tile.y, ok ? 0x66ee66 : 0xff5a5a, 1, Math.max(2, 3 * view.zoom), 0.4);
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
        const done = store.get().buildings.find((x) => x.id === e.id);
        if (done && isTileVisible(done.x, done.y, 0)) {
          const c = tileCenter(done.x, done.y);
          sparkBurst(this, c.x, c.y - tileSize() * 0.2, DEPTH.ghost - 5, 0x9fd8ff, 14);
        }
      } else if (e.type === 'raid') {
        if (e.report.live && e.report.replay) this.startDefense(e.report); // llegó mientras jugabas: se ve la pelea
        else this.openRaidReport(e.report); // llegó mientras no estabas: solo el informe
      } else if (e.type === 'trained') {
        out.push(
          HEROES[e.unit]
            ? `¡${HEROES[e.unit].name} ha llegado!`
            : RESEARCH[e.unit]
              ? `Investigación completada: ${RESEARCH[e.unit].name}`
              : `${trainName(e.unit)} listo para el combate`,
        );
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
      const shadow = this.add.image(0, 0, 'fx_shadow').setDepth(DEPTH.shadow);
      const hammer = this.add.image(0, 0, 'ic_hammer').setDepth(depth + 0.6).setVisible(false);
      this.views.set(b.id, { type: b.type, objects: [sprite, crate, badge, level, sub, bar, shadow, hammer], sprite, crate, badge, level, sub, bar, shadow, hammer, depth });

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
    this.achievementDot.setVisible(claimableCount(store.get()) > 0);
    this.syncWorkers();
    this.syncArmy();
    if (this.selectedId !== null) this.updatePanel();
    this.renderWorld();
  }

  updateHud() {
    this.updateHudBlocks(store.get());
  }

  /**
   * Coloca todo el mundo según la cámara y el estado: terreno, adornos, edificios y selección.
   * Se llama cuando cambia el estado (cada 250 ms o tras una acción) y cuando se mueve la cámara.
   */
  renderWorld() {
    const state = store.get();
    const zoom = view.zoom;

    for (const t of this.terrain) {
      const visible = isTileVisible(t.x, t.y, 0);
      t.img.setVisible(visible);
      if (!visible) continue;
      const c = tileCenter(t.x, t.y);
      t.img.setPosition(c.x, c.y).setScale(zoom * 1.015); // un poco más grande: evita rendijas entre casillas
    }

    this.renderLandscape(state);

    const occupied = new Set(state.buildings.map((b) => `${b.x},${b.y}`));
    for (const d of this.decor) {
      const visible = isTileVisible(d.x, d.y) && !occupied.has(`${d.x},${d.y}`);
      d.img.setVisible(visible);
      if (visible) this.placeOnTile(d.img, d.key, d.x, d.y, DECOR_GROW);
      if (d.shadow) {
        if (visible) this.putShadow(d.shadow, d.x, d.y, d.kind);
        else d.shadow.setVisible(false);
      }
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
      this.putShadow(v.shadow, b.x, b.y, 'building', b.type === 'wall' || b.type === 'gate' ? 0.8 : 1, this.movingId === b.id ? 0.4 : 1);
      if (b.damaged) v.sprite.setTint(DAMAGED_TINT); // dañado: oscuro y chamuscado
      else if (stats.tint) v.sprite.setTint(stats.tint); // los niveles 4 y 5 se ven dorados
      else v.sprite.clearTint();
      v.sprite.setAlpha(this.movingId === b.id ? 0.35 : upgrading ? 0.35 : 1);
      this.placeOnTile(v.crate, 'crate', b.x, b.y, 0.8).setVisible(upgrading);
      // Mientras se mejora, un martillo golpea sobre el edificio.
      const swing = Math.abs(Math.sin(this.time.now / 170));
      v.hammer.setVisible(upgrading).setPosition(c.x + 10 * zoom, c.y - 74 * zoom - swing * 6 * zoom).setDisplaySize(24 * zoom, 24 * zoom).setAngle(-35 + swing * 55).setDepth(v.depth + 0.6);

      // Nivel (en el vértice derecho del rombo), texto y barra bajo el edificio.
      v.badge.setPosition(c.x + 40 * zoom, c.y + 2 * zoom).setScale(zoom);
      v.level.setPosition(v.badge.x, v.badge.y).setScale(zoom).setText(String(b.level));
      v.sub.setPosition(c.x, c.y + 31 * zoom).setScale(zoom);

      const bw = 50 * zoom;
      const bx = c.x - bw / 2;
      const by = c.y + 17 * zoom;
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
        const total = (logic.trainSecOf(state, b.training.unit) ?? 1) * 1000 * (stats.trainFactor ?? 1);
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

    const selected = this.selectedId !== null && state.buildings.find((b) => b.id === this.selectedId);
    if (selected) {
      this.selector.clear().setVisible(isTileVisible(selected.x, selected.y, 0));
      strokeCell(this.selector, selected.x, selected.y, 0xffffff, 1, Math.max(2, 3 * zoom), 0.18);
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
    this.animateArmy(this.time.now, Math.min(delta, 250) / 1000);
    stepClouds(this.clouds, Math.min(delta, 250) / 1000);
    this.swayTrees(this.time.now);
    this.shimmerWater(this.time.now);

    if (this.pop.size || logic.busyBuilders(store.get())) this.viewDirty = true; // hay animaciones de construcción o de obras en curso
    if (this.viewDirty) {
      this.viewDirty = false;
      this.renderWorld();
    }
  }
}
