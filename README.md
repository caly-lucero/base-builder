# Base Builder

Prototipo de juego de estrategia con construcción de base (un jugador), hecho como PWA con **Phaser 4 + Vite**. Referencias de diseño: **Backyard Monsters** y Clash of Clans (la base y el ataque) y **Warcraft III** (dos recursos, el Ayuntamiento que sube de nivel y manda sobre lo que se puede construir). Nombres propios y arte de terceros con licencia libre (ver *Créditos*).

## Qué hay hoy
- **Mapa de 24×24** que se ve por una ventana: se desplaza y se hace zoom (ver *Controles*).
- **Dos recursos, como en Warcraft III: oro y madera.** La **Mina de oro** produce oro y el **Aserradero** madera; tócalos para recolectar. Casi todo cuesta oro y madera.
- **Ayuntamiento** (ya viene en la partida, no se construye ni se demuele; se puede mover). Sube de nivel y cambia de nombre: Ayuntamiento → Fortaleza → Castillo. **Su nivel manda**:
  - cuántos edificios de cada tipo puedes tener (p. ej. 3 minas con el nivel 1, 5 con el 2, 8 con el 3);
  - hasta qué nivel puedes mejorar el resto (un edificio nunca pasa del nivel del Ayuntamiento).
- **Almacén**: sube el tope de oro **y** de madera. **Torre**: aún sin función (defensa en la fase de combate).
- **Muros**: cuestan solo madera y se pintan arrastrando. Hoy solo ocupan casilla; en el combate frenarán al enemigo.
- **Mejoras con temporizador**: cada mejora cuesta recursos y **tarda tiempo real**; mientras se mejora, el edificio no produce. Hay 2 «obreros» (2 mejoras a la vez, el Ayuntamiento también usa uno).
- **Mover edificios** arrastrándolos (gratis).
- **Demoler**: devuelve el 50 % de lo invertido (construcción + mejoras).
- La producción y las mejoras **siguen mientras no juegas** (máximo 8 h de producción); al volver, el juego avisa qué terminó.
- **Población, como en Warcraft III.** El Ayuntamiento da algo de población y cada **Granja** suma más; las unidades la ocupan desde que empiezan a entrenarse. El HUD muestra «Población 3/11»: sin espacio libre no se entrena, y no se demuele una granja que sostiene al ejército.
- **Cuartel** (3 niveles): entrena **Soldados** (nivel 1), **Hechiceros** (nivel 2) y **Caballeros** (nivel 3). Cada unidad cuesta oro y madera, ocupa población y **tarda tiempo real** en entrenarse, también sin conexión. Se entrena de a una por cuartel: al elegirlo aparecen sobre el mapa las tarjetas de cada unidad.
- **Altar del héroe** (pide el Ayuntamiento en nivel 2 y solo permite uno): invoca a tu **Héroe**, que ocupa 3 de población y aparece junto al altar con su nivel. Hoy no hace nada más; sus niveles y habilidades llegan con el combate.
- **El ejército se ve**: las unidades entrenadas se forman junto al primer cuartel (como máximo se dibujan 24).
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
| Mover un edificio | arrastrarlo a otra casilla (verde = se puede, rojo = no) | igual |
| Desplazar el mapa | arrastrar el suelo, flechas o WASD | arrastrar el suelo |
| Zoom | rueda, botones **+ / −** | pellizcar, botones **+ / −** |
| Volver al centro | botón **⌂** | igual |

Notas: con la herramienta **Muro** elegida, arrastrar pinta muros (para desplazar el mapa, deselecciona la herramienta o usa las teclas). El panel de un edificio ocupa el lugar de la barra de herramientas: ciérralo con ✕ o tocando el suelo para volver a elegir un edificio.

## Uso
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
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`. Ejemplos: v1→v2 (niveles), v2→v3 (mapa 12×12 → 24×24, madera y Ayuntamiento), v3→v4 (misiones) y v4→v5 (ejército, héroe y entrenamiento). Una base avanzada que se migra tendrá varias misiones ya cumplidas y podrá reclamarlas.
- Los sonidos son `.ogg`: algunos navegadores antiguos de Apple no los reproducen (el juego funciona igual, sin sonido).
- El lienzo es de 576 px de ancho y se escala a la pantalla; en pantallas grandes los dibujos se ven algo suavizados.
- Los muros son piezas sueltas (no se unen entre sí al dibujarse).
- Las unidades del ejército y el héroe están quietos (se balancean un poco); solo los aldeanos caminan. No tienen estadísticas de combate todavía.
- Los cuarteles entrenan de a una unidad por vez; no hay cola de entrenamiento.

## Hoja de ruta
Se decidió que el juego debía sentirse menos básico: *quieto, con poco que hacer, sin objetivos y sin combate*. Por etapas:

1. **Vida y metas** — hecho: aldeanos, efectos y misiones.
2. **Más contenido** — hecho: granjas y población, cuartel con unidades, altar y héroe, puertas, más decoración y misiones. Pendiente de esta etapa: **logros** (metas sueltas, fuera de la cadena de misiones).
3. **Combate y campaña**, con dos formas posibles (a decidir): ataque automático contra bases generadas, al estilo Backyard Monsters, o control directo de unidades y un **héroe**, al estilo Warcraft III.
4. En cualquier momento: publicarlo gratis (GitHub Pages) para instalarlo y probarlo en el celular, y pasar Lighthouse.
