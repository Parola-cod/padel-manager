// sw.js — Padel Manager (GitHub Pages)
// Scope: /padel-manager/  —  usa sempre path assoluti qui sotto

const CACHE = 'padel-lite-v12';

const ASSETS = [
  '/padel-manager/',
  '/padel-manager/index.html',
  '/padel-manager/offline.html',
  '/padel-manager/manifest.webmanifest',
  '/padel-manager/styles.css',
  '/padel-manager/app.js',
  '/padel-manager/pwa-192.png',
  '/padel-manager/pwa-512.png',
  '/padel-manager/pwa-maskable-192.png',
  '/padel-manager/pwa-maskable-512.png',
  '/padel-manager/apple-touch-icon.png',
  '/padel-manager/logo-padel.png',
  '/padel-manager/favicon.ico'
];

// Normalizza: ignora query string (?v=10)
function normalize(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch { return url; }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE && caches.delete(k)));
    await self.clients.claim();
  })());
});

// HTML: network-first con fallback offline
// Asset: cache-first; salva in cache usando l'URL normalizzato (senza query)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const urlNoQS = normalize(req.url);

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(fetch(req).catch(() => caches.match('/padel-manager/offline.html')));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    const cached = await cache.match(urlNoQS) || await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (ASSETS.includes(urlNoQS)) {
        await cache.put(urlNoQS, res.clone());
      }
      return res;
    } catch (e) {
      const fallback = await cache.match(urlNoQS) || await cache.match(req);
      if (fallback) return fallback;
      throw e;
    }
  })());
});
