const CACHE = 'padel-lite-v9';

const STATIC_FILES = [
  '/padel-manager/offline.html',
  '/padel-manager/manifest.webmanifest',
  '/padel-manager/styles.css',
  '/padel-manager/pwa-192.png',
  '/padel-manager/pwa-512.png',
  '/padel-manager/pwa-maskable-192.png',
  '/padel-manager/pwa-maskable-512.png',
  '/padel-manager/apple-touch-icon.png',
  '/padel-manager/logo-padel.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE && caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // HTML / navigazione: rete-prima, fallback offline
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(fetch(req).catch(() => caches.match('/padel-manager/offline.html')));
    return;
  }

  // Asset: cache-prima, poi rete
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const url = new URL(req.url);
    const urlNoQS = url.origin + url.pathname; // ignora ?v=...

    const match =
      (await cache.match(urlNoQS)) ||
      (await cache.match(req));

    if (match) return match;

    const res = await fetch(req);
    // se è uno degli statici (senza query), mettilo in cache con path “pulito”
    if (STATIC_FILES.includes(urlNoQS)) {
      cache.put(urlNoQS, res.clone());
    }
    return res;
  })());
});


self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_FILES))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE && caches.delete(k)));
    await self.clients.claim();
  })());
});

// HTML: rete-prima con fallback offline
// Asset: cache-prima; se manca, fetch e salva normalizzando l'URL
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const urlNoQS = normalize(req.url);

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/padel-manager/offline.html'))
    );
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(urlNoQS) || await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const copy = res.clone();
      // se è uno degli statici (ignorando query), salviamo la versione normalizzata
      if (STATIC_FILES.includes(urlNoQS)) {
        await cache.put(urlNoQS, copy);
      }
      return res;
    } catch (e) {
      // se fallisce rete, prova comunque cache “grezza”
      const fallback = await cache.match(req);
      if (fallback) return fallback;
      throw e;
    }
  })());
});



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
