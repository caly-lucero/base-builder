# Base Builder

Prototipo de juego de estrategia con construcción de base (un jugador), hecho como PWA con **Phaser 4 + Vite**. Referencias de diseño: **Backyard Monsters** y Clash of Clans (la base y el ataque) y **Warcraft III** (dos recursos, el Ayuntamiento que sube de nivel y manda sobre lo que se puede construir). La vista es **isométrica** (rombos 2:1) con arte hecho a partir de modelos 3D libres, personalizados (ver *Arte* y *Créditos*).

## Jugar online
**https://caly-lucero.github.io/base-builder/** — funciona en el navegador y se puede **instalar como app** (en Android: menú del navegador → «Instalar app» / «Añadir a la pantalla de inicio») y jugar sin conexión.

Cada vez que se sube algo a la rama `main`, GitHub corre las pruebas, compila y publica solo (ver `.github/workflows/deploy.yml`); si una prueba falla, no se publica. La partida se guarda **en el navegador de cada dispositivo**: la versión online y la de `localhost` tienen partidas separadas (se pueden pasar con *Exportar/Importar partida*).

## Qué hay hoy
- **Mapa isométrico de 48×48 cuadros** (tierra firme que sigue más allá del borde, con bosque y rocas; cada cuadro es la mitad de lo que era una casilla) que se ve por una ventana: se desplaza y se hace zoom (ver *Controles*), con césped variado, **caminos de tierra** que unen tus edificios, estanques con reflejos, flores, sombras, nubes, humo de chimeneas, fuego en lo dañado y efectos al recolectar, mejorar y combatir.
- **Dos recursos, como en Warcraft III: oro y madera.** La **Mina de oro** produce oro y el **Aserradero** madera; tócalos para recolectar. Casi todo cuesta oro y madera.
- **Todos los edificios llegan al nivel 10.** Del nivel 4 en adelante reutilizan el dibujo del 3 con un **tinte propio por nivel** (dorado, verde, celeste, violeta, rosa, naranja), así se ve de un vistazo qué tan avanzado está. Las mejoras **tardan tiempo real** (hasta 12 h las últimas) y mientras se mejora el edificio no produce. Hay 2 «obreros» (2 mejoras a la vez, el Ayuntamiento también usa uno).
- **Ayuntamiento** (ya viene en la partida; se puede mover, no se construye ni se demuele). Sube del nivel 1 al 10: Ayuntamiento → Fortaleza → Castillo → Ciudadela → Capital → Reino → Imperio → Dominio → Trono → Corona. **Su nivel manda**:
  - cuántos edificios de cada tipo puedes tener;
  - hasta qué nivel puedes mejorar el resto (un edificio nunca pasa del nivel del Ayuntamiento);
  - **qué edificios militares se desbloquean**: Cuartel (nivel 2), Arquería (4), Atelier (6), Caballeriza (8) y Taller de asedio (10);
  - el **nivel máximo de tus héroes: el doble** (hasta 20).
- **Casas** (antes «granjas»): dan población. El Ayuntamiento da algo de población propia; cada unidad y cada héroe ocupan la suya desde que empiezan a entrenarse. Sin espacio libre no se entrena, y no se demuele una casa que sostiene al ejército.
- **Cinco edificios militares, cada uno con su unidad.** Solo puedes tener **uno de cada clase** (también Herrería y Altar). Su **nivel es el de sus unidades**: a más nivel, más vida y daño (+15 % por nivel) y, desde el nivel 4, entrena más rápido.
- **Entrenar por lotes**: en un edificio militar eliges la cantidad (− / + / **Máx**) y entrenas varias unidades iguales **a la vez**. El tope del lote crece con el nivel del edificio (3 + 2 por nivel: 5 en el nivel 1, 23 en el 10), el lote entero tarda solo un 10 % más por cada unidad extra, y también lo limitan la población libre y tus recursos.
- **Mi ejército**: toca la **población** del HUD (o *Ver mi ejército* al atacar) para ver cuántas tropas tienes de cada tipo, su nivel y fuerza, las que están en camino y tus héroes. En la base solo se dibujan unas pocas figuras de muestra.
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
- **Edificios de distintos tamaños**: cada edificio ocupa un rectángulo de cuadros, así se distinguen de un vistazo. Mina, aserradero, casa y torre: 2×2; almacén y herrería: 4×3; altar: 3×3; atelier: 4×4; cuartel y arquería: 5×5; caballeriza: 5×4; taller de asedio: 6×5; muros y puertas: 1×1; y el **Ayuntamiento, 7×7**, un patio amurallado con torreones y un halo dorado que late bajo él (lleva su nombre encima). El suelo de los edificios grandes es una losa de piedra con adornos.
- **Quitar árboles, rocas y arbustos**: toca uno (o usa la herramienta Demoler) y desaparece, gratis, con una nube de polvo. En el **Menú**, *Quitar todos los adornos* deja el mapa limpio de golpe y *Devolver los adornos* los repone (también se quitan de las batallas, y al defender tu base se ve lo que quitaste). El bosque de más allá del borde del mapa no se quita.
- **Girar la cámara**: los botones ⟲ ⟳ (o las teclas **Q** / **E**) giran la vista de 90° en 90°. Cada edificio tiene su dibujo para los 4 lados y los personajes miran según la vista.
- **Combate y campaña (botón ⚔)**: un **mapa de campaña** con 10 enemigos por mapa (puntos unidos por un camino). Cada punto guarda sus estrellas (★ Ayuntamiento · 50 % · 100 %) y se puede repetir para mejorarlas. Al vencer a los 10 (el décimo es un jefe) se abre otro mapa (hay 10 temas distintos y luego se repiten sin fin) con enemigos más duros: la guarnición crece al ritmo de un ejército (de 3 defensores en el nivel 1 a 200 en el 31, con arqueros, brutos, chamanes y arañas) y de ahí en adelante crece su dureza. Con `node tools/balance.mjs` se simula qué ejército pasa cada nivel.
  - **Automático con control de grupos**: tus unidades pelean solas (primero los enemigos cercanos, luego el edificio más cercano; los muros se rodean o se rompen). Tú puedes **elegir un grupo** (Todos, Soldados, Arqueros, Magos, Caballeros, Asedio, Héroes, tocando una unidad o con el recuadro ▭) y **darle un objetivo**: tocar un enemigo o edificio para atacarlo, o el suelo para moverlo. Al cumplir la orden vuelven al modo automático; **Auto** las devuelve de inmediato.
  - **Tres estrellas, como en Clash**: ★ por destruir el Ayuntamiento enemigo (eso ya es una victoria y hace avanzar la campaña), ★ por destruir el 50 % de su base y ★ por destruirla toda (los muros no cuentan). Destruir el Ayuntamiento **no termina la batalla**: sigue hasta que arrases todo, te quedes sin tropas, se acabe el tiempo (3 min) o te retires. Se guarda la mejor cantidad de estrellas de cada nivel y **cada estrella nueva da un premio extra** que crece con el nivel. Las estrellas se encienden en vivo arriba del mapa.
  - **La guarnición defiende en grupo**: en cuanto atacas algo de una aldea (la enemiga o la tuya), todas sus tropas se enteran, ven más lejos y acuden. Las guarniciones enemigas son variadas: guardias, arqueros (desde la campaña 3), brutos (4) y chamanes (6); en los ataques a tu base llegan además arañas y arqueros.
  - **Resultado**: las tropas caídas se pierden (los héroes no), el botín entra sin pasar el tope y los héroes de la escuadra ganan experiencia. Ganar el nivel que toca avanza la campaña.
- **Ataques enemigos a tu base**: cada 12 minutos (el primero a los 20) llega una oleada. Un cartel rojo muestra la **cuenta regresiva** y la fuerza del ataque (crece con el Ayuntamiento y con la campaña superada). **Si estás jugando, ves la defensa en vivo** (tus torres, muros, tropas y héroes pelean solos, puedes lanzar las habilidades o **saltar la defensa**); si estabas fuera, solo ves el informe. El enemigo se retira tras destruir `2 + nivel del Ayuntamiento` edificios, y el informe cuenta cómo fue:
  - los edificios destruidos quedan **dañados** (oscuros, con la etiqueta «Dañado»): no producen, no entrenan ni mejoran hasta **repararlos**, por una parte de lo invertido (30 %). Tócalos y pulsa *Reparar*, o toca el cartel rojo para **reparar todo**;
  - te roban un porcentaje del oro y la madera (más si cae el Ayuntamiento, que nunca queda dañado);
  - los héroes ganan XP por cada atacante derrotado y un bono si rechazas la oleada.
  Tus tropas no mueren al defender, las armas de asedio no defienden, y las **Fortificaciones** de la herrería refuerzan edificios y torres. Mientras tú atacas, las oleadas quedan en pausa; si estuviste fuera mucho tiempo, solo se resuelve una.
- **Muros y puertas**: los muros (de 1×1 cuadro) cuestan solo madera (4) y se pintan arrastrando (cada uno es un bloque: de madera, de piedra y almenado). Las puertas son un muro con paso. Como cada pieza es la mitad de larga que antes, los límites por nivel del Ayuntamiento son el doble.
- **Pensado para el celular**: el juego ocupa toda la pantalla en vertical, con la barra de abajo (Construir, Atacar, Héroes, Logros, Menú) y una **hoja de construcción** que se abre sobre el mapa con tres pestañas (*Economía*, *Ejército*, *Defensa*) y el botón *Demoler*. Al elegir un edificio la hoja se cierra y un aviso arriba dice qué estás colocando (con una ✕ para cancelar). Hay vibración corta al tocar los botones. Sonido, exportar, importar y nueva partida están en el **Menú**.
- **Misiones**: una cadena de 32 objetivos que guía la partida («Construye un Aserradero», «Sube el Ayuntamiento a Fortaleza», «Construye una Herrería»…). El cartel de arriba a la izquierda muestra la actual; al cumplirla se pone verde y la tocas para **reclamar el premio**.
- **Logros** (botón 🏆, con un punto rojo cuando hay premio): 11 familias con varios niveles (Constructor, Muralla, Gran ciudad, Obra maestra, Gran ejército, Señor del asedio, Conquistador, Colección de héroes, Leyenda, Herrero, Superviviente). Se reclaman de a un nivel y los premios crecen mucho.
- **Mover edificios** arrastrándolos (gratis; con el dedo hay que mantenerlos pulsados un momento, así arrastrar sobre ellos desplaza el mapa). **Demoler** devuelve el 50 % de lo invertido.
- La producción, las mejoras, el entrenamiento y las investigaciones **siguen mientras no juegas** (máximo 8 h de producción); al volver, el juego avisa qué terminó.
- **Animación de verdad**: cada personaje tiene cuadros de **caminar, atacar, quieto y caído**, mirando en las cuatro diagonales. En la base, tus tropas y héroes **pasean** alrededor de su puesto; en la batalla caminan, **golpean con su arma** hacia el objetivo y caen al morir. Mientras un edificio se mejora, un **martillo** lo golpea y levanta polvo; la fragua echa brasas, el altar brilla, la mina destella y el aserradero suelta astillas.
- **Vida**: unos pocos **aldeanos** (3 como máximo, alternando oro y madera) caminan entre el Ayuntamiento y una mina o aserradero llevando la carga (es adorno). Al recolectar suben números flotantes y chispas; al construir, el edificio «salta» con una nube de polvo; los árboles se mecen con el viento.
- **Dos razas**: al empezar una partida eliges entre **El Reino** (humanos: piedra clara, tejados azul pizarra) y **Los Silvanos** (gente del bosque: casas de madera con techos verdes, cristales, cuernos de ciervo). Cambian el **arte** (edificios, tropas, héroes, aldeanos) y los **nombres** (Árbol Madre, Lancero, Guardián…); las estadísticas y costos son los mismos, así que el equilibrio no cambia. La raza queda en el guardado y no se cambia después (solo empezando de cero). Las partidas anteriores son del Reino.
- **Arte** (concepto del **Reino**: piedra clara, tejados azul pizarra y detalles dorados; la Horda enemiga va en rojo oscuro): edificios de 3 etapas compuestos con piezas de los kits 3D de Kenney (CC0), personajes de Mini Characters con **armas, escudos, capas, sombreros y aureolas modelados para el proyecto**, todo dibujado con la herramienta `tools/iso`. Hay 15 efectos de sonido y un botón de sonido en el Menú.
- **Pantalla de inicio**: al abrir el juego, *Continuar*, *Nueva partida* (con confirmación) o *Cómo se juega* (un minitutorial de 4 pantallas, que sale solo la primera vez). Si cerraste la página en plena batalla, también ofrece **retomarla**.
- **Premio diario**: al abrir el juego (o en el Menú) puedes reclamar un premio de oro y madera. Son 7 días seguidos que van subiendo (el 7.º es el gordo) y crecen con el nivel del Ayuntamiento; si falta un día, la racha vuelve al día 1. El día cuenta por la medianoche del dispositivo.
- **Colas**: un edificio militar guarda lotes de espera tras el que está entrenando (se pagan y reservan población al encargarlos; caben `1 + nivel/3` lotes: 1 en el nivel 1, 4 en el 9) y empiezan solos, también mientras no juegas. Las **mejoras** también se pueden dejar encargadas cuando los dos obreros están ocupados (hasta 3, pagadas al encargarlas y reembolsables): empiezan solas al liberarse un obrero.
- **Ataques con más margen**: el primer ataque llega a los 20 minutos y es un aviso suave (2 guardias más flojos). Tocar el cartel «ATAQUE EN» permite **aplazarlo** 8 min (hasta 2 veces por ataque, no en el último minuto, a `40 × nivel del Ayuntamiento` de oro). Los edificios que están **mejorando o entrenando cuando llega el ataque no quedan dañados** (así una obra de horas no se paraliza).
- **Interfaz más clara**: «ATAQUE EN 9:59» con rótulo, «Obreros 1/2» y «Ayuntamiento nivel N» en una fila grande, costos y entrenamientos en **rojo** cuando no alcanzan, y en la hoja de construcción los edificios bloqueados muestran su nombre y «Pide Ayuntamiento nivel N». Sin Altar ni héroes, la ventana de Héroes es una explicación corta con el botón **Construir el Altar**.
- **Batalla guardada**: una batalla en curso se guarda sola (al esconder o cerrar la página y cada pocos segundos) y se retoma desde la pantalla de inicio, justo donde estaba. Las unidades ya no se **encimen** (se separan y siguen cada una su carril).
- Guardado automático, exportar/importar partida y funcionamiento sin conexión. Si abres el juego en **otra pestaña**, la más vieja avisa y deja de guardar para no pisar tu partida. Al **girar el celular** el juego se recarga solo para ocupar toda la pantalla.

## Controles
| Acción | Ratón / teclado | Pantalla táctil |
|---|---|---|
| Construir | botón **Construir** → elegir edificio → tocar el mapa (el edificio queda centrado bajo el dedo; verde = cabe, rojo = no) | igual |
| Muros | elegir **Muro** en la hoja y arrastrar | igual |
| Seleccionar / recolectar | tocar un edificio (abre su panel) | igual |
| Entrenar | elegir un cuartel (o el altar), ajustar la cantidad y tocar la tarjeta de la unidad | igual |
| Ver mi ejército | tocar la población (arriba) | igual |
| Atacar | botón ⚔ y «Atacar» | igual |
| Logros y Héroes | botones de la barra de abajo | igual |
| Menú (sonido, exportar, importar, nueva partida) | botón **Menú** | igual |
| En batalla: habilidad de un héroe | botón con su cara, a la derecha | igual |
| En batalla: elegir tropas | botones de abajo, tocar una unidad, o ▭ y arrastrar un recuadro | igual |
| En batalla: ordenar | tocar un enemigo (atacar) o el suelo (mover) | igual |
| Mover un edificio | táctil: mantenerlo pulsado y arrastrar; ratón: arrastrarlo (verde = se puede, rojo = no) | igual |
| Desplazar el mapa | arrastrar el suelo, flechas o WASD | arrastrar el suelo |
| Zoom | rueda, botones **+ / −** | pellizcar, botones **+ / −** |
| Girar la vista | teclas **Q** / **E** o botones ⟲ ⟳ | botones ⟲ ⟳ |
| Elegir un edificio | tocarlo (se toca su dibujo, también el tejado de los altos) | igual |
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
node tools/balance.mjs --fill 0.6   # informe de equilibrio: estrellas por Ayuntamiento y nivel de campaña
```
En Windows PowerShell, si `npm` da error de «ejecución de scripts deshabilitada», usa `npm.cmd` (o permite scripts firmados con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## Estructura
- `src/data/config.js` — edificios, niveles, costos, límites por nivel del Ayuntamiento, sprites y economía. Para balancear, edita solo este archivo.
- `src/data/assets.js` — lista de imágenes y sonidos que se cargan (los archivos están en `public/assets/`).
- `src/game/logic.js` — reglas del juego (puras, sin DOM).
- `src/game/save.js` — guardado: validación estricta, checksum, versión, migraciones, respaldo.
- `src/game/store.js` — estado único, autoguardado y avisos.
- `src/game/projection.js` — **único** lugar que convierte cuadros ↔ pantalla y que lleva la cámara (desplazamiento, zoom y giro). Isométrica 2:1: `centro = vista + ((x − y)·24, (x + y + 1)·12)·zoom` (con la vista girada se gira antes el punto).
- `src/game/sprites.js` — puntos de apoyo y medidas del arte (edificios, adornos, personajes).
- `src/game/unitArt.js` — cómo se leen las hojas de animación (qué cuadro toca para caminar, atacar, quieto o caído, y hacia dónde mira).
- `src/game/battle.js` — simulación de la batalla (pura y determinista): objetivos automáticos, órdenes, torres, botín y fin.
- `src/game/pathfinding.js` — A* sobre la cuadrícula (los muros cuestan más: se rodean, pero se pueden atravesar rompiéndolos).
- `src/game/missions.js` — genera la base enemiga de cada nivel de campaña (con edificios de su tamaño).
- `src/game/campaignMap.js` y `src/scenes/campaignPanel.js` — los mapas de campaña de 10 enemigos y su ventana.
- `src/data/heroes.js` — los 5 héroes, sus dos árboles de poder, estadísticas y nivel máximo.
- `src/game/achievements.js` — logros: cómo se mide cada uno y cómo se reclaman.
- `src/scenes/terrainArt.js` — terreno isométrico dibujado por código (césped, tierra, arena, agua) y el borde de roca de la isla.
- `src/scenes/artPlace.js` — cómo se apoya cada dibujo en el centro de su rectángulo (y elige el dibujo del giro de cámara).
- `src/data/artBoxes.js`, `artBoxesSylvan.js` — tamaño y punto de apoyo de cada dibujo de edificio, por raza (los genera `tools/iso`).
- `src/data/races.js` — las razas: carpeta de arte y nombres de edificios, unidades y héroes (`applyRace`).
- `src/game/res.js` — resolución del lienzo (nitidez): zoom de cámara y puntero en píxeles lógicos.
- `src/game/raids.js` — ataques enemigos a tu base: fuerza y generación de oleadas, calendario, daño, robo y reparación del informe.
- `src/game/campaign.js` — aplica el resultado de una batalla (bajas, botín, campaña, experiencia del héroe).
- `src/scenes/BattleScene.js` — escena de la batalla (tuya o la defensa de tu base): dibujo, selección, órdenes, habilidades y resultado.
- `src/scenes/heroPanel.js`, `src/scenes/achievementsPanel.js`, `src/scenes/armyPanel.js` — las ventanas de héroes, de logros y del ejército.
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
El juego se dibuja en **vista isométrica 2:1** (casillas de 96×48 px a zoom 1). El arte sale de modelos 3D CC0 de Kenney que se montan, recolorean y fotografían desde una cámara isométrica con `tools/iso` (ver su README); el resultado son PNG normales en `public/assets/iso/` (y `iso/sylvan/` para los Silvanos), dibujados a **1,5× el tamaño en pantalla** (`ART_SCALE` en `config.js`): adornos de 240×264 y hojas de animación de personajes de 8×4 cuadros de 144×180; los edificios se recortan a lo que ocupan. Cada tipo se apoya en su casilla por un punto fijo (`sprites.js`). La lógica, el guardado y la economía solo hablan en casillas `(x, y)` y no saben nada de cómo se dibuja.

Una **raza nueva** pide: su paleta y sus piezas por edificio (como `tools/iso/sylvan.js`), sus personajes (`designsSylvan.js`), sus medidas (`node tools/iso/boxes.mjs <boxes.json> <raza>`), una entrada en `src/data/races.js` y una carpeta `public/assets/iso/<raza>/` (que no se precarga: se baja al elegir esa raza).

### Nitidez
El lienzo se dibuja a la resolución real de la pantalla (hasta 2× el tamaño lógico de 432 px de ancho, según la densidad: `res.js`): la cámara hace zoom y el puntero se convierte a píxeles lógicos, así que el juego sigue hablando en píxeles lógicos. Los textos se dibujan a esa resolución. Para probarlo sin un celular: `?dpr=2.5` al final de la dirección.

## Créditos
Modelos 3D y sonido de [Kenney](https://kenney.nl) (Castle Kit, Fantasy Town Kit, Mini Characters, Interface Sounds y RPG Audio), licencia **CC0**; el arte isométrico se generó con ellos y las piezas propias de `tools/iso`. Detalle y correspondencia de archivos en `public/assets/CREDITS.md`; licencias originales en `public/assets/licenses/`.

## Seguridad (juego de un jugador)
- Todo lo que se carga (localStorage o archivo importado) pasa por `parseSave`: tamaño máximo, versión, checksum y validación de cada campo; se descartan campos desconocidos.
- Los mensajes se escriben con `textContent`, nunca como HTML.
- El build incluye una **Content-Security-Policy** (`meta`). Al publicar, conviene enviarla además como cabecera HTTP.
- Si la partida principal está dañada, se recupera la copia de respaldo.
- El checksum **no impide hacer trampa** (el código corre en el navegador); solo detecta archivos dañados o editados a mano. No importa mientras no haya ranking ni multijugador: ahí habría que validar en un servidor.

## Limitaciones conocidas
- Las pruebas de PWA se hicieron a mano (instalación, sin conexión); falta pasar **Lighthouse**.
- El pellizco con dos dedos, el recuadro de selección y los botones de habilidad **no se han probado en un móvil real** (solo con ratón y teclado).
- Las mejoras usan la hora del sistema: adelantar el reloj las termina antes. El juego limita el daño (una mejora nunca puede quedar más lejos que su duración total), pero no puede impedirlo del todo; es aceptable sin ranking.
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`. Ejemplos: v1→v2 (niveles), v2→v3 (mapa 12×12 → 24×24, madera y Ayuntamiento), v3→v4 (misiones), v4→v5 (ejército, héroe y entrenamiento), v5→v6 (campaña y experiencia), v6→v7 (ataques enemigos y edificios dañados), v7→v8 (casas, nuevas unidades, 5 héroes con escuadra, herrería y logros) v9→v10 (edificios militares únicos y entrenamiento por lotes) v10→v11 (mapa de 48×48 cuadros y edificios de varios cuadros: cada casilla vieja pasa a 2×2 cuadros y cada muro a 4) v11→v12 (adornos quitados), v12→v13 (colas de entrenamiento y de obras, premio diario) y v13→v14 (raza elegida). Una base avanzada que se migra tendrá varias misiones ya cumplidas y podrá reclamarlas.
- Los sonidos son `.ogg`: algunos navegadores antiguos de Apple no los reproducen (el juego funciona igual, sin sonido).
- El lienzo es de 432 px lógicos de ancho (el alto se adapta a la pantalla al arrancar) y se dibuja hasta a 2× según la pantalla; las texturas de interfaz generadas por código (paneles, brillos, terreno) siguen a 1× y se ven algo suaves, y el arte a 1,5× se suaviza un poco si haces mucho zoom o la pantalla es muy densa.
- Cambiar de raza recarga la página (cada una trae su arte): pasa al empezar de cero o al importar una partida de otra raza.
- Los niveles 4 a 10 reutilizan el dibujo de la etapa 3 con un tinte; no tienen arte propio.
- El arte nuevo se probó en un navegador de escritorio con tamaño de móvil; falta probarlo en un móvil real.
- Los personajes miran en 4 diagonales (2 dibujadas y 2 volteadas): no giran con suavidad. Las máquinas de asedio solo se balancean al moverse y atacar.
- Los muros son bloques sueltos que no se unen entre sí con piezas de esquina.
- Al migrar una base antigua, un muro viejo se vuelve un bloque de 4 muros (más gruesos que los nuevos) y los edificios grandes se acomodan al sitio libre más cercano; un muro que cae bajo un edificio grande se pierde.
- El terreno (césped, estanques, flores, árboles) se dibuja en bloques de 2×2 cuadros y no gira con la cámara más que de posición; los árboles y rocas usan el mismo dibujo en las 4 vistas.
- Cada lote es de unidades iguales; la cola guarda varios lotes (de unidades distintas si quieres), pero los héroes y las investigaciones no se encolan. Las partidas antiguas con varios cuarteles (u otros militares) se unifican al abrirlas: se queda el de más nivel y se devuelve todo lo invertido en los demás (migración v9 → v10).
- Una batalla guardada solo se retoma si no pasó más de un día y aún tienes las tropas con las que saliste. Las defensas de tu base no se guardan (se ven como repetición).
- Las unidades se separan con un empujón suave, no tienen colisiones duras: en un montón muy apretado pueden rozarse.
- El equilibrio (fuerza de las oleadas, robo, costo de reparar y de las mejoras de nivel alto) se calibró con simulaciones (`tools/balance.mjs`), no jugando: las simulaciones no usan habilidades ni órdenes, así que un jugador atento rinde más. Un ejército de nivel alto sigue aplastando las primeras campañas (es lo normal: sirven para repetirlas y conseguir estrellas). Producción, tope de recursos y costos de los niveles 6 a 10 se revisaron: el tope de almacenamiento siempre alcanza para pagar la mejora más cara.
- Los premios y las oleadas usan la hora del dispositivo: se pueden manipular cambiando la hora.
- Las dos razas son iguales en estadísticas (solo cambian arte y nombres); las misiones y logros siguen hablando de «Aserradero», «Soldado»… con los nombres del Reino.

## Hoja de ruta
Se decidió que el juego debía sentirse menos básico: *quieto, con poco que hacer, sin objetivos y sin combate*. Por etapas:

1. **Vida y metas** — hecho: aldeanos, efectos y misiones.
2. **Más contenido** — hecho: casas, cinco edificios militares con sus unidades, herrería, altar y 5 héroes con árboles de poder, puertas, logros y niveles hasta el 10.
3. **Combate y campaña** — hecho: ataque **automático con control de grupos**, arqueros, magos, caballeros y asedio, habilidades de héroes, **ataques enemigos a tu base** que se ven en vivo, con daño y reparación. También hecho: campaña sin fin con guarnición creciente, ataques suaves al principio y aplazables, colas, premio diario y batalla guardada. Pendiente: elegir dónde desembarcan las tropas, más tipos de enemigo y jugar el equilibrio en un móvil real.
4. **Gráficos** — hecho: **vista isométrica con arte 3D propio**, personajes con animación de caminar y atacar, sombras, terreno con caminos, estanques y flores, humo y fuego, efectos de habilidades e interfaz nueva. Pendiente: más razas con estilo propio (hoy solo cambian arte y nombres), etapas de arte propias para los niveles altos y mejorar el terreno de la batalla.
5. En cualquier momento: probarlo en el celular, pasar Lighthouse y, si hace falta, alojarlo en otro sitio.
