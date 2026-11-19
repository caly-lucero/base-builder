// Convierte el boxes.json que deja la herramienta (buildings/boxes.json en su carpeta de salida) en src/data/artBoxes.js.
//   node tools/iso/boxes.mjs <carpeta-de-salida>/buildings/boxes.json            → src/data/artBoxes.js (el Reino)
//   node tools/iso/boxes.mjs <carpeta-de-salida>/sylvan/buildings/boxes.json sylvan → src/data/artBoxesSylvan.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
const race = process.argv[3] ?? '';
if (!input) {
  console.error('Uso: node tools/iso/boxes.mjs <ruta/a/boxes.json> [raza]');
  process.exit(1);
}
const file = race ? `artBoxes${race[0].toUpperCase()}${race.slice(1)}.js` : 'artBoxes.js';
const boxes = JSON.parse(readFileSync(input, 'utf8'));
const lines = [
  `// Tamaño y punto de apoyo (el centro del rectángulo que pisa en el suelo) de cada dibujo de edificio${race ? ` de la raza «${race}»` : ''}, en píxeles.`,
  '// Lo genera tools/iso (renderAll de buildings.js + boxes.mjs): no se edita a mano. Claves: `tipo_etapa` y `tipo_etapa_rN` (N = giro 1–3).',
  'export const ART_BOXES = {',
  ...Object.keys(boxes)
    .sort()
    .map((k) => `  ${k}: { w: ${boxes[k].w}, h: ${boxes[k].h}, x: ${boxes[k].x}, y: ${boxes[k].y} },`),
  '};',
  '',
];
writeFileSync(fileURLToPath(new URL(`../../src/data/${file}`, import.meta.url)), lines.join('\n'));
console.log(`${Object.keys(boxes).length} medidas escritas en src/data/${file}`);
