// Chameleon Catch - Service Worker
// Strategy: Cache-first always. Update in background. Never leave user stranded.

const CACHE_NAME = 'chameleon-catch-v13';
const PRECACHE_URLS = [
  './',
  './index.html',
  './sw.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

// ─── Install: pre-cache everything, don't skip waiting until cache is ready ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Pre-caching app shell');
        // addAll is atomic — if any file fails, whole install fails (safe)
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function() {
        // Only skip waiting AFTER cache is fully populated
        return self.skipWaiting();
      })
      .catch(function(err) {
        console.error('[SW] Pre-cache failed:', err);
        // Don't skip waiting if install failed — old SW keeps serving
      })
  );
});

// ─── Activate: only delete old caches AFTER new cache is confirmed ready ─────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    // First verify our own cache is healthy
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.match('./index.html');
      })
      .then(function(indexResponse) {
        if (!indexResponse) {
          // Our cache is broken — don't delete old caches, abort
          console.warn('[SW] Own cache missing index.html, keeping old caches');
          return Promise.resolve();
        }
        // Cache is healthy — now safe to delete old ones
        return caches.keys().then(function(cacheNames) {
          return Promise.all(
            cacheNames
              .filter(function(name) { return name !== CACHE_NAME; })
              .map(function(name) {
                console.log('[SW] Deleting old cache:', name);
                return caches.delete(name);
              })
          );
        });
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

// ─── Fetch: cache-first, network fallback, background update ─────────────────
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      // Always serve from cache immediately if available
      if (cachedResponse) {
        // Background update (stale-while-revalidate)
        fetch(event.request.clone())
          .then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(function() { /* offline, no worries */ });

        return cachedResponse;
      }

      // Not in cache — fetch from network
      return fetch(event.request.clone())
        .then(function(networkResponse) {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type === 'error'
          ) {
            return networkResponse;
          }
          // Cache for next time
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(function() {
          // Network failed, nothing in cache
          // For navigation: always return index.html (game shell)
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then(function(r) {
              return r || new Response('Offline — please open the game while online first.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
          }
          // For other requests: return nothing (let it fail gracefully)
        });
    })
  );
});
