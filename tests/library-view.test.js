/**
 * Test: 3D Interactive Library View & Admin Manager Implementation
 */
import assert from "node:assert";
import fs from "node:fs";

console.log("==================================================");
console.log("RUNNING 3D LIBRARY VIEW & ADMIN INTEGRATION TESTS");
console.log("==================================================");

// ─── Test 1: Verify library.css rules and performance constraints ───
console.log("Test 1: Verifying library.css rules, variables, and animations...");
const libCss = fs.readFileSync("nuqtha/library.css", "utf8");

assert.ok(libCss.includes("--wall:"), "library.css must define --wall variable");
assert.ok(libCss.includes("--wood:"), "library.css must define --wood variable");
assert.ok(libCss.includes("--paper:"), "library.css must define --paper variable");
assert.ok(libCss.includes(".lib-case"), "library.css must define .lib-case bookshelf container");
assert.ok(libCss.includes(".book"), "library.css must define .book style");
assert.ok(libCss.includes(".paper"), "library.css must define .paper table reading item style");
assert.ok(libCss.includes("#lib-reader"), "library.css must define #lib-reader modal");
assert.ok(libCss.includes("#lib-stage"), "library.css must define #lib-stage with 3D perspective");
assert.ok(libCss.includes("#lib-close"), "library.css must define #lib-close button");
assert.ok(libCss.includes("prefers-reduced-motion"), "library.css must support prefers-reduced-motion");
assert.ok(libCss.includes("#feed[hidden]") && libCss.includes("#library[hidden]"), "library.css must guarantee display: none !important for hidden attribute");

console.log("  [OK] library.css contains all required 3D shelf, table, book, and reader styles.");

// ─── Test 2: Verify library.js dynamic lazy module and performance guardrails ───
console.log("Test 2: Verifying library.js logic, caching, and low-end phone optimizations...");
const libJs = fs.readFileSync("nuqtha/library.js", "utf8");

assert.ok(libJs.includes("export async function mountLibrary"), "library.js must export mountLibrary");
assert.ok(libJs.includes('import { getCachedAuthUser } from "./js/auth-system.js"'), "library item navigation must check authentication");
assert.ok(libJs.includes('import { openAuthModal } from "./js/auth-ui.js"'), "library item navigation must use the existing login modal");
assert.ok(libJs.includes('window.addEventListener("nuqtha_auth_changed"'), "library item navigation must resume after successful sign-in");
assert.ok(libJs.includes('window.addEventListener("nuqtha:auth-modal-closed"'), "library item navigation must clear abandoned login requests");
assert.ok(libJs.includes('el.addEventListener("click", () => openLibraryItem(b))'), "book clicks must open the book's actual destination");
assert.ok(libJs.includes('p.addEventListener("click", () => openLibraryItem(a))'), "article clicks must open the article's actual destination");
assert.ok(libJs.includes('window.location.assign(destination.href)'), "authenticated library item clicks must navigate to their actual page");
assert.ok(libJs.includes('type: "BOOK"') && libJs.includes("isBook: true"), "library book records must retain book routing and paywall semantics");
assert.ok(libJs.includes('MAX_BOOKS = 6'), "library.js must limit to MAX_BOOKS = 6");
assert.ok(libJs.includes('MAX_PAPERS = 5'), "library.js must limit to MAX_PAPERS = 5");
assert.ok(libJs.includes('sessionStorage.getItem(CACHE_KEY)'), "library.js must cache data in sessionStorage");
assert.ok(libJs.includes('nuqtha:library:v2'), "library.js must version cached book routes and article metadata");
assert.ok(libJs.includes('navigator.deviceMemory') && libJs.includes('navigator.hardwareConcurrency'), "library.js must check deviceMemory and hardwareConcurrency for low-end device optimization");
assert.ok(libJs.includes('esc ='), "library.js must escape all Firestore text via esc()");
assert.ok(libJs.includes('from "./firebase-config.js"'), "library.js must import db from ./firebase-config.js");
assert.ok(libJs.includes('FALLBACK_BOOKS') && libJs.includes('FALLBACK_ARTICLE_ITEMS'), "library.js must load book and article fallback datasets");
assert.ok(!libJs.includes('from "./app.js"'), "library.js must not load app.js just to access fallback data");

console.log("  [OK] library.js correctly implements dynamic lazy loading, 5-minute caching, and low-end hardware fallbacks.");

// ─── Test 3: Verify admin-library.js logic and DOM contract ───
console.log("Test 3: Verifying admin-library.js management panel...");
const adminLibJs = fs.readFileSync("nuqtha/admin-library.js", "utf8");
const adminJs = fs.readFileSync("nuqtha/admin.js", "utf8");

assert.ok(adminLibJs.includes("export async function initLibraryAdmin"), "admin-library.js must export initLibraryAdmin");
assert.ok(adminLibJs.includes('id="bk-form"'), "admin-library.js must contain #bk-form for book editing");
assert.ok(adminLibJs.includes('id="bk-list"'), "admin-library.js must contain #bk-list for current books");
assert.ok(adminLibJs.includes('id="tb-list"'), "admin-library.js must contain #tb-list for table articles");
assert.ok(adminLibJs.includes('MAX_BOOKS = 6'), "admin-library.js must validate shelf limit of 6 books");
assert.ok(adminLibJs.includes('MAX_PAPERS = 5'), "admin-library.js must validate table limit of 5 papers");
assert.ok(adminLibJs.includes('showOnTable:'), "admin-library.js must toggle showOnTable flag on articles");
assert.ok(adminLibJs.includes('name="bk-import-type"'), "admin-library.js must contain toggle/radio for Import Book vs Import Article");
assert.ok(adminLibJs.includes('value="article"'), "admin-library.js must support article import mode");
assert.ok(adminLibJs.includes('field("title").value = item.title'), "admin-library.js must auto-fill title from selected article");
assert.ok(adminLibJs.includes('field("author").value = item.author'), "admin-library.js must auto-fill author from selected article");
assert.ok(adminLibJs.includes('form.elements.namedItem(name)'), "admin-library.js must access form fields without colliding with HTMLFormElement.id");
assert.ok(!adminLibJs.includes("form.id.value"), "admin-library.js must not read or write the form's built-in id property as a field");
assert.ok(adminLibJs.includes(".filter(isValidBookRecord)"), "admin-library.js must exclude invalid Firestore book documents");
assert.ok(adminLibJs.includes("if (total) total.textContent = `${books.length} total`"), "admin-library.js book count must match rendered valid records");
assert.ok(adminLibJs.includes("id: d.id"), "admin-library.js must use the authoritative Firestore document ID");
assert.ok(adminJs.includes("if (!art || !getValidBookTitle(art)) return false;"), "admin.js must exclude books without a valid title");
assert.ok(adminJs.includes("const totalBooks = books.length;"), "admin.js book count must match the deduplicated rendered list");
assert.ok(adminJs.includes("if (Array.isArray(art.chapters) && art.chapters.length > 0) return true;"), "admin.js must recognize legacy books with chapter records without treating every empty article array as a book");
assert.ok(adminLibJs.includes("(Array.isArray(record.chapters) && record.chapters.length > 0)"), "admin-library.js must not classify ordinary documents with empty chapter arrays as books");
assert.ok(adminJs.includes("bookName && title && bookName === title"), "admin.js must recognize legacy book documents by matching book and document titles");
assert.ok(adminJs.includes('data-action="add-chapter-to-book"'), "admin.js book cards must expose chapter actions through event delegation");
assert.ok(adminJs.includes('case "add-chapter-to-book"'), "admin.js must dispatch delegated chapter actions");
assert.strictEqual((adminJs.match(/case "add-chapter-to-book"/g) || []).length, 1, "admin.js must not register duplicate chapter action cases");
assert.ok(!/data-action="(?:edit-article|delete-article|manage-book|edit-book-meta|delete-book)"[^>]*onclick=/.test(adminJs), "admin.js delegated actions must not also invoke inline handlers");
assert.ok(adminJs.includes("id: articleDoc.id"), "admin.js must use authoritative Firestore IDs for action bindings");

console.log("  [OK] admin-library.js contains all required management forms, limits, dual article/book import, and Firestore actions.");

// ─── Test 4: Verify index.html view switcher and container ───
console.log("Test 4: Verifying index.html drawer link and library container...");
const indexHtml = fs.readFileSync("nuqtha/index.html", "utf8");

assert.ok(indexHtml.includes('id="library"') && indexHtml.includes('hidden'), "index.html must contain section#library with hidden attribute");
assert.ok(indexHtml.includes('id="drawer-library-link"'), "index.html drawer must contain drawer-library-link");
assert.ok(!indexHtml.includes('id="view-switch"'), "index.html must not contain the top view-switch toggle (moved to 3-lines drawer)");
assert.ok(!indexHtml.includes('id="view-articles"') && !indexHtml.includes('id="view-library"'), "index.html must not contain unused article/library toggle buttons");

console.log("  [OK] index.html correctly integrates #library section and drawer shortcut without navbar toggle clutter.");

// ─── Test 5: Verify app.js dynamic lazy loading wiring ───
console.log("Test 5: Verifying app.js dynamic import and view switching...");
const appJs = fs.readFileSync("nuqtha/app.js", "utf8");

assert.ok(appJs.includes("setupLibraryView"), "app.js must define and call setupLibraryView()");
assert.ok(appJs.includes('import("./library.js")'), "app.js must dynamically import ./library.js only when opened");
assert.ok(appJs.includes('feed.hidden = isLib'), "app.js must toggle feed.hidden");
assert.ok(appJs.includes('lib.hidden = !isLib'), "app.js must toggle lib.hidden");
assert.ok(appJs.includes('window.showNuqthaView("articles")'), "app.js category switching must reset view back to articles");
assert.ok(!appJs.includes('view-articles') && !appJs.includes('view-library'), "app.js must not wire unused navbar toggle buttons");

console.log("  [OK] app.js correctly wires dynamic import and view toggling without polluting initial bundle.");

// ─── Test 6: Verify admin.html and admin.js integration ───
console.log("Test 6: Verifying admin.html and admin.js integration...");
const adminHtml = fs.readFileSync("nuqtha/admin.html", "utf8");

assert.ok(adminHtml.includes('data-tab="library"'), "admin.html must contain tab button for library");
assert.ok(adminHtml.includes('id="library-admin"'), "admin.html must contain #library-admin container");
assert.ok(adminHtml.includes('name="bk-import-type"'), "admin.html must contain radio options for Import Book vs Import Article");
assert.ok(adminHtml.includes('id="bk-existing-select"'), "admin.html must contain bk-existing-select dropdown");
assert.ok(adminJs.includes('import { initLibraryAdmin } from "./admin-library.js"'), "admin.js must import initLibraryAdmin");
assert.ok(adminJs.includes('tabName === "library"'), "admin.js must handle tabName === 'library'");

console.log("  [OK] Admin panel correctly wires Library tab, container, dual article/book import UI, and lazy initialization.");

console.log("==================================================");
console.log("PASS: ALL 3D LIBRARY TESTS PASSED SUCCESSFULLY!");
console.log("==================================================");
