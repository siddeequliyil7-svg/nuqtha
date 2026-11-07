// library.js (loaded lazily: only when the visitor opens the Library view)
import { db, collection, getDocs, getDocsFromCache, query, where } from "./firebase-config.js";
import { getStoryUrl } from "./schema-validator.js";
import { FALLBACK_ARTICLE_ITEMS, FALLBACK_BOOKS } from "./fallback-data.js";
import "./library.css";

const MAX_BOOKS = 6, MAX_PAPERS = 5;
const CACHE_KEY = "nuqtha:library:v1", CACHE_MS = 5 * 60 * 1000;
const articleUrl = (a) => {
  if (typeof a === "object" && a !== null) {
    try {
      const u = getStoryUrl(a);
      if (u) return u;
    } catch (_) {}
    return `/article.html?id=${encodeURIComponent(a.id || "")}`;
  }
  return `/article.html?id=${encodeURIComponent(a)}`;
};

const COLORS = ["#7b2d26", "#2f4a3a", "#2d3e5c", "#5c3a21", "#6b2f4f", "#8a6a2a"];
const ROT = [-6, 4, -3, 7, -5];

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// Low-end phones get a simple fade instead of the 3D flip (keeps it smooth)
const lite = reduced || (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 3);
const D = (n) => (reduced ? 1 : n);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const safeColor = (c, i) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : COLORS[i % COLORS.length]);

/* ---------- data (cached for 5 min per session, resilient to 429 quota) ---------- */
async function loadData() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.d?.books) && Array.isArray(c.d?.papers)) return c.d;
  } catch (error) {
    console.warn("[Library] Could not restore the session cache.", error);
  }

  let books = [];
  let papers = [];

  async function getCollectionDocs(ref, name) {
    try {
      return await getDocs(ref);
    } catch (error) {
      console.warn(`[Library] ${name} request failed; checking Firestore's local cache.`, error);
      try {
        return await getDocsFromCache(ref);
      } catch (cacheError) {
        console.warn(`[Library] ${name} is unavailable in the local cache.`, cacheError);
        return { docs: [] };
      }
    }
  }

  const [bookSnapshot, articleSnapshot] = await Promise.all([
    getCollectionDocs(query(collection(db, "books"), where("visible", "==", true)), "books"),
    getCollectionDocs(query(collection(db, "articles"), where("showOnTable", "==", true)), "articles")
  ]);
  books = bookSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, MAX_BOOKS)
      .map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        pages: b.pages,
        color: b.color,
        description: b.description,
        imageUrl: b.imageUrl || b.coverImage || b.thumbnailUrl || "",
        slug: b.slug,
        contents: b.contents || b.chapters?.map(chapter => chapter.title || chapter) || []
      }));
  papers = articleSnapshot.docs.slice(0, MAX_PAPERS).map((d) => {
      const a = d.data();
      return {
        id: d.id,
        title: a.title,
        author: a.author,
        category: a.category,
        readTime: a.readTime,
        slug: a.slug,
        bookSlug: a.bookSlug,
        isChapter: a.isChapter,
        excerpt: a.excerpt || a.description || String(a.body || a.content || "").replace(/<[^>]*>/g, " ").slice(0, 220)
      };
    });

  // Fallback to FALLBACK_ARTICLES if Firestore quota is exhausted (429) or offline
  if (books.length === 0) {
    books = FALLBACK_BOOKS.map((b, i) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      pages: 180 + (i * 25),
      color: COLORS[i % COLORS.length],
      description: b.excerpt,
      imageUrl: b.imageUrl || b.coverImage || b.thumbnailUrl || "",
      slug: b.slug,
      contents: (b.chapters || b.contents || []).map(c => typeof c === "string" ? c : c.title)
    }));
  }

  if (papers.length === 0) {
    papers = FALLBACK_ARTICLE_ITEMS.map(a => ({
      id: a.id,
      title: a.title,
      author: a.author,
      category: a.category,
      readTime: "5 min",
      slug: a.slug,
      bookSlug: a.bookSlug || "",
      isChapter: a.isChapter === true,
      excerpt: a.excerpt || a.description || String(a.content || "").replace(/<[^>]*>/g, " ").slice(0, 220)
    }));
  }

  const data = { books, papers };
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch {}
  return data;
}

/* ---------- reader (book / paper opening) ---------- */
let R = null, cur = null, busy = false, sheet = false;
const EASE = "cubic-bezier(.2,.8,.2,1)", IO = "ease-in-out";

function ensureReader() {
  if (R) return R;
  const w = document.createElement("div");
  w.innerHTML = `<div id="lib-reader" role="dialog" aria-modal="true" aria-label="Reader"><div id="lib-stage">
    <div id="lib-pageR"></div><div id="lib-flyer"><div id="lib-cover">
    <div class="face front" id="lib-fr"><div class="ft" id="lib-ft"></div></div><div class="face pg" id="lib-bk"></div>
    </div></div></div></div><button id="lib-close" type="button">Back to library</button>`;
  document.body.append(...w.children);
  R = { reader: $("lib-reader"), stage: $("lib-stage"), pageR: $("lib-pageR"), flyer: $("lib-flyer"),
        cover: $("lib-cover"), fr: $("lib-fr"), ft: $("lib-ft"), bk: $("lib-bk"), closeBtn: $("lib-close") };
  R.closeBtn.addEventListener("click", closeItem);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeItem(); });
  return R;
}

const fromTo = (s, t) => `translate(${s.left - t.left}px,${s.top - t.top}px) scale(${s.width / t.width},${s.height / t.height})`;
const clearAnims = () => Object.values(R).forEach((e) => e && e.getAnimations && e.getAnimations().forEach((a) => a.cancel()));

async function openItem(el, it) {
  if (busy) return;
  busy = true; cur = el; sheet = it.sheet;
  const { reader, stage, pageR, flyer, cover, fr, ft, bk, closeBtn } = ensureReader();
  fr.style.setProperty("--c", it.color); fr.style.setProperty("--fc", it.fc);
  ft.innerHTML = `<span>✦</span><h3>${esc(it.title)}</h3><span>${esc(it.author)}</span>`;
  bk.innerHTML = it.left; pageR.innerHTML = it.right; pageR.scrollTop = 0; pageR.style.opacity = 0;
  stage.classList.toggle("sheet", sheet); stage.classList.remove("lea");
  reader.classList.add("on"); document.body.style.overflow = "hidden";
  stage.style.transform = sheet || lite ? "none" : "translateX(-25%)"; cover.style.transform = "none";

  if (lite) { // simple fade, no 3D
    if (sheet) fr.style.opacity = 0; else { cover.style.transform = "rotateY(-180deg)"; stage.classList.add("lea"); }
    pageR.style.opacity = 1;
    reader.animate({ opacity: [0, 1] }, { duration: D(200) });
    closeBtn.classList.add("on"); closeBtn.focus(); busy = false; return;
  }

  const s = el.getBoundingClientRect(), t = flyer.getBoundingClientRect();
  el.classList.add("out");
  reader.animate({ opacity: [0, 1] }, { duration: D(300) });
  ft.animate({ opacity: [0, 0, 1] }, { duration: D(750) });
  await flyer.animate({ transform: [fromTo(s, t), "none"] }, { duration: D(750), easing: EASE }).finished;
  pageR.style.opacity = 1;
  if (sheet) {
    await fr.animate({ opacity: [1, 0] }, { duration: D(400), fill: "forwards" }).finished;
  } else {
    stage.classList.add("lea");
    stage.animate({ transform: ["translateX(-25%)", "translateX(0)"] }, { duration: D(1000), easing: IO, fill: "forwards" });
    await cover.animate({ transform: ["rotateY(0deg)", "rotateY(-180deg)"] }, { duration: D(1000), easing: IO, fill: "forwards" }).finished;
  }
  closeBtn.classList.add("on"); closeBtn.focus(); busy = false;
}

function endClose() {
  const { reader, stage, cover, fr } = R;
  reader.classList.remove("on"); clearAnims();
  stage.style.transform = ""; cover.style.transform = ""; fr.style.opacity = "";
  document.body.style.overflow = "";
  if (cur) {
    cur.classList.remove("out");
    cur.focus();
    cur = null;
  }
  busy = false;
}

async function closeItem() {
  if (busy || !cur) return;
  busy = true;
  const { reader, stage, pageR, flyer, cover, fr, closeBtn } = R;
  closeBtn.classList.remove("on"); stage.classList.remove("lea");
  if (lite) { await reader.animate({ opacity: [1, 0] }, { duration: D(200) }).finished; return endClose(); }
  if (sheet) await fr.animate({ opacity: [0, 1] }, { duration: D(350), fill: "forwards" }).finished;
  else await Promise.all([
    cover.animate({ transform: ["rotateY(-180deg)", "rotateY(0deg)"] }, { duration: D(800), easing: IO, fill: "forwards" }).finished,
    stage.animate({ transform: ["translateX(0)", "translateX(-25%)"] }, { duration: D(800), easing: IO, fill: "forwards" }).finished,
  ]);
  pageR.style.opacity = 0;
  const s = cur.getBoundingClientRect(), t = flyer.getBoundingClientRect();
  await flyer.animate({ transform: ["none", fromTo(s, t)] }, { duration: D(650), easing: EASE, fill: "forwards" }).finished;
  await reader.animate({ opacity: [1, 0] }, { duration: D(250) }).finished;
  endClose();
}

/* ---------- items ---------- */
const bookItem = (b, i) => ({
  sheet: false, title: b.title, author: b.author, color: safeColor(b.color, i), fc: "#f4e7c8",
  left: `<p class="k">Book</p><h2>${esc(b.title)}</h2><hr><p class="by">${esc(b.author)}${b.pages ? " · " + esc(b.pages) + " pages" : ""}</p>`,
  right: `<p>${esc(b.description)}</p>` + (b.contents && b.contents.length
    ? `<p class="k">Inside this book</p><ul>${b.contents.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""),
});

const paperItem = (a) => ({
  sheet: true, title: a.title, author: a.author, color: "#efe6d4", fc: "#2c221e",
  left: "",
  right: `<p class="k">${esc(a.category || "Article")}</p><h2>${esc(a.title)}</h2><p class="by">${esc(a.author || "NUQTHA")}${a.readTime ? " · " + esc(a.readTime) + " read" : ""}</p>
    <p>${esc(a.excerpt)}…</p><p><a href="${articleUrl(a)}">Read the full article →</a></p>`,
});

/* ---------- render ---------- */
function renderShelf(books) {
  const shelf = $("lib-shelf");
  if (!shelf) return;
  shelf.innerHTML = "";
  if (!books.length) { shelf.innerHTML = '<p class="lib-msg">No books on the shelf yet.</p>'; return; }
  const row = document.createElement("div"); row.className = "row";
  books.forEach((b, i) => {
    const h = hash(b.id), el = document.createElement("button");
    el.type = "button"; el.className = "book" + (i === 3 ? " lean" : "");
    el.style.setProperty("--c", safeColor(b.color, i));
    el.style.setProperty("--h", 150 + (h % 40) + "px");
    el.style.setProperty("--w", 44 + ((h >> 3) % 14) + "px");
    el.setAttribute("aria-label", "Open book: " + b.title);
    el.innerHTML = `<span>${esc(b.title)}</span>`;
    el.addEventListener("click", () => openItem(el, bookItem(b, i)));
    row.appendChild(el);
  });
  const plank = document.createElement("div"); plank.className = "plank";
  shelf.append(row, plank);
}

function renderTable(papers) {
  const table = $("lib-table");
  if (!table) return;
  table.innerHTML = "";
  if (!papers.length) { table.innerHTML = '<p class="lib-msg" style="color:#f3e8dc">No papers on the table yet.</p>'; return; }
  papers.forEach((a, i) => {
    const p = document.createElement("button");
    p.type = "button"; p.className = "paper"; p.style.setProperty("--r", ROT[i % ROT.length] + "deg");
    p.setAttribute("aria-label", "Open printed article: " + a.title);
    p.innerHTML = `<h4>${esc(a.title)}</h4><i></i><b>${esc(a.author || "NUQTHA")}${a.readTime ? " · " + esc(a.readTime) : ""}</b>`;
    p.addEventListener("click", () => openItem(p, paperItem(a)));
    table.appendChild(p);
  });
}

export async function mountLibrary(root) {
  root.innerHTML = `<div class="max-w-md mx-auto px-4 pt-4 pb-1 flex items-center justify-between">
    <button type="button" id="lib-back-btn" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-[#b4532c]/15 text-xs font-bold text-[#b4532c] dark:text-[#f87171] transition cursor-pointer font-english shadow-2xs">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
      <span>ലേഖനങ്ങളിലേക്ക് (Back to Articles)</span>
    </button>
    <span class="text-[11px] font-bold text-[#8c7a6b] font-english uppercase tracking-wider">3D Library</span>
  </div>
  <div class="lib-case"><div class="wallbg" id="lib-shelf"><p class="lib-msg">Loading the library…</p></div></div>
  <div class="lib-table" id="lib-table" aria-label="Table with printed articles"></div>`;

  const backBtn = root.querySelector("#lib-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (typeof window.showNuqthaView === "function") {
        window.showNuqthaView("articles");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }
  try {
    const { books, papers } = await loadData();
    renderShelf(books); renderTable(papers);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="lib-msg">Couldn’t load the library. Check your connection.<br><button type="button">Try again</button></div>';
    root.querySelector("button")?.addEventListener("click", () => mountLibrary(root));
  }
}
