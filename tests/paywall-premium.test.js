/**
 * Unit & Integration Test Suite for NUQTHA Paywall & Premium Book Features
 */
import assert from "node:assert";
import { normalizeArticleDoc, getStoryUrl } from "../schema-validator.js";

console.log("==================================================");
console.log("RUNNING PAYWALL & PREMIUM BOOKS TEST SUITE");
console.log("==================================================");

// Test 1: getStoryUrl with dirty/double-encoded slugs
console.log("Test 1: Testing getStoryUrl cleaning...");
const book1 = { id: "57iJx0eBBXQKKF2MMRM6", title: "അബ്ബാസിയ്യ ഖിലാഫത്ത്", slug: "book/abbaasiyya-khilaaphathth", type: "BOOK" };
const url1 = getStoryUrl(book1);
assert.strictEqual(url1, "/book/abbaasiyya-khilaaphathth", `Expected /book/abbaasiyya-khilaaphathth, got ${url1}`);

const book2 = { id: "test", title: "Test", slug: "2fabbaasiyya-khilaaphathth", type: "BOOK" };
const url2 = getStoryUrl(book2);
assert.strictEqual(url2, "/book/abbaasiyya-khilaaphathth", `Expected /book/abbaasiyya-khilaaphathth, got ${url2}`);

const book3 = { id: "QLO71LUik9O7DTkQ7v3p", title: "ഇമാമുമാരുടെ ജീവിതം", slug: "imamumaarude-jeevitham", isBook: true };
const url3 = getStoryUrl(book3);
assert.strictEqual(url3, "/book/imamumaarude-jeevitham", `Expected /book/imamumaarude-jeevitham, got ${url3}`);
console.log("  [OK] getStoryUrl cleans prefixes and hex residues accurately.");

// Test 2: normalizeArticleDoc with isPremium, price, apkUrl
console.log("Test 2: Testing schema normalization for premium fields...");
const rawBookDoc = {
    title: "പ്രീമിയം പുസ്തകം",
    category: "Premium Book",
    type: "BOOK",
    isBook: true,
    price: "49",
    apkUrl: "https://nuqtha.com/app.apk"
};
const normBook = normalizeArticleDoc(rawBookDoc, "doc_prem_1");
assert.strictEqual(normBook.isPremium, true, "isPremium should be true for category 'Premium Book'");
assert.strictEqual(normBook.price, 49, "price should be normalized to number 49");
assert.strictEqual(normBook.apkUrl, "https://nuqtha.com/app.apk", "apkUrl should be preserved");

const rawFreeDoc = {
    title: "സൗജന്യ പുസ്തകം",
    category: "STUDY",
    type: "BOOK",
    isBook: true
};
const normFree = normalizeArticleDoc(rawFreeDoc, "doc_free_1");
assert.strictEqual(normFree.isPremium, false, "isPremium should be false for standard categories");
assert.strictEqual(normFree.price, 0, "default price should be 0");
console.log("  [OK] Schema normalizer correctly handles premium metadata.");

// Test 3: Chapter URL building
console.log("Test 3: Testing chapter URL structure...");
const chapter = {
    id: "ch_1",
    title: "ഹദ്ദാദ് (റ)",
    slug: "haddad-thareeminte-nayakan",
    bookName: "ഇമാമുമാരുടെ ജീവിതം",
    bookSlug: "imamumaarude-jeevitham",
    type: "CHAPTER"
};
const chUrl = getStoryUrl(chapter);
assert.strictEqual(chUrl, "/story/imamumaarude-jeevitham/haddad-thareeminte-nayakan", `Expected /story/imamumaarude-jeevitham/haddad-thareeminte-nayakan, got ${chUrl}`);
console.log("  [OK] Chapter URLs correctly routed under /story/:bookSlug/:chapterSlug.");

console.log("==================================================");
console.log("PASS: ALL PAYWALL & PREMIUM TESTS PASSED!");
console.log("==================================================");
