/* Offline support: serve the app from cache, refresh the cache in the background.
   Change CACHE (e.g. planner-v7) whenever you upload new files, so phones get the update. */
const CACHE = "planner-v6";
const SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./manifest.json",
  "./icon.svg", "./icon-192.png", "./icon-180.png",
  "./fonts/bricolage-grotesque.woff2", "./fonts/plus-jakarta-sans.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit || caches.match("./index.html"));
      return hit || net;
    })
  );
});
