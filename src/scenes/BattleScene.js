import Phaser from 'phaser';
import { ART_SIZE, ARMY_UNITS, BUILDINGS, CAMERA, GRID, LAYOUT, RAID } from '../data/config.js';
import { HEROES } from '../data/heroes.js';
import { abilityStatus, advanceBattle, attackers, battleStatus, castHeroAbility, clearOrders, createBattle, defenderUnits, orderAttack, orderMove, retreat, unitIdsOfKinds } from '../game/battle.js';
import { applyBattleResult } from '../game/campaign.js';
import { formatDuration, squadHeroes, statsOf, unitCombat } from '../game/logic.js';
import { generateMission, missionName } from '../game/missions.js';
import * as prefs from '../game/prefs.js';
import { depthOf, inViewport, isTileVisible, panBy, resetView, screenToTile, spriteScale, tileBase, tileCenter, tileSize, view, zoomAt } from '../game/projection.js';
import { contentBounds } from '../game/sprites.js';
import * as store from '../game/store.js';
import { grassLook } from '../game/terrain.js';
import { wallConnectors } from '../game/walls.js';
import { renderConnectors } from './connectors.js';
import { addGloss, addVignette, emberPuff, ensureTextures, placeShadow, smokePuff, sparkBurst } from './look.js';

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
  guard: 'enemy_guard', brute: 'enemy_brute',
};
/** Dibujo de una unidad de la batalla: cada héroe tiene el suyo. */
const unitSprite = (e) => (e.type === 'hero' ? HEROES[e.heroKey].sprite : UNIT_SPRITE[e.type]);
const ENEMY_TINT = 0xffc2b2;
const DAMAGED_TINT = 0x6a5a55;
const RAID_CENTER = { x: 12, y: 9 }; // en una defensa se ve tu base con el borde de arriba, por donde llega el enemigo
const RAID_ZOOM = 0.7;
const UNIT_GROW = 1.7;
const BUILDING_GROW = 1.25;
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
    this.chips = []; // vacío en una defensa (no hay tropas que dirigir)
    this.viewDirty = true;
    this.connectors = new Map(); // enlaces entre los muros enemigos que siguen en pie
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

    ensureTextures(this);
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
    this.hint = this.add
      .text(12, LAYOUT.barTop - 20, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
      .setDepth(DEPTH.buttons);
    this.toast = this.add
      .text(LAYOUT.width / 2, LAYOUT.gridTop + 12, '', {
        fontFamily: FONT, fontSize: '15px', color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 10, y: 6 }, align: 'center',
      })
      .setOrigin(0.5, 0)
      .setAlpha(0)
      .setDepth(DEPTH.modal - 10);
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
    const b = contentBounds(this.textures, key);
    const p = tileBase(x, y);
    return img.setTexture(key).setOrigin(b.cx / ART_SIZE, b.bottom / ART_SIZE).setPosition(p.x, p.y).setScale(spriteScale() * grow);
  }

  fitIcon(img, key, cx, cy, size) {
    const b = contentBounds(this.textures, key);
    return img.setTexture(key).setOrigin(b.cx / ART_SIZE, b.cy / ART_SIZE).setPosition(cx, cy).setScale(size / Math.max(b.w, b.h));
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
        const look = grassLook(x, y);
        const img = this.add.image(0, 0, look.key).setDepth(DEPTH.terrain).setTint(look.tint).setFlip(look.flipX, look.flipY);
        this.terrain.push({ x, y, img });
      }
    }
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
      const img = this.add.image(0, 0, unitSprite(u));
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
      emberPuff(this, c.x + (Math.random() - 0.5) * ts * 0.4, c.y, depth);
      if (Math.random() < 0.6) smokePuff(this, c.x + (Math.random() - 0.5) * ts * 0.3, c.y - ts * 0.2, depth, { color: 0x3a3430, size: 0.8, rise: ts * 0.9, alpha: 0.55, life: 1700 });
    }
  }

  createHud() {
    const d = DEPTH.ui;
    const hudBg = this.add.rectangle(LAYOUT.width / 2, LAYOUT.hudHeight / 2, LAYOUT.width, LAYOUT.hudHeight, COLORS.hud).setDepth(d);
    addGloss(this, hudBg);
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.hudHeight - 1, LAYOUT.width, 2, 0xd4a017, 0.55).setDepth(d + 0.5);
    this.hudTop = this.add.text(16, 20, '', { fontFamily: FONT, fontSize: '18px', color: TEXT.gold, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(d + 1);
    this.hudBottom = this.add.text(16, 46, '', { fontFamily: FONT, fontSize: '13px', color: '#9fc8ef' }).setOrigin(0, 0.5).setDepth(d + 1);

    const btn = this.add
      .rectangle(LAYOUT.width - 70, LAYOUT.hudHeight / 2, 116, 40, COLORS.button)
      .setStrokeStyle(2, 0x4a6a4a)
      .setInteractive({ useHandCursor: true })
      .setDepth(d + 1);
    addGloss(this, btn);
    this.speedText = this.add.text(btn.x, btn.y, '', { fontFamily: FONT, fontSize: '14px', color: TEXT.normal }).setOrigin(0.5).setDepth(d + 2);
    btn.on('pointerdown', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.play('select');
    });
  }

  /** Barra inferior con 7 botones: grupos de tropas, «Auto» y «Retirada». */
  createChips() {
    const slots = 9;
    const w = LAYOUT.width / slots;
    const cy = LAYOUT.barTop + LAYOUT.barHeight / 2;
    const barBg = this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, LAYOUT.barHeight, COLORS.hud).setDepth(DEPTH.ui);
    addGloss(this, barBg);
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.barTop + 1, LAYOUT.width, 2, 0xd4a017, 0.55).setDepth(DEPTH.ui + 0.5);

    const defs = [
      { id: 'all', label: 'Todos', kinds: null },
      { id: 'soldier', label: 'Soldados', kinds: ['soldier'], icon: 'unit_soldier' },
      { id: 'archer', label: 'Arqueros', kinds: ['archer'], icon: 'unit_archer' },
      { id: 'mage', label: 'Magos', kinds: ['mage'], icon: 'unit_mage' },
      { id: 'knight', label: 'Caballeros', kinds: ['knight'], icon: 'unit_knight' },
      { id: 'siege', label: 'Asedio', kinds: ['catapult', 'ram'], icon: 'unit_catapult' },
      { id: 'hero', label: 'Héroes', kinds: ['hero'], icon: 'unit_hero' },
      { id: 'auto', label: 'Auto', action: () => this.autoMode() },
      { id: 'retreat', label: 'Retirada', action: () => this.tryRetreat() },
    ];
    this.chips = defs.map((def, i) => {
      const cx = i * w + w / 2;
      const rect = this.add
        .rectangle(cx, cy, w - 6, LAYOUT.barHeight - 14, COLORS.button)
        .setStrokeStyle(2, 0x4a6a4a)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.ui + 1);
      addGloss(this, rect);
      if (def.icon) this.fitIcon(this.add.image(0, 0, def.icon), def.icon, cx, cy - 24, 28).setDepth(DEPTH.ui + 2);
      else {
        const glyph = { all: '★', auto: '⟲', retreat: '⚑' }[def.id];
        this.add.text(cx, cy - 24, glyph, { fontFamily: FONT, fontSize: '22px', color: def.id === 'retreat' ? '#ff9a8a' : '#cfe3ff' }).setOrigin(0.5).setDepth(DEPTH.ui + 2);
      }
      const label = this.add
        .text(cx, cy + 12, '', { fontFamily: FONT, fontSize: '10px', color: TEXT.normal, align: 'center', lineSpacing: 2 })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      rect.on('pointerdown', () => {
        this.play('select');
        if (def.action) def.action();
        else this.selectKinds(def.id, def.kinds);
      });
      return { def, rect, label };
    });
  }

  /** Barra de una defensa: no hay órdenes que dar, solo mirar o saltar la pelea. */
  createRaidBar() {
    const cy = LAYOUT.barTop + LAYOUT.barHeight / 2;
    const bg = this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, LAYOUT.barHeight, COLORS.hud).setDepth(DEPTH.ui);
    addGloss(this, bg);
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.barTop + 1, LAYOUT.width, 2, 0xdd5555, 0.7).setDepth(DEPTH.ui + 0.5);
    this.raidInfo = this.add
      .text(20, cy, '', { fontFamily: FONT, fontSize: '14px', color: TEXT.normal, lineSpacing: 6 })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui + 2);
    const btn = this.add
      .rectangle(LAYOUT.width - 120, cy, 200, 52, 0x9a6a2a)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(DEPTH.ui + 1);
    addGloss(this, btn);
    this.add.text(btn.x, btn.y, 'Saltar defensa ⏩', { fontFamily: FONT, fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(DEPTH.ui + 2);
    btn.on('pointerdown', () => {
      this.play('select');
      this.skipRaid();
    });
  }

  /** Un botón por héroe con su habilidad: se lanza sola, y tocándolo se lanza ya. Muestra la recarga. */
  createHeroButtons() {
    this.heroButtons = [];
    const mine = this.raid ? 'd' : 'a';
    const heroes = this.battle.units.filter((u) => u.type === 'hero' && u.side === mine);
    const x = LAYOUT.width - 24;
    const y0 = LAYOUT.gridTop + (this.raid ? 146 : 186);
    heroes.forEach((u, i) => {
      const y = y0 + i * 44;
      const rect = this.add.rectangle(x, y, 38, 38, 0x2a3a2a, 0.92).setStrokeStyle(2, 0xd4a017).setInteractive({ useHandCursor: true }).setDepth(DEPTH.buttons);
      addGloss(this, rect);
      const icon = this.add.image(0, 0, HEROES[u.heroKey].sprite).setDepth(DEPTH.buttons + 1);
      this.fitIcon(icon, HEROES[u.heroKey].sprite, x, y - 2, 28);
      const label = this.add
        .text(x, y + 9, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(DEPTH.buttons + 2);
      rect.on('pointerdown', () => {
        if (this.finished) return;
        const st = abilityStatus(this.battle, u.id);
        if (!st?.alive) return this.showToast(`${HEROES[u.heroKey].name} ha caído`);
        if (castHeroAbility(this.battle, u.id)) this.play('select');
        else this.showToast(st.cdLeft > 0 ? `${st.name}: recargando (${Math.ceil(st.cdLeft)} s)` : `${st.name}: no hay a quién`);
      });
      this.heroButtons.push({ id: u.id, rect, icon, label });
    });
  }

  updateHeroButtons() {
    for (const hb of this.heroButtons ?? []) {
      const st = abilityStatus(this.battle, hb.id);
      const ready = st?.alive && st.cdLeft <= 0;
      hb.label.setText(st?.alive ? (ready ? '' : String(Math.ceil(st.cdLeft))) : '✕');
      hb.icon.setAlpha(st?.alive ? (ready ? 1 : 0.5) : 0.3);
      hb.rect.setStrokeStyle(2, ready ? 0xffe9a0 : 0x4a6a4a);
    }
  }

  /** Termina la pelea de golpe: se simula hasta el final y solo se dibujan los resultados. */
  skipRaid() {
    if (this.finished) return;
    for (let i = 0; i < 6000 && !this.battle.over; i++) advanceBattle(this.battle, 0.1);
    for (const ev of this.battle.events.splice(0)) this.onEvent(ev, true);
  }

  createSideButtons() {
    const x = LAYOUT.width - 24;
    const top = LAYOUT.gridTop;
    const make = (y, text, size, onClick) => {
      const rect = this.add
        .rectangle(x, y, 34, 34, 0x1a2a1a, 0.82)
        .setStrokeStyle(2, 0x86a083)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.buttons);
      addGloss(this, rect);
      this.add.text(x, y, text, { fontFamily: FONT, fontSize: size, color: '#e8eee0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(DEPTH.buttons + 1);
      rect.on('pointerdown', onClick);
      return rect;
    };
    const mid = () => ({ x: LAYOUT.width / 2, y: LAYOUT.gridTop + LAYOUT.viewHeight / 2 });
    const zoom = (f) => {
      zoomAt(mid().x, mid().y, view.zoom * f);
      this.viewDirty = true;
    };
    make(top + 26, '+', '22px', () => zoom(1.25));
    make(top + 66, '−', '22px', () => zoom(0.8));
    if (!this.raid) {
      this.boxButton = make(top + 106, '▭', '18px', () => {
        this.boxMode = !this.boxMode;
        this.showToast(this.boxMode ? 'Recuadro: arrastra sobre el mapa para elegir tropas' : 'Recuadro desactivado');
      });
    }
    make(this.raid ? top + 106 : top + 146, '⌂', '18px', () => {
      resetView(this.raid ? RAID_CENTER : START_CENTER);
      zoomAt(mid().x, mid().y, this.raid ? RAID_ZOOM : START_ZOOM);
      this.viewDirty = true;
    });
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
      this.tweens.add({ targets: [target.img, target.shadow], alpha: 0, duration: 500, onComplete: () => { target.img.destroy(); target.shadow.destroy(); } });
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

  /** Fin de una defensa: el resultado ya se aplicó a tu partida; se avisa y se vuelve a la base con el informe. */
  finishRaid() {
    this.finished = true;
    this.gesture = null;
    const out = this.battle.result.outcome;
    const good = out === 'repelled';
    this.play(good ? 'win' : 'lose');
    const w = LAYOUT.width;
    const d = DEPTH.modal;
    const cx = w / 2;
    const cy = LAYOUT.gridTop + 250;
    this.add.rectangle(w / 2, LAYOUT.height / 2, w, LAYOUT.height, 0x000000, 0.6).setDepth(d).setInteractive();
    const box = this.add.rectangle(cx, cy, 440, 210, 0x1a2a1a, 0.98).setStrokeStyle(3, good ? COLORS.ok : COLORS.bad).setDepth(d + 1);
    addGloss(this, box, d + 1.3, 0.6);
    const title = { repelled: '¡Ataque rechazado!', retreated: 'El enemigo se retira', raided: '¡Tumbaron tu Ayuntamiento!' }[out];
    this.add
      .text(cx, cy - 55, title, { fontFamily: FONT, fontSize: '28px', color: good ? '#b8f0b8' : '#ffb0a0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(d + 2);
    this.add
      .text(cx, cy - 8, `Atacantes derrotados: ${this.battle.result.kills}`, { fontFamily: FONT, fontSize: '16px', color: '#e8eee0' })
      .setOrigin(0.5)
      .setDepth(d + 2);
    const btn = this.add.rectangle(cx, cy + 60, 240, 48, 0x2f5f8f).setStrokeStyle(2, 0x8cc4f5).setInteractive({ useHandCursor: true }).setDepth(d + 2);
    addGloss(this, btn);
    this.add.text(cx, cy + 60, 'Ver informe', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 3);
    btn.on('pointerdown', () => this.scene.start('BaseScene', { raidReport: this.raid }));
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
    const w = LAYOUT.width;
    const h = LAYOUT.height;
    const d = DEPTH.modal;
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.68).setDepth(d).setInteractive();
    const cx = w / 2;
    const cy = LAYOUT.gridTop + 250;
    this.add.rectangle(cx, cy, 460, 330, 0x1a2a1a, 0.98).setStrokeStyle(3, r.won ? COLORS.ok : COLORS.bad).setDepth(d + 1);
    this.add
      .text(cx, cy - 135, r.won ? '¡Victoria!' : 'Derrota', { fontFamily: FONT, fontSize: '34px', color: r.won ? '#b8f0b8' : '#ffb0a0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(d + 2);

    const casualties = Object.entries(r.casualties)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${{ soldier: 'soldado(s)', archer: 'arquero(s)', mage: 'hechicero(s)', knight: 'caballero(s)', catapult: 'catapulta(s)', ram: 'ariete(s)' }[k]}`)
      .join(', ');
    const heroLine = r.heroes?.length
      ? `Héroes: +${r.xp} XP${r.heroLevelUps ? ' · ¡SUBEN DE NIVEL!' : ''}\n${r.heroes
          .map((h) => `${h.name} nv. ${h.level}${h.capped ? ' (tope)' : ` (${h.xp}/${h.next})`}`)
          .join(' · ')}`
      : null;
    const lines = [
      `Edificios destruidos: ${r.percent}%`,
      `Botín: ${rewardText(r.loot, '+') || 'ninguno'}`,
      `Bajas: ${casualties || 'ninguna'}`,
      heroLine,
      r.cleared ? `¡${missionName(r.level)} superada!` : r.won ? 'Ya habías superado este nivel' : 'Puedes volver a intentarlo',
    ].filter(Boolean);
    this.add
      .text(cx, cy - 20, lines.join('\n'), { fontFamily: FONT, fontSize: '17px', color: '#e8eee0', align: 'center', lineSpacing: 10 })
      .setOrigin(0.5)
      .setDepth(d + 2);

    const btn = this.add
      .rectangle(cx, cy + 128, 240, 48, 0x2f5f8f)
      .setStrokeStyle(2, 0x8cc4f5)
      .setInteractive({ useHandCursor: true })
      .setDepth(d + 2);
    addGloss(this, btn);
    this.add.text(cx, cy + 128, 'Volver a la base', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(d + 3);
    btn.on('pointerdown', () => this.scene.start('BaseScene', { report: this.report }));
  }

  /* ---------- dibujo y bucle ---------- */

  renderTerrain() {
    const scale = spriteScale() * 1.02;
    for (const t of this.terrain) {
      const visible = isTileVisible(t.x, t.y, 0);
      t.img.setVisible(visible);
      if (visible) {
        const c = tileCenter(t.x, t.y);
        t.img.setPosition(c.x, c.y).setScale(scale);
      }
    }
  }

  /** Sombra bajo (x, y) casillas, de `w` × `h` casillas. */
  shadowAt(shadow, x, y, w, h, alpha) {
    const ts = tileSize();
    const p = tileBase(x, y);
    placeShadow(shadow, p.x + ts * 0.05, p.y - ts * 0.02, ts * w, ts * h, alpha);
  }

  renderEntities() {
    const now = this.time.now;

    // Los muros enemigos que siguen en pie se ven unidos; al caer uno, desaparecen sus enlaces.
    const standing = this.battle.buildings.filter((e) => e.alive).map((e) => ({ type: e.type, x: e.x, y: e.y, level: e.level ?? 2 }));
    renderConnectors(this, this.connectors, wallConnectors(standing), {
      grow: BUILDING_GROW,
      tintFor: this.raid ? (c) => BUILDINGS.wall.levels[Math.min(c.level, 5) - 1]?.tint ?? null : () => ENEMY_TINT,
    });
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
          const wall = e.type === 'wall' || e.type === 'gate' ? 0.8 : 1;
          this.shadowAt(entry.shadow, e.x, e.y, 1.05 * wall, 0.4 * wall, 0.55);
        }
      } else if (e.alive) {
        const visible = isTileVisible(Math.round(e.x), Math.round(e.y));
        img.setVisible(visible);
        entry.shadow.setVisible(visible);
        if (!visible) continue;
        this.shadowAt(entry.shadow, e.x, e.y, e.type === 'hero' ? 0.62 : 0.42, e.type === 'hero' ? 0.25 : 0.17, 0.4);
        const grow = e.type === 'hero' ? UNIT_GROW * 1.3 : UNIT_GROW;
        this.placeOnTile(img, unitSprite(e), e.x, e.y, grow).setDepth(DEPTH.world + e.y + 0.5);
        const dx = e.x - entry.lastX;
        if (Math.abs(dx) > 0.001) img.setFlipX(dx < 0);
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
      bar(p.x, p.y - ts * 1.05, ts * 0.9, e.hp / e.maxHp, this.raid ? 0x55cc55 : 0xe05050);
    }
    for (const u of this.battle.units) {
      if (!u.alive || u.hp >= u.maxHp || !isTileVisible(Math.round(u.x), Math.round(u.y))) continue;
      const p = tileBase(u.x, u.y);
      const friendly = this.raid ? u.side === 'd' : u.side === 'a'; // en una defensa, tus tropas son las defensoras
      bar(p.x, p.y - ts * 0.95, ts * 0.6, u.hp / u.maxHp, friendly ? 0x55cc55 : 0xe05050);
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
      g.lineStyle(3, m.color, k).strokeCircle(c.x, c.y, ts * (0.35 + 0.35 * (1 - k)));
    }

    if (this.boxRect) {
      const { x1, y1, x2, y2 } = this.boxRect;
      g.fillStyle(0x66ff66, 0.15).fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      g.lineStyle(2, 0x66ff66, 0.9).strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
  }

  updateHud() {
    if (this.raid) {
      const b = this.battle;
      this.hudTop.setText(`¡Ataque enemigo! · fuerza ${this.level} · ${formatDuration(Math.max(0, RAID.timeLimitSec - b.time) * 1000)}`);
      this.hudBottom.setText(`Atacantes ${attackers(b).length} · Tus tropas ${defenderUnits(b).length} · Daños ${b.destroyed}/${b.maxDestroyed}`);
      this.speedText.setText(`Velocidad ×${this.speed}`);
      this.raidInfo.setText(`Tus torres, muros y tropas\ndefienden solos.\nEl ataque termina si destruyen ${b.maxDestroyed} edificios.`);
      return;
    }
    const s = battleStatus(this.battle);
    this.hudTop.setText(`${missionName(this.level)} · ${formatDuration(s.timeLeft * 1000)}`);
    this.hudBottom.setText(`Aliados ${s.alliesAlive} · Enemigos ${s.enemiesAlive} · Destruido ${s.percent}%`);
    this.speedText.setText(`Velocidad ×${this.speed}`);

    for (const chip of this.chips) {
      const { def, rect, label } = chip;
      const kinds = def.kinds;
      const n = def.action ? null : unitIdsOfKinds(this.battle, kinds).length;
      const armed = def.id === 'retreat' && this.time.now < this.retreatArmedUntil;
      label.setText(def.action ? (armed ? '¿Seguro?' : def.label) : `${def.label}\n${n}`);
      label.setColor(armed ? TEXT.bad : TEXT.normal);
      const active = this.activeChip === def.id;
      rect.setFillStyle(active ? COLORS.on : COLORS.button).setStrokeStyle(active ? 3 : 2, active ? COLORS.gold : 0x4a6a4a);
      rect.setAlpha(n === 0 ? 0.45 : 1);
    }
    const n = [...this.selection].filter((id) => this.battle.byId.get(id)?.alive).length;
    this.hint.setText(
      this.finished
        ? ''
        : n
          ? `${n} seleccionadas · toca un enemigo para atacar o el suelo para moverlas`
          : 'Elige tropas abajo (o toca una unidad) para darles órdenes',
    );
    this.boxButton?.setStrokeStyle(2, this.boxMode ? COLORS.ok : 0x86a083);
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
    this.renderEntities();
    this.renderOverlay();
    this.updateHud();
    this.updateHeroButtons();
  }
}
