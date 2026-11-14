const CACHE_NAME = "stream-pwa-v2.1";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./config.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("player_api.php") || e.request.url.includes(".m3u8")) return;
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
