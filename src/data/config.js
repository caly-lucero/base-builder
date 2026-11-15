// Datos del juego. Balancear = editar este archivo, sin tocar la lógica.

// El mapa es de 24×24 casillas; en pantalla se ve una parte (ver CAMERA y LAYOUT).
export const GRID = { cols: 24, rows: 24, tile: 48 };

/** Lado en píxeles de los sprites originales (pack Kenney Medieval RTS). */
export const ART_SIZE = 64;

export const LAYOUT = {
  width: 576,
  hudHeight: 64,
  viewHeight: 576, // alto de la ventana por la que se ve el mapa
  barHeight: 96,
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

export const CAMERA = {
  minZoom: 0.5, // con 0.5 el mapa entero cabe en la ventana
  maxZoom: 1.6,
  startZoom: 1,
  dragThreshold: 8, // píxeles que hay que mover antes de que un toque sea un arrastre
  keyPanSpeed: 420, // píxeles por segundo con las flechas
};

// Los niveles 4 y 5 reutilizan el dibujo del nivel 3 con un tinte dorado (campo `tint` del nivel):
// más fuertes, y a la vista se nota que son «élite».
const TIER_4 = 0xfff0a8;
const TIER_5 = 0xffd45a;

export const RESOURCES = ['gold', 'wood'];
export const RESOURCE_NAMES = { gold: 'oro', wood: 'madera' };

export const ECONOMY = {
  start: { gold: 250, wood: 60 },
  baseCap: 500, // máximo de cada recurso sin almacenes
  maxOfflineMs: 8 * 60 * 60 * 1000, // la producción sin conexión se limita a 8 h
  refundRate: 0.5, // al demoler se devuelve el 50 % de lo invertido (construcción + mejoras)
  builders: 2, // mejoras que pueden hacerse al mismo tiempo
};

// Cada edificio tiene una lista de niveles. El nivel 1 es el que se construye con `cost`;
// los siguientes indican lo que cuesta y tarda mejorar HASTA ese nivel
// (`upgradeCost`, `upgradeSec`). `sprite` es la clave de imagen de ese nivel (ver assets.js);
// las demás claves son las estadísticas. Los costos son { gold, wood } (lo que falte vale 0).
//
// Inspirado en Warcraft III: el Ayuntamiento sube (Ayuntamiento → Fortaleza → Castillo),
// y su nivel manda: cuántos edificios de cada tipo se pueden tener (`limits`) y hasta qué
// nivel se puede mejorar el resto.
export const BUILDINGS = {
  townhall: {
    name: 'Ayuntamiento',
    buildable: false, // lo trae la partida; no se construye ni se demuele
    cost: {},
    levelNames: ['Ayuntamiento', 'Fortaleza', 'Castillo', 'Ciudadela', 'Capital'],
    // `baseSupply`: población que da el propio Ayuntamiento (las granjas suman más).
    levels: [
      {
        sprite: 'townhall_1',
        baseSupply: 5,
        limits: { mine: 3, sawmill: 2, farm: 2, storage: 1, barracks: 1, altar: 0, tower: 2, wall: 20, gate: 4 },
      },
      {
        sprite: 'townhall_2',
        baseSupply: 10,
        limits: { mine: 5, sawmill: 3, farm: 4, storage: 2, barracks: 2, altar: 1, tower: 4, wall: 50, gate: 10 },
        upgradeCost: { gold: 300, wood: 150 },
        upgradeSec: 90,
      },
      {
        sprite: 'townhall_3',
        baseSupply: 15,
        limits: { mine: 8, sawmill: 5, farm: 6, storage: 3, barracks: 3, altar: 1, tower: 6, wall: 100, gate: 20 },
        upgradeCost: { gold: 800, wood: 400 },
        upgradeSec: 300,
      },
      {
        sprite: 'townhall_3',
        tint: TIER_4,
        baseSupply: 20,
        limits: { mine: 10, sawmill: 7, farm: 8, storage: 4, barracks: 4, altar: 1, tower: 8, wall: 150, gate: 30 },
        upgradeCost: { gold: 1800, wood: 900 },
        upgradeSec: 600,
      },
      {
        sprite: 'townhall_3',
        tint: TIER_5,
        baseSupply: 25,
        limits: { mine: 12, sawmill: 9, farm: 10, storage: 5, barracks: 5, altar: 1, tower: 10, wall: 220, gate: 45 },
        upgradeCost: { gold: 3500, wood: 1800 },
        upgradeSec: 1200,
      },
    ],
  },
  mine: {
    name: 'Mina de oro',
    shortName: 'Mina', // para la barra de herramientas
    cost: { gold: 50 },
    levels: [
      { sprite: 'mine_1', produces: 'gold', ratePerSec: 0.5, capacity: 120 },
      { sprite: 'mine_2', produces: 'gold', ratePerSec: 0.9, capacity: 240, upgradeCost: { gold: 100 }, upgradeSec: 30 },
      { sprite: 'mine_3', produces: 'gold', ratePerSec: 1.5, capacity: 480, upgradeCost: { gold: 250, wood: 50 }, upgradeSec: 120 },
      { sprite: 'mine_3', tint: TIER_4, produces: 'gold', ratePerSec: 2.2, capacity: 800, upgradeCost: { gold: 500, wood: 150 }, upgradeSec: 300 },
      { sprite: 'mine_3', tint: TIER_5, produces: 'gold', ratePerSec: 3.2, capacity: 1400, upgradeCost: { gold: 1000, wood: 350 }, upgradeSec: 600 },
    ],
  },
  sawmill: {
    name: 'Aserradero',
    cost: { gold: 60 },
    levels: [
      { sprite: 'sawmill_1', produces: 'wood', ratePerSec: 0.4, capacity: 100 },
      { sprite: 'sawmill_2', produces: 'wood', ratePerSec: 0.7, capacity: 200, upgradeCost: { gold: 90, wood: 20 }, upgradeSec: 30 },
      { sprite: 'sawmill_3', produces: 'wood', ratePerSec: 1.1, capacity: 400, upgradeCost: { gold: 200, wood: 60 }, upgradeSec: 120 },
      { sprite: 'sawmill_3', tint: TIER_4, produces: 'wood', ratePerSec: 1.6, capacity: 700, upgradeCost: { gold: 350, wood: 140 }, upgradeSec: 300 },
      { sprite: 'sawmill_3', tint: TIER_5, produces: 'wood', ratePerSec: 2.3, capacity: 1200, upgradeCost: { gold: 700, wood: 300 }, upgradeSec: 600 },
    ],
  },
  storage: {
    name: 'Almacén',
    cost: { gold: 100, wood: 30 },
    levels: [
      { sprite: 'storage_1', capBonus: 500 }, // sube el tope de oro Y de madera
      { sprite: 'storage_2', capBonus: 1000, upgradeCost: { gold: 150, wood: 60 }, upgradeSec: 45 },
      { sprite: 'storage_3', capBonus: 2000, upgradeCost: { gold: 400, wood: 150 }, upgradeSec: 180 },
      { sprite: 'storage_3', tint: TIER_4, capBonus: 3500, upgradeCost: { gold: 700, wood: 300 }, upgradeSec: 360 },
      { sprite: 'storage_3', tint: TIER_5, capBonus: 6000, upgradeCost: { gold: 1400, wood: 700 }, upgradeSec: 720 },
    ],
  },
  tower: {
    name: 'Torre',
    cost: { gold: 150, wood: 60 },
    // Las estadísticas de defensa llegan en la fase de combate.
    levels: [
      { sprite: 'tower_1' },
      { sprite: 'tower_2', upgradeCost: { gold: 200, wood: 100 }, upgradeSec: 60 },
      { sprite: 'tower_3', upgradeCost: { gold: 500, wood: 250 }, upgradeSec: 240 },
      { sprite: 'tower_3', tint: TIER_4, upgradeCost: { gold: 900, wood: 450 }, upgradeSec: 480 },
      { sprite: 'tower_3', tint: TIER_5, upgradeCost: { gold: 1800, wood: 900 }, upgradeSec: 900 },
    ],
  },
  wall: {
    name: 'Muro',
    cost: { wood: 8 },
    // Hoy solo ocupa casilla; en el combate frenará a las unidades enemigas.
    levels: [
      { sprite: 'wall_1' },
      { sprite: 'wall_2', upgradeCost: { wood: 20 }, upgradeSec: 10 },
      { sprite: 'wall_3', upgradeCost: { wood: 50 }, upgradeSec: 20 },
      { sprite: 'wall_3', tint: TIER_4, upgradeCost: { wood: 120 }, upgradeSec: 40 },
      { sprite: 'wall_3', tint: TIER_5, upgradeCost: { wood: 250 }, upgradeSec: 80 },
    ],
  },
  gate: {
    name: 'Puerta',
    cost: { wood: 30 },
    // Como un muro con paso: en el combate dejará pasar a las unidades propias.
    levels: [
      { sprite: 'gate_1' },
      { sprite: 'gate_2', upgradeCost: { wood: 60 }, upgradeSec: 15 },
      { sprite: 'gate_3', upgradeCost: { wood: 120 }, upgradeSec: 30 },
      { sprite: 'gate_3', tint: TIER_4, upgradeCost: { wood: 240 }, upgradeSec: 60 },
      { sprite: 'gate_3', tint: TIER_5, upgradeCost: { wood: 480 }, upgradeSec: 120 },
    ],
  },
  farm: {
    name: 'Granja',
    cost: { gold: 60, wood: 20 },
    // `supply`: población que suma. Sin población libre no se pueden entrenar más unidades.
    levels: [
      { sprite: 'farm_1', supply: 6 },
      { sprite: 'farm_2', supply: 10, upgradeCost: { gold: 90, wood: 40 }, upgradeSec: 30 },
      { sprite: 'farm_3', supply: 16, upgradeCost: { gold: 200, wood: 80 }, upgradeSec: 120 },
      { sprite: 'farm_3', tint: TIER_4, supply: 24, upgradeCost: { gold: 400, wood: 160 }, upgradeSec: 300 },
      { sprite: 'farm_3', tint: TIER_5, supply: 34, upgradeCost: { gold: 800, wood: 350 }, upgradeSec: 600 },
    ],
  },
  barracks: {
    name: 'Cuartel',
    cost: { gold: 120, wood: 60 },
    trains: ['soldier', 'mage', 'knight'], // cada unidad pide un nivel mínimo del cuartel (ver UNITS)
    levels: [
      { sprite: 'barracks_1' },
      { sprite: 'barracks_2', upgradeCost: { gold: 180, wood: 90 }, upgradeSec: 60 },
      { sprite: 'barracks_3', upgradeCost: { gold: 400, wood: 200 }, upgradeSec: 180 },
      // Desde el nivel 4 el cuartel entrena más rápido (`trainFactor` multiplica el tiempo de entrenamiento).
      { sprite: 'barracks_3', tint: TIER_4, trainFactor: 0.8, upgradeCost: { gold: 800, wood: 400 }, upgradeSec: 420 },
      { sprite: 'barracks_3', tint: TIER_5, trainFactor: 0.6, upgradeCost: { gold: 1600, wood: 800 }, upgradeSec: 840 },
    ],
  },
  altar: {
    name: 'Altar del héroe',
    shortName: 'Altar',
    cost: { gold: 200, wood: 100 },
    trains: ['hero'],
    levels: [{ sprite: 'altar_1' }],
  },
};

// Unidades que se entrenan. `minLevel` es el nivel que debe tener el edificio que la entrena.
// Cada unidad ocupa `supply` de población desde que empieza a entrenarse.
// `combat`: vida, daño por golpe, alcance (en casillas), velocidad (casillas/s) y segundos entre golpes.
// El Héroe sube estas estadísticas con su nivel (ver HERO_PER_LEVEL).
export const UNITS = {
  soldier: {
    name: 'Soldado', sprite: 'unit_soldier', cost: { gold: 40, wood: 10 }, supply: 1, trainSec: 15, minLevel: 1,
    combat: { hp: 60, dmg: 8, range: 0.9, speed: 1.8, atkSec: 0.8 },
  },
  mage: {
    name: 'Hechicero', sprite: 'unit_mage', cost: { gold: 70, wood: 30 }, supply: 1, trainSec: 25, minLevel: 2,
    combat: { hp: 35, dmg: 15, range: 3.5, speed: 1.5, atkSec: 1.2 }, // ataca de lejos
  },
  knight: {
    name: 'Caballero', sprite: 'unit_knight', cost: { gold: 120, wood: 60 }, supply: 2, trainSec: 40, minLevel: 3,
    combat: { hp: 160, dmg: 14, range: 1.0, speed: 2.0, atkSec: 1.0 },
  },
  hero: {
    name: 'Héroe', sprite: 'unit_hero', cost: { gold: 300, wood: 150 }, supply: 3, trainSec: 60, minLevel: 1, hero: true,
    combat: { hp: 220, dmg: 18, range: 1.1, speed: 2.2, atkSec: 0.9 },
  },
};

/** Unidades del ejército (el héroe va aparte: solo puede haber uno). */
export const ARMY_UNITS = Object.keys(UNITS).filter((u) => !UNITS[u].hero);

// Lo que gana el héroe por cada nivel por encima del 1, y lo que necesita para subir.
export const HERO_PER_LEVEL = { hp: 35, dmg: 4 };
export const HERO_MAX_LEVEL = 10;
export const heroXpToNext = (level) => 100 * level;

// Combate. Las posiciones son casillas con decimales (0.5 = media casilla).
export const COMBAT = {
  tickSec: 0.1, // paso fijo de la simulación
  timeLimitSec: 180, // la batalla termina a los 3 minutos
  aggro: 4.5, // distancia a la que una unidad se fija en un enemigo cercano
  wallCost: 6, // costo extra al atravesar un muro: se prefiere rodear, pero se puede romper
  repathSec: 1, // cada cuánto se recalcula el camino
  // Experiencia del héroe: llega SIEMPRE que pelea (ganes o pierdas) y hay un bono extra por ganar.
  heroXpPerBuilding: 6, // por cada edificio enemigo destruido (sin contar muros)
  heroXpPerKill: 4, // por cada defensor derrotado
  heroXpWin: 60, // bono por ganar, más esto por cada nivel de la misión
  heroXpPerLevel: 15,
};

// Unidades enemigas que defienden una base.
export const ENEMY_UNITS = {
  guard: { name: 'Guardia', sprite: 'enemy_guard', hp: 50, dmg: 7, range: 0.9, speed: 1.6, atkSec: 0.9 },
  brute: { name: 'Bruto', sprite: 'enemy_brute', hp: 140, dmg: 12, range: 1.0, speed: 1.5, atkSec: 1.1 },
};

// Defensa de TU base cuando el enemigo la ataca. La vida de cada edificio crece con su nivel; las
// torres disparan (más daño por nivel); tu ejército y tu héroe defienden desde donde están formados.
export const DEFENSE = {
  hpPerLevel: 0.35, // +35 % de vida por cada nivel sobre el 1
  baseHp: { townhall: 700, tower: 260, wall: 110, gate: 110, mine: 140, sawmill: 140, storage: 160, barracks: 200, farm: 120, altar: 150 },
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
  heroXpPerKill: 4, // experiencia del héroe por cada atacante derrotado
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
  farm: { name: 'Granja', hp: 100 },
};

// La barra de herramientas se reparte en páginas para que quepan los botones.
export const TOOL_PAGES = [
  { name: 'Economía', tools: ['mine', 'sawmill', 'farm', 'storage', 'wall'] },
  { name: 'Militar', tools: ['barracks', 'altar', 'tower', 'gate'] },
];

// Misiones: una cadena que guía al jugador (se hacen en orden). Cada una tiene un objetivo
// que se evalúa mirando la partida y una recompensa que se reclama al cumplirla.
//   { kind: 'count', building, min }   tener al menos `min` edificios de ese tipo
//   { kind: 'townhall', level }        Ayuntamiento al menos en ese nivel
//   { kind: 'anyLevel', level }        algún edificio (que no sea el Ayuntamiento) al menos en ese nivel
//   { kind: 'army', min }              al menos `min` unidades de ejército (sin contar al héroe)
//   { kind: 'unit', unit, min }        al menos `min` unidades de ese tipo
//   { kind: 'hero' }                   haber invocado al héroe
//   { kind: 'campaign', min }          haber superado al menos `min` niveles de campaña
export const QUESTS = [
  { id: 'q_sawmill', text: 'Construye un Aserradero', goal: { kind: 'count', building: 'sawmill', min: 1 }, reward: { wood: 40 } },
  { id: 'q_mines', text: 'Ten 2 Minas de oro', goal: { kind: 'count', building: 'mine', min: 2 }, reward: { gold: 60 } },
  { id: 'q_storage', text: 'Construye un Almacén', goal: { kind: 'count', building: 'storage', min: 1 }, reward: { gold: 80, wood: 20 } },
  { id: 'q_farm', text: 'Construye una Granja', goal: { kind: 'count', building: 'farm', min: 1 }, reward: { gold: 80 } },
  { id: 'q_walls', text: 'Levanta 5 Muros', goal: { kind: 'count', building: 'wall', min: 5 }, reward: { wood: 40 } },
  { id: 'q_barracks', text: 'Construye un Cuartel', goal: { kind: 'count', building: 'barracks', min: 1 }, reward: { gold: 100, wood: 50 } },
  { id: 'q_soldiers', text: 'Entrena 3 Soldados', goal: { kind: 'unit', unit: 'soldier', min: 3 }, reward: { gold: 120 } },
  { id: 'q_tower', text: 'Construye una Torre', goal: { kind: 'count', building: 'tower', min: 1 }, reward: { gold: 100 } },
  { id: 'q_hall2', text: 'Sube el Ayuntamiento a Fortaleza', goal: { kind: 'townhall', level: 2 }, reward: { gold: 200, wood: 100 } },
  { id: 'q_altar', text: 'Construye un Altar del héroe', goal: { kind: 'count', building: 'altar', min: 1 }, reward: { gold: 150 } },
  { id: 'q_hero', text: 'Invoca a tu Héroe', goal: { kind: 'hero' }, reward: { gold: 300, wood: 150 } },
  { id: 'q_win1', text: 'Supera la Campaña 1 (botón ⚔)', goal: { kind: 'campaign', min: 1 }, reward: { gold: 200, wood: 100 } },
  { id: 'q_upgrade', text: 'Mejora un edificio al nivel 2', goal: { kind: 'anyLevel', level: 2 }, reward: { gold: 120 } },
  { id: 'q_army8', text: 'Reúne un ejército de 8 unidades', goal: { kind: 'army', min: 8 }, reward: { gold: 250, wood: 100 } },
  { id: 'q_win3', text: 'Supera la Campaña 3', goal: { kind: 'campaign', min: 3 }, reward: { gold: 400, wood: 200 } },
  { id: 'q_mines4', text: 'Ten 4 Minas de oro', goal: { kind: 'count', building: 'mine', min: 4 }, reward: { gold: 200 } },
  { id: 'q_gate', text: 'Construye una Puerta', goal: { kind: 'count', building: 'gate', min: 1 }, reward: { wood: 60 } },
  { id: 'q_walls20', text: 'Levanta 20 Muros', goal: { kind: 'count', building: 'wall', min: 20 }, reward: { wood: 120 } },
  { id: 'q_hall3', text: 'Sube el Ayuntamiento a Castillo', goal: { kind: 'townhall', level: 3 }, reward: { gold: 500, wood: 300 } },
  { id: 'q_level5', text: 'Sube un edificio al nivel 5', goal: { kind: 'anyLevel', level: 5 }, reward: { gold: 800, wood: 400 } },
  { id: 'q_hall5', text: 'Sube el Ayuntamiento a Capital', goal: { kind: 'townhall', level: 5 }, reward: { gold: 2000, wood: 1000 } },
];

/** Edificios que el jugador puede construir, en el orden de la barra de herramientas. */
export const BUILDABLE = TOOL_PAGES.flatMap((p) => p.tools);
