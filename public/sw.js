const CACHE = "nuqtha-shell-v8";
const OFFLINE = "/offline.html";
const CODE_ASSET_REGEX = /\.(?:m?js|css|json|webmanifest)$/i;
const BYPASS_PATH_REGEX = /^\/(?:@vite|@fs|@id|@react-refresh|node_modules|__vite|api\/)/;

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
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    BYPASS_PATH_REGEX.test(url.pathname) ||
    url.searchParams.has("t") ||
    url.searchParams.has("import")
  ) {
    return;
  }

  if (request.mode === "navigate" && /^\/admin(?:\.html)?\/?$/.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const isBookRoute = /\/book\//.test(url.pathname);
      const shellUrl = isBookRoute ? "/article.html" : (url.pathname.includes("article.html") || /\/story\//.test(url.pathname) ? "/article.html" : "/index.html");
      const cache = await caches.open(CACHE);

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          event.waitUntil(cache.put(shellUrl, networkResponse.clone()));
          return networkResponse;
        }
      } catch (_) {}

      const cachedShell = await cache.match(shellUrl);
      return cachedShell || caches.match(OFFLINE);
    })());
    return;
  }

  const isCodeOrStyle =
    CODE_ASSET_REGEX.test(url.pathname) ||
    request.destination === "script" ||
    request.destination === "style";

  if (isCodeOrStyle) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          event.waitUntil(cache.put(request, networkResponse.clone()));
        }
        return networkResponse;
      } catch (_) {
        const cached = await cache.match(request);
        return cached || caches.match(OFFLINE);
      }
    })());
    return;
  }

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
