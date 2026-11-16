// Service worker : l'app s'ouvre même sans réseau (écran de connexion mis en cache) et reçoit les
// notifications push. Portée = dossier de l'app (/latribu/ dans la passerelle). L'API n'est jamais
// mise en cache : les données viennent toujours du serveur.
// Changer VERSION quand la liste des fichiers change.
const VERSION = 'latribu-v1';
const FILES = ['./', 'style.css', 'app.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (la copie gardée est rafraîchie à chaque réponse réussie), sinon la copie.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const scope = new URL(self.registration.scope).pathname;
  const key = req.mode === 'navigate' ? scope : req; // la page, quelle que soit l'adresse
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then((hit) => hit || Response.error())));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'La Tribu', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'La Tribu', {
    body: d.body || '', tag: d.tag || 'latribu', icon: 'icon-192.png', badge: 'badge-96.png', data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
