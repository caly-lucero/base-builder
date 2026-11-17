import Phaser from 'phaser';
import { ARMY_UNITS, CAMERA, GRID, LAYOUT, RAID, STARS } from '../data/config.js';
import { HEROES } from '../data/heroes.js';
import { abilityStatus, advanceBattle, attackers, battleStatus, castHeroAbility, clearOrders, createBattle, defenderUnits, orderAttack, orderMove, retreat, unitIdsOfKinds } from '../game/battle.js';
import { applyBattleResult } from '../game/campaign.js';
import { formatDuration, squadHeroes, statsOf, unitCombat } from '../game/logic.js';
import { generateMission, missionName } from '../game/missions.js';
import * as prefs from '../game/prefs.js';
import { depthOf, inViewport, isTileVisible, panBy, resetView, screenToTile, tileBase, tileCenter, tileSize, view, zoomAt } from '../game/projection.js';
import { unitFrame } from '../game/unitArt.js';
import * as store from '../game/store.js';
import { fitIcon as fitIconArt, placeOnTile as placeOnTileArt } from './artPlace.js';
import { drawCliff, ensureTerrainTextures, grassKey } from './terrainArt.js';
import * as ui from './ui.js';
import { addGloss, addVignette, emberPuff, ensureTextures, smokePuff, sparkBurst } from './look.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const DEPTH = { terrain: 0, shadow: 8, world: 10, fx: 60, vignette: 90, ui: 150, buttons: 160, modal: 400 };
const COLORS = { hud: 0x243624, button: 0x324a32, on: 0x5a7a3a, ok: 0x66dd66, bad: 0xdd5555, gold: 0xd4a017 };
const TEXT = { gold: '#ffe9a0', wood: '#e8c79a', normal: '#e8eee0', bad: '#ff8a7a' };

// Los edificios enemigos usan los mismos dibujos que los tuyos, teñidos de rojo.
const BUILDING_SPRITE = {
  hall: 'townhall_2', tower: 'tower_2', wall: 'wall_2', mine: 'mine_2',
  sawmill: 'sawmill_1', storage: 'storage_1', barracks: 'barracks_2', house: 'house_1',
};
const UNIT_SPRITE = {
  soldier: 'unit_soldier', archer: 'unit_archer', mage: 'unit_mage', knight: 'unit_knight', catapult: 'unit_catapult', ram: 'unit_ram',
  guard: 'enemy_guard', brute: 'enemy_brute', bowman: 'enemy_archer', shaman: 'enemy_shaman', spider: 'enemy_spider',
};
/** Dibujo de una unidad de la batalla: cada héroe tiene el suyo. */
const unitSprite = (e) => (e.type === 'hero' ? HEROES[e.heroKey].sprite : UNIT_SPRITE[e.type]);
const ENEMY_TINT = 0xffa890; // los edificios de la Horda: los mismos dibujos, teñidos de rojizo
const DAMAGED_TINT = 0x8a7a72;
const RAID_CENTER = { x: 12, y: 9 }; // en una defensa se ve tu base con el borde de arriba, por donde llega el enemigo
const RAID_ZOOM = 0.7;
const UNIT_GROW = 1; // el arte isométrico ya viene al tamaño final
const BUILDING_GROW = 1;
const START_ZOOM = 0.6;
const START_CENTER = { x: 12, y: 13.5 }; // deja ver la base enemiga arriba y el desembarco abajo

const rewardText = (r, sign = '') =>
  [r.gold > 0 && `${sign}${r.gold} oro`, r.wood > 0 && `${sign}${r.wood} madera`].filter(Boolean).join(' · ');

export default class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    // `report` (con su `replay`) = defensa de tu base contra un ataque enemigo; si no, un ataque tuyo.
    this.raid = data?.report?.replay ? data.report : null;
    this.level = this.raid ? this.raid.level : (data?.level ?? 1);
    this.entries = new Map(); // id -> { ent, img, rubble, baseTint, lastX }
    this.selection = new Set();
    this.activeChip = null;
    this.gesture = null;
    this.boxMode = false;
    this.speed = 1;
    this.finished = false;
    this.report = null;
    this.flash = new Map(); // id -> instante hasta el que se ve el destello de golpe
    this.markers = []; // marcas de órdenes: { x, y (casilla), until, color }
    this.lastSound = {};
    this.retreatArmedUntil = 0;
    this.lunge = new Map(); // id de unidad -> golpe en curso { until, dx, dy } (se lanza hacia el objetivo)
    this.chips = []; // vacío en una defensa (no hay tropas que dirigir)
    this.viewDirty = true;
  }

  create() {
    this.sound.mute = prefs.get().muted;
    this.input.addPointer(1);
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D');

    store.holdRaids(true); // mientras tú atacas, nadie te ataca
    const state = store.get();
    if (this.raid) {
      this.mission = null;
      this.battle = this.raid.replay;
    } else {
      this.mission = generateMission(this.level);
      const stats = Object.fromEntries(ARMY_UNITS.map((k) => [k, unitCombat(state, k)])); // nivel de los edificios + investigaciones
      this.battle = createBattle(this.mission, state.army, squadHeroes(state), stats);
    }

    resetView(this.raid ? RAID_CENTER : START_CENTER);
    zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, this.raid ? RAID_ZOOM : START_ZOOM);

    this.cameras.main.setBackgroundColor(0x8fc0e4); // lo que queda fuera de la isla: cielo
    ensureTextures(this);
    ensureTerrainTextures(this);
    ui.ensureUi(this);
    this.createTerrain();
    this.createEntities();
    addVignette(this, DEPTH.vignette);
    this.time.addEvent({ delay: 380, loop: true, callback: () => this.burnTick() });
    this.createHud();
    if (this.raid) this.createRaidBar();
    else this.createChips();
    this.createSideButtons();
    this.createHeroButtons();
    this.gfx = this.add.graphics().setDepth(DEPTH.fx);
    this.hint = ui.label(this, LAYOUT.width / 2, LAYOUT.barTop - 12, '', { size: 12, bold: true, origin: [0.5, 0.5], align: 'center', stroke: 3, depth: DEPTH.buttons, wrap: LAYOUT.width - 30 });
    this.toast = this.add
      .text(LAYOUT.width / 2, LAYOUT.gridTop + 12, '', {
        fontFamily: ui.FONT, fontSize: '14px', fontStyle: 'bold', color: ui.TXT.light, backgroundColor: '#2b1d12f2', padding: { x: 14, y: 8 }, align: 'center', wordWrap: { width: LAYOUT.width - 48 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(900);
    this.boxRect = null;

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);

    this.showToast(this.raid ? `¡Ataque enemigo! Fuerza ${this.level}: tus defensas pelean solas` : `${missionName(this.level)}: destruye el Ayuntamiento enemigo`, 2600);
    if (this.raid) this.play('boom'); // la alarma
  }

  /* ---------- utilidades de dibujo ---------- */

  play(name, gap = 0) {
    if (this.sound.mute || !this.cache.audio.exists(name)) return;
    const now = this.time.now;
    if (now - (this.lastSound[name] ?? -1e9) < gap) return;
    this.lastSound[name] = now;
    this.sound.play(name, { volume: 0.5 });
  }

  placeOnTile(img, key, x, y, grow) {
    return placeOnTileArt(img, key, x, y, grow);
  }

  fitIcon(img, key, cx, cy, size) {
    return fitIconArt(this, img, key, cx, cy, size);
  }

  showToast(text, hold = 1500) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: hold, duration: 400 });
  }

  /* ---------- creación ---------- */

  createTerrain() {
    this.terrain = [];
    for (let y = 0; y < GRID.rows; y++) {
      for (let x = 0; x < GRID.cols; x++) {
        const img = this.add.image(0, 0, grassKey(x, y)).setDepth(DEPTH.terrain);
        this.terrain.push({ x, y, img });
      }
    }
    this.cliff = this.add.graphics().setDepth(DEPTH.terrain - 1); // el borde de roca bajo la isla
  }

  createEntities() {
    const shadow = () => this.add.image(0, 0, 'fx_shadow').setDepth(DEPTH.shadow);
    for (const e of this.battle.buildings) {
      const baseTint = this.buildingTint(e);
      const img = this.add.image(0, 0, this.buildingSprite(e)).setDepth(DEPTH.world + depthOf(e.x, e.y));
      if (baseTint) img.setTint(baseTint);
      this.entries.set(e.id, { ent: e, img, shadow: shadow(), rubble: null, baseTint, lastX: e.x });
    }
    for (const u of this.battle.units) {
      const img = this.add.image(0, 0, unitSprite(u), 0);
      this.entries.set(u.id, { ent: u, img, shadow: shadow(), rubble: null, baseTint: null, lastX: u.x });
    }
  }

  /** Dibujo de un edificio: en un ataque tuyo, el del enemigo (teñido de rojo); en una defensa, el tuyo según su nivel. */
  buildingSprite(e) {
    return this.raid ? statsOf(e.type, e.level).sprite : BUILDING_SPRITE[e.type];
  }

  buildingTint(e) {
    if (!this.raid) return ENEMY_TINT;
    return e.damaged ? DAMAGED_TINT : (statsOf(e.type, e.level).tint ?? null);
  }

  /** Los edificios muy dañados echan humo y llamas (en una defensa, los tuyos). */
  burnTick() {
    if (this.finished) return;
    const ts = tileSize();
    for (const e of this.battle.buildings) {
      if (!e.alive || e.hp / e.maxHp > 0.5 || !isTileVisible(e.x, e.y, 0)) continue;
      const c = tileCenter(e.x, e.y);
      const depth = DEPTH.fx;
      emberPuff(this, c.x + (Math.random() - 0.5) * ts * 0.5, c.y - ts * 0.3, depth);
      if (Math.random() < 0.6) smokePuff(this, c.x + (Math.random() - 0.5) * ts * 0.4, c.y - ts * 0.55, depth, { color: 0x3a3430, size: 0.8, rise: ts * 0.9, alpha: 0.55, life: 1700 });
    }
  }

  createHud() {
    const W = LAYOUT.width;
    const H = LAYOUT.hudHeight;
    const d = DEPTH.ui;
    ui.panel(this, W / 2, H / 2, W, H, 'bar', d, 'bottom');
    this.hudTop = ui.label(this, 12, 20, '', { size: 16, bold: true, color: ui.TXT.gold, origin: [0, 0.5], depth: d + 2 });
    this.hudBottom = ui.label(this, 12, 41, '', { size: 11, color: ui.TXT.blue, origin: [0, 0.5], depth: d + 2 });
    if (!this.raid) {
      // Las 3 estrellas del ataque, a la vista: Ayuntamiento, 50 % y 100 %.
      const y = LAYOUT.gridTop + 24;
      const d2 = DEPTH.buttons;
      this.starPill = { bg: ui.panel(this, W / 2 - 20, y, 150, 32, 'pill', d2), stars: [0, 1, 2].map((i) => ui.icon(this, W / 2 - 66 + i * 26, y, 'star', 22, d2 + 1).setTint(0x2a2118).setAlpha(0.6)), text: ui.label(this, W / 2 + 8, y, '0 %', { size: 13, bold: true, origin: [0, 0.5], depth: d2 + 1 }) };
      this.starsEarned = [false, false, false];
    }
    this.speedBtn = ui.button(this, { x: W - 46, y: H / 2, w: 76, h: 36, kind: 'dark2', icon: 'ff', iconSize: 16, text: '×1', size: 14, depth: d + 2, onClick: () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.play('select');
    } });
  }

  /** Barra de abajo: un botón por grupo de tropas (con su cantidad), «Auto» y «Huir». */
  createChips() {
    const W = LAYOUT.width;
    const slots = 9;
    const w = (W - 8) / slots;
    const top = LAYOUT.barTop;
    const H = LAYOUT.barHeight;
    const cy = top + H / 2 + 1;
    const d = DEPTH.ui;
    ui.panel(this, W / 2, top + H / 2, W, H, 'bar', d, 'top');
    const defs = [
      { id: 'all', glyph: 'star', kinds: null, name: 'Todas las tropas' },
      { id: 'soldier', sprite: 'unit_soldier', kinds: ['soldier'], name: 'Soldados' },
      { id: 'archer', sprite: 'unit_archer', kinds: ['archer'], name: 'Arqueros' },
      { id: 'mage', sprite: 'unit_mage', kinds: ['mage'], name: 'Hechiceros' },
      { id: 'knight', sprite: 'unit_knight', kinds: ['knight'], name: 'Caballeros' },
      { id: 'siege', sprite: 'unit_catapult', kinds: ['catapult', 'ram'], name: 'Armas de asedio' },
      { id: 'hero', sprite: 'unit_hero', kinds: ['hero'], name: 'Héroes' },
      { id: 'auto', glyph: 'auto', label: 'Auto', action: () => this.autoMode() },
      { id: 'retreat', glyph: 'flag', label: 'Huir', action: () => this.tryRetreat() },
    ];
    this.chips = defs.map((def, i) => {
      const cx = 4 + w / 2 + i * w;
      const chipW = Math.round(w - 4);
      const chipH = H - 10;
      const rect = ui.panel(this, cx, cy, chipW, chipH, 'dark2', d + 1).setInteractive({ useHandCursor: true });
      if (def.sprite) this.fitIcon(this.add.image(0, 0, def.sprite).setDepth(d + 2), def.sprite, cx, cy - 10, 28);
      else ui.icon(this, cx, cy - 10, def.glyph, 22, d + 2);
      const label = ui.label(this, cx, cy + 16, '', { size: 11, bold: true, origin: [0.5, 0.5], align: 'center', depth: d + 3 });
      rect.on('pointerdown', () => {
        ui.haptic();
        this.play('select');
        if (def.action) def.action();
        else {
          this.selectKinds(def.id, def.kinds);
          this.showToast(def.name, 700);
        }
      });
      return { def, rect, label, chipW, chipH };
    });
  }

  /** Barra de una defensa: no hay órdenes que dar, solo mirar o saltar la pelea. */
  createRaidBar() {
    const W = LAYOUT.width;
    const top = LAYOUT.barTop;
    const H = LAYOUT.barHeight;
    const cy = top + H / 2 + 1;
    const d = DEPTH.ui;
    ui.panel(this, W / 2, top + H / 2, W, H, 'bar', d, 'top');
    this.raidInfo = ui.label(this, 14, cy, '', { size: 11, color: ui.TXT.light, origin: [0, 0.5], depth: d + 2, wrap: W - 190, lineSpacing: 3 });
    ui.button(this, { x: W - 84, y: cy, w: 150, h: 46, kind: 'gold', icon: 'ff', iconSize: 18, text: 'Saltar', size: 15, depth: d + 1, onClick: () => {
      this.play('select');
      this.skipRaid();
    } });
  }

  /** Un botón por héroe con su habilidad: se lanza sola, y tocándolo se lanza ya. Muestra la recarga. */
  createHeroButtons() {
    this.heroButtons = [];
    const mine = this.raid ? 'd' : 'a';
    const heroes = this.battle.units.filter((u) => u.type === 'hero' && u.side === mine);
    const x = LAYOUT.width - 28;
    const y0 = (this.sideEndY ?? LAYOUT.gridTop + 160) + 16;
    heroes.forEach((u, i) => {
      const y = y0 + i * 58;
      const sprite = HEROES[u.heroKey].sprite;
      const btn = ui.button(this, { x, y, w: 50, h: 50, kind: 'pill', depth: DEPTH.buttons, onClick: () => {
        if (this.finished) return;
        const st = abilityStatus(this.battle, u.id);
        if (!st?.alive) return this.showToast(`${HEROES[u.heroKey].name} ha caído`);
        if (castHeroAbility(this.battle, u.id)) this.play('select');
        else this.showToast(st.cdLeft > 0 ? `${st.name}: recargando (${Math.ceil(st.cdLeft)} s)` : `${st.name}: no hay a quién`);
      } });
      const icon = this.add.image(0, 0, sprite).setDepth(DEPTH.buttons + 2);
      this.fitIcon(icon, sprite, x, y - 2, 34);
      const label = ui.label(this, x, y + 12, '', { size: 13, bold: true, origin: [0.5, 0.5], stroke: 3, depth: DEPTH.buttons + 3 });
      this.heroButtons.push({ id: u.id, btn, icon, label });
    });
  }

  updateHeroButtons() {
    for (const hb of this.heroButtons ?? []) {
      const st = abilityStatus(this.battle, hb.id);
      const ready = st?.alive && st.cdLeft <= 0;
      hb.label.setText(st?.alive ? (ready ? '' : String(Math.ceil(st.cdLeft))) : '✕');
      hb.icon.setAlpha(st?.alive ? (ready ? 1 : 0.45) : 0.25);
      hb.btn.img.setTint(ready ? 0xffe9a0 : 0xb0a090);
    }
  }

  /** Termina la pelea de golpe: se simula hasta el final y solo se dibujan los resultados. */
  skipRaid() {
    if (this.finished) return;
    for (let i = 0; i < 6000 && !this.battle.over; i++) advanceBattle(this.battle, 0.1);
    for (const ev of this.battle.events.splice(0)) this.onEvent(ev, true);
  }

  createSideButtons() {
    const x = LAYOUT.width - 28;
    let y = LAYOUT.gridTop + 28;
    const mid = () => ({ x: LAYOUT.width / 2, y: LAYOUT.gridTop + LAYOUT.viewHeight / 2 });
    const zoom = (f) => {
      zoomAt(mid().x, mid().y, view.zoom * f);
      this.viewDirty = true;
    };
    const round = (name, onClick) => {
      const b = ui.button(this, { x, y, w: 40, h: 40, kind: 'dark2', icon: name, iconSize: 20, depth: DEPTH.buttons, onClick });
      y += 46;
      return b;
    };
    round('plus', () => zoom(1.25));
    round('minus', () => zoom(0.8));
    if (!this.raid) {
      this.boxButton = round('box', () => {
        this.boxMode = !this.boxMode;
        this.showToast(this.boxMode ? 'Recuadro: arrastra sobre el mapa para elegir tropas' : 'Recuadro desactivado');
      });
    }
    round('home', () => {
      resetView(this.raid ? RAID_CENTER : START_CENTER);
      zoomAt(mid().x, mid().y, this.raid ? RAID_ZOOM : START_ZOOM);
      this.viewDirty = true;
    });
    this.sideEndY = y;
  }

  /* ---------- selección y órdenes ---------- */

  selectKinds(chipId, kinds) {
    this.activeChip = chipId;
    this.selection = new Set(unitIdsOfKinds(this.battle, kinds));
    if (!this.selection.size) this.showToast('No quedan tropas de ese tipo');
  }

  autoMode() {
    const ids = this.selection.size ? [...this.selection] : unitIdsOfKinds(this.battle);
    clearOrders(this.battle, ids);
    this.showToast(this.selection.size ? 'El grupo vuelve al modo automático' : 'Todas las tropas en modo automático');
  }

  tryRetreat() {
    if (this.finished) return;
    if (this.time.now < this.retreatArmedUntil) {
      retreat(this.battle);
    } else {
      this.retreatArmedUntil = this.time.now + 2000;
      this.showToast('Toca «Retirada» otra vez para retirarte', 2000);
    }
  }

  /** Qué hay bajo el puntero: primero unidades (más cercana), luego el edificio de esa casilla. */
  pick(px, py) {
    const ts = tileSize();
    let best = null;
    let bestDist = ts * 0.55;
    for (const u of this.battle.units) {
      if (!u.alive) continue;
      const p = tileBase(u.x, u.y);
      const d = Math.hypot(px - p.x, py - (p.y - ts * 0.35));
      if (d < bestDist) {
        best = u;
        bestDist = d;
      }
    }
    if (best) return best;
    const tile = screenToTile(px, py);
    return tile ? (this.battle.buildings.find((e) => e.alive && e.x === tile.x && e.y === tile.y) ?? null) : null;
  }

  mark(x, y, color) {
    this.markers.push({ x, y, until: this.time.now + 900, color });
  }

  onTap(g) {
    if (this.raid) return; // en una defensa tus tropas pelean solas
    const e = g.picked;
    if (e?.side === 'a') {
      this.selection = new Set([e.id]);
      this.activeChip = null;
      this.play('select');
    } else if (e?.side === 'd') {
      if (!this.selection.size) {
        this.showToast('Elige tropas primero (botones de abajo o toca una unidad)');
        return;
      }
      if (orderAttack(this.battle, [...this.selection], e.id)) {
        this.mark(e.x, e.y, COLORS.bad);
        this.play('select');
      }
    } else if (g.tile && this.selection.size) {
      orderMove(this.battle, [...this.selection], g.tile.x, g.tile.y);
      this.mark(g.tile.x, g.tile.y, COLORS.ok);
      this.play('select');
    }
  }

  /* ---------- gestos ---------- */

  onPointerDown(pointer, over) {
    if (this.finished || over?.length || !inViewport(pointer.x, pointer.y)) return;
    if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
      const p = this.pinchState();
      this.gesture = { mode: 'pinch', dist: p.dist, zoom: view.zoom, x: p.x, y: p.y };
      return;
    }
    this.gesture = {
      id: pointer.id, startX: pointer.x, startY: pointer.y, lastX: pointer.x, lastY: pointer.y,
      mode: 'pending', picked: this.pick(pointer.x, pointer.y), tile: screenToTile(pointer.x, pointer.y),
    };
  }

  onPointerMove(pointer) {
    const g = this.gesture;
    if (g?.mode === 'pinch') {
      const p = this.pinchState();
      zoomAt(p.x, p.y, g.zoom * (p.dist / g.dist));
      panBy(p.x - g.x, p.y - g.y);
      g.x = p.x;
      g.y = p.y;
      this.viewDirty = true;
      return;
    }
    if (!g || g.id !== pointer.id) return;
    if (g.mode === 'pending') {
      if (Math.hypot(pointer.x - g.startX, pointer.y - g.startY) < CAMERA.dragThreshold) return;
      g.mode = this.boxMode ? 'box' : 'pan';
    }
    if (g.mode === 'pan') {
      panBy(pointer.x - g.lastX, pointer.y - g.lastY);
      this.viewDirty = true;
    } else if (g.mode === 'box') {
      this.boxRect = { x1: g.startX, y1: g.startY, x2: pointer.x, y2: pointer.y };
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
    if (g.mode === 'pending') this.onTap(g);
    else if (g.mode === 'box' && this.boxRect) {
      const { x1, y1, x2, y2 } = this.boxRect;
      const [l, r] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [t, b] = [Math.min(y1, y2), Math.max(y1, y2)];
      const ts = tileSize();
      const ids = attackers(this.battle)
        .filter((u) => {
          const p = tileBase(u.x, u.y);
          return p.x >= l && p.x <= r && p.y - ts * 0.35 >= t && p.y - ts * 0.35 <= b;
        })
        .map((u) => u.id);
      this.selection = new Set(ids);
      this.activeChip = null;
      this.showToast(ids.length ? `${ids.length} unidades elegidas` : 'No había tropas en el recuadro');
    }
    this.boxRect = null;
  }

  onWheel(pointer, _over, _dx, dy) {
    if (!inViewport(pointer.x, pointer.y) || !dy) return;
    zoomAt(pointer.x, pointer.y, view.zoom * (dy < 0 ? 1.12 : 1 / 1.12));
    this.viewDirty = true;
  }

  pinchState() {
    const a = this.input.pointer1;
    const b = this.input.pointer2;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /* ---------- eventos de la simulación ---------- */

  /** `quiet` = se está saltando la pelea: solo se actualiza lo que quedó, sin efectos ni sonidos. */
  onEvent(ev, quiet = false) {
    const target = this.entries.get(ev.to ?? ev.id);
    if (quiet && (ev.type === 'hit' || ev.type === 'shot')) return;
    if (quiet && ev.type === 'die' && target?.ent.kind === 'unit') {
      target.img.destroy();
      target.shadow.destroy();
      return;
    }
    if (quiet && ev.type === 'destroy' && target) {
      target.shadow.setVisible(false);
      target.rubble = this.add.image(0, 0, 'rock_a').setDepth(DEPTH.world + depthOf(target.ent.x, target.ent.y) - 0.1);
      return;
    }
    if (ev.type === 'hit' || ev.type === 'shot') {
      const from = this.entries.get(ev.from)?.ent;
      if (from?.kind === 'unit' && target) {
        const dx = target.ent.x - from.x;
        const dy = target.ent.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        // Los cuerpo a cuerpo se lanzan hacia el objetivo; los que disparan retroceden un poco (retroceso).
        const sign = ev.type === 'shot' ? -0.4 : 1;
        this.lunge.set(ev.from, { start: this.time.now, until: this.time.now + 300, dx: (dx / len) * sign, dy: (dy / len) * sign, face: { dx: dx / len, dy: dy / len } });
      }
      if (target) {
        this.flash.set(target.ent.id, this.time.now + 90);
        if (target.img.visible && Math.random() < 0.5) {
          const p = tileBase(target.ent.x, target.ent.y);
          sparkBurst(this, p.x, p.y - tileSize() * 0.35, DEPTH.fx + 2, ev.type === 'shot' ? 0xa8e0ff : 0xfff0c0, 4);
        }
      }
      if (ev.type === 'shot') {
        this.projectile(this.entries.get(ev.from)?.ent, target?.ent);
        this.play('shoot', 90);
      } else this.play('hit', 80);
    } else if (ev.type === 'die' && target?.ent.kind === 'unit') {
      this.selection.delete(ev.id);
      const dir = target.anim?.dir ?? { dx: 1, dy: 0 };
      const f = unitFrame('die', dir.dx, dir.dy);
      target.img.setFrame(f.frame).setFlipX(f.flipX).setRotation(0);
      this.tweens.add({ targets: [target.img, target.shadow], alpha: 0, delay: 650, duration: 600, onComplete: () => { target.img.destroy(); target.shadow.destroy(); } });
      const p = tileBase(target.ent.x, target.ent.y);
      smokePuff(this, p.x, p.y - tileSize() * 0.15, DEPTH.fx, { color: 0xd8cdb0, size: 0.5, rise: tileSize() * 0.35, alpha: 0.6, life: 700 });
      target.dying = true;
    } else if (ev.type === 'destroy' && target) {
      this.play('boom', 120);
      const c = tileCenter(target.ent.x, target.ent.y);
      this.dust(c.x, c.y);
      sparkBurst(this, c.x, c.y - tileSize() * 0.2, DEPTH.fx + 2, 0xffb060, 12);
      for (let i = 0; i < 4; i++) smokePuff(this, c.x + (Math.random() - 0.5) * 20, c.y, DEPTH.fx, { color: 0x4a423c, size: 1.1, rise: tileSize() * 1.1, alpha: 0.7, life: 1800 });
      target.shadow.setVisible(false);
      target.rubble = this.add.image(0, 0, 'rock_a').setDepth(DEPTH.world + depthOf(target.ent.x, target.ent.y) - 0.1);
    } else if (ev.type === 'cast') {
      this.castFx(ev);
    } else if (ev.type === 'splash') {
      this.ring(ev.x, ev.y, ev.radius * 0.7, 0xff9a5a, 0.25, 300);
    } else if (ev.type === 'end') {
      this.finish();
    }
  }

  /** Aro que se expande y se desvanece (en casillas). */
  ring(x, y, radius, color, alpha = 0.22, ms = 520) {
    const c = tileCenter(x, y);
    const r = radius * tileSize();
    const ring = this.add.circle(c.x, c.y, r * 0.35, color, alpha).setStrokeStyle(3, color, 0.9).setDepth(DEPTH.fx);
    this.tweens.add({ targets: ring, scale: 1 / 0.35, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** La habilidad de un héroe: un efecto distinto para cada una. */
  castFx(ev) {
    const c = tileCenter(ev.x, ev.y);
    const ts = tileSize();
    if (ev.kind === 'fire') {
      this.ring(ev.x, ev.y, ev.radius, 0xff7a2a, 0.3);
      sparkBurst(this, c.x, c.y - ts * 0.2, DEPTH.fx + 3, 0xff9a40, 18);
      this.play('boom', 150);
    } else if (ev.kind === 'volley') {
      this.ring(ev.x, ev.y, ev.radius, 0xffe08a, 0.18);
      for (let i = 0; i < 14; i++) {
        const dx = (Math.random() - 0.5) * ev.radius * ts * 1.6;
        const dy = (Math.random() - 0.5) * ev.radius * ts * 1.2;
        const arrow = this.add.rectangle(c.x + dx, c.y + dy - 90, 2, 12, 0xfff0c0).setDepth(DEPTH.fx + 2).setAngle(8);
        this.tweens.add({ targets: arrow, y: c.y + dy, duration: 280 + Math.random() * 200, ease: 'Quad.easeIn', onComplete: () => { arrow.destroy(); sparkBurst(this, c.x + dx, c.y + dy, DEPTH.fx + 2, 0xfff0c0, 2); } });
      }
      this.play('shoot', 150);
    } else if (ev.kind === 'heal') {
      this.ring(ev.x, ev.y, ev.radius, 0x66dd88, 0.2, 700);
      sparkBurst(this, c.x, c.y, DEPTH.fx + 3, 0x8cff9a, 14);
      this.play('upgrade_done', 150);
    } else if (ev.kind === 'shield') {
      this.ring(ev.x, ev.y, ev.radius, 0x6fb7ff, 0.2, 700);
      sparkBurst(this, c.x, c.y, DEPTH.fx + 3, 0x9ad4ff, 12);
      this.play('upgrade_start', 150);
    } else if (ev.kind === 'warcry') {
      this.ring(ev.x, ev.y, ev.radius, 0xff5a4a, 0.2, 700);
      sparkBurst(this, c.x, c.y, DEPTH.fx + 3, 0xff8a6a, 12);
      this.play('upgrade_start', 150);
    }
    const hero = this.battle.byId.get(ev.id);
    if (hero) this.showToast(`${HEROES[hero.heroKey].name}: ${hero.ability.name}`, 900);
  }

  projectile(from, to) {
    if (!from || !to) return;
    const a = tileBase(from.x, from.y);
    const b = tileBase(to.x, to.y);
    const ts = tileSize();
    const orb = this.add
      .image(a.x, a.y - ts * 0.5, 'fx_soft')
      .setTint(from.kind === 'building' ? 0xffb050 : 0x66ccff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5)
      .setDepth(DEPTH.fx + 1);
    this.tweens.add({ targets: orb, x: b.x, y: b.y - ts * 0.4, duration: 160, onComplete: () => orb.destroy() });
  }

  dust(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const puff = this.add.circle(x, y + 6, 4 + Math.random() * 3, 0xd8cdb0, 0.85).setDepth(DEPTH.fx + 1);
      this.tweens.add({
        targets: puff, x: x + Math.cos(a) * 20, y: y + 6 + Math.sin(a) * 10, alpha: 0, scale: 0.4, duration: 450, onComplete: () => puff.destroy(),
      });
    }
  }

  /* ---------- fin de la batalla ---------- */

  /** Enciende las estrellas a medida que se ganan (con un toquecito y un aviso). */
  updateStars(percent) {
    const hall = this.battle.byId.get(this.battle.hallId);
    const now = [Boolean(hall && !hall.alive), percent >= STARS.half, percent >= STARS.all];
    this.starPill.text.setText(`${percent} %`);
    now.forEach((earned, i) => {
      if (!earned || this.starsEarned[i]) return;
      this.starsEarned[i] = true;
      const star = this.starPill.stars[i];
      star.clearTint().setAlpha(1);
      this.tweens.add({ targets: star, scale: star.scale * 1.7, duration: 200, yoyo: true });
      this.showToast(['¡Estrella! Destruiste el Ayuntamiento', '¡Estrella! Mitad de la base destruida', '¡Tercera estrella! Base arrasada'][i], 1800);
      this.play('upgrade_done');
    });
  }

  /** Quita la ventana abierta (la usa ui.dialog). */
  closeModal() {
    for (const p of this.modal ?? []) p.destroy();
    this.modal = null;
  }

  /** Fin de una defensa: el resultado ya se aplicó a tu partida; se avisa y se vuelve a la base con el informe. */
  finishRaid() {
    this.finished = true;
    this.gesture = null;
    const out = this.battle.result.outcome;
    const good = out === 'repelled';
    ui.dialog(this, {
      title: { repelled: '¡Ataque rechazado!', retreated: 'El enemigo se retira', raided: '¡Tumbaron tu Ayuntamiento!' }[out],
      icon: good ? 'shield' : 'warning',
      tone: good ? 'good' : 'bad',
      lines: [`Atacantes derrotados: ${this.battle.result.kills}`],
      buttons: [{ text: 'Ver informe', kind: 'blue', close: false, onClick: () => this.scene.start('BaseScene', { raidReport: this.raid }) }],
    });
    this.play(good ? 'win' : 'lose');
  }

  finish() {
    if (this.finished) return;
    if (this.raid) {
      this.finishRaid();
      return;
    }
    this.finished = true;
    this.gesture = null;
    this.selection.clear();
    store.tick();
    this.report = applyBattleResult(store.get(), this.battle.result);
    store.commit();
    this.play(this.report.won ? 'win' : 'lose');
    this.showResult(this.report);
  }

  showResult(r) {
    const casualties = Object.entries(r.casualties)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${{ soldier: 'soldado(s)', archer: 'arquero(s)', mage: 'hechicero(s)', knight: 'caballero(s)', catapult: 'catapulta(s)', ram: 'ariete(s)' }[k]}`)
      .join(', ');
    const lines = [
      `Edificios destruidos: ${r.percent}%`,
      `Botín: ${rewardText(r.loot, '+') || 'ninguno'}`,
      `Bajas: ${casualties || 'ninguna'}`,
    ];
    if (r.heroes?.length) {
      lines.push(`Héroes: +${r.xp} XP${r.heroLevelUps ? ' · ¡SUBEN DE NIVEL!' : ''}`);
      lines.push(r.heroes.map((h) => `${h.name} nv. ${h.level}${h.capped ? ' (tope)' : ` (${h.xp}/${h.next})`}`).join(' · '));
    }
    if (r.newStars > 0) lines.push(`+${r.newStars} estrella${r.newStars > 1 ? 's' : ''} nueva${r.newStars > 1 ? 's' : ''}: ${rewardText(r.starBonus, '+') || 'sin espacio para el premio'}`);
    lines.push(r.cleared ? `¡${missionName(r.level)} superada!` : r.won ? 'Ya habías superado este nivel' : 'Puedes volver a intentarlo');
    ui.dialog(this, {
      title: r.won ? '¡Victoria!' : r.stars > 0 ? 'Resultado parcial' : 'Derrota',
      stars: r.stars,
      icon: r.won ? 'trophy' : 'shield',
      tone: r.won ? 'good' : 'bad',
      lines,
      buttons: [{ text: 'Volver a la base', kind: 'blue', close: false, onClick: () => this.scene.start('BaseScene', { report: this.report }) }],
    });
  }

  /* ---------- dibujo y bucle ---------- */

  renderTerrain() {
    const scale = view.zoom * 1.015; // un poco más grande: evita rendijas entre casillas
    drawCliff(this.cliff, view.zoom);
    for (const t of this.terrain) {
      const visible = isTileVisible(t.x, t.y, 0);
      t.img.setVisible(visible);
      if (visible) {
        const c = tileCenter(t.x, t.y);
        t.img.setPosition(c.x, c.y).setScale(scale);
      }
    }
  }

  /** Las sombras ya vienen dibujadas en el arte isométrico. */
  shadowAt(shadow) {
    shadow.setVisible(false);
  }

  /**
   * Animación de una unidad con los cuadros de su hoja: camina mientras avanza, golpea (cuadros de ataque) al
   * pelear y descansa quieta. Mira hacia donde va o hacia su objetivo.
   */
  animateUnit(entry, img, e, dt) {
    const defaultDir = e.side === 'a' ? { dx: 0, dy: -1 } : { dx: 0, dy: 1 }; // los atacantes miran hacia arriba (la base enemiga)
    const a = (entry.anim ??= { x: e.x, y: e.y, phase: Math.random(), speed: 0, dir: defaultDir });
    const zoom = view.zoom;
    const step = Math.hypot(e.x - a.x, e.y - a.y);
    if (step > 0.0004) a.dir = { dx: e.x - a.x, dy: e.y - a.y };
    a.x = e.x;
    a.y = e.y;
    a.speed += (step / Math.max(dt, 0.001) - a.speed) * 0.35;
    const moving = a.speed > 0.35;
    a.phase += dt * (1.1 + a.speed * 0.55);

    const l = this.lunge.get(e.id);
    let f;
    if (l) {
      const k = (this.time.now - l.start) / (l.until - l.start);
      if (k >= 1) this.lunge.delete(e.id);
      else {
        a.dir = l.face;
        f = unitFrame('attack', l.face.dx, l.face.dy, k);
        const push = Math.sin(k * Math.PI) * 6 * zoom; // sale un poco hacia el objetivo y vuelve
        img.x += l.dx * push * 0.9;
        img.y += l.dy * push * 0.5;
      }
    }
    if (!f) f = moving ? unitFrame('walk', a.dir.dx, a.dir.dy, a.phase) : unitFrame('idle', a.dir.dx, a.dir.dy);
    img.setFrame(f.frame).setFlipX(f.flipX);
  }

  renderEntities(dt = 0.016) {
    const now = this.time.now;

    for (const entry of this.entries.values()) {
      const e = entry.ent;
      const { img } = entry;
      if (!img.active) continue; // ya se destruyó (unidad caída)

      if (e.kind === 'building') {
        const visible = isTileVisible(e.x, e.y);
        if (!e.alive) {
          img.setVisible(false);
          entry.shadow.setVisible(false);
          if (entry.rubble) {
            this.placeOnTile(entry.rubble, 'rock_a', e.x, e.y, 0.9).setVisible(visible);
          }
          continue;
        }
        img.setVisible(visible);
        entry.shadow.setVisible(visible);
        if (visible) {
          this.placeOnTile(img, this.buildingSprite(e), e.x, e.y, BUILDING_GROW);
          entry.shadow.setVisible(false);
        }
      } else if (e.alive) {
        const visible = isTileVisible(Math.round(e.x), Math.round(e.y));
        img.setVisible(visible);
        entry.shadow.setVisible(visible);
        if (!visible) continue;
        entry.shadow.setVisible(false);
        this.placeOnTile(img, unitSprite(e), e.x, e.y, UNIT_GROW).setDepth(DEPTH.world + depthOf(e.x, e.y) + 0.06);
        this.animateUnit(entry, img, e, dt);
        entry.lastX = e.x;
      }
      const flashing = (this.flash.get(e.id) ?? 0) > now;
      if (flashing) img.setTint(0xff5555);
      else if (entry.baseTint) img.setTint(entry.baseTint);
      else img.clearTint();
    }
  }

  renderOverlay() {
    const g = this.gfx;
    const ts = tileSize();
    const zoom = view.zoom;
    g.clear();

    const bar = (cx, cy, w, ratio, color) => {
      g.fillStyle(0x000000, 0.65).fillRect(cx - w / 2 - 1, cy - 1, w + 2, 6 * zoom + 2);
      g.fillStyle(color, 1).fillRect(cx - w / 2, cy, w * Math.max(0, ratio), 6 * zoom);
    };
    for (const e of this.battle.buildings) {
      if (!e.alive || !isTileVisible(e.x, e.y)) continue;
      if (e.hp >= e.maxHp && e.type !== 'hall' && e.type !== 'townhall' && e.type !== 'tower') continue;
      const p = tileBase(e.x, e.y);
      const tall = e.type === 'hall' || e.type === 'townhall' ? 2.0 : e.type === 'tower' ? 1.6 : e.type === 'wall' || e.type === 'gate' ? 0.9 : 1.35;
      bar(p.x, p.y - ts * tall, ts * 0.9, e.hp / e.maxHp, this.raid ? 0x55cc55 : 0xe05050);
    }
    for (const u of this.battle.units) {
      if (!u.alive || u.hp >= u.maxHp || !isTileVisible(Math.round(u.x), Math.round(u.y))) continue;
      const p = tileBase(u.x, u.y);
      const friendly = this.raid ? u.side === 'd' : u.side === 'a'; // en una defensa, tus tropas son las defensoras
      bar(p.x, p.y - ts * (u.type === 'hero' ? 1.35 : 1.0), ts * 0.6, u.hp / u.maxHp, friendly ? 0x55cc55 : 0xe05050);
    }

    g.lineStyle(2, 0x66ff66, 1);
    for (const id of this.selection) {
      const u = this.battle.byId.get(id);
      if (!u?.alive) continue;
      const p = tileBase(u.x, u.y);
      g.strokeEllipse(p.x, p.y - 2 * zoom, ts * 0.75, ts * 0.32);
    }

    const now = this.time.now;
    this.markers = this.markers.filter((m) => m.until > now);
    for (const m of this.markers) {
      const c = tileCenter(m.x, m.y);
      const k = (m.until - now) / 900;
      g.lineStyle(3, m.color, k).strokeEllipse(c.x, c.y, ts * 2 * (0.35 + 0.35 * (1 - k)), ts * (0.35 + 0.35 * (1 - k)));
    }

    if (this.boxRect) {
      const { x1, y1, x2, y2 } = this.boxRect;
      g.fillStyle(0x66ff66, 0.15).fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      g.lineStyle(2, 0x66ff66, 0.9).strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
  }

  updateHud() {
    this.speedBtn.setText(`×${this.speed}`);
    if (this.raid) {
      const b = this.battle;
      this.hudTop.setText(`¡Ataque enemigo! · ${formatDuration(Math.max(0, RAID.timeLimitSec - b.time) * 1000)}`);
      this.hudBottom.setText(`Fuerza ${this.level} · Atacantes ${attackers(b).length} · Tus tropas ${defenderUnits(b).length} · Daños ${b.destroyed}/${b.maxDestroyed}`);
      this.raidInfo.setText(`Tus torres, muros y tropas defienden solos. Toca la cara de un héroe para lanzar su habilidad.`);
      return;
    }
    const s = battleStatus(this.battle);
    this.updateStars(s.percent);
    this.hudTop.setText(`${missionName(this.level)} · ${formatDuration(s.timeLeft * 1000)}`);
    this.hudBottom.setText(`Aliados ${s.alliesAlive} · Enemigos ${s.enemiesAlive} · Destruido ${s.percent}%`);

    for (const chip of this.chips) {
      const { def, rect, label } = chip;
      const n = def.action ? null : unitIdsOfKinds(this.battle, def.kinds).length;
      const armed = def.id === 'retreat' && this.time.now < this.retreatArmedUntil;
      label.setText(def.action ? (armed ? '¿Seguro?' : def.label) : String(n));
      label.setColor(armed ? ui.TXT.bad : ui.TXT.light);
      const active = this.activeChip === def.id || armed;
      rect.setTexture(ui.panelTexture(this, armed ? 'red' : active ? 'green' : 'dark2', chip.chipW, chip.chipH));
      rect.setAlpha(n === 0 ? 0.45 : 1);
    }
    const n = [...this.selection].filter((id) => this.battle.byId.get(id)?.alive).length;
    this.hint.setText(
      this.finished
        ? ''
        : n
          ? `${n} elegidas · toca un enemigo para atacar o el suelo para moverlas`
          : 'Elige tropas abajo (o toca una unidad) para darles órdenes',
    );
    this.boxButton?.img.setTexture(ui.panelTexture(this, this.boxMode ? 'green' : 'dark2', 40, 40));
  }

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

    if (!this.battle.over) advanceBattle(this.battle, (Math.min(delta, 100) / 1000) * this.speed);
    for (const ev of this.battle.events.splice(0)) this.onEvent(ev);

    if (this.viewDirty) {
      this.viewDirty = false;
      this.renderTerrain();
    }
    this.renderEntities(Math.min(delta, 100) / 1000);
    this.renderOverlay();
    this.updateHud();
    this.updateHeroButtons();
  }
}
