// Razas jugables. Cada una trae su propio arte (carpeta de `public/assets/`), nombres y un poco de sabor; las
// estadísticas y costos son los mismos para todas (el equilibrio se calibró una sola vez, ver tools/balance.mjs).
// La raza se elige al empezar una partida y no cambia después (queda en el guardado: `state.race`).
import { BUILDINGS, UNITS } from './config.js';
import { HEROES } from './heroes.js';

export const DEFAULT_RACE = 'kingdom';

export const RACES = {
  kingdom: {
    name: 'El Reino',
    blurb: 'humanos, piedra y tejados azules',
    artDir: 'iso', // carpeta del arte (edificios y personajes de la raza) dentro de public/assets/
    names: {},
  },
  sylvan: {
    name: 'Los Silvanos',
    blurb: 'gente del bosque, madera y hojas',
    artDir: 'iso/sylvan',
    names: {
      // Edificios (la clave es el tipo). `townhall` lleva además el nombre de cada nivel.
      buildings: {
        townhall: 'Árbol Madre', mine: 'Mina de gemas', sawmill: 'Aserradero', storage: 'Granero', tower: 'Atalaya', wall: 'Seto', gate: 'Portón',
        house: 'Cabaña', barracks: 'Salón de lanceros', archery: 'Campo de arqueras', atelier: 'Santuario', stable: 'Establo', siege: 'Taller de ingenios',
        forge: 'Fragua', altar: 'Santuario del héroe',
      },
      townhallLevels: ['Brote', 'Retoño', 'Árbol joven', 'Árbol grande', 'Árbol viejo', 'Arboleda', 'Bosque', 'Gran bosque', 'Corazón verde', 'Árbol del mundo'],
      units: { soldier: 'Lancero', archer: 'Arquera', mage: 'Druida', knight: 'Centinela', catapult: 'Ballesta', ram: 'Ariete' },
      heroes: {
        paladin: ['Guardián', 'Protector del claro'],
        ranger: ['Montaraz', 'Ojo del bosque'],
        priestess: ['Sanadora', 'Voz de las hojas'],
        pyromancer: ['Pirómana', 'Chispa del sol'],
        warlord: ['Capitán', 'Voz del bosque'],
      },
    },
  },
};

export const RACE_KEYS = Object.keys(RACES);
export const isRace = (id) => typeof id === 'string' && Object.hasOwn(RACES, id);

/** Carpeta del arte de una raza (con barra final). */
export const artDirOf = (id) => `${(RACES[id] ?? RACES[DEFAULT_RACE]).artDir}/`;

// La raza activa: la fija `applyRace` al abrir la partida. El arte y los nombres salen de aquí.
export const current = { race: DEFAULT_RACE };

const originals = new Map();
const remember = (obj, key) => {
  const k = `${key}`;
  if (!originals.has(obj)) originals.set(obj, {});
  const o = originals.get(obj);
  if (!(k in o)) o[k] = obj[k];
  return o;
};

/**
 * Pone los nombres de la raza en los datos del juego (se llama una vez al abrir la partida, antes de dibujar nada).
 * Es reversible: pasar 'kingdom' restaura los nombres originales (lo usan las pruebas).
 */
export function applyRace(id) {
  const race = RACES[isRace(id) ? id : DEFAULT_RACE];
  current.race = isRace(id) ? id : DEFAULT_RACE;
  const names = race.names;
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const o = remember(def, 'name');
    def.name = names.buildings?.[type] ?? o.name;
    if (type === 'townhall') {
      const l = remember(def, 'levelNames');
      def.levelNames = names.townhallLevels ?? l.levelNames;
    }
  }
  for (const [key, def] of Object.entries(UNITS)) {
    const o = remember(def, 'name');
    def.name = names.units?.[key] ?? o.name;
  }
  for (const [key, def] of Object.entries(HEROES)) {
    const o = remember(def, 'name');
    const t = remember(def, 'title');
    def.name = names.heroes?.[key]?.[0] ?? o.name;
    def.title = names.heroes?.[key]?.[1] ?? t.title;
  }
  return current.race;
}
