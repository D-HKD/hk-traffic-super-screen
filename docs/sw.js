/* 香港交通警報中心 v2 — Service Worker
 *
 * 只有一個目標：令「開過一次就唔怕離線白畫面」。
 * 原則：
 *   - 導航請求：network-first（拿最新 HTML），失敗才用快取，保證有舊畫面好過白畫面。
 *   - 同源靜態資源（Vite 出 hash 檔名）：cache-first，因為檔名一變就係新資源。
 *   - 跨源（政府 API / proxy）：完全唔碰，避免把即時資料寫入快取造成「假即時」。
 */

const VERSION = 'v2-2026-10';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 逐個 add，任何一個失敗都不應該令整個 install 失敗。
      await Promise.all(SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>離線</title><body style="background:#06111f;color:#f4fbff;font-family:sans-serif;padding:32px"><h1>目前離線</h1><p>未能夠載入交通資料，請檢查網絡後重新整理。</p>',
      { status: 503, headers: { 'Content-Type': 'text/html;charset=utf-8' } },
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone()).catch(() => undefined);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API 一律直接上網，不經快取

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
