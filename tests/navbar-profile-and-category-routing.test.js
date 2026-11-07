/**
 * Test: Navbar styling, profile icon state (no fallback 'U' letter), and category routing fixes.
 */
import assert from "node:assert";
import fs from "node:fs";

// Mock window.location before importing
global.window = {
    location: {
        pathname: '/',
        protocol: 'https:'
    }
};

import {
    normalizeCategoryName,
    categorySlug,
    categoryUrl
} from "../js/category-link.js";

console.log("==================================================");
console.log("RUNNING NAVBAR, PROFILE ICON & CATEGORY ROUTING TESTS");
console.log("==================================================");

// ─── Test 1: Category URL generation on home vs subpages ───
console.log("Test 1: Verifying categoryUrl on home page vs article pages...");

// On home page:
assert.strictEqual(categoryUrl("HISTORY"), "#history", "On home page, categoryUrl('HISTORY') must return '#history' without leading slash");
assert.strictEqual(categoryUrl("STUDY"), "#study", "On home page, categoryUrl('STUDY') must return '#study'");
assert.strictEqual(categoryUrl("STORY"), "#story", "On home page, categoryUrl('STORY') must return '#story'");
assert.strictEqual(categoryUrl("BOOKS"), "#books", "On home page, categoryUrl('BOOKS') must return '#books'");
assert.strictEqual(categoryUrl("ALL"), "#home", "On home page, categoryUrl('ALL') must return '#home'");

// On article page:
global.window.location.pathname = '/article.html';
assert.strictEqual(categoryUrl("HISTORY"), "/#history", "On article page, categoryUrl('HISTORY') must return '/#history'");
assert.strictEqual(categoryUrl("BOOKS"), "/#books", "On article page, categoryUrl('BOOKS') must return '/#books'");
assert.strictEqual(categoryUrl("ALL"), "/", "On article page, categoryUrl('ALL') must return '/'");

console.log("  [OK] Category URL generation correctly uses in-page hash on Home and absolute path on subpages.");

// ─── Test 2: Category feed filtering logic (no stripping of articles with playlist/book names) ───
console.log("Test 2: Verifying category feed does NOT strip articles that have playlist/book names...");

const sampleArticles = [
    { id: "1", title: "History Article 1", category: "HISTORY", playlistName: "Islamic History Series" },
    { id: "2", title: "History Article 2", category: "history", bookName: "History Volume 1" },
    { id: "3", title: "Study Article 1", category: "STUDY" },
    { id: "4", title: "Story Article 1", category: "STORY" },
    { id: "5", title: "Dedicated Book Cover", type: "BOOK", isBook: true, category: "BOOKS" },
    { id: "6", title: "Book Chapter 1", type: "CHAPTER", isChapter: true, category: "HISTORY", bookId: "5" }
];

const isChapterEntity = (a) => a.isChapter === true || a.type === "CHAPTER";
const isBookCover = (a) => ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && !isChapterEntity(a);

const filterCategoryArticles = (articles, category) => {
    const targetNorm = normalizeCategoryName(category).toUpperCase();
    return articles.filter(a => {
        if (isBookCover(a)) return false;
        const catNorm = normalizeCategoryName(a.category).toUpperCase();
        return catNorm === targetNorm || 
               categorySlug(catNorm) === categorySlug(targetNorm) ||
               (targetNorm === "HISTORY" && (catNorm === "HISTORY" || catNorm === "ചരിത്രം")) ||
               (targetNorm === "STUDY" && (catNorm === "STUDY" || catNorm === "പഠനം")) ||
               (targetNorm === "STORY" && (catNorm === "STORY" || catNorm === "കഥ"));
    });
};

const historyResults = filterCategoryArticles(sampleArticles, "HISTORY");
assert.strictEqual(historyResults.length, 3, "All 3 history articles/chapters must be included (none stripped due to playlist/book name)");
assert.ok(historyResults.some(a => a.id === "1"), "Article with playlistName must be included in HISTORY feed");
assert.ok(historyResults.some(a => a.id === "2"), "Article with bookName & lowercase category must be included in HISTORY feed");
assert.ok(historyResults.some(a => a.id === "6"), "Chapter with bookId must be included in HISTORY feed");
assert.strictEqual(historyResults.some(a => a.id === "5"), false, "Dedicated book cover wrapper must be excluded from HISTORY feed");

console.log("  [OK] Category filtering keeps all relevant articles and chapters, excluding only book covers.");

// ─── Test 3: Top Navbar controls cleanup & Drawer Login/Logout ───
console.log("Test 3: Verifying Top Navbar cleanup (search + 3-lines menu only) and Drawer Login/Logout...");

const indexHtml = fs.readFileSync("nuqtha/index.html", "utf8");
const articleHtml = fs.readFileSync("nuqtha/article.html", "utf8");
const authUiJs = fs.readFileSync("nuqtha/js/auth-ui.js", "utf8");

// Top Navbar right actions: search button and hamburger 3-lines button present, profile avatar removed
assert.ok(
    indexHtml.includes('id="header-search-btn"'),
    "index.html must have header-search-btn in top navbar"
);
assert.ok(
    indexHtml.includes('id="sidebar-toggle-btn"'),
    "index.html must have sidebar-toggle-btn in top navbar"
);
assert.strictEqual(
    indexHtml.includes('id="header-auth-container"'),
    false,
    "index.html top navbar must NOT contain header-auth-container (profile icons fully removed from top navbar as requested)"
);

// Sidebar Drawer: Bottom Login / Logout section
assert.ok(
    indexHtml.includes('id="drawer-auth-section"'),
    "index.html sidebar drawer must contain drawer-auth-section"
);
assert.ok(
    indexHtml.includes('id="drawer-login-btn"'),
    "index.html sidebar drawer must contain drawer-login-btn for logged-out state"
);
assert.ok(
    indexHtml.includes('id="drawer-logout-btn"'),
    "index.html sidebar drawer must contain drawer-logout-btn for logged-in state"
);

// Verify that initial letter 'U' is completely removed
assert.strictEqual(
    indexHtml.includes('>U<'),
    false,
    "index.html must not contain hardcoded fallback initial 'U'!"
);
assert.strictEqual(
    articleHtml.includes('<span id="header-user-avatar-initial">U</span>'),
    false,
    "article.html must not contain hardcoded fallback initial 'U' in header-user-avatar-initial!"
);
assert.strictEqual(
    articleHtml.includes('<span id="dropdown-user-avatar-initial">U</span>'),
    false,
    "article.html must not contain hardcoded fallback initial 'U' in dropdown-user-avatar-initial!"
);

// Verify auth-ui.js does not fall back to "U" and wires drawer auth buttons
assert.strictEqual(
    authUiJs.includes('|| "U"'),
    false,
    "auth-ui.js must not contain fallback letter 'U'!"
);
assert.ok(
    authUiJs.includes('drawer-login-btn') && authUiJs.includes('drawer-logout-btn'),
    "auth-ui.js must wire drawer-login-btn and drawer-logout-btn"
);

// Top Navbar Left Section: Small Bordered Login / Logout under brand logo
assert.ok(
    indexHtml.includes('id="nav-login-btn"'),
    "index.html must have nav-login-btn under brand logo"
);
assert.ok(
    indexHtml.includes('id="nav-logout-btn"'),
    "index.html must have nav-logout-btn under brand logo"
);
assert.ok(
    authUiJs.includes('nav-login-btn') && authUiJs.includes('nav-logout-btn'),
    "auth-ui.js must wire nav-login-btn and nav-logout-btn"
);

console.log("  [OK] Top navbar is clean (search + 3-lines menu), user profile icons removed from top bar, and drawer login/logout implemented.");

// ─── Test 4: Navbar layout & responsiveness ───
console.log("Test 4: Verifying navbar layout & desktop/mobile alignment classes...");

assert.ok(
    indexHtml.includes('order-1 brand-badge'),
    "Brand logo must have order-1 for flex alignment"
);
assert.ok(
    indexHtml.includes('order-2 md:order-3 nav-actions'),
    "Nav actions must have order-2 md:order-3 for flex alignment"
);
assert.ok(
    indexHtml.includes('order-3 md:order-2') && indexHtml.includes('id="category-nav"'),
    "Category nav must have order-3 md:order-2 to sit centered on desktop and row 2 on mobile"
);

const stylesCss = fs.readFileSync("nuqtha/styles.css", "utf8");
assert.ok(
    stylesCss.includes('.top-canopy-band') && stylesCss.includes('height: 16px;') && stylesCss.includes('height: 20px;'),
    "top-canopy-band must have compact height (16px mobile, 20px desktop)"
);
assert.ok(
    stylesCss.includes('.category-pill-link,') && stylesCss.includes('z-index: 2;'),
    "Category links and badges must have z-index: 2 to prevent card stretched-link interception"
);

console.log("  [OK] Navbar layout, spacing, and z-index ordering correctly configured.");

console.log("==================================================");
console.log("PASS: ALL NAVBAR, PROFILE ICON & CATEGORY ROUTING TESTS PASSED!");
console.log("==================================================");
