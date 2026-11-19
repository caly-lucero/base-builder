import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Política de seguridad de contenido. Se inyecta solo en el build para no
// romper el hot reload del servidor de desarrollo. Si publicas el juego en un
// hosting que permita cabeceras HTTP, es mejor enviarla como cabecera.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

// Genera dist/sw.js a partir de sw.template.js con la lista exacta de archivos
// del build (precaché) y una versión de caché derivada de su contenido.
// Así el juego funciona sin conexión desde la primera visita y cada build
// nuevo invalida la caché anterior.
function serviceWorkerPlugin() {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'emit-service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js')
        .sort();
      // Los dibujos de edificios de las vistas giradas (_r1 a _r3) pesan mucho y casi nadie los usa al instalar:
      // se descargan al girar la cámara y entonces quedan en la caché (ver el manejador de fetch de abajo).
      // El arte de las razas que no son la tuya (assets/iso/<raza>/) tampoco se precarga: se baja al elegirla.
      const precached = files.filter((f) => !/_r[1-3]\.png$/.test(f) && !f.startsWith('assets/iso/sylvan/'));

      const template = readFileSync(join(root, 'sw.template.js'), 'utf8');

      const hash = createHash('sha256').update(template);
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);

      const urls = ['./', ...precached.map((f) => './' + f)];
      const source = template
        .replace('__CACHE_VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(urls, null, 2));
      if (source.includes('__CACHE_VERSION__') || source.includes('__PRECACHE__')) {
        throw new Error('sw.template.js: quedaron marcadores sin sustituir');
      }
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [cspPlugin(), serviceWorkerPlugin()],
  build: {
    chunkSizeWarningLimit: 2000, // Phaser pesa bastante; es esperado
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
