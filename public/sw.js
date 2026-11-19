const CACHE = "nuqtha-shell-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    OFFLINE,
    "/",
    "/index.html",
    "/article.html",
    "/styles.css",
    "/tailwind.css",
    "/app.js",
    "/schema-validator.js",
    "/firebase-config.js",
    "/js/public-image-loader.js",
    "/js/book-data.js",
    "/src/install.js",
    "/src/install.css",
    "/src/app-experience.js",
    "/src/app-experience.css",
    "/favicon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-512.png"
  ])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (/\/book\//.test(new URL(event.request.url).pathname)) return caches.match(OFFLINE);
      return caches.match("/index.html").then((index) => index || caches.match(OFFLINE));
    }));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.includes(self.location.origin));
    if (existing) return existing.navigate(url).then((client) => client?.focus());
    return self.clients.openWindow(url);
  }));
});
