// Plantilla del service worker. En el build, vite.config.js sustituye los dos
// marcadores de abajo (versión de caché y lista de archivos) y emite dist/sw.js.
const CACHE = 'base-builder-__CACHE_VERSION__';
const PRECACHE = __PRECACHE__;

// Los scripts de módulo y las hojas con `crossorigin` envían la cabecera Origin
// aunque sean del mismo sitio; si el servidor responde `Vary: Origin`, la caché
// no los reconocería como la misma petición del precaché. Se ignora Vary a propósito.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // nunca cacheamos terceros

  // Páginas: red primero (para recibir actualizaciones) y caché si no hay red.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req, MATCH).then((hit) => hit || caches.match('./index.html', MATCH)),
      ),
    );
    return;
  }

  // Resto de archivos: caché primero (los nombres llevan hash del contenido).
  event.respondWith(
    caches.match(req, MATCH).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
