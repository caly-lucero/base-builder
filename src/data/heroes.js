// Héroes: 5 distintos con dos «árboles de poder» cada uno. Puedes tener varios, pero solo 2 salen a pelear.
// Todo se desbloquea solo al subir de nivel (no hay puntos que repartir):
//   Árbol 1 «Habilidad»: una habilidad activa que se lanza sola (o a mano) y mejora en 4 rangos.
//   Árbol 2 «Pasivas»: 5 bonos permanentes (vida, daño, velocidad, regeneración, armadura).
// El nivel máximo de un héroe es el doble del nivel del Ayuntamiento (tope 20).

export const HERO_MAX_LEVEL = 20;
/** Nivel máximo que puede alcanzar un héroe con el Ayuntamiento en `townHallLevel`. */
export const heroCap = (townHallLevel) => Math.min(HERO_MAX_LEVEL, Math.max(1, townHallLevel) * 2);
export const heroXpToNext = (level) => 100 * level;
export const SQUAD_SIZE = 2;

// Cuánto crece la vida y el daño base de un héroe por cada nivel sobre el 1 (fracción del valor base).
export const HERO_GROWTH = { hp: 0.12, dmg: 0.1 };

// Rangos de la habilidad: nivel del héroe que los desbloquea y cuánto mejoran (poder, enfriamiento, radio).
export const ABILITY_RANKS = [
  { level: 1, power: 1, cd: 1, radius: 0 },
  { level: 7, power: 1.3, cd: 0.9, radius: 0.3 },
  { level: 13, power: 1.65, cd: 0.8, radius: 0.6 },
  { level: 19, power: 2.1, cd: 0.7, radius: 1 },
];

// Niveles del héroe en los que se desbloquea cada pasiva (la i-ésima de `passives`).
export const PASSIVE_LEVELS = [3, 6, 10, 14, 18];

// Habilidades. `kind` decide qué hacen en la batalla (ver battle.js):
//   shield  aliados cercanos reciben menos daño `dur` s     (power = fracción que se evita)
//   volley  daño en área sobre el grupo enemigo más cercano (power = daño base)
//   fire    daño en área, grande y corto                    (power = daño base)
//   heal    cura a los aliados cercanos                     (power = vida curada)
//   warcry  aliados cercanos hacen más daño `dur` s         (power = multiplicador extra)
export const HEROES = {
  paladin: {
    name: 'Paladín',
    title: 'Guardián de la base',
    sprite: 'unit_hero',
    altarLevel: 1,
    cost: { gold: 300, wood: 150 },
    trainSec: 60,
    supply: 3,
    combat: { hp: 260, dmg: 16, range: 1.1, speed: 2.0, atkSec: 0.9 },
    ability: { kind: 'shield', name: 'Escudo sagrado', text: 'Los aliados cercanos reciben la mitad del daño', cdSec: 14, radius: 3, power: 0.5, dur: 5 },
    passives: [
      { type: 'armor', value: 0.1, text: '+10 % de armadura' },
      { type: 'hp', value: 0.15, text: '+15 % de vida' },
      { type: 'regen', value: 3, text: 'Regenera 3 de vida por segundo' },
      { type: 'armor', value: 0.1, text: '+10 % de armadura' },
      { type: 'dmg', value: 0.15, text: '+15 % de daño' },
    ],
  },
  ranger: {
    name: 'Cazadora',
    title: 'Maestra del arco',
    sprite: 'hero_ranger',
    altarLevel: 2,
    cost: { gold: 320, wood: 170 },
    trainSec: 65,
    supply: 3,
    combat: { hp: 170, dmg: 20, range: 4.6, speed: 2.2, atkSec: 0.8 },
    ability: { kind: 'volley', name: 'Lluvia de flechas', text: 'Daño en área sobre el grupo enemigo más cercano', cdSec: 12, radius: 2, power: 55, dur: 0 },
    passives: [
      { type: 'dmg', value: 0.1, text: '+10 % de daño' },
      { type: 'speed', value: 0.1, text: '+10 % de velocidad' },
      { type: 'dmg', value: 0.1, text: '+10 % de daño' },
      { type: 'hp', value: 0.15, text: '+15 % de vida' },
      { type: 'dmg', value: 0.15, text: '+15 % de daño' },
    ],
  },
  priestess: {
    name: 'Sacerdotisa',
    title: 'Luz que sana',
    sprite: 'hero_priest',
    altarLevel: 4,
    cost: { gold: 340, wood: 180 },
    trainSec: 70,
    supply: 3,
    combat: { hp: 190, dmg: 10, range: 3.0, speed: 2.0, atkSec: 1.2 },
    ability: { kind: 'heal', name: 'Sanación', text: 'Cura a los aliados cercanos', cdSec: 12, radius: 3.5, power: 70, dur: 0 },
    passives: [
      { type: 'regen', value: 2, text: 'Regenera 2 de vida por segundo' },
      { type: 'hp', value: 0.15, text: '+15 % de vida' },
      { type: 'armor', value: 0.08, text: '+8 % de armadura' },
      { type: 'regen', value: 3, text: 'Regenera 3 de vida por segundo más' },
      { type: 'hp', value: 0.2, text: '+20 % de vida' },
    ],
  },
  pyromancer: {
    name: 'Piromante',
    title: 'Señor del fuego',
    sprite: 'hero_pyro',
    altarLevel: 6,
    cost: { gold: 360, wood: 190 },
    trainSec: 75,
    supply: 3,
    combat: { hp: 150, dmg: 22, range: 3.6, speed: 1.8, atkSec: 1.1 },
    ability: { kind: 'fire', name: 'Bola de fuego', text: 'Gran daño en área', cdSec: 15, radius: 2.2, power: 90, dur: 0 },
    passives: [
      { type: 'dmg', value: 0.12, text: '+12 % de daño' },
      { type: 'hp', value: 0.12, text: '+12 % de vida' },
      { type: 'dmg', value: 0.12, text: '+12 % de daño' },
      { type: 'speed', value: 0.1, text: '+10 % de velocidad' },
      { type: 'dmg', value: 0.2, text: '+20 % de daño' },
    ],
  },
  warlord: {
    name: 'Comandante',
    title: 'Grito de guerra',
    sprite: 'hero_warlord',
    altarLevel: 8,
    cost: { gold: 380, wood: 200 },
    trainSec: 80,
    supply: 3,
    combat: { hp: 230, dmg: 19, range: 1.1, speed: 2.1, atkSec: 0.85 },
    ability: { kind: 'warcry', name: 'Grito de guerra', text: 'Los aliados cercanos hacen más daño', cdSec: 16, radius: 4, power: 0.4, dur: 6 },
    passives: [
      { type: 'dmg', value: 0.1, text: '+10 % de daño' },
      { type: 'speed', value: 0.08, text: '+8 % de velocidad' },
      { type: 'hp', value: 0.15, text: '+15 % de vida' },
      { type: 'armor', value: 0.1, text: '+10 % de armadura' },
      { type: 'dmg', value: 0.15, text: '+15 % de daño' },
    ],
  },
};

export const HERO_KEYS = Object.keys(HEROES);
export const isHeroKey = (key) => typeof key === 'string' && Object.hasOwn(HEROES, key);

/** Rango de la habilidad (0–3) que tiene un héroe de ese nivel. */
export function abilityRank(level) {
  let rank = 0;
  ABILITY_RANKS.forEach((r, i) => {
    if (level >= r.level) rank = i;
  });
  return rank;
}

/** Cuántas pasivas tiene ya desbloqueadas. */
export const passivesUnlocked = (level) => PASSIVE_LEVELS.filter((l) => level >= l).length;

/**
 * Habilidad lista para usar a ese nivel: { kind, name, cdSec, radius, power, dur, rank }.
 * El poder y el radio crecen con el rango y el poder, además, un poco con el nivel.
 */
export function abilityAt(key, level) {
  const def = HEROES[key].ability;
  const rank = abilityRank(level);
  const r = ABILITY_RANKS[rank];
  const scaling = def.kind === 'shield' || def.kind === 'warcry' ? 1 : 1 + 0.04 * (level - 1); // las de «porcentaje» no crecen con el nivel
  const power = def.kind === 'shield' ? Math.min(0.8, def.power + 0.07 * rank) : def.kind === 'warcry' ? def.power + 0.1 * rank : def.power * r.power * scaling;
  return {
    kind: def.kind,
    name: def.name,
    cdSec: Math.round(def.cdSec * r.cd * 10) / 10,
    radius: Math.round((def.radius + r.radius) * 10) / 10,
    power: Math.round(power * 100) / 100,
    dur: def.dur,
    rank,
  };
}

/** Suma de las pasivas desbloqueadas: { hp, dmg, speed, armor (fracciones) y regen (vida/s) }. */
export function passivesAt(key, level) {
  const total = { hp: 0, dmg: 0, speed: 0, armor: 0, regen: 0 };
  HEROES[key].passives.slice(0, passivesUnlocked(level)).forEach((p) => {
    total[p.type] += p.value;
  });
  total.armor = Math.min(0.6, total.armor);
  return total;
}

/** Estadísticas de combate de un héroe a ese nivel: base, crecimiento por nivel y pasivas. */
export function heroStats(key, level) {
  const base = HEROES[key].combat;
  const extra = Math.max(0, level - 1);
  const p = passivesAt(key, level);
  return {
    hp: Math.round(base.hp * (1 + HERO_GROWTH.hp * extra) * (1 + p.hp)),
    dmg: Math.round(base.dmg * (1 + HERO_GROWTH.dmg * extra) * (1 + p.dmg) * 10) / 10,
    range: base.range,
    speed: Math.round(base.speed * (1 + p.speed) * 100) / 100,
    atkSec: base.atkSec,
    armor: p.armor,
    regen: p.regen,
  };
}
