// Datos del juego. Balancear = editar este archivo, sin tocar la lógica.

export const GRID = { cols: 12, rows: 12, tile: 48 };

export const LAYOUT = {
  width: GRID.cols * GRID.tile, // 576
  hudHeight: 64,
  barHeight: 96,
  get gridTop() {
    return this.hudHeight;
  },
  get barTop() {
    return this.hudHeight + GRID.rows * GRID.tile;
  },
  get height() {
    return this.hudHeight + GRID.rows * GRID.tile + this.barHeight;
  },
};

export const ECONOMY = {
  startGold: 200,
  baseCap: 500, // oro máximo sin almacenes
  maxOfflineMs: 8 * 60 * 60 * 1000, // la producción sin conexión se limita a 8 h
  refundRate: 0.5, // al demoler se devuelve el 50 % de lo invertido (construcción + mejoras)
  builders: 2, // mejoras que pueden hacerse al mismo tiempo
};

// Cada edificio tiene una lista de niveles. El nivel 1 es el que se construye
// con `cost`; los siguientes indican lo que cuesta y tarda mejorar HASTA ese nivel
// (`upgradeCost`, `upgradeSec`). Las demás claves son las estadísticas del nivel.
export const BUILDINGS = {
  mine: {
    name: 'Mina',
    short: 'M',
    cost: 50,
    color: 0xd4a017,
    levels: [
      { ratePerSec: 0.5, capacity: 120 },
      { ratePerSec: 0.9, capacity: 240, upgradeCost: 100, upgradeSec: 30 },
      { ratePerSec: 1.5, capacity: 480, upgradeCost: 250, upgradeSec: 120 },
    ],
  },
  storage: {
    name: 'Almacén',
    short: 'A',
    cost: 100,
    color: 0x8b5a2b,
    levels: [
      { capBonus: 500 },
      { capBonus: 1000, upgradeCost: 150, upgradeSec: 45 },
      { capBonus: 2000, upgradeCost: 400, upgradeSec: 180 },
    ],
  },
  tower: {
    name: 'Torre',
    short: 'T',
    cost: 150,
    color: 0x4a6fa5,
    // Las estadísticas de defensa llegan en la fase de combate.
    levels: [{}, { upgradeCost: 200, upgradeSec: 60 }, { upgradeCost: 500, upgradeSec: 240 }],
  },
};
