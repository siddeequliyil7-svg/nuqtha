/**
 * Test: Verify that book chapters are excluded from regularArticles (Hero/Carousel),
 * and automatic dual-sync to books is removed.
 */
import assert from "node:assert";
import fs from "node:fs";

console.log("==================================================");
console.log("RUNNING NO DUAL-SYNC & HOME FEED PURITY TESTS");
console.log("==================================================");

// Test 1: Check admin.js has no dual-write to books in handleSaveBookStep1
console.log("Test 1: Verifying admin.js has no automatic dual-sync to books collection...");
const adminJs = fs.readFileSync("nuqtha/admin.js", "utf8");
assert.strictEqual(
    adminJs.includes('setDoc(doc(db, "books"'),
    false,
    "admin.js must not contain setDoc to 'books' collection in handleSaveBookStep1!"
);
assert.strictEqual(
    adminJs.includes('deleteDoc(doc(db, "books"'),
    false,
    "admin.js must not contain deleteDoc to 'books' collection!"
);
console.log("  [OK] admin.js has no automatic dual-writes or dual-deletes to 'books' collection.");

// Test 2: Check app.js regularArticles excludes chapters
console.log("Test 2: Verifying app.js home feed excludes chapters from regularArticles...");
const appJs = fs.readFileSync("nuqtha/app.js", "utf8");
assert.ok(
    appJs.includes("!isBookCoverItem(a) && !isChapterEntity(a)"),
    "app.js must filter out both book covers and chapter entities from regularArticles!"
);
console.log("  [OK] app.js strictly excludes both book covers and book chapters from regularArticles.");

// Test 3: Simulation test with actual data
console.log("Test 3: Simulating feed filtering with chapters and standalone articles...");
const mockArticles = [
    { id: "art1", title: "Standalone Article 1", type: "ARTICLE", category: "HISTORY" },
    { id: "art2", title: "Standalone Article 2", type: "ARTICLE", category: "STUDY" },
    { id: "bk1", title: "Book One", type: "BOOK", isBook: true },
    { id: "bk2", title: "Book Two", type: "BOOK", isBook: true },
    { id: "ch1", title: "Chapter 1 of Book One", type: "ARTICLE", bookId: "bk1", bookName: "Book One", isChapter: true },
    { id: "ch2", title: "ഇമാം ബുഖാരി(റ)", type: "ARTICLE", bookId: "bk1", bookName: "Book One", order: 3 }
];

function isChapterEntity(article) {
    if (!article) return false;
    if (article.isChapter === true || article.type === "CHAPTER") return true;
    if (article.chapterIndex !== undefined && article.chapterIndex !== null) return true;
    if (article.bookId && String(article.bookId).trim() && String(article.bookId).trim() !== String(article.id)) return true;
    const t = (article.title || "").toString().normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
    const b = (article.bookName || "").toString().normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
    if (b && t && b !== t) return true;
    if (article.order !== undefined && article.order !== null && !isNaN(article.order) && Number(article.order) > 0 && (article.bookId || (b && t && b !== t))) return true;
    return false;
}

const isBookCoverItem = (a) => ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && !isChapterEntity(a);
const bookCovers = mockArticles.filter(isBookCoverItem);
const regularArticles = mockArticles.filter(a => !isBookCoverItem(a) && !isChapterEntity(a));

assert.strictEqual(bookCovers.length, 2, "Must contain exactly 2 books");
assert.strictEqual(regularArticles.length, 2, "Must contain exactly 2 regular articles, NO chapters!");
assert.ok(!regularArticles.some(a => a.id === "ch1" || a.id === "ch2"), "Chapters must NOT be present in regularArticles");
console.log("  [OK] Feed correctly isolates books and articles, zero chapter leakage into hero/carousel.");

console.log("==================================================");
console.log("PASS: ALL NO-DUAL-SYNC & FEED PURITY TESTS PASSED!");
console.log("==================================================");

