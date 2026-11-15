# Base Builder

Prototipo de juego de estrategia con construcción de base (un jugador), hecho como PWA con **Phaser 4 + Vite**. Referencias de diseño: **Backyard Monsters** y Clash of Clans (la base y el ataque) y **Warcraft III** (dos recursos, el Ayuntamiento que sube de nivel y manda sobre lo que se puede construir). Nombres propios y arte de terceros con licencia libre (ver *Créditos*).

## Qué hay hoy
- **Mapa de 24×24** que se ve por una ventana: se desplaza y se hace zoom (ver *Controles*).
- **Dos recursos, como en Warcraft III: oro y madera.** La **Mina de oro** produce oro y el **Aserradero** madera; tócalos para recolectar. Casi todo cuesta oro y madera.
- **Ayuntamiento** (ya viene en la partida, no se construye ni se demuele; se puede mover). Sube hasta el **nivel 5** y cambia de nombre: Ayuntamiento → Fortaleza → Castillo → Ciudadela → Capital. **Su nivel manda**:
  - cuántos edificios de cada tipo puedes tener (p. ej. 3 minas con el nivel 1, 5 con el 2, 8 con el 3);
  - hasta qué nivel puedes mejorar el resto (un edificio nunca pasa del nivel del Ayuntamiento).
- **Almacén**: sube el tope de oro **y** de madera. **Torre**: aún sin función (defensa en la fase de combate).
- **5 niveles**: todos los edificios (menos el altar) suben hasta el nivel 5. Los niveles 4 y 5 son «élite»: más producción, capacidad, población o velocidad de entrenamiento (los cuarteles de nivel 4 y 5 entrenan un 20 % y un 40 % más rápido), y se ven **dorados**. El nivel máximo de un edificio sigue limitado por el del Ayuntamiento.
- **Muros**: cuestan solo madera y se pintan arrastrando. **Los muros y puertas que quedan uno junto a otro se dibujan unidos, como una sola pared** (también en el mapa enemigo). Hoy solo ocupan casilla; en el combate frenarán al enemigo.
- **Mejoras con temporizador**: cada mejora cuesta recursos y **tarda tiempo real**; mientras se mejora, el edificio no produce. Hay 2 «obreros» (2 mejoras a la vez, el Ayuntamiento también usa uno).
- **Mover edificios** arrastrándolos (gratis).
- **Demoler**: devuelve el 50 % de lo invertido (construcción + mejoras).
- La producción y las mejoras **siguen mientras no juegas** (máximo 8 h de producción); al volver, el juego avisa qué terminó.
- **Población, como en Warcraft III.** El Ayuntamiento da algo de población y cada **Granja** suma más; las unidades la ocupan desde que empiezan a entrenarse. El HUD muestra «Población 3/11»: sin espacio libre no se entrena, y no se demuele una granja que sostiene al ejército.
- **Cuartel** (3 niveles): entrena **Soldados** (nivel 1), **Hechiceros** (nivel 2) y **Caballeros** (nivel 3). Cada unidad cuesta oro y madera, ocupa población y **tarda tiempo real** en entrenarse, también sin conexión. Se entrena de a una por cuartel: al elegirlo aparecen sobre el mapa las tarjetas de cada unidad.
- **Altar del héroe** (pide el Ayuntamiento en nivel 2 y solo permite uno): invoca a tu **Héroe**, que ocupa 3 de población y aparece junto al altar con su nivel. Hoy no hace nada más; sus niveles y habilidades llegan con el combate.
- **El ejército se ve**: las unidades entrenadas se forman junto al primer cuartel (como máximo se dibujan 24).
- **Combate y campaña (botón ⚔)**: ataca bases enemigas generadas (Campaña 1, 2, 3…, cada una más dura: más torres, defensores, vida y un anillo de muros que al principio tiene huecos y desde el nivel 7 es cerrado).
  - **Automático con control de grupos**: tus unidades pelean solas (primero los enemigos cercanos, luego el edificio más cercano; los muros se rodean o se rompen). Tú puedes **elegir un grupo** (Todos, Soldados, Hechiceros, Caballeros, Héroe, tocando una unidad o con el recuadro ▭) y **darle un objetivo**: tocar un enemigo o edificio para atacarlo, o el suelo para moverlo. Al cumplir la orden vuelven al modo automático; **Auto** las devuelve de inmediato.
  - Se gana destruyendo el Ayuntamiento enemigo; se pierde si caen todas tus tropas, se acaba el tiempo (3 min) o tocas **Retirada** (dos toques). Hay botón de velocidad ×2.
  - **Resultado**: las tropas caídas se pierden (el héroe no), el botín entra sin pasar el tope y el **héroe gana experiencia siempre que pelea**: 6 XP por cada edificio destruido y 4 por cada defensor derrotado, más un bono por ganar. Al juntar la necesaria (100 × su nivel) **sube de nivel** (más vida y daño, hasta el 10). Su progreso se ve en el panel del altar y en la pantalla de resultado. Ganar el nivel que toca avanza la campaña.
- **Puertas**: como un muro con paso (en el combate dejarán pasar a tus unidades).
- **Barra por páginas**: *Economía* (mina, aserradero, granja, almacén, muro) y *Militar* (cuartel, altar, torre, puerta). El botón de la derecha cambia de página.
- **Misiones**: una cadena de 17 objetivos que guía la partida («Construye un Aserradero», «Ten 2 Minas de oro», «Sube el Ayuntamiento a Fortaleza»…). El cartel de arriba a la izquierda muestra la actual y su avance; al cumplirla se pone verde y la tocas para **reclamar el premio**. Se hacen en orden; los premios no pasan del tope de recursos.
- **Vida**: un **aldeano** por cada mina y aserradero camina entre el Ayuntamiento y su edificio llevando la carga (es adorno: no cambia la economía). Al recolectar suben números flotantes (+120); al construir, el edificio «salta» con una nube de polvo.
- **Arte y sonido (Kenney, CC0)**: terreno, edificios con un dibujo distinto por nivel, adornos (árboles, rocas, arbustos), aldeanos, 10 efectos de sonido y botón **Sonido: sí/no**.
- Guardado automático, exportar/importar partida y funcionamiento sin conexión.

## Controles
| Acción | Ratón / teclado | Pantalla táctil |
|---|---|---|
| Construir | elegir edificio abajo y tocar una casilla | igual |
| Muros | elegir **Muro** y arrastrar | igual |
| Seleccionar / recolectar | tocar un edificio (abre su panel) | igual |
| Entrenar | elegir un cuartel o el altar y tocar la tarjeta de la unidad | igual |
| Cambiar de página de la barra | botón de la derecha (Economía ▶ / Militar ▶) | igual |
| Atacar | botón ⚔ y «Atacar» | igual |
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
npm run walls      # regenera los sprites de los muros (public/assets/art/wall_*.png)
npm run icons      # regenera los iconos de la PWA
```
En Windows PowerShell, si `npm` da error de «ejecución de scripts deshabilitada», usa `npm.cmd` (o permite scripts firmados con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## Estructura
- `src/data/config.js` — edificios, niveles, costos, límites por nivel del Ayuntamiento, sprites y economía. Para balancear, edita solo este archivo.
- `src/data/assets.js` — lista de imágenes y sonidos que se cargan (los archivos están en `public/assets/`).
- `src/game/logic.js` — reglas del juego (puras, sin DOM).
- `src/game/save.js` — guardado: validación estricta, checksum, versión, migraciones, respaldo.
- `src/game/store.js` — estado único, autoguardado y avisos.
- `src/game/projection.js` — **único** lugar que convierte casillas ↔ pantalla y que lleva la cámara (desplazamiento y zoom). Hoy cenital 2D; ver *Pasar a isométrico*.
- `src/game/sprites.js` — mide el área real de cada dibujo para apoyarlo bien sobre su casilla.
- `src/game/battle.js` — simulación de la batalla (pura y determinista): objetivos automáticos, órdenes, torres, botín y fin.
- `src/game/pathfinding.js` — A* sobre la cuadrícula (los muros cuestan más: se rodean, pero se pueden atravesar rompiéndolos).
- `src/game/missions.js` — genera la base enemiga de cada nivel de campaña.
- `src/game/campaign.js` — aplica el resultado de una batalla (bajas, botín, campaña, experiencia del héroe).
- `src/scenes/BattleScene.js` — escena de la batalla: dibujo, selección, órdenes y pantalla de resultado.
- `src/game/quests.js` — misiones: progreso (calculado, no guardado) y reclamo de premios. Los datos están en `QUESTS` de `config.js`.
- `src/game/workers.js` — rutas y tiempos de los aldeanos (lógica pura; el dibujo está en la escena).
- `src/game/decor.js` — adornos del mapa generados con semilla fija (no se guardan).
- `src/game/prefs.js` — preferencias del dispositivo (sonido), aparte de la partida.
- `src/scenes/BaseScene.js` — dibujo, gestos (tocar, arrastrar, pellizcar), sonido y HUD con Phaser.
- `scripts/` — generadores de iconos y de los sprites de muros (sin dependencias).
- `sw.template.js` — plantilla del service worker; el build genera `dist/sw.js` con la lista de archivos.

## Pasar a isométrico más adelante
La lógica, el guardado y la economía hablan solo en casillas `(x, y)`. Todo lo que depende de cómo se dibuja está en `projection.js` (casilla → pantalla, pantalla → casilla, cámara, orden de dibujado) y en el arte. Para pasar a isométrico hay que reescribir esas funciones, cambiar el arte (el pack Medieval RTS es cenital) y revisar el orden de dibujado y los gestos; no hay que tocar `logic.js` ni `save.js`.

## Créditos
Arte y sonido de [Kenney](https://kenney.nl) (packs Medieval RTS, Interface Sounds y RPG Audio), licencia **CC0**. Los sprites de los muros están dibujados para este proyecto con `scripts/make-walls.mjs`. Detalle y correspondencia de archivos en `public/assets/CREDITS.md`; licencias originales en `public/assets/licenses/`.

## Seguridad (juego de un jugador)
- Todo lo que se carga (localStorage o archivo importado) pasa por `parseSave`: tamaño máximo, versión, checksum y validación de cada campo; se descartan campos desconocidos.
- Los mensajes se escriben con `textContent`, nunca como HTML.
- El build incluye una **Content-Security-Policy** (`meta`). Al publicar, conviene enviarla además como cabecera HTTP.
- Si la partida principal está dañada, se recupera la copia de respaldo.
- El checksum **no impide hacer trampa** (el código corre en el navegador); solo detecta archivos dañados o editados a mano. No importa mientras no haya ranking ni multijugador: ahí habría que validar en un servidor.

## Limitaciones conocidas
- Abrir el juego en dos pestañas a la vez: la última en guardar gana.
- Las pruebas de PWA se hicieron a mano (instalación, sin conexión); falta pasar **Lighthouse**.
- El pellizco con dos dedos está implementado pero **no se ha probado en un móvil real** (solo con ratón y teclado).
- Las mejoras usan la hora del sistema: adelantar el reloj las termina antes. El juego limita el daño (una mejora nunca puede quedar más lejos que su duración total), pero no puede impedirlo del todo; es aceptable sin ranking.
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`. Ejemplos: v1→v2 (niveles), v2→v3 (mapa 12×12 → 24×24, madera y Ayuntamiento), v3→v4 (misiones), v4→v5 (ejército, héroe y entrenamiento) y v5→v6 (campaña y experiencia del héroe). Una base avanzada que se migra tendrá varias misiones ya cumplidas y podrá reclamarlas.
- Los sonidos son `.ogg`: algunos navegadores antiguos de Apple no los reproducen (el juego funciona igual, sin sonido).
- El lienzo es de 576 px de ancho y se escala a la pantalla; en pantallas grandes los dibujos se ven algo suavizados.
- Los enlaces entre muros usan solo dos piezas por nivel (horizontal y vertical): en esquinas y cruces se ven bien, pero no hay un dibujo especial para cada forma.
- Los niveles 4 y 5 reutilizan el dibujo del nivel 3 con un tinte dorado; no tienen arte propio.
- Las unidades del ejército y el héroe están quietos (se balancean un poco); solo los aldeanos caminan. No tienen estadísticas de combate todavía.
- Los cuarteles entrenan de a una unidad por vez; no hay cola de entrenamiento.
- Una batalla en curso no se guarda: si cierras la página, no cuenta (tus tropas siguen intactas).
- Las unidades no chocan entre sí (se superponen) y las torres de tu base todavía no defienden: el combate es solo ataque.
- El equilibrio es una primera aproximación: con 8 soldados, 3 hechiceros y el héroe las primeras campañas se ganan sin bajas. Hay una prueba que exige que la 1 se gane con un ejército razonable y la 12 no, pero falta jugarla mucho.
- Probado con ratón; el recuadro de selección y el pellizco en la batalla no se han probado en un móvil real.

## Hoja de ruta
Se decidió que el juego debía sentirse menos básico: *quieto, con poco que hacer, sin objetivos y sin combate*. Por etapas:

1. **Vida y metas** — hecho: aldeanos, efectos y misiones.
2. **Más contenido** — hecho: granjas y población, cuartel con unidades, altar y héroe, puertas, más decoración y misiones. Pendiente de esta etapa: **logros** (metas sueltas, fuera de la cadena de misiones).
3. **Combate y campaña** — decidido: ataque **automático con control de grupos** (ver arriba). Primera versión hecha. Pendiente: que el enemigo ataque TU base (defensa con torres y muros), elegir dónde desembarcan las tropas, habilidades del héroe, más tipos de enemigo y afinar el equilibrio.
4. En cualquier momento: publicarlo gratis (GitHub Pages) para instalarlo y probarlo en el celular, y pasar Lighthouse.
