// Servidor local mínimo para la herramienta que convierte modelos 3D en imágenes isométricas (solo para desarrollo).
//   node tools/iso/server.mjs <carpeta-de-modelos> <carpeta-de-salida>
// Sirve la herramienta (/), three.js (/three/…), los modelos (/models/…) y recibe las imágenes (POST /save?name=…).
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = resolve(process.argv[2] ?? 'models');
const outDir = resolve(process.argv[3] ?? 'out');
const threeDir = resolve(here, '../../node_modules/three');
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.css': 'text/css' };

function serve(res, root, rel) {
  const file = resolve(root, normalize(decodeURIComponent(rel)).replace(/^[\\/]+/, ''));
  if (!file.startsWith(root + sep) && file !== root) return void res.writeHead(403).end('no');
  if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end('no existe');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (req.method === 'POST' && p === '/save') {
    const name = (url.searchParams.get('name') ?? '').replace(/[^a-zA-Z0-9_.\-/]/g, '');
    if (!name.endsWith('.png') || name.includes('..')) return void res.writeHead(400).end('nombre inválido');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const b64 = text.replace(/^data:image\/png;base64,/, '');
      const target = resolve(outDir, name);
      if (!target.startsWith(outDir + sep)) return void res.writeHead(400).end('ruta');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(b64, 'base64'));
      res.writeHead(200).end('ok');
    });
    return;
  }
  if (p.startsWith('/three/')) return serve(res, threeDir, p.slice(7));
  if (p.startsWith('/models/')) return serve(res, modelsDir, p.slice(8));
  if (p === '/' || p === '') return serve(res, here, 'index.html');
  return serve(res, here, p);
}).listen(5199, '127.0.0.1', () => console.log('Herramienta iso en http://127.0.0.1:5199  modelos:', modelsDir, ' salida:', outDir));
