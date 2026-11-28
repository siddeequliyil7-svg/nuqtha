import assert from "node:assert/strict";
import fs from "node:fs";

function createMemoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    },
    clear() {
      map.clear();
    }
  };
}

globalThis.sessionStorage = createMemoryStorage();
globalThis.localStorage = createMemoryStorage();

const cacheMod = await import("../js/firestore-cache.js");
const {
  PRIORITY_FOREGROUND,
  PRIORITY_BACKGROUND,
  readTtlCache,
  writeTtlCache,
  readArticlesListCache,
  writeArticlesListCache,
  saveCachedArticleDoc,
  getCachedArticleDoc,
  lookupSlugMapping,
  markFirestoreRateLimited,
  clearFirestoreRateLimit,
  checkIsRateLimited,
  dedupeInFlight,
  enqueueFirestoreTask,
  queuedFirestoreFetch
} = cacheMod;

console.log("==================================================");
console.log("RUNNING FIRESTORE CACHE, 429 QUEUE & UI TESTS");
console.log("==================================================");

// 1. UI & Source Assertions (app.js, styles.css, article.html, firebase-config.js)
const appJs = fs.readFileSync("app.js", "utf8");
assert.ok(!appJs.includes("ലേഖനങ്ങൾ ഉൾക്കൊള്ളുന്നു"), "Book card count text must be deleted from app.js");
assert.ok(!appJs.includes("carousel-prev") && !appJs.includes("carousel-next") && !appJs.includes("carousel-section-header"),
  "Carousel < and > buttons must be removed from app.js");
console.log("  [OK] app.js removes book chapter count line and carousel < > arrows.");

const stylesCss = fs.readFileSync("styles.css", "utf8");
assert.ok(stylesCss.includes("padding-top: 6px !important"), "styles.css should tighten top spacing under navbar");
assert.ok(stylesCss.includes("margin: 0.15rem 0 1.25rem"), "styles.css should move carousel closer to navbar with clean gap");
console.log("  [OK] styles.css pulls top scrolling carousel closer to navbar cleanly.");

const fbConfig = fs.readFileSync("firebase-config.js", "utf8");
assert.ok(fbConfig.includes("persistentLocalCache") && fbConfig.includes("persistentMultipleTabManager"));
assert.ok(fbConfig.includes("response.status === 429") && fbConfig.includes("queuedFirestoreFetch"));
console.log("  [OK] firebase-config.js integrates persistent cache + queuedFirestoreFetch + 429 handling.");

const articleHtml = fs.readFileSync("article.html", "utf8");
assert.ok(articleHtml.includes("function isChapter("), "article.html must define isChapter at script scope");
assert.ok(articleHtml.includes("searchLocalArticlesPool") && articleHtml.includes("FALLBACK_ARTICLES"));
assert.ok(articleHtml.includes("checkIsRateLimited") && articleHtml.includes("markFirestoreRateLimited"));
assert.ok(articleHtml.includes("art-body-error-card") && articleHtml.includes("retry-article-body-btn"));
assert.ok(articleHtml.includes("nuqthaRetryArticleLoad"), "article.html must provide non-blank retry UI on body/doc failure");
console.log("  [OK] article.html defines isChapter, slug lookup, queued fetches, and non-blank body retry UI.");

const indexHtml = fs.readFileSync("index.html", "utf8");
const swJs = fs.readFileSync("public/sw.js", "utf8");
assert.ok(indexHtml.includes("./app.js?v=8") && swJs.includes("nuqtha-shell-v8"));
assert.ok(fs.existsSync("public/assets/malamukalile-cover.jpg"), "public/assets/malamukalile-cover.jpg must exist to prevent 404");
assert.ok(fs.existsSync("public/assets/imamumaarude-jeevitham-cover.jpg"), "public/assets/imamumaarude-jeevitham-cover.jpg must exist");
assert.ok(appJs.includes("fallbackBookPool") && appJs.includes("FALLBACK_BOOKS"), "app.js must fall back to FALLBACK_BOOKS when Firestore books list is rate-limited");
assert.ok(appJs.includes("mergeCategoryOptions([], publishedCombined"), "app.js must derive categories from available articles if Firestore categories 429 on cold load");
console.log("  [OK] Cache busters (v8), cover assets on disk, and app.js book/category 429 fallbacks verified.");

// 2. TTL Cache & Slug Index Behavior
writeArticlesListCache([
  { id: "art-123", slug: "badr-history", title: "ബദ്ർ", category: "History", status: "published" },
  { id: "book-456", slug: "umaviyya-khilafah", title: "ഉമവിയ്യ ഖിലാഫത്ത്", type: "BOOK", isBook: true, status: "published" }
]);
const listHit = readArticlesListCache();
assert.equal(listHit.data.length, 2);
assert.equal(lookupSlugMapping("badr-history")?.id, "art-123");
assert.equal(lookupSlugMapping("badr-history")?.col, "articles");
assert.equal(lookupSlugMapping("umaviyya-khilafah")?.id, "book-456");
assert.equal(lookupSlugMapping("umaviyya-khilafah")?.col, "books");

// Simulate fresh reload where only localStorage remains
globalThis.sessionStorage.clear();
const mappedFromLocal = lookupSlugMapping("badr-history");
assert.equal(mappedFromLocal?.id, "art-123");

saveCachedArticleDoc({
  id: "art-123",
  slug: "badr-history",
  title: "ബദ്ർ",
  content: "Full article body paragraph",
  status: "published"
});
const fullDoc = getCachedArticleDoc("badr-history");
assert.equal(fullDoc?.content, "Full article body paragraph");

writeTtlCache("test_ttl_expired", { ok: true });
assert.equal(readTtlCache("test_ttl_expired", -1), null);
assert.deepEqual(readTtlCache("test_ttl_expired", -1, { allowExpired: true })?.data, { ok: true });
console.log("  [OK] Memory + sessionStorage + localStorage TTL cache & slug index work across reloads.");

// 3. Request Deduplication (in-flight sharing)
let concurrentCalls = 0;
const dedupeResults = await Promise.all([
  dedupeInFlight("same-doc", async () => { concurrentCalls += 1; await new Promise(r => setTimeout(r, 20)); return { id: "doc-1" }; }),
  dedupeInFlight("same-doc", async () => { concurrentCalls += 1; return { id: "doc-2" }; }),
  dedupeInFlight("same-doc", async () => { concurrentCalls += 1; return { id: "doc-3" }; })
]);
assert.equal(concurrentCalls, 1, "Concurrent callers with same key must share one in-flight promise");
assert.deepEqual(dedupeResults.map(r => r.id), ["doc-1", "doc-1", "doc-1"]);
console.log("  [OK] In-flight request deduplication shares 1 request across concurrent callers.");

// 4. Priority Queue & Bounded 429 Exponential Backoff
clearFirestoreRateLimit();
const origFetch = globalThis.fetch;
let attemptCounter = 0;
globalThis.fetch = async (url) => {
  attemptCounter += 1;
  if (attemptCounter <= 2) {
    return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
  }
  return new Response(JSON.stringify({ ok: true, url }), { status: 200 });
};

const fgRes = await queuedFirestoreFetch("https://firestore.googleapis.com/v1/test-doc", {}, {
  priority: PRIORITY_FOREGROUND,
  max429Retries: 2,
  baseBackoffMs: 20
});
assert.equal(fgRes.status, 200, "Foreground fetch should recover after bounded 429 exponential backoff");
assert.equal(attemptCounter, 3);
assert.equal(checkIsRateLimited({ scope: "background" }), true, "429 sets background cooldown so background fetches yield");

// Background request should NOT hit fetch while background cooldown is active
let bgFetchCalls = 0;
globalThis.fetch = async () => {
  bgFetchCalls += 1;
  return new Response("{}", { status: 200 });
};
const bgRes = await queuedFirestoreFetch("https://firestore.googleapis.com/v1/bg-list", {}, {
  priority: PRIORITY_BACKGROUND
});
assert.equal(bgRes.status, 429);
assert.equal(bgFetchCalls, 0, "Background fetches must short-circuit during 429 cooldown without starving quota");

// Priority ordering: foreground preempts background in queue
clearFirestoreRateLimit();
const execOrder = [];
const slowTask1 = enqueueFirestoreTask(() => new Promise(r => setTimeout(() => { execOrder.push("seed-1"); r(); }, 25)), { priority: PRIORITY_BACKGROUND });
const slowTask2 = enqueueFirestoreTask(() => new Promise(r => setTimeout(() => { execOrder.push("seed-2"); r(); }, 25)), { priority: PRIORITY_BACKGROUND });
const bgQueued = enqueueFirestoreTask(() => { execOrder.push("bg-queued"); }, { priority: PRIORITY_BACKGROUND });
const fgQueued = enqueueFirestoreTask(() => { execOrder.push("fg-queued"); }, { priority: PRIORITY_FOREGROUND });
await Promise.all([slowTask1, slowTask2, bgQueued, fgQueued]);
assert.ok(execOrder.indexOf("fg-queued") < execOrder.indexOf("bg-queued"),
  `Expected foreground task before queued background task, got ${JSON.stringify(execOrder)}`);

markFirestoreRateLimited(5000, { scope: "foreground" });
assert.equal(checkIsRateLimited({ scope: "foreground" }), true);
clearFirestoreRateLimit();
assert.equal(checkIsRateLimited({ scope: "foreground" }), false);

clearFirestoreRateLimit();
let normalAttempts = 0;
globalThis.fetch = async () => {
  normalAttempts += 1;
  if (normalAttempts === 1) {
    return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
const normalRes = await queuedFirestoreFetch("https://firestore.googleapis.com/v1/test-list", {}, {
  priority: cacheMod.PRIORITY_NORMAL,
  max429Retries: 1,
  baseBackoffMs: 20
});
assert.equal(normalRes.status, 200, "PRIORITY_NORMAL list fetch should execute bounded 429 retry without self-blocking");
assert.equal(normalAttempts, 2);

// 5. Large list cache (>240KB old threshold) still persists to storage
const largeArticles = Array.from({ length: 120 }, (_, idx) => ({
  id: `art-big-${idx}`,
  slug: `art-big-${idx}`,
  title: `തലക്കെട്ട് ${idx}`,
  excerpt: "ഉദാഹരണം ".repeat(180),
  status: "published"
}));
const savedLarge = writeArticlesListCache(largeArticles);
assert.equal(savedLarge, true, "Large article list cache must persist cleanly via raised limit/compaction");
assert.equal(readArticlesListCache()?.data?.length, 120);

globalThis.fetch = origFetch;
console.log("  [OK] Priority queue preemption, normal-list 429 retry, and large-list cache persistence verified.");
console.log("==================================================");
console.log("PASS: ALL FIRESTORE CACHE, 429 QUEUE & UI TESTS PASSED!");
console.log("==================================================");
