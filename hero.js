import "./hero.css";

/*
  NUQTHA hero (vanilla JS, ES module)

  Timeline:  smooth write-in of "NUQTHA" (~750ms) -> tagline fade -> auto smooth scroll to navbar & feed
  - Positioned ABOVE <header>, so the navbar is completely hidden during intro
  - No blinking caret/line
  - Shows once per session (re-test with /?hero=1)
  - Auto-scroll hands off control immediately if user scrolls or taps
*/

const SEEN_KEY = "nuqtha:hero-seen";
const HOLD_MS = 600; // brief pause after write-in before scrolling
const SCROLL_MS = 950; // smooth scroll duration
const SKIP_SCROLL_MS = 450;

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

const easeInOutCubic = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

function initHero() {
  const hero = document.getElementById("hero");
  const target = document.getElementById("home") || document.getElementById("feed");
  if (!hero || !target) return;

  const forced = /[?&]hero=1/.test(window.location.search);
  if (!forced) {
    document.documentElement.classList.add("hero-seen");
    hero.style.display = "none";
    markSeen();
    return;
  }

  if (document.documentElement.classList.contains("hero-seen")) {
    hero.style.display = "none";
    return;
  }

  const typedEl = hero.querySelector("[data-hero-typed]");
  const tagline = hero.querySelector("[data-hero-tagline]");
  const skipBtn = hero.querySelector("[data-hero-skip]");
  if (!typedEl) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let runId = 0;
  let rafId = 0;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function scrollToContent(duration) {
    const myRun = ++runId;
    cancelAnimationFrame(rafId);
    markSeen();

    const startY = window.scrollY;
    const endY = target.getBoundingClientRect().top + startY;
    const dist = endY - startY;

    if (duration <= 0 || Math.abs(dist) < 2) {
      window.scrollTo({ top: endY, behavior: "instant" });
      onScrollComplete();
      return;
    }

    const t0 = performance.now();
    const step = (now) => {
      if (myRun !== runId) return;
      const p = Math.min((now - t0) / duration, 1);
      window.scrollTo({ top: startY + dist * easeInOutCubic(p), behavior: "instant" });
      if (p < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        onScrollComplete();
      }
    };
    rafId = requestAnimationFrame(step);
  }

  function onScrollComplete() {
    markSeen();
    document.documentElement.classList.add("hero-seen");
    // After arriving at navbar, hide hero so page starts cleanly at navbar
    if (hero) hero.style.display = "none";
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function stopAuto() {
    runId++;
    cancelAnimationFrame(rafId);
    timers.forEach(clearTimeout);
    markSeen();
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evt) =>
      window.removeEventListener(evt, stopAuto)
    );
  }

  function showAll() {
    typedEl.classList.add("is-written");
    tagline?.classList.add("is-visible");
  }

  function startSmoothIntro() {
    // 1. Smooth fast write-in (ink sweep)
    later(() => {
      typedEl.classList.add("is-written");
    }, 150);

    // 2. Tagline reveals smoothly
    later(() => {
      tagline?.classList.add("is-visible");
    }, 450);

    // 3. Smooth auto-scroll down to navbar and content
    later(() => {
      scrollToContent(SCROLL_MS);
    }, 450 + HOLD_MS);
  }

  skipBtn?.addEventListener("click", () => {
    timers.forEach(clearTimeout);
    showAll();
    scrollToContent(reduced ? 0 : SKIP_SCROLL_MS);
  });

  if (reduced) {
    showAll();
    return;
  }

  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((evt) =>
    window.addEventListener(evt, stopAuto, { passive: true })
  );

  startSmoothIntro();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHero);
} else {
  initHero();
}
