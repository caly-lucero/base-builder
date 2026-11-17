# Herramienta de render isométrico (solo desarrollo)

Convierte modelos 3D CC0 de Kenney (Castle Kit, Fantasy Town Kit, Mini Characters) en las imágenes isométricas 2:1 que usa el juego
(`public/assets/iso/`). No forma parte del juego publicado.

## Uso
1. Descarga los tres packs de https://kenney.nl/assets (formato GLB) y extráelos en una carpeta con las subcarpetas `castle/`, `town/` y `chars/`.
2. `npm install` (trae `three`) y `node tools/iso/server.mjs <carpeta-de-modelos> <carpeta-de-salida>`.
3. Abre http://127.0.0.1:5199/ en un navegador y ejecuta en la consola, según lo que quieras regenerar:
   ```js
   // edificios: 15 tipos × 3 etapas → buildings/<tipo>_<etapa>.png (192×256, el centro del rombo en (96,196))
   await import('/buildings.js');
   for (const t of buildings.TYPES) for (const s of [1, 2, 3]) {
     iso.save(iso.render(await buildings.build(t, s), { W: 192, H: 256, ox: 96, oy: 196, ground: true }), `buildings/${t}_${s}.png`);
   }
   // decoración → decor/*.png
   await (await import('/decor.js')).renderAll(true);
   // personajes: una hoja 8×4 de 96×120 por personaje → units/*.png
   const S = await import('/sheets.js'); await S.renderAll(S.ALL_KEYS, true);
   ```
4. Copia las carpetas `buildings/`, `decor/` y `units/` de la salida a `public/assets/iso/`.

Si cambias un módulo y la consola sigue usando el viejo, recarga la página de la herramienta (el navegador guarda los módulos importados).

## Archivos
- `iso.js` — cámara isométrica, luces, sombras, recolor de paletas, render a canvas y guardado.
- `buildings.js` — cómo se arma cada edificio y su paleta del *Reino* (`reino()`); `HEIGHT` limita la altura de cada uno.
- `chars.js` y `designs.js` — el diseño de cada personaje (armas, escudos, sombreros, capas) sobre los modelos de Mini Characters.
- `sheets.js` — saca los cuadros de animación (caminar, atacar, quieto, caído) y arma las hojas. También modela la araña.
- `decor.js` — árboles, rocas, arbustos, tocones y flores.
- `muestra.png` — una galería de ejemplo.
