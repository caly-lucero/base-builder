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
    levels: [
      { sprite: 'townhall_1', limits: { mine: 3, sawmill: 2, storage: 1, tower: 2, wall: 20 } },
      {
        sprite: 'townhall_2',
        limits: { mine: 5, sawmill: 3, storage: 2, tower: 4, wall: 50 },
        upgradeCost: { gold: 300, wood: 150 },
        upgradeSec: 90,
      },
      {
        sprite: 'townhall_3',
        limits: { mine: 8, sawmill: 5, storage: 3, tower: 6, wall: 100 },
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
};

/** Edificios que el jugador puede construir, en el orden de la barra de herramientas. */
export const BUILDABLE = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].buildable !== false);
