import "./hero.css";

/*
  NUQTHA hero (vanilla JS, ES module)

  Timeline:  type "NUQTHA" for ~1.5s  ->  short pause  ->  auto smooth scroll to #feed

  - Runs ONLY if #hero exists in the page, so it is safe to import from app.js
    even if article.html shares that file. article.html simply has no #hero.
  - Shows once per browser session. Test again with  /?hero=1
  - If the visitor scrolls, taps or presses a key, the auto-scroll stops.
  - prefers-reduced-motion: full text shown at once, no auto-scroll (button only).
*/

const SEEN_KEY = "nuqtha:hero-seen";
const TEXT = "NUQTHA";

const TYPING_MS = 1500; // total time to type all letters
const HOLD_MS = 700; // pause after typing, before scrolling
const SCROLL_MS = 1400; // auto-scroll duration
const SKIP_SCROLL_MS = 600; // scroll duration when "Skip" is pressed

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: ignore */
  }
}

const easeInOutCubic = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

function initHero() {
  const hero = document.getElementById("hero");
  const target = document.getElementById("feed");
  if (!hero || !target) return; // not the home page
  if (document.documentElement.classList.contains("hero-seen")) return;

  const typedEl = hero.querySelector("[data-hero-typed]");
  const caret = hero.querySelector("[data-hero-caret]");
  const tagline = hero.querySelector("[data-hero-tagline]");
  const skipBtn = hero.querySelector("[data-hero-skip]");
  if (!typedEl) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = document.querySelector("header");
  if (header) {
    document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }

  let runId = 0; // bump to cancel any running scroll
  let rafId = 0;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  /* ---------- scrolling ---------- */

  function scrollToFeed(duration) {
    const myRun = ++runId;
    cancelAnimationFrame(rafId);
    markSeen();

    const offset = header ? header.offsetHeight : 0;
    const startY = window.scrollY;
    const endY = target.getBoundingClientRect().top + startY - offset;
    const dist = endY - startY;

    // behavior:"instant" overrides any CSS scroll-behavior:smooth
    if (duration <= 0 || Math.abs(dist) < 2) {
      window.scrollTo({ top: endY, behavior: "instant" });
      return;
    }

    const t0 = performance.now();
    const step = (now) => {
      if (myRun !== runId) return; // cancelled
      const p = Math.min((now - t0) / duration, 1);
      window.scrollTo({ top: startY + dist * easeInOutCubic(p), behavior: "instant" });
      if (p < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  // Visitor takes control: stop the automatic scroll
  function stopAuto() {
    runId++;
    cancelAnimationFrame(rafId);
    timers.forEach(clearTimeout);
    markSeen();
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evt) =>
      window.removeEventListener(evt, stopAuto)
    );
  }

  /* ---------- typing ---------- */

  function showAll() {
    typedEl.textContent = TEXT;
    caret?.classList.add("is-done");
    tagline?.classList.add("is-visible");
  }

  function startTyping() {
    const perLetter = TYPING_MS / TEXT.length; // 1500 / 6 = 250ms
    let i = 0;
    const tick = () => {
      i += 1;
      typedEl.textContent = TEXT.slice(0, i);
      if (i === 2) tagline?.classList.add("is-visible");
      if (i < TEXT.length) {
        later(tick, perLetter);
      } else {
        caret?.classList.add("is-done");
        later(() => scrollToFeed(SCROLL_MS), HOLD_MS);
      }
    };
    later(tick, 400); // small delay so the page settles first
  }

  /* ---------- wire up ---------- */

  skipBtn?.addEventListener("click", () => {
    timers.forEach(clearTimeout);
    showAll();
    scrollToFeed(reduced ? 0 : SKIP_SCROLL_MS);
  });

  if (reduced) {
    showAll(); // no typing, no auto-scroll
    return;
  }

  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evt) =>
    window.addEventListener(evt, stopAuto, { passive: true })
  );
  startTyping();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHero);
} else {
  initHero();
}
