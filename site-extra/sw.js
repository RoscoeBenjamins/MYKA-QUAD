// Myka Quad service worker: makes the app installable and opens the last-seen app shell
// when the phone is offline. Business data (/api) is never cached; it always goes to the server.
const CACHE = 'myka-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;
  // network first (always the newest version), cached copy only when offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (e.request.mode === 'navigate' || SHELL.includes(url.pathname) || url.pathname.startsWith('/icons/'))) {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request.mode === 'navigate' ? '/' : e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request.mode === 'navigate' ? '/' : e.request).then((r) => r || caches.match('/'))));
});
