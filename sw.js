/* FLOWDECK service worker — アプリ本体をキャッシュしてオフラインでも開けるようにする。
   タスクデータは localStorage / GitHub Gist 側なので、ここでは扱わない。 */
const CACHE = 'flowdeck-v2';
const ASSETS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/app.js',
  './assets/icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* app shell は network-first。
   - オンライン: 常に最新を配信する（更新が1リロード遅れないため）
   - オフライン: 直前にキャッシュしたものを返す
   api.github.com など別オリジンへのリクエストは一切触らない。 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true });
      return cached || new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
