# Créditos de arte y sonido

Todo el arte y el audio de Base Builder parte de **Kenney** (https://kenney.nl) y es **CC0 1.0** (dominio público):
se puede usar en proyectos personales y comerciales. El crédito no es obligatorio, pero se agradece.
Las licencias originales están en `licenses/`.

## Packs usados
| Pack | Uso | Licencia |
|---|---|---|
| [Castle Kit](https://kenney.nl/assets/castle-kit) (modelos 3D) | Torres, muros, puertas, armas de asedio, rocas, árboles y troncos | CC0 |
| [Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit) (modelos 3D) | Casas, tejados, chimeneas, carros, fuentes, árboles, rocas y arbustos | CC0 |
| [Mini Characters](https://kenney.nl/assets/mini-characters) (modelos 3D con esqueleto y animaciones) | Los personajes: aldeanos, tropas, héroes y enemigos | CC0 |
| [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Clics, cerrar, confirmar, error | CC0 |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | Monedas, construir, mejorar, demoler | CC0 |

## Cómo se hizo el arte (vista isométrica)
Las imágenes de `iso/` **no son las de Kenney tal cual**: se generan con la herramienta `tools/iso` del repositorio, que monta los modelos 3D,
los recolorea y los dibuja desde una cámara isométrica 2:1 con luz y sombra propias. Se ofrecen también como CC0.

- **`iso/buildings/`** — 15 edificios × 3 etapas. Cada uno es una composición propia de piezas del Castle Kit y del Fantasy Town Kit (pisos, tejados,
  chimeneas, banderas, carros, ruedas, fuentes…) con la paleta del *Reino*: piedra clara, tejados azul pizarra y detalles dorados. Los niveles 4 a 10
  reutilizan la etapa 3 con un tinte (ver `config.js`).
- **`iso/decor/`** — árboles, rocas y troncos de los kits (los árboles recoloreados); los arbustos, las flores y la mata de hierba están hechos a mano.
- **`iso/units/`** — una hoja por personaje (8×4 cuadros de 96×120 px: caminar, atacar, quieto y caído, mirando a dos direcciones; las otras dos se
  obtienen volteando). Parten de los modelos de Mini Characters y **llevan armas, escudos, aljabas, bastones, hacha, maza, sombreros, capas y aureolas
  modelados para este proyecto** (`tools/iso/designs.js`), con colores propios para cada bando. La araña y las máquinas de asedio también (la araña
  está modelada desde cero; el asedio es del Castle Kit).
- El terreno (césped, tierra, arena, agua) y el borde de roca de la isla se dibujan por código dentro del juego.

## Sonido
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
| `hit` | `knifeSlice` | RPG Audio |
| `shoot` | `metalClick` | RPG Audio |
| `boom` | `doorClose_1` | RPG Audio |
| `win` | `confirmation_002` | Interface Sounds |
| `lose` | `error_007` | Interface Sounds |
| `close` | `close_002` | Interface Sounds |

El formato de audio es `.ogg`; algunos navegadores antiguos de Apple no lo reproducen (el juego funciona igual, sin sonido).
