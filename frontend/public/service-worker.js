/* Rivan Reality — PWA service worker
   Strategy:
   - Precache the app shell (pages, runtime, logos, icons) on install.
   - Navigations: network-first, fall back to the cached page, then to index.
   - Same-origin assets: cache-first (fast, offline-ready).
   - Cross-origin (React/Babel CDN, Google Fonts): stale-while-revalidate so
     the app boots offline once it has been opened online at least once.
*/
const CACHE = 'rivan-pwa-v6';

const CORE = [
  './',
  './index.html',
  './support.js',
  './manifest.json',
  './RivanRealtyLogo.png',
  './Property Image 1.jpeg',
  './Property Image 2.jpeg',
  './Map.jpeg',
  './East Face.jpeg',
  './West Face.jpeg',
  './Features.jpeg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Add each individually so one missing/renamed file can't abort the install.
      Promise.all(CORE.map((url) => cache.add(url).catch((err) => {
        console.warn('[sw] skip precache', url, err);
      })))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol === 'chrome-extension:') return;

  // Page navigations: network-first with offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (req.url.startsWith('http')) {
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((r) => r || caches.match('./index.html') || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Same-origin static assets: cache-first, then network (and cache it).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) =>
        cached || fetch(req).then((res) => {
          const copy = res.clone();
          if (req.url.startsWith('http')) {
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached || new Response('', { status: 504 }))
      )
    );
    return;
  }

  // Cross-origin (CDN scripts, Google Fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          if (req.url.startsWith('http')) {
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        }
        return res;
      }).catch(() => cached || new Response('', { status: 504 }));
      return cached || network;
    })
  );
});

