// Service Worker für GrabGeistApp (PWA).
// Cached die App-Shell, damit die App nach der ersten Installation offline läuft.
// Version (SemVer) kommt aus js/version.js -> bei jedem Release dort erhöhen.

importScripts('./js/version.js');

const CACHE = 'grabgeist-app-' + APP_VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/ble.js',
  './js/app.js',
  './js/version.js',
  './js/update.js',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
  );
});

// Neuladen-Anforderung der App: der wartende Worker darf sofort aktiv werden.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Stale-while-revalidate: sofort aus dem Cache liefern, im Hintergrund aktualisieren.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
