const LAST_SEEN_KEY = "nuqtha:last-seen-content";
const ARTICLE_CACHE_KEY = "nuqtha:offline-articles:v1";

let updateWorker = null;

function isBookRecord(item) {
  return item?.isBook === true || /(?:^|\/)books?(?:$|\/)/i.test(item?.category || "") ||
    ["BOOK", "FREE", "PREMIUM"].includes(String(item?.type || "").toUpperCase());
}

function getTimestamp(item) {
  const value = item?.updatedAt || item?.createdAt || item?.publishDate || item?.date || 0;
  if (typeof value === "number") return value;
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function cacheArticlesOffline(items) {
  if (!Array.isArray(items)) return;
  const articles = items
    .filter(item => item && !isBookRecord(item))
    .filter(item => String(item.status || "published").toLowerCase() !== "draft")
    .map(item => ({
      id: item.id || "",
      title: item.title || "",
      slug: item.slug || "",
      author: item.author || "",
      category: item.category || "",
      excerpt: item.excerpt || item.storedExcerpt || "",
      content: item.content || "",
      transcription: item.transcription || "",
      imageUrl: item.imageUrl || item.coverUrl || item.coverImage || item.thumbnailUrl || "",
      thumbnailUrl: item.thumbnailUrl || item.imageUrl || item.coverUrl || "",
      bookId: item.bookId || "",
      bookName: item.bookName || "",
      updatedAt: getTimestamp(item),
      createdAt: getTimestamp(item)
    }))
    .slice(0, 200);

  try { localStorage.setItem(ARTICLE_CACHE_KEY, JSON.stringify(articles)); } catch {}
}

export function getOfflineArticles() {
  try {
    const value = JSON.parse(localStorage.getItem(ARTICLE_CACHE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

function showInAppNotice(item) {
  const existing = document.getElementById("nuqtha-new-content-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "nuqtha-new-content-banner";
  banner.className = "nuqtha-app-notice";

  const copy = document.createElement("div");
  copy.className = "nuqtha-app-notice-copy";
  const label = document.createElement("strong");
  label.textContent = isBookRecord(item) ? "New book published" : "New article published";
  const title = document.createElement("span");
  title.textContent = item.title || "NUQTHA";
  copy.append(label, title);

  const open = document.createElement("a");
  open.className = "nuqtha-app-notice-action";
  open.textContent = "Open";
  open.href = item.slug ? (isBookRecord(item) ? `/book/${encodeURIComponent(item.slug)}` : `/story/${encodeURIComponent(item.slug)}`) : "/";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "nuqtha-app-notice-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close notification");
  close.onclick = () => banner.remove();

  banner.append(copy, open, close);
  document.body.append(banner);
  requestAnimationFrame(() => banner.classList.add("on"));
  setTimeout(() => banner.remove(), 10000);
}

export async function showSystemNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const url = item.slug ? (isBookRecord(item) ? `/book/${encodeURIComponent(item.slug)}` : `/story/${encodeURIComponent(item.slug)}`) : "/";

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(isBookRecord(item) ? "New NUQTHA book" : "New NUQTHA article", {
        body: item.title || "Open NUQTHA to read the latest update.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url },
        tag: `nuqtha-${item.id || item.slug || Date.now()}`
      });
    }
  } catch {}
}

export function checkLatestContent(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  cacheArticlesOffline(items);

  let lastSeen = 0;
  try { lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0; } catch {}

  const newest = [...items].sort((a, b) => getTimestamp(b) - getTimestamp(a))[0];
  if (!newest) return;
  const newestTime = getTimestamp(newest);

  if (lastSeen === 0) {
    try { localStorage.setItem(LAST_SEEN_KEY, String(newestTime)); } catch {}
    return;
  }

  if (newestTime > lastSeen) {
    showInAppNotice(newest);
    showSystemNotification(newest);
  }

  try { localStorage.setItem(LAST_SEEN_KEY, String(newestTime)); } catch {}
}

export function initOfflineStatus() {
  const status = document.createElement("div");
  status.id = "nuqtha-offline-status";
  status.className = "nuqtha-offline-status";
  status.setAttribute("role", "status");
  document.body.append(status);

  const render = () => {
    if (navigator.onLine) {
      status.classList.remove("on", "offline");
      status.textContent = "";
    } else {
      status.textContent = "Offline — articles remain available; books require internet.";
      status.classList.add("on", "offline");
    }
  };

  window.addEventListener("offline", render);
  window.addEventListener("online", () => {
    status.textContent = "Back online";
    status.classList.remove("offline");
    status.classList.add("on");
    setTimeout(() => status.classList.remove("on"), 3500);
  });
  render();
}

export function initUpdateNotice() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready.then(registration => {
    registration.addEventListener("updatefound", () => {
      updateWorker = registration.installing;
      if (!updateWorker) return;
      updateWorker.addEventListener("statechange", () => {
        if (updateWorker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(registration);
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.getRegistration().then(registration => {
    if (!registration) return;
    if (registration.waiting) showUpdateBanner(registration);
  }).catch(() => {});
}

function showUpdateBanner(registration) {
  if (document.getElementById("nuqtha-update-banner")) return;
  const banner = document.createElement("div");
  banner.id = "nuqtha-update-banner";
  banner.className = "nuqtha-update-banner";
  banner.innerHTML = `<span>New version available</span><button type="button">Refresh</button>`;
  document.body.append(banner);
  banner.querySelector("button")?.addEventListener("click", () => {
    const waiting = registration.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(() => window.location.reload(), 150);
    } else {
      window.location.reload();
    }
  });
}

async function initFirebaseMessagingIfConfigured() {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;
  const vapidKey = window.NUQTHA_FCM_VAPID_KEY;
  if (!vapidKey) return;
  try {
    const firebaseConfigModule = await import("../firebase-config.js");
    const app = firebaseConfigModule.app || window.NUQTHA_FIREBASE_APP;
    if (!app) return;
    const messagingModule = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js");
    const messaging = messagingModule.getMessaging(app);
    await messagingModule.getToken(messaging, { vapidKey, serviceWorkerRegistration: await navigator.serviceWorker.ready });
  } catch (error) {
    console.warn("[NUQTHA] FCM setup unavailable:", error?.message || error);
  }
}

export function initAppExperience() {
  const standalone = (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (standalone) {
    document.querySelectorAll("[data-install], .pwa-card").forEach(element => element.remove());
  }
  window.addEventListener("pageshow", () => {
    if ((typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true) {
      document.querySelectorAll("[data-install], .pwa-card, .nuqtha-app-notice").forEach(element => element.remove());
    }
  });

  initOfflineStatus();
  initUpdateNotice();
  initFirebaseMessagingIfConfigured();

  if (!("Notification" in window) || Notification.permission !== "default") return;
  const promptKey = "nuqtha:notification-prompted";
  try {
    if (localStorage.getItem(promptKey)) return;
  } catch {}

  setTimeout(() => {
    if (document.getElementById("nuqtha-notification-banner")) return;
    const banner = document.createElement("div");
    banner.id = "nuqtha-notification-banner";
    banner.className = "nuqtha-app-notice";
    banner.innerHTML = `<div class="nuqtha-app-notice-copy"><strong>NUQTHA notifications</strong><span>Get notified when a new article or book is published.</span></div><button type="button" class="nuqtha-app-notice-action">Enable</button><button type="button" class="nuqtha-app-notice-close" aria-label="Close">×</button>`;
    document.body.append(banner);
    requestAnimationFrame(() => banner.classList.add("on"));

    banner.querySelector(".nuqtha-app-notice-action")?.addEventListener("click", async () => {
      await requestNotificationPermission();
      try { localStorage.setItem(promptKey, "1"); } catch {}
      banner.remove();
    });
    banner.querySelector(".nuqtha-app-notice-close")?.addEventListener("click", () => {
      try { localStorage.setItem(promptKey, "1"); } catch {}
      banner.remove();
    });
  }, 8000);
}
