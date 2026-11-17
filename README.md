# Base Builder

Prototipo de juego de estrategia con construcción de base (un jugador), hecho como PWA con **Phaser 4 + Vite**. Referencias de diseño: **Backyard Monsters** y Clash of Clans (la base y el ataque) y **Warcraft III** (dos recursos, el Ayuntamiento que sube de nivel y manda sobre lo que se puede construir). La vista es **isométrica** (rombos 2:1) con arte hecho a partir de modelos 3D libres, personalizados (ver *Arte* y *Créditos*).

## Jugar online
**https://caly-lucero.github.io/base-builder/** — funciona en el navegador y se puede **instalar como app** (en Android: menú del navegador → «Instalar app» / «Añadir a la pantalla de inicio») y jugar sin conexión.

Cada vez que se sube algo a la rama `main`, GitHub corre las pruebas, compila y publica solo (ver `.github/workflows/deploy.yml`); si una prueba falla, no se publica. La partida se guarda **en el navegador de cada dispositivo**: la versión online y la de `localhost` tienen partidas separadas (se pueden pasar con *Exportar/Importar partida*).

## Qué hay hoy
- **Mapa isométrico de 24×24** (una isla que flota sobre el cielo) que se ve por una ventana: se desplaza y se hace zoom (ver *Controles*), con césped variado, **caminos de tierra** que unen tus edificios, estanques con reflejos, flores, sombras, nubes, humo de chimeneas, fuego en lo dañado y efectos al recolectar, mejorar y combatir.
- **Dos recursos, como en Warcraft III: oro y madera.** La **Mina de oro** produce oro y el **Aserradero** madera; tócalos para recolectar. Casi todo cuesta oro y madera.
- **Todos los edificios llegan al nivel 10.** Del nivel 4 en adelante reutilizan el dibujo del 3 con un **tinte propio por nivel** (dorado, verde, celeste, violeta, rosa, naranja), así se ve de un vistazo qué tan avanzado está. Las mejoras **tardan tiempo real** (hasta 12 h las últimas) y mientras se mejora el edificio no produce. Hay 2 «obreros» (2 mejoras a la vez, el Ayuntamiento también usa uno).
- **Ayuntamiento** (ya viene en la partida; se puede mover, no se construye ni se demuele). Sube del nivel 1 al 10: Ayuntamiento → Fortaleza → Castillo → Ciudadela → Capital → Reino → Imperio → Dominio → Trono → Corona. **Su nivel manda**:
  - cuántos edificios de cada tipo puedes tener;
  - hasta qué nivel puedes mejorar el resto (un edificio nunca pasa del nivel del Ayuntamiento);
  - **qué edificios militares se desbloquean**: Cuartel (nivel 2), Arquería (4), Atelier (6), Caballeriza (8) y Taller de asedio (10);
  - el **nivel máximo de tus héroes: el doble** (hasta 20).
- **Casas** (antes «granjas»): dan población. El Ayuntamiento da algo de población propia; cada unidad y cada héroe ocupan la suya desde que empiezan a entrenarse. Sin espacio libre no se entrena, y no se demuele una casa que sostiene al ejército.
- **Cinco edificios militares, cada uno con su unidad.** Su **nivel es el de sus unidades**: a más nivel, más vida y daño (+15 % por nivel) y, desde el nivel 4, entrena más rápido.
  | Edificio | Unidad | Papel |
  |---|---|---|
  | Cuartel | Soldado | barato y resistente; vence a los caballeros |
  | Arquería | Arquero | dispara desde lejos; vence a los magos, parejo con los soldados, pierde con los caballeros |
  | Atelier | Hechicero | daño en área; rompe soldados agrupados |
  | Caballeriza | Caballero | rápido y duro; arrasa arqueros y magos, pierde con soldados |
  | Taller de asedio | Catapulta (nivel 1) y Ariete (nivel 5) | van a por los edificios y casi no dañan unidades |
  Hay una prueba que enfrenta ejércitos de igual costo y vigila que ninguna unidad gane a todas ni pierda contra todas.
- **Herrería** (Ayuntamiento 3): investiga tres mejoras de hasta el nivel de la herrería (máx. 10): **Armas afiladas** (+6 % de daño por nivel), **Armaduras** (+6 % de vida) y **Fortificaciones** (+8 % de vida de edificios y de daño de torres, en la defensa). Cuestan, tardan y siguen aunque no estés.
- **Cinco héroes** en el **Altar** (cada uno pide un nivel de altar: Paladín 1, Cazadora 2, Sacerdotisa 4, Piromante 6, Comandante 8). Puedes tener varios, pero **solo 2 salen a pelear**: se elige la escuadra en la ventana *Héroes* (tarjeta del Altar). Cada uno tiene **dos árboles de poder que se desbloquean solos al subir de nivel**:
  - **Árbol 1 · Habilidad** (rangos en los niveles 1, 7, 13 y 19): Escudo sagrado, Lluvia de flechas, Sanación, Bola de fuego o Grito de guerra. Se lanza sola cuando vale la pena, o a mano tocando el botón del héroe en la batalla.
  - **Árbol 2 · Pasivas** (niveles 3, 6, 10, 14 y 18): vida, daño, velocidad, armadura y regeneración.
  - Ganan experiencia siempre que pelean (6 por edificio, 4 por baja, bono por ganar) y **su nivel no pasa del doble del Ayuntamiento**: al llegar al tope guardan la experiencia hasta que lo subas.
- **Combate y campaña (botón ⚔)**: ataca bases enemigas generadas (Campaña 1, 2, 3…, cada una más dura).
  - **Automático con control de grupos**: tus unidades pelean solas (primero los enemigos cercanos, luego el edificio más cercano; los muros se rodean o se rompen). Tú puedes **elegir un grupo** (Todos, Soldados, Arqueros, Magos, Caballeros, Asedio, Héroes, tocando una unidad o con el recuadro ▭) y **darle un objetivo**: tocar un enemigo o edificio para atacarlo, o el suelo para moverlo. Al cumplir la orden vuelven al modo automático; **Auto** las devuelve de inmediato.
  - **Tres estrellas, como en Clash**: ★ por destruir el Ayuntamiento enemigo (eso ya es una victoria y hace avanzar la campaña), ★ por destruir el 50 % de su base y ★ por destruirla toda (los muros no cuentan). Destruir el Ayuntamiento **no termina la batalla**: sigue hasta que arrases todo, te quedes sin tropas, se acabe el tiempo (3 min) o te retires. Se guarda la mejor cantidad de estrellas de cada nivel y **cada estrella nueva da un premio extra** que crece con el nivel. Las estrellas se encienden en vivo arriba del mapa.
  - **La guarnición defiende en grupo**: en cuanto atacas algo de una aldea (la enemiga o la tuya), todas sus tropas se enteran, ven más lejos y acuden. Las guarniciones enemigas son variadas: guardias, arqueros (desde la campaña 3), brutos (4) y chamanes (6); en los ataques a tu base llegan además arañas y arqueros.
  - **Resultado**: las tropas caídas se pierden (los héroes no), el botín entra sin pasar el tope y los héroes de la escuadra ganan experiencia. Ganar el nivel que toca avanza la campaña.
- **Ataques enemigos a tu base**: cada 12 minutos (el primero a los 10) llega una oleada. Un cartel rojo muestra la **cuenta regresiva** y la fuerza del ataque (crece con el Ayuntamiento y con la campaña superada). **Si estás jugando, ves la defensa en vivo** (tus torres, muros, tropas y héroes pelean solos, puedes lanzar las habilidades o **saltar la defensa**); si estabas fuera, solo ves el informe. El enemigo se retira tras destruir `2 + nivel del Ayuntamiento` edificios, y el informe cuenta cómo fue:
  - los edificios destruidos quedan **dañados** (oscuros, con la etiqueta «Dañado»): no producen, no entrenan ni mejoran hasta **repararlos**, por una parte de lo invertido (30 %). Tócalos y pulsa *Reparar*, o toca el cartel rojo para **reparar todo**;
  - te roban un porcentaje del oro y la madera (más si cae el Ayuntamiento, que nunca queda dañado);
  - los héroes ganan XP por cada atacante derrotado y un bono si rechazas la oleada.
  Tus tropas no mueren al defender, las armas de asedio no defienden, y las **Fortificaciones** de la herrería refuerzan edificios y torres. Mientras tú atacas, las oleadas quedan en pausa; si estuviste fuera mucho tiempo, solo se resuelve una.
- **Muros y puertas**: los muros cuestan solo madera y se pintan arrastrando (cada uno es un bloque: de madera, de piedra y almenado). Las puertas son un muro con paso.
- **Pensado para el celular**: el juego ocupa toda la pantalla en vertical, con la barra de abajo (Construir, Atacar, Héroes, Logros, Menú) y una **hoja de construcción** que se abre sobre el mapa con tres pestañas (*Economía*, *Ejército*, *Defensa*) y el botón *Demoler*. Al elegir un edificio la hoja se cierra y un aviso arriba dice qué estás colocando (con una ✕ para cancelar). Hay vibración corta al tocar los botones. Sonido, exportar, importar y nueva partida están en el **Menú**.
- **Misiones**: una cadena de 32 objetivos que guía la partida («Construye un Aserradero», «Sube el Ayuntamiento a Fortaleza», «Construye una Herrería»…). El cartel de arriba a la izquierda muestra la actual; al cumplirla se pone verde y la tocas para **reclamar el premio**.
- **Logros** (botón 🏆, con un punto rojo cuando hay premio): 11 familias con varios niveles (Constructor, Muralla, Gran ciudad, Obra maestra, Gran ejército, Señor del asedio, Conquistador, Colección de héroes, Leyenda, Herrero, Superviviente). Se reclaman de a un nivel y los premios crecen mucho.
- **Mover edificios** arrastrándolos (gratis). **Demoler** devuelve el 50 % de lo invertido.
- La producción, las mejoras, el entrenamiento y las investigaciones **siguen mientras no juegas** (máximo 8 h de producción); al volver, el juego avisa qué terminó.
- **Animación de verdad**: cada personaje tiene cuadros de **caminar, atacar, quieto y caído**, mirando en las cuatro diagonales. En la base, tus tropas y héroes **pasean** alrededor de su puesto; en la batalla caminan, **golpean con su arma** hacia el objetivo y caen al morir. Mientras un edificio se mejora, un **martillo** lo golpea y levanta polvo; la fragua echa brasas, el altar brilla, la mina destella y el aserradero suelta astillas.
- **Vida**: un **aldeano** por cada mina y aserradero camina entre el Ayuntamiento y su edificio llevando la carga (es adorno). Al recolectar suben números flotantes y chispas; al construir, el edificio «salta» con una nube de polvo; los árboles se mecen con el viento.
- **Arte** (concepto del **Reino**: piedra clara, tejados azul pizarra y detalles dorados; la Horda enemiga va en rojo oscuro): edificios de 3 etapas compuestos con piezas de los kits 3D de Kenney (CC0), personajes de Mini Characters con **armas, escudos, capas, sombreros y aureolas modelados para el proyecto**, todo dibujado con la herramienta `tools/iso`. Hay 15 efectos de sonido y un botón de sonido en el Menú.
- Guardado automático, exportar/importar partida y funcionamiento sin conexión.

## Controles
| Acción | Ratón / teclado | Pantalla táctil |
|---|---|---|
| Construir | botón **Construir** → elegir edificio → tocar una casilla | igual |
| Muros | elegir **Muro** en la hoja y arrastrar | igual |
| Seleccionar / recolectar | tocar un edificio (abre su panel) | igual |
| Entrenar | elegir un cuartel o el altar y tocar la tarjeta de la unidad | igual |
| Atacar | botón ⚔ y «Atacar» | igual |
| Logros y Héroes | botones de la barra de abajo | igual |
| Menú (sonido, exportar, importar, nueva partida) | botón **Menú** | igual |
| En batalla: habilidad de un héroe | botón con su cara, a la derecha | igual |
| En batalla: elegir tropas | botones de abajo, tocar una unidad, o ▭ y arrastrar un recuadro | igual |
| En batalla: ordenar | tocar un enemigo (atacar) o el suelo (mover) | igual |
| Mover un edificio | arrastrarlo a otra casilla (verde = se puede, rojo = no) | igual |
| Desplazar el mapa | arrastrar el suelo, flechas o WASD | arrastrar el suelo |
| Zoom | rueda, botones **+ / −** | pellizcar, botones **+ / −** |
| Volver al centro | botón **⌂** | igual |

Notas: con la herramienta **Muro** elegida, arrastrar pinta muros (para desplazar el mapa, deselecciona la herramienta o usa las teclas). El panel de un edificio ocupa el lugar de la barra de herramientas: ciérralo con ✕ o tocando el suelo para volver a elegir un edificio.

## Uso
**Para jugar:** doble clic en **`iniciar.bat`** (hay también un acceso directo «Base Builder» en el Escritorio). Arranca el servidor, abre el juego en el navegador y, para apagarlo, cierras la ventana negra. La primera vez instala las dependencias solo. Usa `npm.cmd`, así que no lo frena el bloqueo de scripts de PowerShell.

Para desarrollar, desde una terminal:
```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas de lógica, guardado, cámara y assets
npm run build      # genera dist/ (con CSP y service worker)
npm run preview    # sirve dist/ en http://localhost:4173
npm run icons      # regenera los iconos de la PWA
```
En Windows PowerShell, si `npm` da error de «ejecución de scripts deshabilitada», usa `npm.cmd` (o permite scripts firmados con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## Estructura
- `src/data/config.js` — edificios, niveles, costos, límites por nivel del Ayuntamiento, sprites y economía. Para balancear, edita solo este archivo.
- `src/data/assets.js` — lista de imágenes y sonidos que se cargan (los archivos están en `public/assets/`).
- `src/game/logic.js` — reglas del juego (puras, sin DOM).
- `src/game/save.js` — guardado: validación estricta, checksum, versión, migraciones, respaldo.
- `src/game/store.js` — estado único, autoguardado y avisos.
- `src/game/projection.js` — **único** lugar que convierte casillas ↔ pantalla y que lleva la cámara (desplazamiento y zoom). Isométrica 2:1: `centro = vista + ((x − y)·48, (x + y + 1)·24)·zoom`.
- `src/game/sprites.js` — puntos de apoyo y medidas del arte (edificios, adornos, personajes).
- `src/game/unitArt.js` — cómo se leen las hojas de animación (qué cuadro toca para caminar, atacar, quieto o caído, y hacia dónde mira).
- `src/game/battle.js` — simulación de la batalla (pura y determinista): objetivos automáticos, órdenes, torres, botín y fin.
- `src/game/pathfinding.js` — A* sobre la cuadrícula (los muros cuestan más: se rodean, pero se pueden atravesar rompiéndolos).
- `src/game/missions.js` — genera la base enemiga de cada nivel de campaña.
- `src/data/heroes.js` — los 5 héroes, sus dos árboles de poder, estadísticas y nivel máximo.
- `src/game/achievements.js` — logros: cómo se mide cada uno y cómo se reclaman.
- `src/scenes/terrainArt.js` — terreno isométrico dibujado por código (césped, tierra, arena, agua) y el borde de roca de la isla.
- `src/scenes/artPlace.js` — cómo se apoya cada dibujo en su casilla.
- `src/game/raids.js` — ataques enemigos a tu base: fuerza y generación de oleadas, calendario, daño, robo y reparación del informe.
- `src/game/campaign.js` — aplica el resultado de una batalla (bajas, botín, campaña, experiencia del héroe).
- `src/scenes/BattleScene.js` — escena de la batalla (tuya o la defensa de tu base): dibujo, selección, órdenes, habilidades y resultado.
- `src/scenes/heroPanel.js`, `src/scenes/achievementsPanel.js` — las ventanas de héroes y de logros.
- `src/scenes/ui.js` — el kit de interfaz: paleta, iconos dibujados por código, paneles y botones redondeados, ventanas.
- `src/game/menu.js` — puente entre el menú del juego y los botones de la página.
- `src/scenes/look.js` — aspecto: texturas generadas por código, sombras, viñeta, nubes, humo y brillo de la interfaz.
- `src/game/quests.js` — misiones: progreso (calculado, no guardado) y reclamo de premios. Los datos están en `QUESTS` de `config.js`.
- `src/game/workers.js` — rutas y tiempos de los aldeanos (lógica pura; el dibujo está en la escena).
- `src/game/decor.js` — adornos del mapa generados con semilla fija (no se guardan).
- `src/game/prefs.js` — preferencias del dispositivo (sonido), aparte de la partida.
- `src/scenes/BaseScene.js` — dibujo, gestos (tocar, arrastrar, pellizcar), sonido y HUD con Phaser.
- `scripts/` — generador de los iconos de la PWA.
- `tools/iso/` — herramienta de desarrollo que convierte modelos 3D en el arte isométrico del juego (ver su README).
- `sw.template.js` — plantilla del service worker; el build genera `dist/sw.js` con la lista de archivos.

## Arte
El juego se dibuja en **vista isométrica 2:1** (casillas de 96×48 px a zoom 1). El arte sale de modelos 3D CC0 de Kenney que se montan, recolorean y fotografían desde una cámara isométrica con `tools/iso` (ver su README); el resultado son PNG normales en `public/assets/iso/`: edificios de 192×256, adornos de 160×176 y hojas de animación de personajes de 8×4 cuadros de 96×120. Cada tipo se apoya en su casilla por un punto fijo (`sprites.js`). La lógica, el guardado y la economía solo hablan en casillas `(x, y)` y no saben nada de cómo se dibuja.

Más adelante, para **razas**: bastan otra paleta (`reino()` en `tools/iso/buildings.js`) y otras piezas por edificio.

## Créditos
Modelos 3D y sonido de [Kenney](https://kenney.nl) (Castle Kit, Fantasy Town Kit, Mini Characters, Interface Sounds y RPG Audio), licencia **CC0**; el arte isométrico se generó con ellos y las piezas propias de `tools/iso`. Detalle y correspondencia de archivos en `public/assets/CREDITS.md`; licencias originales en `public/assets/licenses/`.

## Seguridad (juego de un jugador)
- Todo lo que se carga (localStorage o archivo importado) pasa por `parseSave`: tamaño máximo, versión, checksum y validación de cada campo; se descartan campos desconocidos.
- Los mensajes se escriben con `textContent`, nunca como HTML.
- El build incluye una **Content-Security-Policy** (`meta`). Al publicar, conviene enviarla además como cabecera HTTP.
- Si la partida principal está dañada, se recupera la copia de respaldo.
- El checksum **no impide hacer trampa** (el código corre en el navegador); solo detecta archivos dañados o editados a mano. No importa mientras no haya ranking ni multijugador: ahí habría que validar en un servidor.

## Limitaciones conocidas
- Abrir el juego en dos pestañas a la vez: la última en guardar gana.
- Las pruebas de PWA se hicieron a mano (instalación, sin conexión); falta pasar **Lighthouse**.
- El pellizco con dos dedos, el recuadro de selección y los botones de habilidad **no se han probado en un móvil real** (solo con ratón y teclado).
- Las mejoras usan la hora del sistema: adelantar el reloj las termina antes. El juego limita el daño (una mejora nunca puede quedar más lejos que su duración total), pero no puede impedirlo del todo; es aceptable sin ranking.
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`. Ejemplos: v1→v2 (niveles), v2→v3 (mapa 12×12 → 24×24, madera y Ayuntamiento), v3→v4 (misiones), v4→v5 (ejército, héroe y entrenamiento), v5→v6 (campaña y experiencia), v6→v7 (ataques enemigos y edificios dañados) y v7→v8 (casas, nuevas unidades, 5 héroes con escuadra, herrería y logros). Una base avanzada que se migra tendrá varias misiones ya cumplidas y podrá reclamarlas.
- Los sonidos son `.ogg`: algunos navegadores antiguos de Apple no los reproducen (el juego funciona igual, sin sonido).
- El lienzo es de 432 px de ancho (el alto se adapta a la pantalla al arrancar) y se escala; en pantallas grandes los dibujos se ven algo suavizados. Si giras el celular hay que recargar.
- Los niveles 4 a 10 reutilizan el dibujo de la etapa 3 con un tinte; no tienen arte propio.
- El arte nuevo se probó en un navegador de escritorio con tamaño de móvil; falta probarlo en un móvil real.
- Los personajes miran en 4 diagonales (2 dibujadas y 2 volteadas): no giran con suavidad. Las máquinas de asedio solo se balancean al moverse y atacar.
- Los muros son bloques sueltos que no se unen entre sí con piezas de esquina.
- Los edificios entrenan de a una unidad por vez; no hay cola de entrenamiento. Solo cuenta el edificio de mayor nivel de cada tipo para el nivel de las unidades; tener varios solo ayuda a entrenar más a la vez.
- Una batalla en curso no se guarda: si cierras la página, no cuenta (tus tropas siguen intactas).
- Las unidades no chocan entre sí (se superponen).
- Las oleadas usan la hora del sistema y no se pueden aplazar; el equilibrio (fuerza, robo, costo de reparar y de las mejoras de nivel alto) es una primera aproximación. Un ejército de nivel alto aplasta las primeras campañas.
- Los costos de los niveles 6 a 10 salen de una fórmula (más caros y lentos cada vez, hasta 12 h por mejora): falta jugarlos para afinarlos.

## Hoja de ruta
Se decidió que el juego debía sentirse menos básico: *quieto, con poco que hacer, sin objetivos y sin combate*. Por etapas:

1. **Vida y metas** — hecho: aldeanos, efectos y misiones.
2. **Más contenido** — hecho: casas, cinco edificios militares con sus unidades, herrería, altar y 5 héroes con árboles de poder, puertas, logros y niveles hasta el 10.
3. **Combate y campaña** — hecho: ataque **automático con control de grupos**, arqueros, magos, caballeros y asedio, habilidades de héroes, **ataques enemigos a tu base** que se ven en vivo, con daño y reparación. Pendiente: elegir dónde desembarcan las tropas, más tipos de enemigo, más campañas y afinar el equilibrio.
4. **Gráficos** — hecho: **vista isométrica con arte 3D propio**, personajes con animación de caminar y atacar, sombras, terreno con caminos, estanques y flores, humo y fuego, efectos de habilidades e interfaz nueva. Pendiente: razas, etapas de arte propias para los niveles altos y mejorar el terreno de la batalla.
5. En cualquier momento: probarlo en el celular, pasar Lighthouse y, si hace falta, alojarlo en otro sitio.
