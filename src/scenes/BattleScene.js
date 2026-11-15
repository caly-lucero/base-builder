import Phaser from 'phaser';
import { ART_SIZE, CAMERA, GRID, LAYOUT } from '../data/config.js';
import { advanceBattle, attackers, battleStatus, clearOrders, createBattle, orderAttack, orderMove, retreat, unitIdsOfKinds } from '../game/battle.js';
import { applyBattleResult } from '../game/campaign.js';
import { formatDuration } from '../game/logic.js';
import { generateMission, missionName } from '../game/missions.js';
import * as prefs from '../game/prefs.js';
import { depthOf, inViewport, isTileVisible, panBy, resetView, screenToTile, spriteScale, tileBase, tileCenter, tileSize, view, zoomAt } from '../game/projection.js';
import { contentBounds } from '../game/sprites.js';
import * as store from '../game/store.js';
import { wallConnectors } from '../game/walls.js';
import { renderConnectors } from './connectors.js';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const DEPTH = { terrain: 0, world: 10, fx: 60, ui: 150, buttons: 160, modal: 400 };
const COLORS = { hud: 0x243624, button: 0x324a32, on: 0x5a7a3a, ok: 0x66dd66, bad: 0xdd5555, gold: 0xd4a017 };
const TEXT = { gold: '#ffe9a0', wood: '#e8c79a', normal: '#e8eee0', bad: '#ff8a7a' };

// Los edificios enemigos usan los mismos dibujos que los tuyos, teñidos de rojo.
const BUILDING_SPRITE = {
  hall: 'townhall_2', tower: 'tower_2', wall: 'wall_2', mine: 'mine_2',
  sawmill: 'sawmill_1', storage: 'storage_1', barracks: 'barracks_2', farm: 'farm_1',
};
const UNIT_SPRITE = {
  soldier: 'unit_soldier', mage: 'unit_mage', knight: 'unit_knight', hero: 'unit_hero',
  guard: 'enemy_guard', brute: 'enemy_brute',
};
const ENEMY_TINT = 0xffc2b2;
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
    this.level = data?.level ?? 1;
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
    this.viewDirty = true;
    this.connectors = new Map(); // enlaces entre los muros enemigos que siguen en pie
  }

  create() {
    this.sound.mute = prefs.get().muted;
    this.input.addPointer(1);
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys('W,A,S,D');

    const state = store.get();
    this.mission = generateMission(this.level);
    this.battle = createBattle(this.mission, state.army, state.hero);

    resetView(START_CENTER);
    zoomAt(LAYOUT.width / 2, LAYOUT.gridTop + LAYOUT.viewHeight / 2, START_ZOOM);

    this.createTerrain();
    this.createEntities();
    this.createHud();
    this.createChips();
    this.createSideButtons();
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

    this.showToast(`${missionName(this.level)}: destruye el Ayuntamiento enemigo`, 2600);
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
        const key = (x * 7 + y * 13) % 3 === 0 ? 'grass_b' : 'grass_a';
        this.terrain.push({ x, y, img: this.add.image(0, 0, key).setDepth(DEPTH.terrain) });
      }
    }
  }

  createEntities() {
    for (const e of this.battle.buildings) {
      const img = this.add.image(0, 0, BUILDING_SPRITE[e.type]).setTint(ENEMY_TINT).setDepth(DEPTH.world + depthOf(e.x, e.y));
      this.entries.set(e.id, { ent: e, img, rubble: null, baseTint: ENEMY_TINT, lastX: e.x });
    }
    for (const u of this.battle.units) {
      const img = this.add.image(0, 0, UNIT_SPRITE[u.type]);
      this.entries.set(u.id, { ent: u, img, rubble: null, baseTint: null, lastX: u.x });
    }
  }

  createHud() {
    const d = DEPTH.ui;
    this.add.rectangle(LAYOUT.width / 2, LAYOUT.hudHeight / 2, LAYOUT.width, LAYOUT.hudHeight, COLORS.hud).setDepth(d);
    this.hudTop = this.add.text(16, 20, '', { fontFamily: FONT, fontSize: '18px', color: TEXT.gold, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(d + 1);
    this.hudBottom = this.add.text(16, 46, '', { fontFamily: FONT, fontSize: '13px', color: '#9fc8ef' }).setOrigin(0, 0.5).setDepth(d + 1);

    const btn = this.add
      .rectangle(LAYOUT.width - 70, LAYOUT.hudHeight / 2, 116, 40, COLORS.button)
      .setStrokeStyle(2, 0x4a6a4a)
      .setInteractive({ useHandCursor: true })
      .setDepth(d + 1);
    this.speedText = this.add.text(btn.x, btn.y, '', { fontFamily: FONT, fontSize: '14px', color: TEXT.normal }).setOrigin(0.5).setDepth(d + 2);
    btn.on('pointerdown', () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.play('select');
    });
  }

  /** Barra inferior con 7 botones: grupos de tropas, «Auto» y «Retirada». */
  createChips() {
    const slots = 7;
    const w = LAYOUT.width / slots;
    const cy = LAYOUT.barTop + LAYOUT.barHeight / 2;
    this.add.rectangle(LAYOUT.width / 2, cy, LAYOUT.width, LAYOUT.barHeight, COLORS.hud).setDepth(DEPTH.ui);

    const defs = [
      { id: 'all', label: 'Todos', kinds: null },
      { id: 'soldier', label: 'Soldados', kinds: ['soldier'], icon: 'unit_soldier' },
      { id: 'mage', label: 'Hechiceros', kinds: ['mage'], icon: 'unit_mage' },
      { id: 'knight', label: 'Caballeros', kinds: ['knight'], icon: 'unit_knight' },
      { id: 'hero', label: 'Héroe', kinds: ['hero'], icon: 'unit_hero' },
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
      if (def.icon) this.fitIcon(this.add.image(0, 0, def.icon), def.icon, cx, cy - 24, 28).setDepth(DEPTH.ui + 2);
      else {
        const glyph = { all: '★', auto: '⟲', retreat: '⚑' }[def.id];
        this.add.text(cx, cy - 24, glyph, { fontFamily: FONT, fontSize: '22px', color: def.id === 'retreat' ? '#ff9a8a' : '#cfe3ff' }).setOrigin(0.5).setDepth(DEPTH.ui + 2);
      }
      const label = this.add
        .text(cx, cy + 12, '', { fontFamily: FONT, fontSize: '11px', color: TEXT.normal, align: 'center', lineSpacing: 2 })
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

  createSideButtons() {
    const x = LAYOUT.width - 24;
    const top = LAYOUT.gridTop;
    const make = (y, text, size, onClick) => {
      const rect = this.add
        .rectangle(x, y, 34, 34, 0x1a2a1a, 0.82)
        .setStrokeStyle(2, 0x86a083)
        .setInteractive({ useHandCursor: true })
        .setDepth(DEPTH.buttons);
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
    this.boxButton = make(top + 106, '▭', '18px', () => {
      this.boxMode = !this.boxMode;
      this.showToast(this.boxMode ? 'Recuadro: arrastra sobre el mapa para elegir tropas' : 'Recuadro desactivado');
    });
    make(top + 146, '⌂', '18px', () => {
      resetView(START_CENTER);
      zoomAt(mid().x, mid().y, START_ZOOM);
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

  onEvent(ev) {
    const target = this.entries.get(ev.to ?? ev.id);
    if (ev.type === 'hit' || ev.type === 'shot') {
      if (target) this.flash.set(target.ent.id, this.time.now + 90);
      if (ev.type === 'shot') {
        this.projectile(this.entries.get(ev.from)?.ent, target?.ent);
        this.play('shoot', 90);
      } else this.play('hit', 80);
    } else if (ev.type === 'die' && target?.ent.kind === 'unit') {
      this.selection.delete(ev.id);
      this.tweens.add({ targets: target.img, alpha: 0, duration: 500, onComplete: () => target.img.destroy() });
    } else if (ev.type === 'destroy' && target) {
      this.play('boom', 120);
      const c = tileCenter(target.ent.x, target.ent.y);
      this.dust(c.x, c.y);
      target.rubble = this.add.image(0, 0, 'rock_a').setDepth(DEPTH.world + depthOf(target.ent.x, target.ent.y) - 0.1);
    } else if (ev.type === 'end') {
      this.finish();
    }
  }

  projectile(from, to) {
    if (!from || !to) return;
    const a = tileBase(from.x, from.y);
    const b = tileBase(to.x, to.y);
    const ts = tileSize();
    const orb = this.add.circle(a.x, a.y - ts * 0.5, 3, from.kind === 'building' ? 0x3a2a1a : 0x66ccff).setDepth(DEPTH.fx + 1);
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

  finish() {
    if (this.finished) return;
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
      .map(([k, n]) => `${n} ${{ soldier: 'soldado(s)', mage: 'hechicero(s)', knight: 'caballero(s)' }[k]}`)
      .join(', ');
    const hero = r.hero;
    const heroLine = hero
      ? `Héroe: +${r.xp} XP · nivel ${hero.level}${hero.next ? ` (${hero.xp}/${hero.next})` : ' (máximo)'}${r.heroLevelUps ? ' · ¡SUBE DE NIVEL!' : ''}`
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

  renderEntities() {
    const now = this.time.now;

    // Los muros enemigos que siguen en pie se ven unidos; al caer uno, desaparecen sus enlaces.
    const standing = this.battle.buildings.filter((e) => e.alive).map((e) => ({ type: e.type, x: e.x, y: e.y, level: 2 }));
    renderConnectors(this, this.connectors, wallConnectors(standing), { grow: BUILDING_GROW, tintFor: () => ENEMY_TINT });
    for (const entry of this.entries.values()) {
      const e = entry.ent;
      const { img } = entry;
      if (!img.active) continue; // ya se destruyó (unidad caída)

      if (e.kind === 'building') {
        const visible = isTileVisible(e.x, e.y);
        if (!e.alive) {
          img.setVisible(false);
          if (entry.rubble) {
            this.placeOnTile(entry.rubble, 'rock_a', e.x, e.y, 0.9).setVisible(visible);
          }
          continue;
        }
        img.setVisible(visible);
        if (visible) this.placeOnTile(img, BUILDING_SPRITE[e.type], e.x, e.y, BUILDING_GROW);
      } else if (e.alive) {
        const visible = isTileVisible(Math.round(e.x), Math.round(e.y));
        img.setVisible(visible);
        if (!visible) continue;
        const grow = e.type === 'hero' ? UNIT_GROW * 1.3 : UNIT_GROW;
        this.placeOnTile(img, UNIT_SPRITE[e.type], e.x, e.y, grow).setDepth(DEPTH.world + e.y + 0.5);
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
      if (e.hp >= e.maxHp && e.type !== 'hall' && e.type !== 'tower') continue;
      const p = tileBase(e.x, e.y);
      bar(p.x, p.y - ts * 1.05, ts * 0.9, e.hp / e.maxHp, 0xe05050);
    }
    for (const u of this.battle.units) {
      if (!u.alive || u.hp >= u.maxHp || !isTileVisible(Math.round(u.x), Math.round(u.y))) continue;
      const p = tileBase(u.x, u.y);
      bar(p.x, p.y - ts * 0.95, ts * 0.6, u.hp / u.maxHp, u.side === 'a' ? 0x55cc55 : 0xe05050);
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
    this.boxButton.setStrokeStyle(2, this.boxMode ? COLORS.ok : 0x86a083);
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
  }
}
