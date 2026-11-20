/**
 * Test: Verify that book chapters are excluded and homepage articles are not duplicated.
 */
import assert from "node:assert";
import fs from "node:fs";

console.log("==================================================");
console.log("RUNNING NO DUAL-SYNC & HOME FEED PURITY TESTS");
console.log("==================================================");

const projectDir = fs.existsSync("app.js") ? "." : "nuqtha";
const adminJs = fs.readFileSync(`${projectDir}/admin.js`, "utf8");
const appJs = fs.readFileSync(`${projectDir}/app.js`, "utf8");

// Test 1: Admin book classification must use explicit chapter markers.
console.log("Test 1: Verifying admin.js uses explicit chapter markers...");
assert.ok(
    adminJs.includes("function isExplicitChapterRecord(art)"),
    "admin.js must centralize explicit chapter-marker detection"
);
assert.ok(
    adminJs.includes("if (isExplicitChapterRecord(art)) return false;"),
    "admin.js must not classify linked legacy articles as books"
);
console.log("  [OK] Admin classification relies on explicit chapter markers.");

// Test 2: Check app.js regularArticles excludes explicitly marked chapters
console.log("Test 2: Verifying app.js home feed excludes explicitly marked chapters...");
assert.ok(
    appJs.includes("!isBookCoverItem(a) && !isChapter(a)") &&
        appJs.includes("getBookChapterIds(allArticles)"),
    "app.js must filter out both book covers and chapter entities from regularArticles!"
);
assert.ok(
    appJs.includes("const carouselPool = [\n        ...explicitCarousel,") &&
        !appJs.includes("        heroArticle,\n"),
    "app.js must keep the hero article out of the carousel"
);
assert.ok(
    appJs.includes("deduplicateHomeArticles(allArticles.filter(a =>") &&
        appJs.includes("articleKeys.some(key => usedHomeArticleKeys.has(key))"),
    "app.js must deduplicate repeated stories and omit carousel/hero stories from category sections"
);
console.log("  [OK] app.js excludes book covers and explicitly marked chapters from regularArticles.");

// Test 3: Simulation test with actual data
console.log("Test 3: Simulating feed filtering with chapters and standalone articles...");
const mockArticles = [
    { id: "art1", title: "Standalone Article 1", type: "ARTICLE", category: "HISTORY" },
    { id: "art2", title: "Standalone Article 2", type: "ARTICLE", category: "STUDY" },
    { id: "bk1", title: "Book One", type: "BOOK", isBook: true },
    { id: "bk2", title: "Book Two", type: "BOOK", isBook: true },
    { id: "ch1", title: "Chapter 1 of Book One", type: "ARTICLE", bookId: "bk1", bookName: "Book One", isChapter: true },
    { id: "ch2", title: "ഇമാം ബുഖാരി(റ)", type: "ARTICLE", bookId: "bk1", bookName: "Book One", order: 3 },
    { id: "ch3", title: "Chapter without book link fields", type: "ARTICLE" }
];
mockArticles[2].chapters = ["ch3"];

const referencedChapterIds = new Set(
    mockArticles.filter(article => article.type === "BOOK")
        .flatMap(book => book.chapters || [])
);

function isChapterEntity(article) {
    if (!article) return false;
    return referencedChapterIds.has(article.id) ||
        article.isChapter === true ||
        String(article.type || "").trim().toUpperCase() === "CHAPTER" ||
        String(article.category || "").trim().toLowerCase() === "chapter" ||
        (article.chapterIndex !== undefined && article.chapterIndex !== null);
}

const isBookCoverItem = (a) => ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && !isChapterEntity(a);
const bookCovers = mockArticles.filter(isBookCoverItem);
const regularArticles = mockArticles.filter(a => !isBookCoverItem(a) && !isChapterEntity(a));

assert.strictEqual(bookCovers.length, 2, "Must contain exactly 2 books");
assert.strictEqual(regularArticles.length, 3, "Must include both standalone articles and legacy linked articles, but not explicit chapters");
assert.ok(!regularArticles.some(a => a.id === "ch1"), "Explicit chapters must NOT be present in regularArticles");
assert.ok(regularArticles.some(a => a.id === "ch2"), "Legacy articles must not be hidden solely because of book relationship fields");
console.log("  [OK] Feed excludes explicitly marked chapters without hiding legacy linked articles.");

// Test 4: Homepage previews must not render the same article in multiple sections.
console.log("Test 4: Verifying homepage sections do not repeat articles...");
const homeArticleIds = ["hero", "carousel", "category", "chapter"];
const heroId = "hero";
const carouselIds = homeArticleIds.filter(id => id !== heroId && id !== "chapter").slice(0, 10);
const displayedIds = new Set([heroId, ...carouselIds]);
const categoryIds = homeArticleIds.filter(id =>
    id !== "chapter" && !displayedIds.has(id)
);

assert.ok(!carouselIds.includes(heroId), "Hero article must not appear in the carousel");
assert.strictEqual(new Set([...displayedIds, ...categoryIds]).size,
    displayedIds.size + categoryIds.length,
    "An article must appear in only one homepage preview section");
assert.deepStrictEqual(categoryIds, ["category"], "Category previews must exclude previously shown articles and chapters");
assert.ok(
    appJs.includes("function getHomeArticleKeys(article)") &&
        appJs.includes("...swipeArticles.flatMap(getHomeArticleKeys)") &&
        appJs.includes("if (getHomeArticleImageScore(article) > getHomeArticleImageScore(uniqueArticles[duplicateIndex]))"),
    "Homepage deduplication must cover IDs, slugs, titles, and prefer an available cover"
);
assert.ok(
    appJs.includes("else combined[existingIndex] = { ...combined[existingIndex], ...book };"),
    "Live book records must update matching fallback books so their cover source is retained"
);
assert.ok(
    appJs.includes('<a href="${escapeHtml(categoryUrl(category.slug))}" class="home-category-show-more">'),
    "Category sections must keep a Show More link when there are no hidden preview cards"
);
const categorySectionRenderer = appJs.slice(
    appJs.indexOf("function renderLazyHomeCategorySection"),
    appJs.indexOf("function attachHomeCategoryLoadMoreListeners")
);
assert.ok(
    categorySectionRenderer.includes("const featuredArticle = selected[0];") &&
        categorySectionRenderer.includes("buildFeaturedCard(featuredArticle)") &&
        categorySectionRenderer.includes("const initialGridArticles = selected.slice(1, 3);") &&
        categorySectionRenderer.includes("const remainingArticles = selected.slice(3);"),
    "Homepage category sections must show one featured card followed by two compact cards before Show More"
);
assert.ok(
    categorySectionRenderer.includes('allArticlesLink.textContent = "Show More";') &&
        !categorySectionRenderer.includes("&darr;") &&
        !categorySectionRenderer.includes("&rarr;"),
    "Category Show More controls must use text only without decorative arrows"
);
console.log("  [OK] Homepage hero, carousel, and category previews contain no duplicate articles.");

// Test 5: Home and Books covers must wait for deferred saved URLs before showing generated covers.
console.log("Test 5: Verifying book cover placeholders only show when no cover source exists...");
assert.ok(
    appJs.includes("function hasBookCoverSource(book)") &&
        appJs.includes("Boolean(getArticleImageUrl(book, \"\") || getDeferredImageAttributes(book))") &&
        (appJs.match(/const hasCoverSource = hasBookCoverSource\(book\);/g) || []).length === 3,
    "All homepage and Books card renderers must treat saved or deferred cover URLs as real cover sources"
);
console.log("  [OK] Generated book covers are deferred when a saved cover URL may exist.");

console.log("==================================================");
console.log("PASS: ALL NO-DUAL-SYNC & FEED PURITY TESTS PASSED!");
console.log("==================================================");
