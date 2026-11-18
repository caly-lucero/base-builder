// Datos del juego. Balancear = editar este archivo, sin tocar la lógica.

// El mapa es de 24×24 casillas; en pantalla se ve una parte (ver CAMERA y LAYOUT).
export const GRID = { cols: 24, rows: 24, tile: 48 };

/** Lado en píxeles de los sprites originales (pack Kenney Medieval RTS). */
export const ART_SIZE = 64;

// Medidas de la pantalla del juego (px lógicos). El ancho es fijo (pensado para un celular en vertical:
// casi 1 px lógico = 1 px real); el alto se adapta a la pantalla con fitLayout() al arrancar.
export const LAYOUT = {
  width: 432,
  hudHeight: 56,
  viewHeight: 640, // alto de la ventana por la que se ve el mapa
  barHeight: 64,
  get gridTop() {
    return this.hudHeight;
  },
  get barTop() {
    return this.hudHeight + this.viewHeight;
  },
  get height() {
    return this.hudHeight + this.viewHeight + this.barHeight;
  },
};

/** Adapta el alto del lienzo a la proporción de la pantalla (para que un celular alto se aproveche entero). */
export function fitLayout(screenW, screenH) {
  if (!(screenW > 0 && screenH > 0)) return;
  const total = Math.round((LAYOUT.width * screenH) / screenW);
  LAYOUT.viewHeight = Math.min(900, Math.max(520, total - LAYOUT.hudHeight - LAYOUT.barHeight));
}

export const CAMERA = {
  minZoom: 0.25, // con 0.25 casi todo el mapa (un rombo de 24×24 casillas) cabe en la ventana
  maxZoom: 1.6,
  startZoom: 1.0, // zoom al abrir la base (más cerca: en el celular se ve grande y se toca bien)
  holdToMoveMs: 380, // con el dedo, tiempo que hay que mantener pulsado un edificio antes de poder arrastrarlo
  dragThreshold: 8, // píxeles que hay que mover antes de que un toque sea un arrastre
  keyPanSpeed: 420, // píxeles por segundo con las flechas
};

export { HERO_MAX_LEVEL, HERO_GROWTH, SQUAD_SIZE, heroCap, heroXpToNext } from './heroes.js';

/** Nivel máximo de todos los edificios. */
export const MAX_LEVEL = 10;

export const RESOURCES = ['gold', 'wood'];
export const RESOURCE_NAMES = { gold: 'oro', wood: 'madera' };

export const ECONOMY = {
  start: { gold: 250, wood: 60 },
  baseCap: 500, // máximo de cada recurso sin almacenes
  maxOfflineMs: 8 * 60 * 60 * 1000, // la producción sin conexión se limita a 8 h
  refundRate: 0.5, // al demoler se devuelve el 50 % de lo invertido (construcción + mejoras)
  builders: 2, // mejoras que pueden hacerse al mismo tiempo
};

// Los niveles 4 en adelante reutilizan el dibujo del nivel 3 con un tinte (campo `tint` del nivel):
// cada nivel «élite» tiene su color, así se ve de un vistazo qué tan avanzado está un edificio.
const TIER_4 = 0xfff0a8;
const TIER_5 = 0xffd45a;
const TIER_TINT = { 6: 0xb8ffb0, 7: 0x9ae4ff, 8: 0xd8a8ff, 9: 0xff9ad8, 10: 0xff9a5a };
const MAX_UPGRADE_SEC = 12 * 60 * 60; // ninguna mejora tarda más de 12 h

const roundLike = (prev, v) => (Number.isInteger(prev) ? Math.round(v) : Math.round(v * 100) / 100);
const scaleCost = (cost, f) => Object.fromEntries(Object.entries(cost ?? {}).map(([k, v]) => [k, Math.round(v * f)]));

/**
 * Extiende los niveles escritos a mano hasta el 10. Cada nivel nuevo copia al anterior y multiplica:
 * el costo y el tiempo de mejora (`cost`, `time`) y las estadísticas que se indiquen en `stats`.
 */
function extend(levels, { cost = 1.9, time = 1.8, stats = {} } = {}) {
  const out = [...levels];
  for (let level = levels.length + 1; level <= MAX_LEVEL; level++) {
    const prev = out[level - 2];
    const next = { ...prev, tint: TIER_TINT[level] };
    for (const [key, factor] of Object.entries(stats)) next[key] = roundLike(prev[key], prev[key] * factor);
    next.upgradeCost = scaleCost(prev.upgradeCost, cost);
    next.upgradeSec = Math.min(MAX_UPGRADE_SEC, Math.round(prev.upgradeSec * time));
    out.push(next);
  }
  return out;
}

// Cuántos edificios de cada tipo permite cada nivel del Ayuntamiento (índice 0 = nivel 1).
// Un 0 significa que aún no se puede construir: así el Ayuntamiento desbloquea los edificios militares
// (Cuartel con el nivel 2, Arquería 4, Atelier 6, Caballeriza 8, Taller de asedio 10).
const LIMITS = {
  mine: [3, 5, 8, 10, 12, 14, 16, 18, 20, 22],
  sawmill: [2, 3, 5, 7, 9, 11, 13, 15, 17, 19],
  house: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  storage: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  tower: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  wall: [20, 50, 100, 150, 220, 260, 300, 340, 380, 420],
  gate: [4, 10, 20, 30, 45, 55, 65, 75, 85, 95],
  // Edificios militares: solo UNO de cada clase (su nivel y su lote de entrenamiento crecen al mejorarlo).
  barracks: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  altar: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  forge: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  archery: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
  atelier: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
  stable: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  siege: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
};
const limitsAt = (level) => Object.fromEntries(Object.entries(LIMITS).map(([type, list]) => [type, list[level - 1]]));

// Lo que cuesta y tarda subir el Ayuntamiento HASTA cada nivel (el 1 viene con la partida).
const TOWN_HALL_UP = [null, { gold: 300, wood: 150, sec: 90 }, { gold: 800, wood: 400, sec: 300 }, { gold: 1800, wood: 900, sec: 600 }, { gold: 3500, wood: 1800, sec: 1200 }];
// Población propia del Ayuntamiento por nivel.
const TOWN_HALL_SUPPLY = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

/** Niveles del Ayuntamiento: 1–5 a mano y 6–10 por fórmula. Su nivel manda sobre todo lo demás. */
function townHallLevels() {
  const levels = [];
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const l = { sprite: `townhall_${Math.min(level, 3)}`, baseSupply: TOWN_HALL_SUPPLY[level - 1], limits: limitsAt(level) };
    if (level === 4) l.tint = TIER_4;
    if (level === 5) l.tint = TIER_5;
    if (level >= 6) l.tint = TIER_TINT[level];
    const up = TOWN_HALL_UP[level - 1];
    if (up) {
      l.upgradeCost = { gold: up.gold, wood: up.wood };
      l.upgradeSec = up.sec;
    } else if (level > 5) {
      const prev = levels[level - 2];
      l.upgradeCost = scaleCost(prev.upgradeCost, 2.0);
      l.upgradeSec = Math.min(MAX_UPGRADE_SEC, Math.round(prev.upgradeSec * 1.9));
    }
    levels.push(l);
  }
  return levels;
}

/** Niveles de un edificio militar: mejoran el entrenamiento y, con él, a sus unidades. */
function military(sprites, k = 1) {
  const c = (gold, wood) => ({ gold: Math.round(gold * k), wood: Math.round(wood * k) });
  return extend(
    [
      { sprite: sprites[0] },
      { sprite: sprites[1], upgradeCost: c(180, 90), upgradeSec: 60 },
      { sprite: sprites[2], upgradeCost: c(400, 200), upgradeSec: 180 },
      // Desde el nivel 4 entrena más rápido (`trainFactor` multiplica el tiempo de entrenamiento).
      { sprite: sprites[2], tint: TIER_4, trainFactor: 0.8, upgradeCost: c(800, 400), upgradeSec: 420 },
      { sprite: sprites[2], tint: TIER_5, trainFactor: 0.6, upgradeCost: c(1600, 800), upgradeSec: 840 },
    ],
    { stats: { trainFactor: 0.93 } },
  );
}

// Cada edificio tiene una lista de 10 niveles. El nivel 1 se construye con `cost`; los siguientes indican
// lo que cuesta y tarda mejorar HASTA ese nivel (`upgradeCost`, `upgradeSec`). `sprite` es la clave de imagen
// (ver assets.js); las demás claves son las estadísticas. Los costos son { gold, wood } (lo que falte vale 0).
//
// Inspirado en Warcraft III: el Ayuntamiento sube (Ayuntamiento → Fortaleza → Castillo…), y su nivel manda:
// cuántos edificios de cada tipo se pueden tener (`limits`) y hasta qué nivel se puede mejorar el resto.
export const BUILDINGS = {
  townhall: {
    name: 'Ayuntamiento',
    buildable: false, // lo trae la partida; no se construye ni se demuele
    cost: {},
    levelNames: ['Ayuntamiento', 'Fortaleza', 'Castillo', 'Ciudadela', 'Capital', 'Reino', 'Imperio', 'Dominio', 'Trono', 'Corona'],
    // `baseSupply`: población que da el propio Ayuntamiento (las casas suman más).
    levels: townHallLevels(),
  },
  mine: {
    name: 'Mina de oro',
    shortName: 'Mina', // para la barra de herramientas
    cost: { gold: 50 },
    levels: extend(
      [
        { sprite: 'mine_1', produces: 'gold', ratePerSec: 0.5, capacity: 120 },
        { sprite: 'mine_2', produces: 'gold', ratePerSec: 0.9, capacity: 240, upgradeCost: { gold: 100 }, upgradeSec: 30 },
        { sprite: 'mine_3', produces: 'gold', ratePerSec: 1.5, capacity: 480, upgradeCost: { gold: 250, wood: 50 }, upgradeSec: 120 },
        { sprite: 'mine_3', tint: TIER_4, produces: 'gold', ratePerSec: 2.2, capacity: 800, upgradeCost: { gold: 500, wood: 150 }, upgradeSec: 300 },
        { sprite: 'mine_3', tint: TIER_5, produces: 'gold', ratePerSec: 3.2, capacity: 1400, upgradeCost: { gold: 1000, wood: 350 }, upgradeSec: 600 },
      ],
      { stats: { ratePerSec: 1.3, capacity: 1.5 } },
    ),
  },
  sawmill: {
    name: 'Aserradero',
    cost: { gold: 60 },
    levels: extend(
      [
        { sprite: 'sawmill_1', produces: 'wood', ratePerSec: 0.4, capacity: 100 },
        { sprite: 'sawmill_2', produces: 'wood', ratePerSec: 0.7, capacity: 200, upgradeCost: { gold: 90, wood: 20 }, upgradeSec: 30 },
        { sprite: 'sawmill_3', produces: 'wood', ratePerSec: 1.1, capacity: 400, upgradeCost: { gold: 200, wood: 60 }, upgradeSec: 120 },
        { sprite: 'sawmill_3', tint: TIER_4, produces: 'wood', ratePerSec: 1.6, capacity: 700, upgradeCost: { gold: 350, wood: 140 }, upgradeSec: 300 },
        { sprite: 'sawmill_3', tint: TIER_5, produces: 'wood', ratePerSec: 2.3, capacity: 1200, upgradeCost: { gold: 700, wood: 300 }, upgradeSec: 600 },
      ],
      { stats: { ratePerSec: 1.3, capacity: 1.5 } },
    ),
  },
  storage: {
    name: 'Almacén',
    cost: { gold: 100, wood: 30 },
    levels: extend(
      [
        { sprite: 'storage_1', capBonus: 500 }, // sube el tope de oro Y de madera
        { sprite: 'storage_2', capBonus: 1000, upgradeCost: { gold: 150, wood: 60 }, upgradeSec: 45 },
        { sprite: 'storage_3', capBonus: 2000, upgradeCost: { gold: 400, wood: 150 }, upgradeSec: 180 },
        { sprite: 'storage_3', tint: TIER_4, capBonus: 3500, upgradeCost: { gold: 700, wood: 300 }, upgradeSec: 360 },
        { sprite: 'storage_3', tint: TIER_5, capBonus: 6000, upgradeCost: { gold: 1400, wood: 700 }, upgradeSec: 720 },
      ],
      { stats: { capBonus: 1.6 } },
    ),
  },
  tower: {
    name: 'Torre',
    cost: { gold: 150, wood: 60 },
    // Dispara a los atacantes de tu base; su vida y su daño crecen con el nivel (ver DEFENSE).
    levels: extend([
      { sprite: 'tower_1' },
      { sprite: 'tower_2', upgradeCost: { gold: 200, wood: 100 }, upgradeSec: 60 },
      { sprite: 'tower_3', upgradeCost: { gold: 500, wood: 250 }, upgradeSec: 240 },
      { sprite: 'tower_3', tint: TIER_4, upgradeCost: { gold: 900, wood: 450 }, upgradeSec: 480 },
      { sprite: 'tower_3', tint: TIER_5, upgradeCost: { gold: 1800, wood: 900 }, upgradeSec: 900 },
    ]),
  },
  wall: {
    name: 'Muro',
    cost: { wood: 8 },
    // En el combate frena a las unidades enemigas.
    levels: extend(
      [
        { sprite: 'wall_1' },
        { sprite: 'wall_2', upgradeCost: { wood: 20 }, upgradeSec: 10 },
        { sprite: 'wall_3', upgradeCost: { wood: 50 }, upgradeSec: 20 },
        { sprite: 'wall_3', tint: TIER_4, upgradeCost: { wood: 120 }, upgradeSec: 40 },
        { sprite: 'wall_3', tint: TIER_5, upgradeCost: { wood: 250 }, upgradeSec: 80 },
      ],
      { cost: 2.0, time: 1.8 },
    ),
  },
  gate: {
    name: 'Puerta',
    cost: { wood: 30 },
    // Como un muro con paso: en el combate deja pasar a las unidades propias.
    levels: extend(
      [
        { sprite: 'gate_1' },
        { sprite: 'gate_2', upgradeCost: { wood: 60 }, upgradeSec: 15 },
        { sprite: 'gate_3', upgradeCost: { wood: 120 }, upgradeSec: 30 },
        { sprite: 'gate_3', tint: TIER_4, upgradeCost: { wood: 240 }, upgradeSec: 60 },
        { sprite: 'gate_3', tint: TIER_5, upgradeCost: { wood: 480 }, upgradeSec: 120 },
      ],
      { cost: 2.0, time: 1.8 },
    ),
  },
  house: {
    name: 'Casa',
    cost: { gold: 60, wood: 20 },
    // `supply`: población que suma. Sin población libre no se pueden entrenar más unidades.
    levels: extend(
      [
        { sprite: 'house_1', supply: 6 },
        { sprite: 'house_2', supply: 10, upgradeCost: { gold: 90, wood: 40 }, upgradeSec: 30 },
        { sprite: 'house_3', supply: 16, upgradeCost: { gold: 200, wood: 80 }, upgradeSec: 120 },
        { sprite: 'house_3', tint: TIER_4, supply: 24, upgradeCost: { gold: 400, wood: 160 }, upgradeSec: 300 },
        { sprite: 'house_3', tint: TIER_5, supply: 34, upgradeCost: { gold: 800, wood: 350 }, upgradeSec: 600 },
      ],
      { stats: { supply: 1.35 } },
    ),
  },
  // --- Edificios militares: cada uno entrena un tipo de unidad. Su nivel es el de sus unidades. ---
  barracks: {
    name: 'Cuartel',
    cost: { gold: 120, wood: 60 },
    trains: ['soldier'],
    levels: military(['barracks_1', 'barracks_2', 'barracks_3']),
  },
  archery: {
    name: 'Arquería',
    cost: { gold: 160, wood: 90 },
    trains: ['archer'],
    levels: military(['archery_1', 'archery_2', 'archery_3'], 1.2),
  },
  atelier: {
    name: 'Atelier',
    cost: { gold: 220, wood: 120 },
    trains: ['mage'],
    levels: military(['atelier_1', 'atelier_2', 'atelier_3'], 1.5),
  },
  stable: {
    name: 'Caballeriza',
    shortName: 'Caballer.', // para la barra de herramientas
    cost: { gold: 300, wood: 160 },
    trains: ['knight'],
    levels: military(['stable_1', 'stable_2', 'stable_3'], 1.8),
  },
  siege: {
    name: 'Taller de asedio',
    shortName: 'Asedio',
    cost: { gold: 500, wood: 320 },
    trains: ['catapult', 'ram'],
    levels: military(['siege_1', 'siege_2', 'siege_3'], 2.4),
  },
  forge: {
    name: 'Herrería',
    cost: { gold: 260, wood: 150 },
    trains: ['weapons', 'armor', 'fortify'], // aquí no se entrena: se investigan mejoras (ver RESEARCH)
    levels: military(['forge_1', 'forge_2', 'forge_3'], 1.4),
  },
  altar: {
    name: 'Altar del héroe',
    shortName: 'Altar',
    cost: { gold: 200, wood: 100 },
    trains: ['paladin', 'ranger', 'priestess', 'pyromancer', 'warlord'], // los 5 héroes (ver heroes.js)
    levels: extend([
      { sprite: 'altar_1' },
      { sprite: 'altar_1', upgradeCost: { gold: 250, wood: 120 }, upgradeSec: 90 },
      { sprite: 'altar_1', upgradeCost: { gold: 500, wood: 250 }, upgradeSec: 240 },
      { sprite: 'altar_1', tint: TIER_4, upgradeCost: { gold: 900, wood: 450 }, upgradeSec: 480 },
      { sprite: 'altar_1', tint: TIER_5, upgradeCost: { gold: 1700, wood: 850 }, upgradeSec: 900 },
    ]),
  },
};

// Unidades del ejército. Se entrenan en el edificio `building`, que además fija su NIVEL: a más nivel del
// edificio, más vida y daño (`perLevel` = fracción que suma cada nivel sobre el 1). `minLevel` es el nivel
// que necesita ese edificio para entrenarla. Cada unidad ocupa `supply` de población desde que empieza a entrenarse.
// `combat`: vida, daño por golpe, alcance (casillas), velocidad (casillas/s) y segundos entre golpes.
// Extras: `bonus` (más daño contra ciertos tipos), `splash` (daño en área alrededor del objetivo, como fracción)
// y `siege` (solo ataca edificios, y mucho; casi no daña unidades).
// Equilibrio (con el mismo gasto): el soldado vence al caballero; el caballero arrasa arqueros y magos; el arquero
// vence al mago desde lejos y queda parejo con el soldado; el mago rompe a los soldados apretados. Hay una prueba que lo vigila.
export const UNITS = {
  soldier: {
    name: 'Soldado', sprite: 'unit_soldier', building: 'barracks', cost: { gold: 40, wood: 10 }, supply: 1, trainSec: 15, minLevel: 1, perLevel: 0.15,
    combat: { hp: 70, dmg: 8, range: 0.9, speed: 1.8, atkSec: 0.8 },
    bonus: { knight: 1.5 },
  },
  archer: {
    name: 'Arquero', sprite: 'unit_archer', building: 'archery', cost: { gold: 55, wood: 25 }, supply: 1, trainSec: 20, minLevel: 1, perLevel: 0.15,
    combat: { hp: 56, dmg: 12, range: 4.2, speed: 1.7, atkSec: 0.9 },
    bonus: { soldier: 1.25 },
  },
  mage: {
    name: 'Hechicero', sprite: 'unit_mage', building: 'atelier', cost: { gold: 85, wood: 40 }, supply: 1, trainSec: 28, minLevel: 1, perLevel: 0.15,
    combat: { hp: 34, dmg: 15, range: 3.4, speed: 1.5, atkSec: 1.3 },
    splash: { radius: 1.1, fraction: 0.5 },
  },
  knight: {
    name: 'Caballero', sprite: 'unit_knight', building: 'stable', cost: { gold: 130, wood: 60 }, supply: 2, trainSec: 40, minLevel: 1, perLevel: 0.15,
    combat: { hp: 180, dmg: 15, range: 1.0, speed: 2.2, atkSec: 1.0 },
    bonus: { archer: 2, mage: 1.5 },
  },
  catapult: {
    name: 'Catapulta', sprite: 'unit_catapult', building: 'siege', cost: { gold: 220, wood: 140 }, supply: 3, trainSec: 70, minLevel: 1, perLevel: 0.15,
    combat: { hp: 110, dmg: 44, range: 6.0, speed: 0.9, atkSec: 3.0 },
    siege: { vsUnits: 0.15 },
  },
  ram: {
    name: 'Ariete', sprite: 'unit_ram', building: 'siege', cost: { gold: 260, wood: 180 }, supply: 3, trainSec: 80, minLevel: 5, perLevel: 0.15,
    combat: { hp: 320, dmg: 55, range: 1.0, speed: 1.2, atkSec: 2.2 },
    siege: { vsUnits: 0.1 },
  },
};

// Entrenamiento por lotes: un edificio entrena varias unidades iguales a la vez. Cuántas, según su nivel;
// el lote entero tarda un poco más que una sola unidad (`extraPerUnit` por cada unidad de más).
export const BATCH = { base: 3, perLevel: 2, extraPerUnit: 0.1 };
export const batchLimit = (level) => BATCH.base + BATCH.perLevel * level;
export const batchTimeFactor = (qty) => 1 + BATCH.extraPerUnit * (Math.max(1, qty) - 1);

// Los edificios militares únicos (uno de cada): sirven para unificar partidas antiguas con varios.
export const UNIQUE_BUILDINGS = ['barracks', 'archery', 'atelier', 'stable', 'siege', 'forge', 'altar'];

/** Unidades del ejército (los héroes van aparte: ver heroes.js). */
export const ARMY_UNITS = Object.keys(UNITS);

// Investigaciones de la Herrería. Cada una sube un nivel por vez (hasta el nivel de la herrería, máx. 10);
// un nivel cuesta `baseCost` × `RESEARCH_COST_GROWTH`^(nivel actual) y tarda `baseSec` × `RESEARCH_TIME_GROWTH`^(nivel actual).
export const RESEARCH = {
  weapons: { name: 'Armas afiladas', text: '+6 % de daño de tus unidades por nivel', perLevel: 0.06, baseCost: { gold: 150, wood: 80 }, baseSec: 120 },
  armor: { name: 'Armaduras', text: '+6 % de vida de tus unidades por nivel', perLevel: 0.06, baseCost: { gold: 140, wood: 100 }, baseSec: 120 },
  fortify: { name: 'Fortificaciones', text: '+8 % de vida de tus edificios y de daño de tus torres por nivel', perLevel: 0.08, baseCost: { gold: 120, wood: 140 }, baseSec: 150 },
};
export const RESEARCH_KEYS = Object.keys(RESEARCH);
export const RESEARCH_COST_GROWTH = 1.7;
export const RESEARCH_TIME_GROWTH = 1.6;

/** Costo y duración de subir `track` desde el nivel `level` al siguiente. */
export function researchStep(track, level) {
  const r = RESEARCH[track];
  return {
    cost: scaleCost(r.baseCost, RESEARCH_COST_GROWTH ** level),
    sec: Math.min(MAX_UPGRADE_SEC, Math.round(r.baseSec * RESEARCH_TIME_GROWTH ** level)),
  };
}

// Combate. Las posiciones son casillas con decimales (0.5 = media casilla).
export const COMBAT = {
  tickSec: 0.1, // paso fijo de la simulación
  timeLimitSec: 180, // la batalla termina a los 3 minutos
  aggro: 4.5, // distancia a la que una unidad se fija en un enemigo cercano
  wallCost: 6, // costo extra al atravesar un muro: se prefiere rodear, pero se puede romper
  repathSec: 1, // cada cuánto se recalcula el camino
  // Experiencia de los héroes: llega SIEMPRE que pelean (ganes o pierdas) y hay un bono extra por ganar.
  heroXpPerBuilding: 6, // por cada edificio enemigo destruido (sin contar muros)
  heroXpPerKill: 4, // por cada defensor derrotado
  heroXpWin: 60, // bono por ganar, más esto por cada nivel de la misión
  heroXpPerLevel: 15,
};

// Unidades enemigas que defienden una base.
export const ENEMY_UNITS = {
  guard: { name: 'Guardia', sprite: 'enemy_guard', hp: 50, dmg: 7, range: 0.9, speed: 1.6, atkSec: 0.9 },
  brute: { name: 'Bruto', sprite: 'enemy_brute', hp: 140, dmg: 12, range: 1.0, speed: 1.5, atkSec: 1.1 },
  bowman: { name: 'Arquero enemigo', sprite: 'enemy_archer', hp: 34, dmg: 7, range: 4.0, speed: 1.6, atkSec: 1.0 },
  shaman: { name: 'Chamán', sprite: 'enemy_shaman', hp: 40, dmg: 12, range: 3.4, speed: 1.4, atkSec: 1.4, splash: { radius: 1.0, fraction: 0.5 } },
  spider: { name: 'Araña', sprite: 'enemy_spider', hp: 30, dmg: 6, range: 0.8, speed: 2.6, atkSec: 0.6 },
};

// Estrellas de un ataque (como en Clash): ★ por destruir el Ayuntamiento enemigo, ★ por destruir el 50 % de su
// base y ★ por destruirla toda (los muros no cuentan). Cada estrella NUEVA de un nivel da un premio extra.
export const STARS = { hall: 1, half: 50, all: 100, reward: { gold: 30, wood: 15, perLevel: 0.5 } };

/** Premio por una estrella nueva en un nivel de campaña: crece con el nivel. */
export const starReward = (level) => ({
  gold: Math.round(STARS.reward.gold * (1 + STARS.reward.perLevel * (level - 1))),
  wood: Math.round(STARS.reward.wood * (1 + STARS.reward.perLevel * (level - 1))),
});

// Defensa de TU base cuando el enemigo la ataca. La vida de cada edificio crece con su nivel; las
// torres disparan (más daño por nivel); tu ejército y tus héroes defienden desde donde están formados.
export const DEFENSE = {
  hpPerLevel: 0.35, // +35 % de vida por cada nivel sobre el 1
  baseHp: {
    townhall: 700, tower: 260, wall: 110, gate: 110, mine: 140, sawmill: 140, storage: 160, house: 120,
    barracks: 200, archery: 190, atelier: 180, stable: 210, siege: 220, forge: 200, altar: 150,
  },
  tower: { dmg: 9, range: 5, atkSec: 1.1, dmgPerLevel: 0.3 },
  damagedHpFactor: 0.5, // un edificio ya dañado entra a la siguiente batalla con la mitad de vida
};

// Ataques enemigos periódicos (con aviso). Tiempos en segundos de reloj real.
export const RAID = {
  firstDelaySec: 10 * 60, // el primer ataque llega 10 min después de empezar
  intervalSec: 12 * 60, // y luego uno cada 12 min (si no estás, se resuelve uno solo al volver)
  timeLimitSec: 120, // si tu defensa aguanta este tiempo, el ataque fracasa
  maxDamaged: (townHallLevel) => 2 + townHallLevel, // el enemigo se retira tras destruir tantos edificios (sin contar muros)
  stealPerBuilding: 0.06, // por cada edificio importante destruido se roba el 6 % de tus recursos...
  stealMax: 0.4, // ...hasta un máximo del 40 %
  stealHall: 0.1, // y un 10 % extra si llegan a tumbar tu Ayuntamiento
  repairRate: 0.3, // reparar un edificio cuesta el 30 % de lo invertido en él
  heroXpPerKill: 4, // experiencia de los héroes por cada atacante derrotado
  heroXpRepel: 30, // bono si el ataque fracasa
};

// Edificios de una base enemiga: vida y, las torres, su ataque. Se escalan con el nivel de la misión.
export const ENEMY_BUILDINGS = {
  hall: { name: 'Ayuntamiento enemigo', hp: 600 },
  tower: { name: 'Torre', hp: 220, dmg: 9, range: 5, atkSec: 1.1 },
  wall: { name: 'Muro', hp: 90 },
  mine: { name: 'Mina', hp: 120 },
  sawmill: { name: 'Aserradero', hp: 120 },
  storage: { name: 'Almacén', hp: 140 },
  barracks: { name: 'Cuartel', hp: 180 },
  house: { name: 'Casa', hp: 100 },
};

// La barra de herramientas se reparte en páginas para que quepan los botones.
export const TOOL_PAGES = [
  { name: 'Economía', tools: ['mine', 'sawmill', 'house', 'storage', 'wall'] },
  { name: 'Ejército', tools: ['barracks', 'archery', 'atelier', 'stable', 'siege'] },
  { name: 'Defensa', tools: ['tower', 'gate', 'altar', 'forge'] },
];

// Misiones: una cadena que guía al jugador (se hacen en orden). Cada una tiene un objetivo
// que se evalúa mirando la partida y una recompensa que se reclama al cumplirla.
//   { kind: 'count', building, min }   tener al menos `min` edificios de ese tipo
//   { kind: 'townhall', level }        Ayuntamiento al menos en ese nivel
//   { kind: 'anyLevel', level }        algún edificio (que no sea el Ayuntamiento) al menos en ese nivel
//   { kind: 'army', min }              al menos `min` unidades de ejército (sin contar a los héroes)
//   { kind: 'unit', unit, min }        al menos `min` unidades de ese tipo
//   { kind: 'hero', min }              tener al menos `min` héroes
//   { kind: 'heroLevel', level }       algún héroe al menos en ese nivel
//   { kind: 'research', level }        alguna investigación de la Herrería al menos en ese nivel
//   { kind: 'campaign', min }          haber superado al menos `min` niveles de campaña
export const QUESTS = [
  { id: 'q_sawmill', text: 'Construye un Aserradero', goal: { kind: 'count', building: 'sawmill', min: 1 }, reward: { wood: 40 } },
  { id: 'q_mines', text: 'Ten 2 Minas de oro', goal: { kind: 'count', building: 'mine', min: 2 }, reward: { gold: 60 } },
  { id: 'q_storage', text: 'Construye un Almacén', goal: { kind: 'count', building: 'storage', min: 1 }, reward: { gold: 80, wood: 20 } },
  { id: 'q_house', text: 'Construye una Casa', goal: { kind: 'count', building: 'house', min: 1 }, reward: { gold: 80 } },
  { id: 'q_walls', text: 'Levanta 5 Muros', goal: { kind: 'count', building: 'wall', min: 5 }, reward: { wood: 40 } },
  { id: 'q_tower', text: 'Construye una Torre', goal: { kind: 'count', building: 'tower', min: 1 }, reward: { gold: 100 } },
  { id: 'q_hall2', text: 'Sube el Ayuntamiento a Fortaleza', goal: { kind: 'townhall', level: 2 }, reward: { gold: 200, wood: 100 } },
  { id: 'q_barracks', text: 'Construye un Cuartel', goal: { kind: 'count', building: 'barracks', min: 1 }, reward: { gold: 100, wood: 50 } },
  { id: 'q_soldiers', text: 'Entrena 3 Soldados', goal: { kind: 'unit', unit: 'soldier', min: 3 }, reward: { gold: 120 } },
  { id: 'q_altar', text: 'Construye un Altar del héroe', goal: { kind: 'count', building: 'altar', min: 1 }, reward: { gold: 150 } },
  { id: 'q_hero', text: 'Invoca a tu primer Héroe', goal: { kind: 'hero', min: 1 }, reward: { gold: 300, wood: 150 } },
  { id: 'q_win1', text: 'Supera la Campaña 1 (botón ⚔)', goal: { kind: 'campaign', min: 1 }, reward: { gold: 200, wood: 100 } },
  { id: 'q_upgrade', text: 'Mejora un edificio al nivel 2', goal: { kind: 'anyLevel', level: 2 }, reward: { gold: 120 } },
  { id: 'q_army8', text: 'Reúne un ejército de 8 unidades', goal: { kind: 'army', min: 8 }, reward: { gold: 250, wood: 100 } },
  { id: 'q_win3', text: 'Supera la Campaña 3', goal: { kind: 'campaign', min: 3 }, reward: { gold: 400, wood: 200 } },
  { id: 'q_mines4', text: 'Ten 4 Minas de oro', goal: { kind: 'count', building: 'mine', min: 4 }, reward: { gold: 200 } },
  { id: 'q_gate', text: 'Construye una Puerta', goal: { kind: 'count', building: 'gate', min: 1 }, reward: { wood: 60 } },
  { id: 'q_walls20', text: 'Levanta 20 Muros', goal: { kind: 'count', building: 'wall', min: 20 }, reward: { wood: 120 } },
  { id: 'q_hall3', text: 'Sube el Ayuntamiento a Castillo', goal: { kind: 'townhall', level: 3 }, reward: { gold: 500, wood: 300 } },
  { id: 'q_forge', text: 'Construye una Herrería', goal: { kind: 'count', building: 'forge', min: 1 }, reward: { gold: 300, wood: 150 } },
  { id: 'q_research', text: 'Investiga una mejora en la Herrería', goal: { kind: 'research', level: 1 }, reward: { gold: 250, wood: 150 } },
  { id: 'q_hall4', text: 'Sube el Ayuntamiento a Ciudadela', goal: { kind: 'townhall', level: 4 }, reward: { gold: 800, wood: 400 } },
  { id: 'q_archery', text: 'Construye una Arquería', goal: { kind: 'count', building: 'archery', min: 1 }, reward: { gold: 400, wood: 200 } },
  { id: 'q_archers', text: 'Entrena 5 Arqueros', goal: { kind: 'unit', unit: 'archer', min: 5 }, reward: { gold: 400, wood: 200 } },
  { id: 'q_level5', text: 'Sube un edificio al nivel 5', goal: { kind: 'anyLevel', level: 5 }, reward: { gold: 800, wood: 400 } },
  { id: 'q_hall5', text: 'Sube el Ayuntamiento a Capital', goal: { kind: 'townhall', level: 5 }, reward: { gold: 2000, wood: 1000 } },
  { id: 'q_hero2', text: 'Consigue un segundo Héroe', goal: { kind: 'hero', min: 2 }, reward: { gold: 1000, wood: 500 } },
  { id: 'q_atelier', text: 'Construye un Atelier (magos)', goal: { kind: 'count', building: 'atelier', min: 1 }, reward: { gold: 1500, wood: 800 } },
  { id: 'q_herolvl10', text: 'Lleva a un héroe al nivel 10', goal: { kind: 'heroLevel', level: 10 }, reward: { gold: 2500, wood: 1200 } },
  { id: 'q_stable', text: 'Construye una Caballeriza', goal: { kind: 'count', building: 'stable', min: 1 }, reward: { gold: 3500, wood: 1800 } },
  { id: 'q_level10', text: 'Sube un edificio al nivel 10', goal: { kind: 'anyLevel', level: 10 }, reward: { gold: 8000, wood: 4000 } },
  { id: 'q_siege', text: 'Construye el Taller de asedio', goal: { kind: 'count', building: 'siege', min: 1 }, reward: { gold: 10000, wood: 5000 } },
];

/** Edificios que el jugador puede construir, en el orden de la barra de herramientas. */
export const BUILDABLE = TOOL_PAGES.flatMap((p) => p.tools);

// Logros: familias con varios niveles. Se miran en la partida (no se cuentan aparte) y se reclaman de a un
// nivel por vez. `kind` dice qué se mide:
//   buildings    edificios en total (sin muros ni puertas)     walls   muros y puertas
//   buildingLevel el nivel más alto de cualquier edificio     townhall nivel del Ayuntamiento
//   army         unidades de ejército (todas)                 siege   armas de asedio
//   campaign     niveles de campaña superados                 heroes  héroes que tienes
//   heroLevel    el nivel más alto de un héroe                 research el nivel más alto de una investigación
//   raids        ataques enemigos sufridos            stars    estrellas de campaña (suma de las mejores de cada nivel)
export const ACHIEVEMENTS = [
  { id: 'builder', name: 'Constructor', text: 'Ten edificios en tu base', kind: 'buildings', tiers: [{ target: 5, reward: { gold: 100 } }, { target: 15, reward: { gold: 300, wood: 150 } }, { target: 35, reward: { gold: 900, wood: 450 } }, { target: 70, reward: { gold: 3000, wood: 1500 } }] },
  { id: 'wall', name: 'Muralla', text: 'Levanta muros y puertas', kind: 'walls', tiers: [{ target: 20, reward: { wood: 150 } }, { target: 80, reward: { wood: 500 } }, { target: 200, reward: { wood: 1500 } }, { target: 400, reward: { wood: 5000 } }] },
  { id: 'city', name: 'Gran ciudad', text: 'Sube el nivel del Ayuntamiento', kind: 'townhall', tiers: [{ target: 3, reward: { gold: 300, wood: 150 } }, { target: 5, reward: { gold: 1500, wood: 800 } }, { target: 8, reward: { gold: 8000, wood: 4000 } }, { target: 10, reward: { gold: 30000, wood: 15000 } }] },
  { id: 'master', name: 'Obra maestra', text: 'Sube un edificio de nivel', kind: 'buildingLevel', tiers: [{ target: 3, reward: { gold: 200, wood: 100 } }, { target: 5, reward: { gold: 1000, wood: 500 } }, { target: 8, reward: { gold: 6000, wood: 3000 } }, { target: 10, reward: { gold: 25000, wood: 12000 } }] },
  { id: 'army', name: 'Gran ejército', text: 'Reúne unidades de ejército', kind: 'army', tiers: [{ target: 10, reward: { gold: 200, wood: 100 } }, { target: 30, reward: { gold: 800, wood: 400 } }, { target: 70, reward: { gold: 3500, wood: 1800 } }, { target: 150, reward: { gold: 15000, wood: 7500 } }] },
  { id: 'siege', name: 'Señor del asedio', text: 'Ten armas de asedio', kind: 'siege', tiers: [{ target: 1, reward: { gold: 1500, wood: 800 } }, { target: 4, reward: { gold: 6000, wood: 3000 } }, { target: 10, reward: { gold: 20000, wood: 10000 } }] },
  { id: 'conquer', name: 'Conquistador', text: 'Supera niveles de campaña', kind: 'campaign', tiers: [{ target: 3, reward: { gold: 300, wood: 150 } }, { target: 10, reward: { gold: 2000, wood: 1000 } }, { target: 20, reward: { gold: 10000, wood: 5000 } }, { target: 30, reward: { gold: 40000, wood: 20000 } }] },
  { id: 'heroes', name: 'Colección de héroes', text: 'Invoca a tus héroes', kind: 'heroes', tiers: [{ target: 1, reward: { gold: 300, wood: 150 } }, { target: 3, reward: { gold: 2500, wood: 1200 } }, { target: 5, reward: { gold: 15000, wood: 7500 } }] },
  { id: 'legend', name: 'Leyenda', text: 'Lleva a un héroe a un nivel alto', kind: 'heroLevel', tiers: [{ target: 5, reward: { gold: 500, wood: 250 } }, { target: 10, reward: { gold: 4000, wood: 2000 } }, { target: 15, reward: { gold: 15000, wood: 7500 } }, { target: 20, reward: { gold: 50000, wood: 25000 } }] },
  { id: 'smith', name: 'Herrero', text: 'Sube una investigación de la Herrería', kind: 'research', tiers: [{ target: 2, reward: { gold: 500, wood: 300 } }, { target: 5, reward: { gold: 4000, wood: 2000 } }, { target: 8, reward: { gold: 15000, wood: 7500 } }, { target: 10, reward: { gold: 40000, wood: 20000 } }] },
  { id: 'stars', name: 'Cazador de estrellas', text: 'Gana estrellas en la campaña', kind: 'stars', tiers: [{ target: 3, reward: { gold: 300, wood: 150 } }, { target: 15, reward: { gold: 2500, wood: 1200 } }, { target: 45, reward: { gold: 12000, wood: 6000 } }, { target: 90, reward: { gold: 40000, wood: 20000 } }] },
  { id: 'survivor', name: 'Superviviente', text: 'Sobrevive a ataques enemigos', kind: 'raids', tiers: [{ target: 1, reward: { gold: 200, wood: 100 } }, { target: 5, reward: { gold: 1500, wood: 750 } }, { target: 15, reward: { gold: 8000, wood: 4000 } }, { target: 30, reward: { gold: 30000, wood: 15000 } }] },
];
