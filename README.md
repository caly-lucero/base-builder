# Base Builder

Prototipo de juego de estrategia con construcción de base (un jugador), hecho como PWA con **Phaser 4 + Vite**. Inspirado en el género de Backyard Monsters / Clash of Clans; arte y nombres propios.

## Qué hay hoy (fase 1)
- Mapa de 12×12 casillas. Elige un edificio abajo y toca una casilla para construir.
- **Mina**: produce oro con el tiempo (hasta llenarse); tócala para recolectar.
- **Almacén**: sube el máximo de oro. **Torre**: aún sin función (defensa en la fase de combate).
- **Demoler**: devuelve el 50 % del costo.
- La producción **sigue mientras no juegas** (máximo 8 h).
- Guardado automático, exportar/importar partida y funcionamiento sin conexión.

## Uso
```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas de lógica y guardado
npm run build      # genera dist/ (con CSP y service worker)
npm run preview    # sirve dist/ en http://localhost:4173
```

## Estructura
- `src/data/config.js` — edificios, costos y economía. Para balancear, edita solo este archivo.
- `src/game/logic.js` — reglas del juego (puras, sin DOM).
- `src/game/save.js` — guardado: validación estricta, checksum, versión, respaldo.
- `src/game/store.js` — estado único, autoguardado y avisos.
- `src/scenes/BaseScene.js` — dibujo y entrada con Phaser.
- `sw.template.js` — plantilla del service worker; el build genera `dist/sw.js` con la lista de archivos.

## Seguridad (juego de un jugador)
- Todo lo que se carga (localStorage o archivo importado) pasa por `parseSave`: tamaño máximo, versión, checksum y validación de cada campo; se descartan campos desconocidos.
- Los mensajes se escriben con `textContent`, nunca como HTML.
- El build incluye una **Content-Security-Policy** (`meta`). Al publicar, conviene enviarla además como cabecera HTTP.
- Si la partida principal está dañada, se recupera la copia de respaldo.
- El checksum **no impide hacer trampa** (el código corre en el navegador); solo detecta archivos dañados o editados a mano. No importa mientras no haya ranking ni multijugador: ahí habría que validar en un servidor.

## Limitaciones conocidas
- Abrir el juego en dos pestañas a la vez: la última en guardar gana.
- Las pruebas de PWA se hicieron a mano (instalación, sin conexión); falta pasar **Lighthouse**.
- Si cambia el formato del guardado, subir `SAVE_VERSION` y añadir el paso en `migrate()` de `save.js`.

## Siguientes fases
1. Mejoras de edificios con temporizador.
2. Combate: unidades, torres que disparan, pathfinding (A*).
3. Campaña con bases enemigas generadas.
