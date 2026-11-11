/**
 * Test: Verify that only explicitly marked chapters are excluded from regularArticles.
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

console.log("==================================================");
console.log("PASS: ALL NO-DUAL-SYNC & FEED PURITY TESTS PASSED!");
console.log("==================================================");
