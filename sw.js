// sw.js — Padel Manager BRT (GitHub Pages)
// Percorsi assoluti e nome cache bumpato per forzare aggiornamento

const CACHE = 'padel-lite-v11';

const STATIC_ASSETS = [
  '/padel-manager/offline.html',
  '/padel-manager/manifest.webmanifest',
  '/padel-manager/styles.css',
  '/padel-manager/app.js',                 // utile se vuoi cache anche del JS
  '/padel-manager/pwa-192.png',
  '/padel-manager/pwa-512.png',
  '/padel-manager/pwa-maskable-192.png',
  '/padel-manager/pwa-maskable-512.png',
  '/padel-manager/apple-touch-icon.png',
  '/padel-manager/logo-padel.png',
  '/padel-manager/favicon.ico'             // se lo aggiungi al repo
];

// Normalizza URL (ignora query string tipo ?v=10)
function normalize(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE && caches.delete(k)));
    await self.clients.claim();
  })());
});

// Strategia:
// - navigazione/HTML: rete-prima, fallback offline
// - asset: cache-prima; se rete ok, metti in cache la versione normalizzata
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const urlNoQS = normalize(req.url);

  // Documenti / navigazione
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/padel-manager/offline.html'))
    );
    return;
  }

  // Asset statici
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1) prova cache (sia url con query che normalizzato)
    const cached = (await cache.match(urlNoQS)) || (await cache.match(req));
    if (cached) return cached;

    // 2) se non in cache, prova rete
    try {
      const res = await fetch(req);
      const copy = res.clone();

      // se è uno dei nostri asset statici (senza query), salvalo normalizzato
      if (STATIC_ASSETS.includes(urlNoQS)) {
        await cache.put(urlNoQS, copy);
      }

      return res;
    } catch (e) {
      // 3) fallback cache (se per caso esiste)
      const fallback = await cache.match(urlNoQS);
      if (fallback) return fallback;
      throw e;
    }
  })());
});
