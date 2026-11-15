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
- **Arte y sonido (Kenney, CC0)**: terreno, edificios con un dibujo distinto por nivel, adornos (árboles, rocas, arbustos), 10 efectos de sonido y botón **Sonido: sí/no**.
- Guardado automático, exportar/importar partida y funcionamiento sin conexión.

## Controles
| Acción | Ratón / teclado | Pantalla táctil |
|---|---|---|
| Construir | elegir edificio abajo y tocar una casilla | igual |
| Muros | elegir **Muro** y arrastrar | igual |
| Seleccionar / recolectar | tocar un edificio (abre su panel) | igual |
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
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`. Ejemplos: v1→v2 (niveles) y v2→v3 (mapa 12×12 → 24×24, madera y Ayuntamiento).
- Los sonidos son `.ogg`: algunos navegadores antiguos de Apple no los reproducen (el juego funciona igual, sin sonido).
- El lienzo es de 576 px de ancho y se escala a la pantalla; en pantallas grandes los dibujos se ven algo suavizados.
- Los muros son piezas sueltas (no se unen entre sí al dibujarse).

## Siguientes pasos
1. **Combate**, con dos formas posibles (a decidir): ataque automático contra bases generadas, al estilo Backyard Monsters, o control directo de unidades y un **héroe**, al estilo Warcraft III.
2. Unidades entrenables y suministro (granjas, como en Warcraft III).
3. Campaña con bases enemigas generadas.
