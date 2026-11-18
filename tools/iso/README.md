# Herramienta de render isométrico (solo desarrollo)

Convierte modelos 3D CC0 de Kenney (Castle Kit, Fantasy Town Kit, Mini Characters) en las imágenes isométricas 2:1 que usa el juego
(`public/assets/iso/`). No forma parte del juego publicado.

## Uso
1. Descarga los tres packs de https://kenney.nl/assets (formato GLB) y extráelos en una carpeta con las subcarpetas `castle/`, `town/` y `chars/`.
2. `npm install` (trae `three`) y `node tools/iso/server.mjs <carpeta-de-modelos> <carpeta-de-salida>`.
3. Abre http://127.0.0.1:5199/ en un navegador y ejecuta en la consola, según lo que quieras regenerar:
   ```js
   // edificios: 15 tipos × 3 etapas × 4 giros de cámara → buildings/<tipo>_<etapa>[_rN].png, cada uno recortado a lo
   // que ocupa, más buildings/boxes.json (tamaño y apoyo de cada imagen). Cada edificio va sobre el suelo de los
   // cuadros que ocupa (ver PLAN en buildings.js; los mismos tamaños que `size` en src/data/config.js).
   await import('/buildings.js');
   await buildings.renderAll(buildings.TYPES, true);
   // decoración → decor/*.png
   await (await import('/decor.js')).renderAll(true);
   // personajes: una hoja 8×4 de 96×120 por personaje → units/*.png
   const S = await import('/sheets.js'); await S.renderAll(S.ALL_KEYS, true);
   ```
4. Copia las carpetas `buildings/`, `decor/` y `units/` de la salida a `public/assets/iso/` y ejecuta
   `node tools/iso/boxes.mjs <salida>/buildings/boxes.json` para regenerar `src/data/artBoxes.js`.

Si cambias un módulo y la consola sigue usando el viejo, recarga la página de la herramienta (el navegador guarda los módulos importados).

## Archivos
- `iso.js` — cámara isométrica, luces, sombras, recolor de paletas, render a canvas y guardado.
- `buildings.js` — cómo se arma cada edificio y su paleta del *Reino* (`reino()`); `HEIGHT` limita la altura de cada uno; `PLAN` fija el tamaño en cuadros, el suelo y cuánto se agranda su modelo; `renderAll` dibuja los 4 giros.
- `boxes.mjs` — convierte `boxes.json` en `src/data/artBoxes.js`.
- `chars.js` y `designs.js` — el diseño de cada personaje (armas, escudos, sombreros, capas) sobre los modelos de Mini Characters.
- `sheets.js` — saca los cuadros de animación (caminar, atacar, quieto, caído) y arma las hojas. También modela la araña.
- `decor.js` — árboles, rocas, arbustos, tocones y flores.
- `muestra.png` — una galería de ejemplo.
