/* SkyGoal Service Worker
   オフライン対応：初回アクセス時に本体＆外部CDNをキャッシュし、
   2回目以降はネットが無くても開けるようにする。 */

const CACHE = 'skygoal-v2';

// 同一オリジンの必須ファイル
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 外部CDN（クロスオリジン：no-corsのopaqueレスポンスとしてキャッシュ）
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // コアは確実に、CDNは失敗しても止めない
    await cache.addAll(CORE).catch(() => {});
    await Promise.all(
      CDN.map((url) =>
        fetch(url, { mode: 'no-cors' })
          .then((res) => cache.put(url, res))
          .catch(() => {})
      )
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // ページ遷移はネット優先→ダメならキャッシュのindex
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // それ以外はキャッシュ優先＋裏で更新（stale-while-revalidate）
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreVary: true });
    const network = fetch(req)
      .then((res) => {
        // フォント等も含めて取れたものはキャッシュ
        try { cache.put(req, res.clone()); } catch (e) {}
        return res;
      })
      .catch(() => cached);
    return cached || network;
  })());
});
