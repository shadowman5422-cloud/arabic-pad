const CACHE_NAME = 'notepad-cache-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Install: cache each asset individually so one bad path doesn't
// break caching for everything else (cache.addAll is atomic and
// was silently failing the whole install if any single file 404'd).
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res.ok) return cache.put(url, res);
              console.warn('[sw] skipped (bad response):', url, res.status);
            })
            .catch((err) => console.warn('[sw] skipped (fetch failed):', url, err))
        )
      )
    )
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for everything else (e.g. CDN fonts/tesseract)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Page navigations: try cache first so a full offline reload still opens the app
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        return (
          cached ||
          fetch(req).catch(() => caches.match('./index.html'))
        );
      })
    );
    return;
  }

  // App shell files: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        return (
          cached ||
          fetch(req)
            .then((res) => {
              const resClone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
              return res;
            })
            .catch(() => cached)
        );
      })
    );
    return;
  }

  // External resources (fonts, tesseract CDN): network-first, fallback to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
