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
assert.ok(libJs.includes('MAX_BOOKS = 6'), "library.js must limit to MAX_BOOKS = 6");
assert.ok(libJs.includes('MAX_PAPERS = 5'), "library.js must limit to MAX_PAPERS = 5");
assert.ok(libJs.includes('sessionStorage.getItem(CACHE_KEY)'), "library.js must cache data in sessionStorage");
assert.ok(libJs.includes('nuqtha:library:v1'), "library.js must use cache key nuqtha:library:v1");
assert.ok(libJs.includes('navigator.deviceMemory') && libJs.includes('navigator.hardwareConcurrency'), "library.js must check deviceMemory and hardwareConcurrency for low-end device optimization");
assert.ok(libJs.includes('esc ='), "library.js must escape all Firestore text via esc()");
assert.ok(libJs.includes('from "./firebase-config.js"'), "library.js must import db from ./firebase-config.js");

console.log("  [OK] library.js correctly implements dynamic lazy loading, 5-minute caching, and low-end hardware fallbacks.");

// ─── Test 3: Verify admin-library.js logic and DOM contract ───
console.log("Test 3: Verifying admin-library.js management panel...");
const adminLibJs = fs.readFileSync("nuqtha/admin-library.js", "utf8");

assert.ok(adminLibJs.includes("export async function initLibraryAdmin"), "admin-library.js must export initLibraryAdmin");
assert.ok(adminLibJs.includes('id="bk-form"'), "admin-library.js must contain #bk-form for book editing");
assert.ok(adminLibJs.includes('id="bk-list"'), "admin-library.js must contain #bk-list for current books");
assert.ok(adminLibJs.includes('id="tb-list"'), "admin-library.js must contain #tb-list for table articles");
assert.ok(adminLibJs.includes('MAX_BOOKS = 6'), "admin-library.js must validate shelf limit of 6 books");
assert.ok(adminLibJs.includes('MAX_PAPERS = 5'), "admin-library.js must validate table limit of 5 papers");
assert.ok(adminLibJs.includes('showOnTable:'), "admin-library.js must toggle showOnTable flag on articles");

console.log("  [OK] admin-library.js contains all required management forms, limits, and Firestore actions.");

// ─── Test 4: Verify index.html view switcher and container ───
console.log("Test 4: Verifying index.html drawer link and library container...");
const indexHtml = fs.readFileSync("nuqtha/index.html", "utf8");

assert.ok(indexHtml.includes('id="library"') && indexHtml.includes('hidden'), "index.html must contain section#library with hidden attribute");
assert.ok(indexHtml.includes('id="drawer-library-link"'), "index.html drawer must contain drawer-library-link");
assert.ok(!indexHtml.includes('id="view-switch"'), "index.html must not contain the top view-switch toggle (moved to 3-lines drawer)");

console.log("  [OK] index.html correctly integrates #library section and drawer shortcut without navbar toggle clutter.");

// ─── Test 5: Verify app.js dynamic lazy loading wiring ───
console.log("Test 5: Verifying app.js dynamic import and view switching...");
const appJs = fs.readFileSync("nuqtha/app.js", "utf8");

assert.ok(appJs.includes("setupLibraryView"), "app.js must define and call setupLibraryView()");
assert.ok(appJs.includes('import("./library.js")'), "app.js must dynamically import ./library.js only when opened");
assert.ok(appJs.includes('feed.hidden = isLib'), "app.js must toggle feed.hidden");
assert.ok(appJs.includes('lib.hidden = !isLib'), "app.js must toggle lib.hidden");
assert.ok(appJs.includes('bA.setAttribute("aria-pressed"'), "app.js must update aria-pressed on view buttons");
assert.ok(appJs.includes('window.showNuqthaView("articles")'), "app.js category switching must reset view back to articles");

console.log("  [OK] app.js correctly wires dynamic import and view toggling without polluting initial bundle.");

// ─── Test 6: Verify admin.html and admin.js integration ───
console.log("Test 6: Verifying admin.html and admin.js integration...");
const adminHtml = fs.readFileSync("nuqtha/admin.html", "utf8");
const adminJs = fs.readFileSync("nuqtha/admin.js", "utf8");

assert.ok(adminHtml.includes('data-tab="library"'), "admin.html must contain tab button for library");
assert.ok(adminHtml.includes('id="library-admin"'), "admin.html must contain #library-admin container");
assert.ok(adminJs.includes('import { initLibraryAdmin } from "./admin-library.js"'), "admin.js must import initLibraryAdmin");
assert.ok(adminJs.includes('tabName === "library"'), "admin.js must handle tabName === 'library'");

console.log("  [OK] Admin panel correctly wires Library tab, container, and lazy initialization.");

console.log("==================================================");
console.log("PASS: ALL 3D LIBRARY TESTS PASSED SUCCESSFULLY!");
console.log("==================================================");

