// Chameleon Catch - Service Worker
// Cache-first strategy: everything works offline after first load.

const CACHE_NAME = 'chameleon-catch-v3';

// All files that make up the app shell
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

// ─── Install: pre-cache all app shell files ─────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Pre-caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function() {
        // Skip waiting so new SW activates immediately
        return self.skipWaiting();
      })
  );
});

// ─── Activate: delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== CACHE_NAME; })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        // Take control of all open clients immediately
        return self.clients.claim();
      })
  );
});

// ─── Fetch: cache-first, fallback to network, then cache the response ────────
self.addEventListener('fetch', function(event) {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Don't intercept chrome-extension or non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }

        // Not in cache — fetch from network and cache the response
        return fetch(event.request.clone())
          .then(function(networkResponse) {
            // Only cache valid responses
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === 'error'
            ) {
              return networkResponse;
            }

            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseToCache);
            });

            return networkResponse;
          })
          .catch(function() {
            // Network failed and no cache — for navigation requests return the app
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
