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
  'worker_1', 'worker_2', 'worker_3', 'worker_4',
  'house_1', 'house_2', 'house_3',
  'barracks_1', 'barracks_2', 'barracks_3',
  'archery_1', 'archery_2', 'archery_3',
  'atelier_1', 'atelier_2', 'atelier_3',
  'stable_1', 'stable_2', 'stable_3',
  'siege_1', 'siege_2', 'siege_3',
  'forge_1', 'forge_2', 'forge_3',
  'altar_1',
  'gate_1', 'gate_2', 'gate_3',
  'wallh_1', 'wallh_2', 'wallh_3', 'wallv_1', 'wallv_2', 'wallv_3',
  'unit_soldier', 'unit_archer', 'unit_mage', 'unit_knight', 'unit_catapult', 'unit_ram',
  'unit_hero', 'hero_ranger', 'hero_priest', 'hero_pyro', 'hero_warlord',
  'enemy_guard', 'enemy_brute',
  'stump', 'log', 'rock_d', 'rock_e', 'rock_f',
  'tree_a', 'tree_b', 'tree_c',
  'rock_a', 'rock_b', 'rock_c',
  'bush_a', 'bush_b',
  'crate',
];

const SFX = [
  'place', 'collect', 'collect_all',
  'upgrade_start', 'upgrade_done',
  'demolish', 'error', 'select', 'close', 'move',
  'hit', 'shoot', 'boom', 'win', 'lose',
];

export const IMAGES = Object.fromEntries(ART.map((k) => [k, `art/${k}.png`]));
export const SOUNDS = Object.fromEntries(SFX.map((k) => [k, `audio/${k}.ogg`]));
