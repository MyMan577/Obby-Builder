// Obby Builder V6 — service worker
// Bump CACHE_VERSION whenever index.html (or other shell files) change,
// so returning players pick up the new version instead of a stale cache.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `obby-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `obby-runtime-${CACHE_VERSION}`;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Never cache calls to the AI API — those must always be live.
const NEVER_CACHE = ['api.anthropic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Always hit the network for the AI endpoint — never serve a cached reply.
  if (NEVER_CACHE.some((host) => url.hostname.includes(host))) {
    event.respondWith(fetch(req));
    return;
  }

  const isShellRequest = url.origin === self.location.origin;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          // Only cache successful, cacheable responses.
          if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
            const clone = networkResponse.clone();
            caches.open(isShellRequest ? SHELL_CACHE : RUNTIME_CACHE)
              .then((cache) => cache.put(req, clone))
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => cached); // offline and nothing new: fall back to cache

      // Cache-first for instant loads/offline play; refresh cache in the background.
      return cached || fetchPromise;
    })
  );
});
