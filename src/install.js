const K = {
  dismissed: "nuqtha:install-dismissed",
  ios: "nuqtha:install-ios-shown",
  active: "nuqtha:active-ms",
  installed: "nuqtha:installed",
};
const ACTIVE_GOAL = 3 * 60 * 1000;
const SNOOZE = 14 * 24 * 3600 * 1000;
const IOS_SNOOZE = 30 * 24 * 3600 * 1000;

let deferred = null;
let shownThisSession = false;
let card = null;
let toastTimer = null;
let toastDismissTimer = null;
let installInitialized = false;
let delegatedClickInitialized = false;
const TOAST_SESSION_KEY = "nuqtha:install-toast-shown";

if (typeof window !== "undefined") {
  if (!window.__NUQTHA_BEFORE_INSTALL_PROMPT__) {
    window.__NUQTHA_BEFORE_INSTALL_PROMPT__ = (event) => {
      event.preventDefault();
      deferred = event;
      window.deferredPrompt = event;
      syncInstallItems();
    };
    window.addEventListener("beforeinstallprompt", window.__NUQTHA_BEFORE_INSTALL_PROMPT__, { passive: false });
  }
}

const num = (key) => {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
};
const put = (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch {}
};

export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isWebView = () => /; wv\)/.test(navigator.userAgent) || /[?&]app=1/.test(location.search);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const eligible = () => !isStandalone() && !isWebView() && !num(K.installed);

function close(snoozeKey) {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastDismissTimer) {
    clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
  }
  if (card) {
    card.classList.remove("on");
    const currentCard = card;
    setTimeout(() => currentCard.remove(), 300);
    card = null;
  }
  if (snoozeKey) put(snoozeKey, Date.now());
}

function show({ ios, manual = false, manualText = "", toast = false }) {
  if (!manual && (shownThisSession || card || !eligible())) return;
  if (!manual) shownThisSession = true;
  if (card) close(null);
  card = document.createElement("div");
  card.className = toast ? "pwa-card pwa-toast" : "pwa-card";
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "Install NUQTHA");

  const brand = document.createElement("div");
  brand.className = "pwa-brand";
  const icon = document.createElement("span");
  icon.className = "pwa-app-icon";
  icon.textContent = "N";
  const title = document.createElement("strong");
  title.textContent = toast ? "Add NUQTHA to your device" : "Install NUQTHA";
  brand.append(icon, title);
  const paragraph = document.createElement("p");
  paragraph.textContent = manual
    ? (ios
      ? "Tap the Share button, then \u201cAdd to Home Screen\u201d."
      : (manualText || "Open your browser menu and choose Install app or Add to Home screen."))
    : (ios
      ? "Tap the Share button, then \u201cAdd to Home Screen\u201d."
      : "Add NUQTHA to your home screen to read faster, even on a weak connection.");
  const row = document.createElement("div");
  row.className = "pwa-row";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "pwa-later";
  later.textContent = ios ? "Got it" : "Not now";
  later.onclick = () => {
    if (toast) {
      try { sessionStorage.setItem(TOAST_SESSION_KEY, "1"); } catch {}
      close(null);
    } else {
      close(ios ? K.ios : K.dismissed);
    }
  };
  row.append(later);

  if (!ios || toast) {
    const go = document.createElement("button");
    go.type = "button";
    go.className = "pwa-go";
    go.textContent = "Install";
    go.onclick = async () => {
      go.disabled = true;
      await installNow();
      if (!toast) go.disabled = false;
    };
    row.append(go);
  }

  card.append(brand, paragraph, row);
  if (toast) {
    const progress = document.createElement("span");
    progress.className = "pwa-toast-progress";
    progress.setAttribute("aria-hidden", "true");
    card.append(progress);
  }
  document.body.append(card);
  requestAnimationFrame(() => card && card.classList.add("on"));

  if (toast) {
    toastDismissTimer = setTimeout(() => {
      try { sessionStorage.setItem(TOAST_SESSION_KEY, "1"); } catch {}
      close(null);
    }, 5500);
  }
}

export function showInstallItem() {
  return eligible();
}

export function syncInstallItems() {
  const visible = showInstallItem();
  document.querySelectorAll("[data-install]").forEach((element) => {
    element.classList.toggle("hidden", !visible);
  });
}

export async function installNow() {
  if (!showInstallItem()) {
    syncInstallItems();
    return;
  }

  const promptEvent = deferred || window.deferredPrompt;
  if (promptEvent) {
    try {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      deferred = null;
      window.deferredPrompt = null;
      if (outcome === "accepted") {
        put(K.installed, 1);
        close(null);
        syncInstallItems();
      }
      return;
    } catch (_) {
      deferred = null;
      window.deferredPrompt = null;
    }
  }

  if (isIOS()) {
    show({ ios: true, manual: true });
    return;
  }
  show({ ios: false, manual: true, manualText: "Open your browser menu and choose Install app or Add to Home screen." });
}

export function offerInstall(reason) {
  if (!eligible() || shownThisSession) return;
  if (Date.now() - num(K.dismissed) < SNOOZE) return;
  if (deferred) {
    show({ ios: false });
    return;
  }
  if (isIOS() && Date.now() - num(K.ios) > IOS_SNOOZE) {
    show({ ios: true });
  }
}

export function initInstall() {
  syncInstallItems();

  if (typeof window !== "undefined") {
    window.NUQTHA_INSTALL = {
      installNow,
      showInstallItem,
      syncInstallItems,
      isStandalone,
      get deferredPrompt() { return deferred || window.deferredPrompt || null; }
    };
  }
  if (isStandalone() || isWebView()) {
    close(null);
    document.querySelectorAll("[data-install], .pwa-card, .nuqtha-app-notice").forEach(element => element.remove());
    return;
  }
  if (installInitialized) return;
  installInitialized = true;


  try {
    if (!isStandalone() && !isWebView() && !sessionStorage.getItem(TOAST_SESSION_KEY)) {
      toastTimer = setTimeout(() => {
        toastTimer = null;
        if (!eligible() || card) return;
        try { sessionStorage.setItem(TOAST_SESSION_KEY, "1"); } catch {}
        show({ ios: isIOS(), toast: true });
      }, 5000);
    }
  } catch {}

  window.addEventListener("pageshow", () => {
    if (isStandalone() || isWebView()) {
      close(null);
      document.querySelectorAll("[data-install], .pwa-card, .nuqtha-app-notice").forEach(element => element.remove());
    }
  });

  if (!delegatedClickInitialized) {
    delegatedClickInitialized = true;
    document.addEventListener("click", async (event) => {
      const element = event.target.closest("[data-install]");
      if (!element) return;
      event.preventDefault();
      if (element.closest("#sidebar-drawer")) {
        document.getElementById("sidebar-close-btn")?.click();
      }
      await installNow();
    });
  }

  window.addEventListener("appinstalled", () => {
    put(K.installed, 1);
    try {
      localStorage.setItem("nuqtha_app_installed", "true");
      localStorage.setItem("nuqtha_installed_platform", "pwa");
    } catch {}
    deferred = null;
    window.deferredPrompt = null;
    close(null);
    syncInstallItems();
    document.querySelectorAll("[data-install], .pwa-card, .nuqtha-app-notice").forEach(element => element.remove());
  });

  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const total = num(K.active) + 5000;
    put(K.active, total);
    if (total >= ACTIVE_GOAL) offerInstall("time");
  }, 5000);

  if (/[?&]installdemo=1/.test(location.search)) {
    localStorage.removeItem(K.dismissed);
    put(K.active, ACTIVE_GOAL);
    offerInstall("time");
  }
}
