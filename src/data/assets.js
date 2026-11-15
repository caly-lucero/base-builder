// Lista de assets que el juego carga. Los archivos viven en public/assets/.
// Cada clave se usa en el código y en config.js (campo `sprite` de cada nivel).
// Créditos y licencias: public/assets/CREDITS.md

export const ASSET_BASE = 'assets/';

const ART = [
  'grass_a', 'grass_b',
  'mine_1', 'mine_2', 'mine_3',
  'storage_1', 'storage_2', 'storage_3',
  'tower_1', 'tower_2', 'tower_3',
  'townhall_1', 'townhall_2', 'townhall_3',
  'sawmill_1', 'sawmill_2', 'sawmill_3',
  'wall_1', 'wall_2', 'wall_3',
  'tree_a', 'tree_b', 'tree_c',
  'rock_a', 'rock_b', 'rock_c',
  'bush_a', 'bush_b',
  'crate',
];

const SFX = [
  'place', 'collect', 'collect_all',
  'upgrade_start', 'upgrade_done',
  'demolish', 'error', 'select', 'close', 'move',
];

export const IMAGES = Object.fromEntries(ART.map((k) => [k, `art/${k}.png`]));
export const SOUNDS = Object.fromEntries(SFX.map((k) => [k, `audio/${k}.ogg`]));
