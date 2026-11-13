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
  refundRate: 0.5, // al demoler se devuelve el 50 % del costo
};

export const BUILDINGS = {
  mine: {
    name: 'Mina',
    short: 'M',
    cost: 50,
    color: 0xd4a017,
    ratePerSec: 0.5, // oro por segundo
    capacity: 120, // oro que puede acumular antes de recolectarse
  },
  storage: {
    name: 'Almacén',
    short: 'A',
    cost: 100,
    color: 0x8b5a2b,
    capBonus: 500, // sube el máximo de oro
  },
  tower: {
    name: 'Torre',
    short: 'T',
    cost: 150,
    color: 0x4a6fa5,
    // La defensa se implementará en la fase de combate.
  },
};
