const CACHE_NAME = "stream-pwa-v8";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./config.js"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  // Nunca interceptar streams, proxies ou domínios externos
  if (url.origin !== self.location.origin) return;
  if (/\.(m3u8|m3u|ts|mp4|mkv|webm|aac|mp3)(\?|$)/i.test(url.pathname)) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
