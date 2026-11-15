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
    levelNames: ['Ayuntamiento', 'Fortaleza', 'Castillo'],
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
    ],
  },
  sawmill: {
    name: 'Aserradero',
    cost: { gold: 60 },
    levels: [
      { sprite: 'sawmill_1', produces: 'wood', ratePerSec: 0.4, capacity: 100 },
      { sprite: 'sawmill_2', produces: 'wood', ratePerSec: 0.7, capacity: 200, upgradeCost: { gold: 90, wood: 20 }, upgradeSec: 30 },
      { sprite: 'sawmill_3', produces: 'wood', ratePerSec: 1.1, capacity: 400, upgradeCost: { gold: 200, wood: 60 }, upgradeSec: 120 },
    ],
  },
  storage: {
    name: 'Almacén',
    cost: { gold: 100, wood: 30 },
    levels: [
      { sprite: 'storage_1', capBonus: 500 }, // sube el tope de oro Y de madera
      { sprite: 'storage_2', capBonus: 1000, upgradeCost: { gold: 150, wood: 60 }, upgradeSec: 45 },
      { sprite: 'storage_3', capBonus: 2000, upgradeCost: { gold: 400, wood: 150 }, upgradeSec: 180 },
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
export const UNITS = {
  soldier: { name: 'Soldado', sprite: 'unit_soldier', cost: { gold: 40, wood: 10 }, supply: 1, trainSec: 15, minLevel: 1 },
  mage: { name: 'Hechicero', sprite: 'unit_mage', cost: { gold: 70, wood: 30 }, supply: 1, trainSec: 25, minLevel: 2 },
  knight: { name: 'Caballero', sprite: 'unit_knight', cost: { gold: 120, wood: 60 }, supply: 2, trainSec: 40, minLevel: 3 },
  hero: { name: 'Héroe', sprite: 'unit_hero', cost: { gold: 300, wood: 150 }, supply: 3, trainSec: 60, minLevel: 1, hero: true },
};

/** Unidades del ejército (el héroe va aparte: solo puede haber uno). */
export const ARMY_UNITS = Object.keys(UNITS).filter((u) => !UNITS[u].hero);

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
  { id: 'q_upgrade', text: 'Mejora un edificio al nivel 2', goal: { kind: 'anyLevel', level: 2 }, reward: { gold: 120 } },
  { id: 'q_army8', text: 'Reúne un ejército de 8 unidades', goal: { kind: 'army', min: 8 }, reward: { gold: 250, wood: 100 } },
  { id: 'q_mines4', text: 'Ten 4 Minas de oro', goal: { kind: 'count', building: 'mine', min: 4 }, reward: { gold: 200 } },
  { id: 'q_gate', text: 'Construye una Puerta', goal: { kind: 'count', building: 'gate', min: 1 }, reward: { wood: 60 } },
  { id: 'q_walls20', text: 'Levanta 20 Muros', goal: { kind: 'count', building: 'wall', min: 20 }, reward: { wood: 120 } },
  { id: 'q_hall3', text: 'Sube el Ayuntamiento a Castillo', goal: { kind: 'townhall', level: 3 }, reward: { gold: 500, wood: 300 } },
];

/** Edificios que el jugador puede construir, en el orden de la barra de herramientas. */
export const BUILDABLE = TOOL_PAGES.flatMap((p) => p.tools);
