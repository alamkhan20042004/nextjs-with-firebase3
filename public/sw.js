/* Minimal service worker to improve app shell performance.
 * Adds light same-origin media caching for slow networks.
 * Note: Service workers cannot cache cross-origin media by default.
 */

const CACHE_NAME = 'moviebox-shell-v1';
const APP_SHELL = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest',
];

// Lightweight cache for same-origin media (HLS manifests/segments and MP4)
const MEDIA_CACHE = 'moviebox-media-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate for same-origin navigations, CSS, JS, and images
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate';
  const isStatic = /\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff2?)$/i.test(url.pathname);

  if (!isHTML && !isStatic) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});

// Media-aware handler: same-origin only
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isManifest = /\.m3u8(\?|$)/i.test(url.pathname);
  const isMedia = /(\.m3u8|\.mp4|\.webm|\.ogg|\.ts)(\?|$)/i.test(url.pathname);
  if (!isMedia) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      if (isManifest) {
        // Network-first for manifests
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (e) {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw e;
        }
      } else {
        // Stale-while-revalidate for segments/mp4
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkPromise;
      }
    })()
  );
});
