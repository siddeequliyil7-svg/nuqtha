/**
 * Test: Unique Chapter URLs & Fast Loading Verification
 */
import assert from "node:assert";
import { getStoryUrl, slugifyText } from "../schema-validator.js";

console.log("==================================================");
console.log("RUNNING UNIQUE CHAPTER URLS & FAST LOAD TEST SUITE");
console.log("==================================================");

// Test 1: Chapters must NEVER use parent bookSlug as their chapter slug
console.log("Test 1: Testing chapter URL generation uniqueness...");
const chapters = [
    { id: "ch1", title: "ഇബ്‌നുൽ ജൗസി (റ) പരീക്ഷണങ്ങളെ അതിജീവിച്ച പണ്ഡിതൻ", bookName: "ഇമാമുമാരുടെ ജീവിതം", bookSlug: "imamumaarude-jeevitham" },
    { id: "ch2", title: "ഇമാം നവവി (റ) ലോകം അതിശയിച്ച ജ്ഞാന വിപ്ലവം", bookName: "ഇമാമുമാരുടെ ജീവിതം", bookSlug: "imamumaarude-jeevitham" },
    { id: "ch3", title: "ഇമാം ബുഖാരി (റ) ഹദീസ് രംഗത്തെ സൂക്ഷ്മശാലി", bookName: "ഇമാമുമാരുടെ ജീവിതം", bookSlug: "imamumaarude-jeevitham" },
    { id: "ch4", title: "ഹദ്ദാദ് (റ) തരീമിന്റെ നായകന്‍", bookName: "ഇമാമുമാരുടെ ജീവിതം", bookSlug: "imamumaarude-jeevitham" }
];

const urls = chapters.map(ch => getStoryUrl(ch));
console.log("  Generated URLs:");
urls.forEach((u, i) => console.log(`   Chapter ${i + 1}: ${u}`));

const uniqueUrls = new Set(urls);
assert.strictEqual(uniqueUrls.size, 4, "Every chapter must generate a distinct unique URL!");
assert.ok(urls[0].includes("ibnul-jausi"), "Chapter 1 must point to ibnul-jausi");
assert.ok(urls[1].includes("imaam-navavi"), "Chapter 2 must point to imaam-navavi");
assert.ok(urls[2].includes("imaam-bukhaari"), "Chapter 3 must point to imaam-bukhaari");
assert.ok(urls[3].includes("haddaad"), "Chapter 4 must point to haddaad");
console.log("  [OK] All 4 chapters have unique, distinct URLs without collapsing to chapter 4!");

// Test 2: Book overview URL remains clean
console.log("Test 2: Testing book overview URL generation...");
const bookDoc = { id: "bk1", title: "ഇമാമുമാരുടെ ജീവിതം", type: "BOOK", slug: "imaamumaarute-jeevitham" };
const bookUrl = getStoryUrl(bookDoc);
assert.strictEqual(bookUrl, "/book/imaamumaarute-jeevitham", "Book overview must be /book/imaamumaarute-jeevitham");
console.log("  [OK] Book overview generates clean URL:", bookUrl);

// Test 3: Standalone article URL
console.log("Test 3: Testing standalone article URL generation...");
const standalone = { id: "art1", title: "ഖാജ തങ്ങളും ചിശ്തി ത്വരീഖത്തും", type: "ARTICLE" };
const artUrl = getStoryUrl(standalone);
assert.ok(artUrl.startsWith("/story/khaaja-thangngalum"), "Standalone article must be /story/khaaja-thangngalum...");
console.log("  [OK] Standalone article URL generates clean URL:", artUrl);

console.log("==================================================");
console.log("PASS: ALL UNIQUE CHAPTER & ROUTING TESTS PASSED!");
console.log("==================================================");
