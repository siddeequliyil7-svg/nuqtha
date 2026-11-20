const CACHE = "nuqtha-shell-v3";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  const precacheUrls = [
    OFFLINE,
    "/",
    "/index.html",
    "/article.html",
    "/manifest.webmanifest",
    "/favicon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-512.png"
  ];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(precacheUrls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Precache request failed (${response.status}): ${url}`);
      await cache.put(url, response);
    }));
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn("[ServiceWorker] Skipping unavailable precache asset:", precacheUrls[index], result.reason);
      }
    });
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === "navigate" && /^\/admin(?:\.html)?\/?$/.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const isBookRoute = /\/book\//.test(url.pathname);
      const shellUrl = isBookRoute ? "/article.html" : (url.pathname.includes("article.html") || /\/story\//.test(url.pathname) ? "/article.html" : "/index.html");
      const cache = await caches.open(CACHE);
      const cachedShell = await cache.match(shellUrl);

      const networkUpdate = fetch(request).then(async (response) => {
        if (response && response.ok) {
          await cache.put(shellUrl, response.clone());
        }
        return response;
      }).catch(() => null);

      if (cachedShell) {
        event.waitUntil(networkUpdate);
        return cachedShell;
      }
      return (await networkUpdate) || caches.match(OFFLINE);
    })());
    return;
  }

  if (request.method === "GET" && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const networkUpdate = fetch(request).then(async (response) => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => null);
      if (cached) {
        event.waitUntil(networkUpdate);
        return cached;
      }
      return (await networkUpdate) || caches.match(OFFLINE);
    })());
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
