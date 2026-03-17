// ── Diane Ópticas CRM — Service Worker v1.0 ──
const CACHE_NAME = 'diane-crm-v1';

// Archivos del app shell que se cachean al instalar
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: cachear app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate: limpiar caches viejos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network first, cache fallback ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Peticiones a Google Sheets / Apps Script — siempre red, nunca cachear
  if (
    url.hostname.includes('google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    return; // deja que el navegador lo maneje normalmente
  }

  // Para el resto (assets del app) — network first, fallback a cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la respuesta es válida, actualizamos el cache
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red — servir desde cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Si es navegación y no hay cache, servir index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
