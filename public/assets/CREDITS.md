# Créditos de arte y sonido

Todo el arte y el audio de Base Builder viene de **Kenney** (https://kenney.nl) y es **CC0 1.0** (dominio público):
se puede usar en proyectos personales y comerciales. El crédito no es obligatorio, pero se agradece.
Las licencias originales están en `licenses/`.

## Packs usados
| Pack | Uso | Licencia |
|---|---|---|
| [Medieval RTS](https://kenney.nl/assets/medieval-rts) | Terreno, edificios, árboles, rocas, arbustos, caja de obras | CC0 |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Clics, cerrar, confirmar, error | CC0 |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | Monedas, construir, mejorar, demoler | CC0 |

## Correspondencia con los archivos originales
Las imágenes son las del tamaño «Default size» (64×64 px), renombradas.

| Archivo en `art/` | Original (Medieval RTS) |
|---|---|
| `grass_a`, `grass_b` | `medievalTile_57`, `medievalTile_58` |
| `mine_1`, `mine_2`, `mine_3` | `medievalEnvironment_11`, `_12`, `_19` |
| `storage_1`, `storage_2`, `storage_3` | `medievalStructure_11`, `_19`, `_09` |
| `tower_1`, `tower_2`, `tower_3` | `medievalStructure_05`, `_01`, `_02` |
| `townhall_1`, `townhall_2`, `townhall_3` | `medievalStructure_17`, `_04`, `_06` |
| `sawmill_1`, `sawmill_2`, `sawmill_3` | `medievalStructure_21`, `_20`, `_16` |
| `wall_1`, `wall_2`, `wall_3` | **Dibujados para este proyecto** con `scripts/make-walls.mjs` (el pack no trae muros); se ofrecen también como CC0 |
| `tree_a`, `tree_b`, `tree_c` | `medievalEnvironment_02`, `_03`, `_04` |
| `rock_a`, `rock_b`, `rock_c` | `medievalEnvironment_08`, `_09`, `_10` |
| `bush_a`, `bush_b` | `medievalEnvironment_13`, `_20` |
| `worker_1` … `worker_4` | `medievalUnit_06`, `_12`, `_18`, `_24` |
| `crate` | `medievalTile_55` |

| Archivo en `audio/` | Original | Pack |
|---|---|---|
| `place` | `chop` | RPG Audio |
| `collect` | `handleCoins` | RPG Audio |
| `collect_all` | `handleCoins2` | RPG Audio |
| `upgrade_start` | `metalLatch` | RPG Audio |
| `demolish` | `doorClose_3` | RPG Audio |
| `upgrade_done` | `confirmation_004` | Interface Sounds |
| `error` | `error_004` | Interface Sounds |
| `select` | `click_002` | Interface Sounds |
| `move` | `drop_001` | Interface Sounds |
| `close` | `close_002` | Interface Sounds |

El formato de audio es `.ogg`; algunos navegadores antiguos de Apple no lo reproducen (el juego funciona igual, sin sonido).
