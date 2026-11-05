/**
 * Dual Content Coexistence & Dynamic Route Resolution Verification
 */
import assert from "assert";
import {
    normalizeArticleDoc,
    getStoryUrl,
    slugifyText
} from "../schema-validator.js";

console.log("==================================================");
console.log("RUNNING DUAL CONTENT & ROUTE RESOLUTION TEST SUITE");
console.log("==================================================");

// 1. Dual Content Support Verification
console.log("Test 1: Verifying Dual Content Coexistence...");

const badrBook = normalizeArticleDoc({
    title: "ബദ്ർ ചരിത്രം",
    type: "BOOK",
    isBook: true,
    isChapter: false,
    slug: "badr-charitham",
    category: "Premium Book"
}, "badr-charitham");

const badrArticle1 = normalizeArticleDoc({
    title: "ബദ്ർ; ചരിത്രവും ഖുർആനിന്റെ പ്രവചനവും",
    type: "ARTICLE",
    bookName: "ബദ്ർ ചരിത്രം",
    category: "HISTORY",
    slug: "badr-charithravum-khuraaninte-pravachanavum"
}, "Eo2dScGYL4ltYBALfozM");

const badrArticle2 = normalizeArticleDoc({
    title: "ബദ്ർ; ലക്ഷ്യവും പാഠങ്ങളും",
    type: "ARTICLE",
    category: "STUDY",
    slug: "badr-lakshyavum-paadhangalum"
}, "9mY98jTWd0t6VFeIK2WX");

const mockArticlesPool = [badrBook, badrArticle1, badrArticle2];

const isBookCoverItem = (a) => ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && !a.isChapter;
const bookCovers = mockArticlesPool.filter(isBookCoverItem);
const regularArticles = mockArticlesPool.filter(a => !isBookCoverItem(a));

assert.strictEqual(bookCovers.length, 1, "Expected exactly 1 book cover");
assert.strictEqual(bookCovers[0].id, "badr-charitham", "Expected badr-charitham as book cover");

assert.strictEqual(regularArticles.length, 2, "Expected 2 regular articles in feed");
assert(regularArticles.some(a => a.id === "Eo2dScGYL4ltYBALfozM"), "Badr article 1 must NOT be hidden");
assert(regularArticles.some(a => a.id === "9mY98jTWd0t6VFeIK2WX"), "Badr article 2 must NOT be hidden");
console.log("  [OK] Badr Book and Badr Articles coexist without hiding each other.");

// 2. Route & Slug Sanitizer Verification
console.log("Test 2: Verifying recursive prefix strip & clean URLs...");

function cleanRouteSlug(str) {
    if (!str) return "";
    let s = String(str).trim();
    for (let i = 0; i < 4; i++) {
        if (!s.includes("%")) break;
        try {
            const decoded = decodeURIComponent(s);
            if (decoded === s) break;
            s = decoded;
        } catch (_) {
            break;
        }
    }
    s = s.split("?")[0].split("#")[0].trim();
    s = s.replace(/^\/+|\/+$/g, "");
    for (let i = 0; i < 4; i++) {
        s = s.replace(/^(?:book|story|article)[\/\\]+/gi, "")
             .replace(/^2f/gi, "")
             .replace(/^\/+|\/+$/g, "");
    }
    s = s.replace(/\/(?:index(?:\.html)?)?$/gi, "");
    return s.trim();
}

const dirtyInputs = [
    "book%2Fabbaasiyya-khilaaphathth",
    "book/abbaasiyya-khilaaphathth",
    "book/book%2Fabbaasiyya-khilaaphathth",
    "book/book/abbaasiyya-khilaaphathth",
    "2fbook%2Fabbaasiyya-khilaaphathth",
    "/book/abbaasiyya-khilaaphathth/"
];

dirtyInputs.forEach(input => {
    const cleaned = cleanRouteSlug(input);
    assert.strictEqual(cleaned, "abbaasiyya-khilaaphathth", `Failed on input: ${input}, got: ${cleaned}`);
});
console.log("  [OK] cleanRouteSlug handles nested 'book%2F', 'book/', and duplicate prefixes flawlessly.");

// 3. getStoryUrl produces pristine clean URLs
console.log("Test 3: Verifying getStoryUrl for all 4 books...");

const booksList = [
    { id: "57iJx0eBBXQKKF2MMRM6", title: "അബ്ബാസിയ്യ ഖിലാഫത്ത്", slug: "abbaasiyya-khilaaphathth", type: "BOOK", isBook: true },
    { id: "E1MuU9fm0RwrKEfsWqKP", title: "ഉമവിയ്യ ഖിലാഫത്ത്", slug: "umaviyya-khilaaphathth", type: "BOOK", isBook: true },
    { id: "QLO71LUik9O7DTkQ7v3p", title: "ഇമാമുമാരുടെ ജീവിതം", slug: "imamumaarude-jeevitham", type: "BOOK", isBook: true },
    { id: "badr-charitham", title: "ബദ്ർ ചരിത്രം", slug: "badr-charitham", type: "BOOK", isBook: true }
];

const expectedUrls = [
    "/book/abbaasiyya-khilaaphathth",
    "/book/umaviyya-khilaaphathth",
    "/book/imamumaarude-jeevitham",
    "/book/badr-charitham"
];

booksList.forEach((bk, i) => {
    const url = getStoryUrl(bk);
    assert.strictEqual(url, expectedUrls[i], `Expected ${expectedUrls[i]}, got ${url}`);
});
console.log("  [OK] All 4 books generate clean /book/:slug URLs.");

console.log("==================================================");
console.log("PASS: ALL DUAL CONTENT & ROUTING TESTS PASSED!");
console.log("==================================================");

