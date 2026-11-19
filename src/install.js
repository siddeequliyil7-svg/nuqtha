import "./install.css";

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
  if (card) {
    card.classList.remove("on");
    const currentCard = card;
    setTimeout(() => currentCard.remove(), 300);
    card = null;
  }
  if (snoozeKey) put(snoozeKey, Date.now());
}

function show({ ios, manual = false, manualText = "" }) {
  if (!manual && (shownThisSession || card || !eligible())) return;
  if (!manual) shownThisSession = true;
  if (card) close(null);
  card = document.createElement("div");
  card.className = "pwa-card";
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "Install NUQTHA");

  const title = document.createElement("strong");
  title.textContent = "Install NUQTHA";
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
  later.onclick = () => close(ios ? K.ios : K.dismissed);
  row.append(later);

  if (!ios) {
    const go = document.createElement("button");
    go.type = "button";
    go.className = "pwa-go";
    go.textContent = "Install";
    go.onclick = async () => {
      if (!deferred) return;
      go.disabled = true;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      close(outcome === "accepted" ? null : K.dismissed);
    };
    row.append(go);
  }

  card.append(title, paragraph, row);
  document.body.append(card);
  requestAnimationFrame(() => card && card.classList.add("on"));
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

  if (deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === "accepted") {
      put(K.installed, 1);
      close(null);
      syncInstallItems();
    }
    return;
  }

  if (isIOS()) {
    show({ ios: true, manual: true });
  } else {
    show({ ios: false, manual: true, manualText: "Open your browser menu and choose Install app or Add to Home screen." });
  }
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

  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    if (num(K.active) >= ACTIVE_GOAL) offerInstall("time");
  });

  addEventListener("appinstalled", () => {
    put(K.installed, 1);
    deferred = null;
    close(null);
    syncInstallItems();
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
