/* Minimal service worker to improve app shell performance.
 * Note: This does NOT cache cross-origin iframe media (e.g., Odysee/Rumble videos).
 */

const CACHE_NAME = 'moviebox-shell-v1';
const APP_SHELL = [
  '/',
  '/favicon.ico',
  '/manifest.webmanifest',
];

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
