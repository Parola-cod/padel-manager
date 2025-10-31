// BUMPA il nome cache per forzare refresh
const CACHE = 'padel-lite-v7';

const STATIC_ASSETS = [
  './offline.html',
  './manifest.webmanifest',
  './styles.css',            // ⬅️ AGGIUNTO
  './pwa-192.png',
  './pwa-512.png',
  './pwa-maskable-192.png',
  './pwa-maskable-512.png',
  './apple-touch-icon.png',
  './logo-padel.png'
];


self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(k => k !== CACHE && caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// strategia:
// - per pagine HTML/navigation: rete prima, fallback offline.html
// - per asset statici (icone ecc.): cache prima
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigazione / documenti HTML → prova rete, se manca offline
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./offline.html'))
    );
    return;
  }

  // Asset statici → cache-first
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const copy = res.clone();
        // mettiamo in cache solo se è uno degli asset statici noti
        if (STATIC_ASSETS.some(p => req.url.includes(p.replace('./','')))) {
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
