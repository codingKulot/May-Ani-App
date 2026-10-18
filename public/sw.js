/* May-Ani service worker: offline-first shell, network-first for API/data calls. */
const CACHE = 'may-ani-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache cross-origin data (weather, quakes) or API calls.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./'))),
  );
});

// Tapping a "new message" notification (src/lib/notify.ts): bring May-Ani to the front and open that conversation.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || '#/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list[0];
      if (open) {
        open.postMessage({ type: 'may-ani:open', hash }); // the app changes its own page (main.tsx)
        return open.focus();
      }
      return self.clients.openWindow(`${self.registration.scope}${hash}`);
    }),
  );
});
