// Ground Truth service worker: makes the app installable and keeps the shell
// available offline. Data (tiles, GeoTIFF range requests, JSON) is never cached
// here beyond what the browser does itself, so numbers are always the pipeline's
// latest and range requests stay range requests.
const VERSION = 'gt-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isShellAsset = sameOrigin && (url.pathname.includes('/assets/') || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png'));
  const isPage = sameOrigin && req.mode === 'navigate';
  if (!isShellAsset && !isPage) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      const fetching = fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      // Hashed assets are immutable: serve the cache first. Pages: network first, cache as fallback.
      return isShellAsset && hit ? hit : fetching;
    }),
  );
});
