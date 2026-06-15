/* global self, caches, fetch, Response, URL, NotificationOptions, clients */
// 【续 45.3 2026-06-28】Service Worker — 静态资源离线缓存 + 通知点击
// 策略:
//   导航请求(HTML): 网络优先,失败 fallback 缓存的 index.html(离线可用)
//   同源静态资源(JS/CSS/SVG/字体): stale-while-revalidate(秒开 + 后台更新)
//   API 请求(/graphql /files /dav /var/log /config /api): 透传网络,不缓存(实时数据)
//   通知点击: 聚焦/打开对应 URL

const CACHE_VERSION = 'unraid-mobile-v1';
const CORE_ASSETS = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API 请求透传(不拦截,让浏览器/nginx 处理)
  const apiPrefixes = ['/graphql', '/files', '/dav', '/var/log', '/config', '/api'];
  if (apiPrefixes.some((p) => url.pathname.startsWith(p))) return;

  // 导航请求:网络优先,失败 fallback 缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())))
    );
    return;
  }

  // 静态资源:stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(targetUrl));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
