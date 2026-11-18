// Lista de assets que el juego carga. Los archivos viven en public/assets/.
// Cada clave se usa en el código y en config.js (campo `sprite` de cada nivel).
// El arte (edificios, decoración, personajes) sale de modelos 3D CC0 de Kenney dibujados en vista
// isométrica con tools/iso (ver tools/iso/README.md). Créditos y licencias: public/assets/CREDITS.md

export const ASSET_BASE = 'assets/';

// Edificios: 3 dibujos por tipo (niveles 1, 2 y 3; del 4 en adelante se reutiliza el 3 con tinte), cada uno en 4 giros
// de cámara: `tipo_n` (el de siempre) y `tipo_n_r1`, `_r2`, `_r3` (la vista girada 90°, 180° y 270°).
const BUILDING_TYPES = ['townhall', 'mine', 'sawmill', 'storage', 'tower', 'wall', 'gate', 'house', 'barracks', 'archery', 'atelier', 'stable', 'siege', 'forge', 'altar'];
export const VIEW_TURNS = 4; // giros de cámara posibles
const BUILDING_ART = BUILDING_TYPES.flatMap((t) => [1, 2, 3].flatMap((n) => Array.from({ length: VIEW_TURNS }, (_, r) => (r ? `${t}_${n}_r${r}` : `${t}_${n}`))));

// Decoración del mapa y cosas sueltas.
const DECOR_ART = [
  'tree_a', 'tree_b', 'tree_c',
  'rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e', 'rock_f',
  'bush_a', 'bush_b',
  'stump', 'log', 'crate',
  'flower_0', 'flower_1', 'flower_2', 'tuft',
];

/** Hojas de animación de los personajes (ver game/unitArt.js para el orden de los cuadros). */
export const SHEET_KEYS = [
  'worker_1', 'worker_2', 'worker_3', 'worker_4',
  'unit_soldier', 'unit_archer', 'unit_mage', 'unit_knight', 'unit_catapult', 'unit_ram',
  'unit_hero', 'hero_ranger', 'hero_priest', 'hero_pyro', 'hero_warlord',
  'enemy_guard', 'enemy_brute', 'enemy_archer', 'enemy_shaman', 'enemy_spider',
];

const SFX = [
  'place', 'collect', 'collect_all',
  'upgrade_start', 'upgrade_done',
  'demolish', 'error', 'select', 'close', 'move',
  'hit', 'shoot', 'boom', 'win', 'lose',
];

const folderOf = (k) => (BUILDING_ART.includes(k) ? 'iso/buildings' : 'iso/decor');
export const IMAGES = Object.fromEntries([...BUILDING_ART, ...DECOR_ART].map((k) => [k, `${folderOf(k)}/${k}.png`]));
export const SHEETS = Object.fromEntries(SHEET_KEYS.map((k) => [k, `iso/units/${k}.png`]));
export const SOUNDS = Object.fromEntries(SFX.map((k) => [k, `audio/${k}.ogg`]));
