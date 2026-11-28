import { safeInit } from "./js/ui-safe.js";
import { FALLBACK_ARTICLES, FALLBACK_ARTICLE_ITEMS, FALLBACK_BOOKS } from './fallback-data.js';
export { FALLBACK_ARTICLES, FALLBACK_BOOKS };
/**
 * NUQTHA — Frosted Glass Feed Engine
 * Realtime Firestore → Category-Sectioned Feed, Latest-First
 * Protected by Strict Schema Validator & Safe Fallbacks
 */
import { db, doc, getDoc } from "./firebase-config.js";
import { normalizeArticleDoc, parseTimestampMillis, getStoryUrl, getArticleImageUrl, sanitizeCategory } from "./schema-validator.js";
import { fetchArticleSearchContent, fetchPublicCollections, getDeferredImageAttributes, installLazyFirestoreImages, scanImages, stripListHeavyFields, waitForContainerImages } from "./js/public-image-loader.js";
import { filterPublicCollections, isExcludedPublicRecord, isPubliclyPublished } from "./js/public-status.js";
import { syncReadingBg } from "./reading-theme.js";
import { getBookChapterIds } from "./book-data.js";
import { getSiteOrigin, getAbsoluteUrl, updatePageMeta, PRIMARY_DOMAIN } from "./site-config.js";
import { areSameBookByTitle, countBookChapters, filterAndSortChapters, prefetchBookPage, saveBookChapterListCache } from "./js/book-data.js";
import { getAuthorsMap, getAuthorPhoto, slugifyAuthor } from "./js/author-service.js";
import { initHeaderAuthUI } from "./js/auth-ui.js";
import { categoryUrl, categoryTag, normalizeCategoryName, categorySlug, handleCategoryLinkClick } from "./js/category-link.js";
import { getArticleCategoryId, getCachedCategories, getCategories, mergeCategoryOptions, slugifyCategory } from "./js/category-store.js";
import { initInstall, isWebView, syncInstallItems } from "./src/install.js";
import { initAppExperience, requestNotificationPermission } from "./src/app-experience.js";
import {
    checkIsRateLimited,
    indexArticleSlugs,
    readArticlesListCache,
    writeArticlesListCache
} from "./js/firestore-cache.js";

if ("serviceWorker" in navigator && !isWebView()) {
    addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
            .then((registration) => registration.update().catch(() => {}))
            .catch(error => {
                console.warn("[NUQTHA] Service worker registration failed.", error);
            });
    });
}
initInstall();
initAppExperience();
if (typeof window.Notification !== "undefined") {
    window.requestNUQTHANotifications = requestNotificationPermission;
}
syncInstallItems();

void syncReadingBg();

/* ═══════════ Pre-bundled Fallback Data for 100% Uptime & Smooth Load ═══════════ */
const CACHE_KEY = 'nuqtha_cached_articles_v15';
let appDataPromise;

installLazyFirestoreImages();

function buildCardImageMarkup(item, className, alt, width, height, eager = false, fallbackUrl = "") {
    const isBook = isBookEntity(item);
    const rawUrl = getArticleImageUrl(item, "");
    const deferredAttributes = getDeferredImageAttributes(item);
    const safeFallback = isBook
        ? (fallbackUrl || "/cover-placeholder.svg")
        : (/(?:^|\/)cover-placeholder\.svg(?:[?#].*)?$/i.test(String(fallbackUrl || "")) ? "" : fallbackUrl);
    const imageUrl = rawUrl || (deferredAttributes ? "" : safeFallback);
    if (!imageUrl && !deferredAttributes) return "";

    const sourceAttribute = imageUrl ? `src="${escapeHtml(imageUrl)}"` : "";
    const opacity = imageUrl ? "1" : "0";
    const styleAttribute = `style="position:absolute;inset:0;opacity:${opacity};transition:opacity .25s ease;"`;
    const priority = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    const entityAttribute = `data-nuqtha-entity="${isBook ? "book" : "article"}"`;
    return `<img ${sourceAttribute} ${deferredAttributes} ${entityAttribute} alt="${escapeHtml(alt)}" class="${className}" width="${width}" height="${height}" ${priority} decoding="async" ${styleAttribute} data-nuqtha-cover="true">`;
}

function hasImmediateCardImage(item) {
    return Boolean(getArticleImageUrl(item, ""));
}

function hasBookCoverSource(book) {
    return Boolean(getArticleImageUrl(book, "") || getDeferredImageAttributes(book));
}

function safeCacheArticles(articles) {
    if (!Array.isArray(articles) || articles.length === 0) return;
    try {
        const inlineLimit = 185 * 1024;
        const lightweight = articles.map(a => {
            const imageUrl = getArticleImageUrl(a, "");
            const thumbnailUrl = getArticleImageUrl({
                imageUrl: a.thumbnailUrl,
                coverUrl: a.thumbnail,
                thumbUrl: a.thumbUrl,
                thumb: a.thumb,
                coverImage: a.ogImage
            }, "") || imageUrl;
            const itemLimit = isBookEntity(a) ? 350 * 1024 : inlineLimit;
            const copy = stripListHeavyFields(a, itemLimit);
            delete copy.content;
            delete copy.transcription;
            const keptImageUrl = imageUrl && (!/^data:image\//i.test(imageUrl) || imageUrl.length <= itemLimit);
            const strippedCover = Boolean(imageUrl && !keptImageUrl);
            if (keptImageUrl) {
                copy.imageUrl = imageUrl;
            }
            if (thumbnailUrl && (!/^data:image\//i.test(thumbnailUrl) || thumbnailUrl.length <= itemLimit)) {
                copy.thumbnailUrl = thumbnailUrl;
            }
            copy._hasAnyImageField = Boolean(imageUrl || a._hasAnyImageField);
            copy._hasDeferredImage = Boolean(strippedCover || (!keptImageUrl && a._hasDeferredImage));
            if (a._imageCollection) copy._imageCollection = a._imageCollection;
            if (a._imageDocId) copy._imageDocId = a._imageDocId;
            if (a._imageFallbackCollection) copy._imageFallbackCollection = a._imageFallbackCollection;
            if (a._imageFallbackDocId) copy._imageFallbackDocId = a._imageFallbackDocId;
            if (Array.isArray(a._imageFallbacks) && a._imageFallbacks.length) copy._imageFallbacks = a._imageFallbacks;
            return copy;
        });
        writeArticlesListCache(lightweight);
    } catch (e) {
        try {
            if (typeof window.clearVolatileStorage === "function") {
                window.clearVolatileStorage(sessionStorage);
            }
        } catch (_) {}
    }
}

let allArticles = [];
let hasFirestoreContent = false;
try {
    // Purge outdated or corrupted cache keys
    sessionStorage.removeItem('nuqtha_cached_articles');
    localStorage.removeItem('nuqtha_cached_articles');
    sessionStorage.removeItem('nuqtha_cached_articles_v5');
    localStorage.removeItem('nuqtha_cached_articles_v5');
    sessionStorage.removeItem('nuqtha_cached_articles_v10');
    localStorage.removeItem('nuqtha_cached_articles_v10');
    sessionStorage.removeItem('nuqtha_cached_articles_v13');
    sessionStorage.removeItem('nuqtha_cached_articles_v14');

    const cachedHit = readArticlesListCache({
        allowExpired: true,
        validate: parsed => {
            const hasNoAiStudio = !parsed.some(a =>
                (a.imageUrl || "").includes("aistudio") ||
                (a.thumbnailUrl || "").includes("aistudio") ||
                (a.imageUrl || "").includes("og-cover.png") ||
                (a.thumbnailUrl || "").includes("og-cover.png")
            );
            const hasNoOldAuthor = !parsed.some(a => (a.author || "").includes("അബൂബക്കർ"));
            return hasNoAiStudio && hasNoOldAuthor;
        }
    });
    if (cachedHit && Array.isArray(cachedHit.data) && cachedHit.data.length > 0) {
        const cleanedCached = cachedHit.data.filter(a =>
            isPubliclyPublished(a) && !isDeletedArticleRecord(a) && !isExcludedDummyBookRecord(a) && !isExcludedPublicRecord(a)
        );
        const cacheIsSynthetic = isSyntheticFallbackAppSet(cleanedCached.filter(a => !isBookEntity(a)));
        allArticles = cacheIsSynthetic
            ? cleanedCached.map(a => ({ ...a, _isFallback: true }))
            : cleanedCached;
        indexArticleSlugs(allArticles);
    }
} catch (e) {}

// Pre-fill with normalized fallback articles & books in memory so feed is NEVER empty, broken, or stuck on skeletons
if (!Array.isArray(allArticles) || allArticles.length === 0) {
    allArticles = [...FALLBACK_ARTICLE_ITEMS, ...FALLBACK_BOOKS].map(a => ({
        ...normalizeArticleDoc(a, a.id),
        _isFallback: true
    }));
}

let siteAuthorsMap = null;
try {
    for (const store of [sessionStorage, localStorage]) {
        const stored = store?.getItem('nuqtha_cached_authors');
        if (stored) {
            const parsed = JSON.parse(stored);
            const resolvedMap = (parsed && typeof parsed === "object" && parsed.data && typeof parsed.savedAt === "number")
                ? parsed.data
                : parsed;
            if (resolvedMap && typeof resolvedMap === "object" && Object.keys(resolvedMap).length > 0) {
                siteAuthorsMap = resolvedMap;
                break;
            }
        }
    }
} catch (e) {}

function refreshAuthorsInBackground() {
    getAuthorsMap(db).then(map => {
        siteAuthorsMap = map;
        if (typeof renderFeed === 'function' && allArticles.length > 0) {
            renderFeed();
        }
    }).catch(() => {});
}
if (siteAuthorsMap) {
    refreshAuthorsInBackground();
}
let currentCategory = "ALL";
let searchContentPromise = null;
let searchContentLoaded = false;
let siteCategories = getCachedCategories();
let siteCategoryById = new Map(siteCategories.map(category => [category.slug, category]));

function categoryLabel(cat) {
    const rawCat = !cat || String(cat).trim().toUpperCase() === "GENERAL" ? "HISTORY" : cat;
    const categoryId = slugifyCategory(rawCat);
    const category = siteCategoryById.get(categoryId);
    return category?.name || String(rawCat).trim().toUpperCase();
}
window.categoryLabel = categoryLabel;

function getVisibleCategories(articles = allArticles) {
    const byId = new Map(siteCategories.filter(category => category.slug !== "general").map(category => [category.slug, category]));
    const knownIds = new Set(byId.keys());
    articles.forEach(article => {
        if (isBookEntity(article) || isChapterEntity(article) || !isPubliclyPublished(article)) return;
        const slug = getArticleCategoryId(article);
        if (!slug || slug === "general" || knownIds.has(slug)) return;
        const name = String(article.category || "").trim() || slug;
        byId.set(slug, { id: slug, slug, name, order: Number.MAX_SAFE_INTEGER, visible: true });
        knownIds.add(slug);
    });
    return [...byId.values()].filter(category => category.visible !== false && category.slug !== "general").sort((a, b) =>
        a.order - b.order || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

/**
 * Robust Malayalam Unicode text decoder to reverse CP437/Windows-1252/Latin1 mojibake corruption
 */
const CP437_MAP = {
    0x00C7: 0x80, 0x00FC: 0x81, 0x00E9: 0x82, 0x00E2: 0x83, 0x00E4: 0x84, 0x00E0: 0x85, 0x00E5: 0x86, 0x00E7: 0x87,
    0x00EA: 0x88, 0x00EB: 0x89, 0x00E8: 0x8A, 0x00EF: 0x8B, 0x00EE: 0x8C, 0x00EC: 0x8D, 0x00C4: 0x8E, 0x00C5: 0x8F,
    0x00C9: 0x90, 0x00E6: 0x91, 0x00C6: 0x92, 0x00F4: 0x93, 0x00F6: 0x94, 0x00F2: 0x95, 0x00FB: 0x96, 0x00F9: 0x97,
    0x00FF: 0x98, 0x00D6: 0x99, 0x00DC: 0x9A, 0x00A2: 0x9B, 0x00A3: 0x9C, 0x00A5: 0x9D, 0x20A7: 0x9E, 0x0192: 0x9F,
    0x00E1: 0xA0, 0x00ED: 0xA1, 0x00F3: 0xA2, 0x00FA: 0xA3, 0x00F1: 0xA4, 0x00D1: 0xA5, 0x00AA: 0xA6, 0x00BA: 0xA7,
    0x00BF: 0xA8, 0x2310: 0xA9, 0x00AC: 0xAA, 0x00BD: 0xAB, 0x00BC: 0xAC, 0x00A1: 0xAD, 0x00AB: 0xAE, 0x00BB: 0xAF,
    0x2591: 0xB0, 0x2592: 0xB1, 0x2593: 0xB2, 0x2502: 0xB3, 0x2524: 0xB4, 0x2561: 0xB5, 0x2562: 0xB6, 0x2556: 0xB7,
    0x2555: 0xB8, 0x2563: 0xB9, 0x2551: 0xBA, 0x2557: 0xBB, 0x255D: 0xBC, 0x255C: 0xBD, 0x255B: 0xBE, 0x2510: 0xBF,
    0x2514: 0xC0, 0x2534: 0xC1, 0x252C: 0xC2, 0x251C: 0xC3, 0x2500: 0xC4, 0x253C: 0xC5, 0x255E: 0xC6, 0x255F: 0xC7,
    0x255A: 0xC8, 0x2554: 0xC9, 0x2569: 0xCA, 0x2566: 0xCB, 0x2560: 0xCC, 0x2550: 0xCD, 0x256C: 0xCE, 0x2567: 0xCF,
    0x2568: 0xD0, 0x2564: 0xD1, 0x2565: 0xD2, 0x2559: 0xD3, 0x2558: 0xD4, 0x2552: 0xD5, 0x2553: 0xD6, 0x256B: 0xD7,
    0x256A: 0xD8, 0x2518: 0xD9, 0x250C: 0xDA, 0x2588: 0xDB, 0x2584: 0xDC, 0x258C: 0xDD, 0x2590: 0xDE, 0x2580: 0xDF,
    0x03B1: 0xE0, 0x00DF: 0xE1, 0x0393: 0xE2, 0x03C0: 0xE3, 0x03A3: 0xE4, 0x03C3: 0xE5, 0x00B5: 0xE6, 0x03C4: 0xE7,
    0x03A6: 0xE8, 0x0398: 0xE9, 0x03A9: 0xEA, 0x03B4: 0xEB, 0x221E: 0xEC, 0x03C6: 0xED, 0x03B5: 0xEE, 0x2229: 0xEF,
    0x2261: 0xF0, 0x00B1: 0xF1, 0x2265: 0xF2, 0x2264: 0xF3, 0x2320: 0xF4, 0x2321: 0xF5, 0x00F7: 0xF6, 0x2248: 0xF7,
    0x00B0: 0xF8, 0x2219: 0xF9, 0x00B7: 0xFA, 0x221A: 0xFB, 0x207F: 0xFC, 0x00B2: 0xFD, 0x25A0: 0xFE, 0x00A0: 0xFF
};

export function sanitizeMalayalamText(str) {
    if (!str || typeof str !== "string") return str;
    // Check if string contains CP437 mangling signatures like 'α' (0x03B1) or typical mojibake characters
    if (/[\u03B1\u03C0\u03C3\u03C4\u03C6\u221E\u2500-\u259F]/.test(str)) {
        try {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                if (code <= 0x7F) {
                    bytes.push(code);
                } else if (CP437_MAP[code] !== undefined) {
                    bytes.push(CP437_MAP[code]);
                } else if (code <= 0xFF) {
                    bytes.push(code);
                } else {
                    bytes.push(0x3F); // fallback '?'
                }
            }
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
            if (decoded && !decoded.includes('\uFFFD')) {
                return decoded;
            }
        } catch(e) {
            console.warn("Failed CP437 decode attempt:", e);
        }
    }
    return str;
}

const SKELETON_MAX_MS = 2000;
let initialLoaded = false;
try {
    initialLoaded = sessionStorage.getItem("nuqtha_initial_loaded") === "1" ||
        document.documentElement.classList.contains("initial-loaded");
} catch (_) {}
let skeletonDismissed = initialLoaded;
let skeletonHardCapTimer = null;

function markInitialLoaded() {
    initialLoaded = true;
    try {
        sessionStorage.setItem("nuqtha_initial_loaded", "1");
    } catch (_) {}
    document.documentElement.classList.add("initial-loaded");
}

function dismissInitialSkeleton(immediate = false) {
    if (skeletonHardCapTimer) {
        clearTimeout(skeletonHardCapTimer);
        skeletonHardCapTimer = null;
    }
    markInitialLoaded();
    const skel = document.getElementById("nuqtha-initial-skeleton");
    if (!skel) {
        skeletonDismissed = true;
        return;
    }
    if (immediate) {
        skeletonDismissed = true;
        skel.style.opacity = "0";
        skel.style.display = "none";
        skel.hidden = true;
        return;
    }
    if (skeletonDismissed) return;
    skeletonDismissed = true;
    skel.style.opacity = "0";
    setTimeout(() => {
        skel.style.display = "none";
        skel.hidden = true;
    }, 320);
}

function waitForInitialHomeImages(maxWaitMs) {
    if (maxWaitMs <= 0) return Promise.resolve();
    const container = document.getElementById("feed-container");
    if (!container) return Promise.resolve();
    scanImages(container);
    return waitForContainerImages(container, maxWaitMs, 8);
}

window.addEventListener("pagehide", () => {
    markInitialLoaded();
});

window.addEventListener("pageshow", (event) => {
    if (event.persisted || initialLoaded || sessionStorage.getItem("nuqtha_initial_loaded") === "1") {
        dismissInitialSkeleton(true);
    }
});

let currentSearchQuery = "";

function initApp() {
    if (initialLoaded || document.documentElement.classList.contains("initial-loaded")) {
        dismissInitialSkeleton(true);
    } else {
        const bootTime = typeof window.__nuqthaBootTime === "number" ? window.__nuqthaBootTime : Date.now();
        const remainingCap = Math.max(0, SKELETON_MAX_MS - (Date.now() - bootTime));
        skeletonHardCapTimer = setTimeout(() => dismissInitialSkeleton(false), remainingCap);
    }

    setupThemeToggle();
    initHeaderAuthUI();
    setupCategoryNav();
    setupArticlesDropdown();
    setupBooksNavLink();
    setupMoreDropdown();
    setupHomeLink();
    setupSidebarDrawer();
    setupSearch();
    setupLibraryView();
    setupGlobalCategoryBadges();
    checkUrlCategory();
    const dataPromise = initAppData();
    renderFeed();
    if (!skeletonDismissed) {
        dataPromise.finally(() => {
            if (skeletonDismissed) return;
            const bootTime = typeof window.__nuqthaBootTime === "number" ? window.__nuqthaBootTime : Date.now();
            const remaining = Math.max(0, SKELETON_MAX_MS - (Date.now() - bootTime));
            waitForInitialHomeImages(remaining).finally(() => {
                dismissInitialSkeleton(false);
            });
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

/* ═══════════ Navbar Dropdown & Link Setup ═══════════ */
function setupArticlesDropdown() {
    const articlesBtn = document.getElementById("articles-dropdown-btn");
    const dropdown = document.getElementById("articles-dropdown-menu");
    const arrow = document.getElementById("articles-arrow");

    if (!articlesBtn || !dropdown) return;

    articlesBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close more dropdown if open
        const moreDropdown = document.getElementById("more-categories-dropdown");
        if (moreDropdown && !moreDropdown.classList.contains("hidden")) {
            moreDropdown.classList.add("hidden");
            const moreArrow = document.getElementById("more-arrow");
            if (moreArrow) moreArrow.style.transform = "rotate(0deg)";
        }

        const isHidden = dropdown.classList.contains("hidden");
        dropdown.classList.toggle("hidden", !isHidden);
        if (arrow) arrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        articlesBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
        if (!articlesBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
            if (arrow) arrow.style.transform = "rotate(0deg)";
            articlesBtn.setAttribute("aria-expanded", "false");
        }
    });

    dropdown.addEventListener("click", (e) => {
        const item = e.target.closest("[data-category]");
        if (item) {
            e.preventDefault();
            const cat = item.dataset.category;
            if (cat) {
                switchToCategory(cat);
                dropdown.classList.add("hidden");
                if (arrow) arrow.style.transform = "rotate(0deg)";
                articlesBtn.setAttribute("aria-expanded", "false");
            }
        }
    });
}

function setupBooksNavLink() {
    const booksLink = document.getElementById("nav-books-link");
    if (!booksLink) return;

    booksLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchToCategory("BOOKS");
        document.getElementById("articles-dropdown-menu")?.classList.add("hidden");
        document.getElementById("more-categories-dropdown")?.classList.add("hidden");
    });
}

export const DEFAULT_FRONT_MORE_MENU = [
    { id: "menu-authors", label: "AUTHORS (എഴുത്തുകാർ)", url: "author.html?id=സയ്യിദ്-സൽമാൻ-അദനി-കരിപ്പൂർ", icon: "✍️", order: 1, targetBlank: false, isActive: true },
    { id: "menu-contact", label: "ABOUT & CONTACT", url: "contact.html", icon: "📬", order: 2, targetBlank: false, isActive: true },
    { id: "menu-admin", label: "ADMIN PORTAL", url: "admin.html", icon: "⚙️", order: 3, targetBlank: false, isActive: true }
];

function renderDynamicMoreMenu(items) {
    const dropdown = document.getElementById("more-categories-dropdown");
    if (!dropdown) return;

    const list = Array.isArray(items) && items.length > 0 ? items : DEFAULT_FRONT_MORE_MENU;
    const activeItems = list.filter(item => item && item.isActive !== false);
    const sorted = activeItems.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    dropdown.innerHTML = sorted.map((item, index) => {
        const isAdmin = (item.url && item.url.includes("admin.html")) || (item.label && item.label.toUpperCase().includes("ADMIN"));
        const colorClass = isAdmin ? "text-[#b4532c] dark:text-[#f87171]" : "text-[#1e1b18] dark:text-white";
        const icon = item.icon || "🔗";
        const targetAttr = item.targetBlank ? `target="_blank" rel="noopener noreferrer"` : "";
        const divider = (index > 0 && isAdmin) ? `<div class="border-t border-[#ebdccb]/60 dark:border-white/10 my-1"></div>` : "";

        return `
            ${divider}
            <a href="${item.url || '#'}" ${targetAttr} class="more-dropdown-item flex items-center gap-2.5 px-4 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold ${colorClass} transition font-english">
                <span>${icon}</span>
                <span>${item.label || ''}</span>
            </a>
        `;
    }).join("");
}

function initDynamicMoreMenu() {
    // 1. Instant cache paint
    try {
        const cached = sessionStorage.getItem("nuqtha_more_menu");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                renderDynamicMoreMenu(parsed);
                return;
            }
        }
    } catch (e) {}

    if (checkIsRateLimited({ scope: "background" })) {
        renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
        return;
    }

    // 2. Fetch once from Firestore
    try {
        const menuDocRef = doc(db, "settings", "more_menu");
        getDoc(menuDocRef).then(snap => {
            if (snap && snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data.items) && data.items.length > 0) {
                    try {
                        sessionStorage.setItem("nuqtha_more_menu", JSON.stringify(data.items));
                    } catch (_) {}
                    renderDynamicMoreMenu(data.items);
                    return;
                }
            }
            try { sessionStorage.setItem("nuqtha_more_menu", JSON.stringify(DEFAULT_FRONT_MORE_MENU)); } catch (_) {}
            renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
        }).catch(() => {
            try { sessionStorage.setItem("nuqtha_more_menu", JSON.stringify(DEFAULT_FRONT_MORE_MENU)); } catch (_) {}
            renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
        });
    } catch (_) {
        renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
    }
}

function setupMoreDropdown() {
    const moreBtn = document.getElementById("more-categories-btn");
    const dropdown = document.getElementById("more-categories-dropdown");
    const arrow = document.getElementById("more-arrow");

    if (!moreBtn || !dropdown) return;

    // Load and listen to dynamic links from Firestore
    initDynamicMoreMenu();

    moreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close articles dropdown if open
        const artDropdown = document.getElementById("articles-dropdown-menu");
        if (artDropdown && !artDropdown.classList.contains("hidden")) {
            artDropdown.classList.add("hidden");
            const artArrow = document.getElementById("articles-arrow");
            if (artArrow) artArrow.style.transform = "rotate(0deg)";
        }

        const isHidden = dropdown.classList.contains("hidden");
        dropdown.classList.toggle("hidden", !isHidden);
        if (arrow) arrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        moreBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
        if (!moreBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
            if (arrow) arrow.style.transform = "rotate(0deg)";
            moreBtn.setAttribute("aria-expanded", "false");
        }
    });

    dropdown.addEventListener("click", (e) => {
        const item = e.target.closest("[data-category]");
        if (item) {
            e.preventDefault();
            const cat = item.dataset.category;
            if (cat) {
                switchToCategory(cat);
                dropdown.classList.add("hidden");
                if (arrow) arrow.style.transform = "rotate(0deg)";
                moreBtn.setAttribute("aria-expanded", "false");
            }
        }
    });
}

function normalizeBookRefValue(value) {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") {
        const trimmed = String(value).trim();
        return trimmed ? trimmed.split("/").pop() : "";
    }
    if (typeof value === "object") {
        return normalizeBookRefValue(
            value.id || value.bookId || value.docId || value.documentId ||
            value.reference || value.ref || value.path || value.slug || value.bookSlug || ""
        );
    }
    return "";
}

function isBookEntity(article) {
    if (!article) return false;
    if (isChapterEntity(article)) return false;
    const artType = String(article.type || "").trim().toUpperCase();
    if (artType === "BOOK" || artType === "FREE" || artType === "PREMIUM" || article.isBook === true) return true;
    const category = String(article.category || "").trim().toLowerCase();
    if (category === "premium book" || category === "book" || category === "books") return true;
    return false;
}

function isChapterEntity(article) {
    if (!article) return false;
    const artType = String(article.type || "").trim().toUpperCase();
    const category = String(article.category || "").trim().toLowerCase();
    if (
        article.isChapter === true ||
        artType === "CHAPTER" ||
        category === "chapter" ||
        (article.chapterIndex !== undefined && article.chapterIndex !== null && article.chapterIndex !== "") ||
        article._sourceCollection === "chapters" ||
        article._imageCollection === "chapters" ||
        /\/chapters\//i.test(String(article.path || article.refPath || ""))
    ) {
        return true;
    }

    const isExplicitBook = artType === "BOOK" || artType === "FREE" || artType === "PREMIUM" ||
        article.isBook === true || category === "premium book" || category === "book" || category === "books";
    if (isExplicitBook) return false;

    const selfId = String(article.id || "").trim();
    const linkedBookId = normalizeBookRefValue(article.bookId);
    const linkedParentBookId = normalizeBookRefValue(article.parentBookId);
    if ((linkedBookId && linkedBookId !== selfId) || (linkedParentBookId && linkedParentBookId !== selfId)) {
        return true;
    }
    if (article.book && normalizeBookRefValue(article.book) !== selfId) {
        return true;
    }

    const cleanSlug = String(article.slug || "").trim().replace(/^\/+|\/+$/g, "");
    if (/^story\/[^/]+\/[^/]+/i.test(cleanSlug)) {
        return true;
    }
    if (String(article.bookSlug || "").trim()) {
        return true;
    }
    return false;
}

function createBookChapterMatcher(items = []) {
    const bookChapterIds = getBookChapterIds(items);
    const bookIds = new Set();
    const bookSlugs = new Set();
    const bookTitles = new Set();
    const normalizeKey = value => String(value || "")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const knownChapterIds = new Set();
    const knownChapterSlugs = new Set();
    const knownChapterTitles = new Set([
        normalizeKey("അബ്ബാസിയ്യ ഖിലാഫത്തിന്റെ ഉദയം"),
        normalizeKey("ബൈതുൽ ഹിക്മയും ജ്ഞാന വിപ്ലവവും"),
        normalizeKey("ബൈത്തുൽ ഹിക്മയും ജ്ഞാന വിപ്ലവവും"),
        normalizeKey("ബഗ്ദാദിലെ സുവർണ്ണ യുഗം")
    ]);
    (Array.isArray(FALLBACK_BOOKS) ? FALLBACK_BOOKS : []).forEach(fb => {
        if (!fb) return;
        if (fb.id) bookIds.add(String(fb.id).trim());
        [fb.slug, fb.bookSlug].forEach(s => {
            const key = normalizeKey(s);
            if (key) bookSlugs.add(key);
        });
        [fb.title, fb.bookTitle, fb.bookName].forEach(t => {
            const key = normalizeKey(t);
            if (key) bookTitles.add(key);
        });
        if (Array.isArray(fb.chapters)) {
            fb.chapters.forEach(ch => {
                if (!ch || typeof ch !== "object") return;
                if (ch.id) knownChapterIds.add(String(ch.id).trim());
                const chSlug = normalizeKey(ch.slug);
                if (chSlug) knownChapterSlugs.add(chSlug);
                const chTitle = normalizeKey(ch.title);
                if (chTitle) knownChapterTitles.add(chTitle);
            });
        }
    });

    items.forEach(item => {
        if (!item || !isBookEntity(item)) return;
        const id = String(item.id || "").trim();
        if (id) bookIds.add(id);
        [item.slug, item.bookSlug].forEach(s => {
            const key = normalizeKey(s);
            if (key) bookSlugs.add(key);
        });
        [item.title, item.bookTitle, item.bookName].forEach(t => {
            const key = normalizeKey(t);
            if (key) bookTitles.add(key);
        });
    });

    return article => {
        if (!article) return false;
        if (isChapterEntity(article) || bookChapterIds.has(article.id)) return true;
        if (isBookEntity(article)) return false;

        const selfId = String(article.id || "").trim();
        if (selfId && knownChapterIds.has(selfId)) return true;
        const artSlugKey = normalizeKey(article.slug);
        if (artSlugKey && knownChapterSlugs.has(artSlugKey)) return true;
        const artTitleKey = normalizeKey(article.title);
        if (artTitleKey && knownChapterTitles.has(artTitleKey)) return true;

        const linkedIds = [normalizeBookRefValue(article.bookId), normalizeBookRefValue(article.parentBookId)].filter(Boolean);
        if (linkedIds.some(id => id !== selfId && bookIds.has(id))) return true;

        const articleBookSlug = normalizeKey(article.bookSlug);
        if (articleBookSlug && bookSlugs.has(articleBookSlug)) return true;

        const cleanSlug = String(article.slug || "").trim().replace(/^\/+|\/+$/g, "");
        const slugParts = cleanSlug.split("/").filter(Boolean);
        if (slugParts.length >= 2) {
            const prefixSlug = normalizeKey(slugParts[0] === "story" ? slugParts[1] : slugParts[0]);
            if (prefixSlug && bookSlugs.has(prefixSlug)) return true;
        }

        const linkedBookNames = [article.bookName, article.bookTitle, article.playlistName].map(normalizeKey).filter(Boolean);
        if (linkedBookNames.some(name => bookTitles.has(name))) return true;

        return false;
    };
}

const SYNTHETIC_FALLBACK_APP_IDS = new Set([
    "history-article-2",
    "islamic-scholar-1", "islamic-scholar-2", "islamic-scholar-3", "islamic-scholar-4",
    "kerala-scholar-1", "kerala-scholar-2", "kerala-scholar-3", "kerala-scholar-4",
    "story-baghdad-wisdom", "story-cordoba-lantern", "story-compassion-medina",
    "history-andalus-libraries", "history-hudaybiyyah-diplomacy",
    "study-quran-reflection", "study-fiqh-methodology"
]);

function isSyntheticFallbackAppSet(items) {
    if (!Array.isArray(items) || items.length === 0) return false;
    if (items.every(item => item?._isFallback === true)) return true;
    let matches = 0;
    for (const item of items) {
        if (SYNTHETIC_FALLBACK_APP_IDS.has(String(item?.id || "").trim())) matches += 1;
    }
    return matches >= 4;
}

function isDeletedArticleRecord(article) {
    if (!article || typeof article !== "object" || isBookEntity(article)) return false;
    if (isExcludedPublicRecord(article)) return true;
    const id = String(article.id || "").trim();
    const permanentDeletedIds = new Set([
        "CT1yvXEEJIKiCFtpP5zW",
        "DQz4xGe5evx4dAzPT0pu",
        "dm6KW74DBcSQn3uf467X",
        "iMcQW3dyL1Es8LIL6CGg"
    ]);
    if (id && permanentDeletedIds.has(id)) return true;
    const slug = String(article.slug || "").trim().toLowerCase();
    const permanentDeletedSlugs = new Set([
        "columbus-history",
        "yathra",
        "srishtaavinte-drishtaantangalil-ninnu",
        "umarinte-thyaaga-jeevithavum-upadeshtaakkalum"
    ]);
    return Boolean(slug && permanentDeletedSlugs.has(slug));
}

function isExcludedDummyBookRecord(book) {
    if (!book) return false;
    if (isExcludedPublicRecord(book)) return true;
    const id = String(book.id || "").trim();
    const slug = String(book.slug || book.bookSlug || "").trim().toLowerCase();
    const title = String(book.title || "").trim();
    return id === "imamumaarude-jeevitham" || id === "badr-charitham" || id === "QLO71LUik9O7DTkQ7v3p" ||
        slug === "imamumaarude-jeevitham" || slug === "badr-charitham" ||
        title === "ഇമാമുമാരുടെ ജീവിതം" || title === "ഇമാമുമാരുടെ ചരിത്രം" || title === "ബദ്ർ ചരിത്രം";
}

function parseFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return Number.POSITIVE_INFINITY;
    const n = Number(value);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function getBookCoverItems(items) {
    if (!Array.isArray(items)) return [];
    const chapterIds = getBookChapterIds(items);
    const seenIds = new Set();
    const seenSlugs = new Set();
    const seenTitleBooks = [];

    const sortedItems = [...items].sort((a, b) => {
        const orderA = parseFiniteNumber(a.order);
        const orderB = parseFiniteNumber(b.order);
        if (orderA !== orderB) return orderA - orderB;
        const prioA = parseFiniteNumber(a.priority);
        const prioB = parseFiniteNumber(b.priority);
        if (prioA !== prioB) return prioA - prioB;
        const tsB = parseTimestampMillis(b.createdAt) || parseTimestampMillis(b.updatedAt) || parseTimestampMillis(b.date) || 0;
        const tsA = parseTimestampMillis(a.createdAt) || parseTimestampMillis(a.updatedAt) || parseTimestampMillis(a.date) || 0;
        return tsB - tsA;
    });

    return sortedItems.filter(book => {
        if (!isPubliclyPublished(book) || !isBookEntity(book) || isChapterEntity(book) || chapterIds.has(book.id) || isExcludedDummyBookRecord(book) || isDeletedArticleRecord(book)) return false;
        const id = String(book.id || "").trim();
        const slug = String(book.slug || book.bookSlug || "").trim().toLowerCase();
        if ((id && seenIds.has(id)) || (slug && seenSlugs.has(slug)) ||
            seenTitleBooks.some(previous => areSameBookByTitle(previous, book))) return false;
        if (id) seenIds.add(id);
        if (slug) seenSlugs.add(slug);
        seenTitleBooks.push(book);
        return true;
    });
}

function updateMoreCategoriesMenu() {
    const categoryLinks = getVisibleCategories()
        .map(category => `
            <a href="${categoryUrl(category.slug)}" data-category="${escapeHtml(category.slug)}" class="articles-dropdown-item flex items-center px-4 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#1e1b18] dark:text-white transition font-english">
                <span>${escapeHtml(category.name)}</span>
            </a>
        `).join("");
    const container = document.getElementById("dynamic-articles-categories");
    if (container) container.innerHTML = categoryLinks;

    const drawerContainer = document.getElementById("drawer-dynamic-categories");
    if (drawerContainer) {
        drawerContainer.innerHTML = getVisibleCategories().map(category => `
            <a href="${categoryUrl(category.slug)}" class="drawer-nav-item drawer-link" data-category="${escapeHtml(category.slug)}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M6 5v15m12-15v15M3 20h18M9 9h6m-6 4h6"/></svg>
                <span>${escapeHtml(category.name)}</span>
            </a>
        `).join("");
        setDrawerCurrentLink([...document.querySelectorAll("#sidebar-drawer .drawer-nav-item")]
            .find(item => (item.dataset.category || "").toUpperCase() === currentCategory) || null);
    }
}

function setupGlobalCategoryBadges() {
    document.addEventListener("click", (e) => {
        const badge = e.target.closest(".category-glass-badge, .category-badge-pill, .carousel-card-cat, [data-badge-category], .category-pill-link, .show-more-pill, .articles-dropdown-item");
        if (badge) {
            const cat = badge.dataset.badgeCategory || badge.dataset.category;
            if (cat) {
                e.preventDefault();
                e.stopPropagation();
                switchToCategory(cat);
            }
        }
    });
}

function checkUrlCategory() {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const catParam = params.get('category') || params.get('cat');
    const hash = window.location.hash.replace(/^#/, '').trim();

    if (viewParam === 'saved' || hash.toLowerCase() === 'saved') {
        switchToCategory('SAVED');
        return;
    }

    let targetCat = catParam || '';
    if (!targetCat && hash && hash !== 'home') {
        const hashClean = hash.replace(/^category=/, '').trim();
        targetCat = hashClean;
    }

    if (targetCat) {
        let decoded = targetCat;
        try { decoded = decodeURIComponent(targetCat); } catch (_) {}
        const norm = normalizeCategoryName(decoded);
        const upper = norm ? norm.toUpperCase() : '';
        if (upper === 'BOOK' || upper === 'BOOKS') {
            switchToCategory('BOOKS');
        } else if (upper) {
            switchToCategory(upper);
        }
    } else if (!hash || hash === 'home') {
        if (currentCategory !== 'ALL') {
            switchToCategory('ALL');
        }
    }
}

window.addEventListener('hashchange', checkUrlCategory);
window.addEventListener('popstate', checkUrlCategory);

/* ═══════════ Light / Dark Mode Toggle ═══════════ */
function setupThemeToggle() {
    const themeBtn = document.getElementById("theme-toggle-btn");
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");

    // Check saved preference or system preference
    const savedTheme = localStorage.getItem("nuqtha_theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
        if (sunIcon) sunIcon.classList.remove("hidden");
        if (moonIcon) moonIcon.classList.add("hidden");
    } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-mode");
            document.documentElement.classList.toggle("dark", isDark);
            document.documentElement.style.colorScheme = isDark ? "dark" : "light";
            try {
                localStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");
            } catch (err) {
                try {
                    sessionStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");
                } catch (_) {}
            }

            if (isDark) {
                if (sunIcon) sunIcon.classList.remove("hidden");
                if (moonIcon) moonIcon.classList.add("hidden");
            } else {
                if (sunIcon) sunIcon.classList.add("hidden");
                if (moonIcon) moonIcon.classList.remove("hidden");
            }
        });
    }
}

/* ═══════════ Category Tab Switching ═══════════ */
// Ensure canonical & OG URL reflect current active domain
updatePageMeta();

function setupCategoryNav() {
    const links = document.querySelectorAll("#category-nav .nav-category-link:not(#more-categories-btn)");
    links.forEach(link => {
        if (!link) return;
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = link.dataset.category;
            if (cat) switchToCategory(cat);
        });
    });
}

function setupHomeLink() {
    const homeLinks = document.querySelectorAll("#home-link, .brand-badge, .drawer-home-link");
    homeLinks.forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();
            clearSearch(false);
            document.getElementById("articles-dropdown-menu")?.classList.add("hidden");
            document.getElementById("more-categories-dropdown")?.classList.add("hidden");
            document.getElementById("sidebar-close-btn")?.click();
            switchToCategory("ALL");
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

/* ═══════════ 3-Bar Sidebar Drawer Setup ═══════════ */
function setupSidebarDrawer() {
    const toggleBtn = document.getElementById("sidebar-toggle-btn");
    const closeBtn = document.getElementById("sidebar-close-btn");
    const backdrop = document.getElementById("sidebar-backdrop");
    const drawer = document.getElementById("sidebar-drawer");
    if (!drawer) return;
    let previousBodyOverflow = "";
    let isOpen = false;
    setDrawerCurrentLink([...drawer.querySelectorAll(".drawer-nav-item")]
        .find(item => (item.dataset.category || "").toUpperCase() === currentCategory) || null);

    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;

    function openDrawer() {
        if (isOpen) return;
        isOpen = true;
        previousBodyOverflow = document.body.style.overflow;
        drawer.inert = false;
        drawer.setAttribute("aria-hidden", "false");
        drawer.classList.add("drawer-open");
        if (backdrop) backdrop.classList.add("backdrop-active");
        document.body.style.overflow = "hidden";
        if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
        drawer.querySelector(".drawer-link")?.focus({ preventScroll: true });
    }

    function closeDrawer() {
        if (!isOpen) return;
        isOpen = false;
        drawer.classList.remove("drawer-open");
        if (backdrop) backdrop.classList.remove("backdrop-active");
        document.body.style.overflow = previousBodyOverflow;
        drawer.setAttribute("aria-hidden", "true");
        drawer.inert = true;
        if (toggleBtn) {
            toggleBtn.setAttribute("aria-expanded", "false");
            toggleBtn.focus({ preventScroll: true });
        }
    }

    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
    if (toggleBtn) toggleBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    drawer.addEventListener("click", event => {
        const link = event.target.closest("a");
        if (!link) return;
        const category = link.dataset.category;
        if (category) {
            event.preventDefault();
            switchToCategory(category);
        }
        if (link.id === "drawer-saved-link") setDrawerCurrentLink(link);
        closeDrawer();
    });

    document.addEventListener("keydown", (e) => {
        if (!isOpen) return;
        if (e.key === "Escape") {
            closeDrawer();
            return;
        }
        if (e.key !== "Tab") return;

        const focusable = [...drawer.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter(element => !element.closest(".hidden") && element.getClientRects().length > 0);
        if (focusable.length === 0) {
            e.preventDefault();
            drawer.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
            e.preventDefault();
            first.focus();
        }
    });
}

function setDrawerCurrentLink(link) {
    document.querySelectorAll("#sidebar-drawer .drawer-link[aria-current]").forEach(item => {
        item.removeAttribute("aria-current");
    });
    link?.setAttribute("aria-current", "page");
}

/* ═══════════ 3D Library View Switcher Setup ═══════════ */
function setupLibraryView() {
    const feed = document.getElementById("feed");
    const lib = document.getElementById("library");
    const drawerLibLink = document.getElementById("drawer-library-link");

    if (!feed || !lib) return;

    let mounted = false;

    async function showView(name) {
        const isLib = name === "library";
        feed.hidden = isLib;
        lib.hidden = !isLib;

        if (isLib) {
            setDrawerCurrentLink(drawerLibLink);
            if (window.location.hash !== "#library") {
                history.replaceState(null, null, "#library");
            }
            if (!mounted) {
                mounted = true;
                const { mountLibrary } = await import("./library.js");
                mountLibrary(lib);
            }
        } else {
            if (window.location.hash === "#library") {
                history.replaceState(null, null, "#home");
            }
        }
    }

    if (drawerLibLink) {
        drawerLibLink.addEventListener("click", () => {
            setDrawerCurrentLink(drawerLibLink);
            const closeBtn = document.getElementById("sidebar-close-btn");
            if (closeBtn) closeBtn.click();
            showView("library");
            lib.scrollIntoView({ behavior: "smooth" });
        });
    }

    window.showNuqthaView = showView;

    // Check if URL requests library view (e.g. #library or ?view=library)
    const urlParams = new URLSearchParams(window.location.search);
    if (window.location.hash === "#library" || urlParams.get("view") === "library") {
        showView("library");
    }
}

/* ═══════════ Real-Time Article Search Setup ═══════════ */
function setupSearch() {
    const searchToggleBtn = document.getElementById("header-search-btn");
    const searchContainer = document.getElementById("header-search-container");
    const headerInput = document.getElementById("header-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");

    function onSearchChange(val) {
        currentSearchQuery = val;
        if (headerInput && headerInput.value !== val) headerInput.value = val;
        if (headerClearBtn) {
            headerClearBtn.classList.toggle("hidden", !val.trim());
        }
        renderFeed();
        if (val.trim() && !searchContentLoaded && !searchContentPromise) {
            searchContentPromise = fetchArticleSearchContent().then(contentById => {
                allArticles = allArticles.map(article => {
                    if (article.content) return article;
                    return { ...article, content: contentById.get(article.id) || "" };
                });
                searchContentLoaded = true;
                searchContentPromise = null;
                if (currentSearchQuery.trim()) renderFeed();
            }).catch(error => {
                console.warn("[NUQTHA App] Full-text search content could not be loaded.", error);
                searchContentPromise = null;
            });
        }
    }

    if (searchToggleBtn && searchContainer) {
        searchToggleBtn.addEventListener("click", () => {
            const isHidden = searchContainer.classList.contains("hidden");
            searchContainer.classList.toggle("hidden", !isHidden);
            if (isHidden && headerInput) {
                headerInput.focus();
            }
        });
    }

    if (headerInput) {
        headerInput.addEventListener("input", (e) => onSearchChange(e.target.value));
    }

    if (headerClearBtn) {
        headerClearBtn.addEventListener("click", () => clearSearch(true));
    }
}

function clearSearch(triggerRender = true) {
    currentSearchQuery = "";
    const headerInput = document.getElementById("header-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");
    if (headerInput) headerInput.value = "";
    if (headerClearBtn) headerClearBtn.classList.add("hidden");
    if (triggerRender) renderFeed();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ═══════════ App Data Loader ═══════════ */
function restoreFallbackFields(article, fallbacksById, rawArticle = {}) {
    const isBook = isBookEntity(article);
    const titleKey = String(article.title || "").normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    const fallback = fallbacksById.get(article.id) || fallbacksById.get(article.slug) || (isBook && article.bookSlug ? fallbacksById.get(article.bookSlug) : null) || (titleKey ? fallbacksById.get(`title:${titleKey}`) : null);
    if (!fallback) return article;
    const isMissing = value => value == null || String(value).trim() === "";
    const hasRawField = field => Object.prototype.hasOwnProperty.call(rawArticle, field);
    const imageUrl = getArticleImageUrl(article, "") || getArticleImageUrl(fallback, "");
    const thumbnailUrl = getArticleImageUrl({
        imageUrl: article.thumbnailUrl,
        coverUrl: article.thumbnail,
        coverImage: article.ogImage
    }, "") || getArticleImageUrl({
        imageUrl: fallback.thumbnailUrl,
        coverUrl: fallback.thumbnail,
        coverImage: fallback.ogImage
    }, "") || imageUrl;
    return {
        ...fallback,
        ...article,
        title: isMissing(article.title) || /^untitled(?: article| book)?$/i.test(article.title) ? fallback.title : article.title,
        author: isMissing(article.author) || /^(?:nuqtha|nuqtha press|nuqtha author)$/i.test(article.author) ? fallback.author : article.author,
        excerpt: isMissing(article.excerpt) ? fallback.excerpt : article.excerpt,
        content: isMissing(article.content) ? fallback.content : article.content,
        imageUrl,
        coverImage: imageUrl,
        coverUrl: imageUrl,
        cover: imageUrl,
        image: imageUrl,
        thumbnailUrl,
        thumbnail: thumbnailUrl,
        ogImage: thumbnailUrl,
        slug: isMissing(article.slug) ? fallback.slug : article.slug,
        bookSlug: isMissing(article.bookSlug) ? fallback.bookSlug : article.bookSlug,
        bookId: isMissing(article.bookId) ? (fallback.bookId || "") : article.bookId,
        parentBookId: isMissing(article.parentBookId) ? (fallback.parentBookId || "") : article.parentBookId,
        bookName: isMissing(article.bookName) ? (fallback.bookName || "") : article.bookName,
        bookTitle: isMissing(article.bookTitle) ? (fallback.bookTitle || "") : article.bookTitle,
        isChapter: article.isChapter === true || fallback.isChapter === true,
        type: fallback.isChapter === true ? "CHAPTER" : (isMissing(article.type) ? fallback.type : article.type),
        volume: hasRawField("volume") ? article.volume : fallback.volume,
        issue: hasRawField("issue") ? article.issue : fallback.issue,
        date: isMissing(article.date) ? fallback.date : article.date,
        chapters: Array.isArray(article.chapters) && article.chapters.length ? article.chapters : fallback.chapters
    };
}

export function initAppData() {
    if (appDataPromise) return appDataPromise;

    appDataPromise = (async () => {
        try {
            const cachedHit = readArticlesListCache({ allowExpired: true });
            if (cachedHit && Array.isArray(cachedHit.data) && cachedHit.data.length > 0) {
                const parsed = cachedHit.data;
                const hasNoAiStudio = !parsed.some(a =>
                    (a.imageUrl || "").includes("aistudio") ||
                    (a.thumbnailUrl || "").includes("aistudio") ||
                    (a.imageUrl || "").includes("og-cover.png") ||
                    (a.thumbnailUrl || "").includes("og-cover.png")
                );
                if (hasNoAiStudio && (!allArticles.length || allArticles.every(a => a._isFallback))) {
                    const cleanedLegacy = parsed.filter(a =>
                        isPubliclyPublished(a) && !isDeletedArticleRecord(a) && !isExcludedDummyBookRecord(a) && !isExcludedPublicRecord(a)
                    );
                    if (!isSyntheticFallbackAppSet(cleanedLegacy.filter(a => !isBookEntity(a)))) {
                        allArticles = cleanedLegacy;
                    }
                }
            }
        } catch (error) {
            console.warn("[NUQTHA App] Could not restore the article cache.", error);
        }

        const previousRealArticles = (Array.isArray(allArticles) ? allArticles : [])
            .filter(item => item && !item._isFallback && !SYNTHETIC_FALLBACK_APP_IDS.has(String(item.id || "").trim()) && isPubliclyPublished(item));

        const publicLists = await fetchPublicCollections();
        const resolvedCategories = await getCategories({ forceRefresh: false }).catch(error => {
            const msg = String(error?.code || error?.message || "").toLowerCase();
            if (!msg.includes("429") && !msg.includes("resource-exhausted") && !msg.includes("quota")) {
                console.warn("[NUQTHA App] Could not load Firestore categories.", error);
            }
            return getCachedCategories();
        });

        hasFirestoreContent = publicLists.hasFirestoreContent === true;

        const fallbacksById = new Map();
        const registerFallback = item => {
            if (!item || typeof item !== "object") return;
            if (item.id && !fallbacksById.has(item.id)) fallbacksById.set(item.id, item);
            if (item.slug && !fallbacksById.has(item.slug)) fallbacksById.set(item.slug, item);
            if (isBookEntity(item) && item.bookSlug && !fallbacksById.has(item.bookSlug)) fallbacksById.set(item.bookSlug, item);
            const normTitle = String(item.title || "").normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
            if (normTitle && !fallbacksById.has(`title:${normTitle}`)) fallbacksById.set(`title:${normTitle}`, item);
        };
        FALLBACK_ARTICLES.forEach(article => {
            registerFallback(article);
            if (Array.isArray(article.chapters)) {
                article.chapters.forEach(registerFallback);
            }
        });

        const scoreBookRecord = (record) => {
            if (!record || typeof record !== "object") return 0;
            let score = 0;
            const cover = getArticleImageUrl(record, "");
            if (cover) score += 40;
            if (record._hasDeferredImage) score += 15;
            if (Array.isArray(record.chapters) && record.chapters.length > 0) score += 25 + record.chapters.length * 4;
            if (Array.isArray(record.articleIds) && record.articleIds.length > 0) score += 20;
            const summaryText = String(record.introduction || record.intro || record.excerpt || record.content || "").trim();
            if (summaryText.length > 20) score += 15;
            if (record._imageCollection === "books" || record._sourceCollection === "books") score += 10;
            if (String(record.id || "").trim() === "CCReELqC4iHBquoiwEPf") score -= 100;
            return score;
        };

        const pickNonEmptyText = (...vals) => {
            for (const v of vals) {
                if (typeof v === "string" && v.trim() && !/^(?:untitled|തലക്കെട്ടില്ല)/i.test(v.trim())) return v;
            }
            return "";
        };

        const mergeRichBookRecord = (existingBook, incomingBook) => {
            if (!existingBook) return incomingBook;
            if (!incomingBook) return existingBook;
            const incomingWins = scoreBookRecord(incomingBook) >= scoreBookRecord(existingBook);
            const primary = incomingWins ? incomingBook : existingBook;
            const secondary = incomingWins ? existingBook : incomingBook;
            const coverUrl = getArticleImageUrl(primary, "") || getArticleImageUrl(secondary, "");
            const thumbnailUrl = getArticleImageUrl({
                imageUrl: primary.thumbnailUrl, coverUrl: primary.thumbnail, thumbUrl: primary.thumbUrl, thumb: primary.thumb, coverImage: primary.ogImage
            }, "") || getArticleImageUrl({
                imageUrl: secondary.thumbnailUrl, coverUrl: secondary.thumbnail, thumbUrl: secondary.thumbUrl, thumb: secondary.thumb, coverImage: secondary.ogImage
            }, "") || coverUrl;
            const chapters = Array.isArray(primary.chapters) && primary.chapters.length > 0
                ? primary.chapters
                : (Array.isArray(secondary.chapters) ? secondary.chapters : []);
            const merged = normalizeArticleDoc({
                ...secondary,
                ...primary,
                title: pickNonEmptyText(primary.title, secondary.title),
                author: pickNonEmptyText(primary.author, secondary.author),
                excerpt: pickNonEmptyText(primary.excerpt, primary.introduction, secondary.excerpt, secondary.introduction),
                introduction: pickNonEmptyText(primary.introduction, primary.intro, secondary.introduction, secondary.intro),
                imageUrl: coverUrl,
                coverImage: coverUrl,
                coverUrl,
                thumbnailUrl,
                chapters
            }, primary.id || secondary.id);
            const preferSecondaryImageSource = !coverUrl && !primary._hasAnyImageField &&
                Boolean(secondary._hasAnyImageField || secondary._hasDeferredImage);
            merged._imageCollection = preferSecondaryImageSource
                ? (secondary._imageCollection || primary._imageCollection || "books")
                : (primary._imageCollection || secondary._imageCollection || "books");
            merged._imageDocId = preferSecondaryImageSource
                ? (secondary._imageDocId || secondary.id || primary._imageDocId || primary.id)
                : (primary._imageDocId || primary.id || secondary._imageDocId || secondary.id);
            merged._imageFallbackCollection = preferSecondaryImageSource
                ? (primary._imageCollection || "")
                : (secondary._imageCollection || "");
            merged._imageFallbackDocId = preferSecondaryImageSource
                ? (primary._imageDocId || primary.id || "")
                : (secondary._imageDocId || secondary.id || "");
            merged._hasAnyImageField = Boolean(coverUrl || primary._hasAnyImageField || secondary._hasAnyImageField);
            merged._hasDeferredImage = Boolean(!coverUrl && (primary._hasDeferredImage || secondary._hasDeferredImage));
            merged._isFallback = Boolean(primary._isFallback && secondary._isFallback);
            if (!merged.isChapter) {
                merged.type = "BOOK";
                merged.isBook = true;
            }
            return merged;
        };

        const publicRecords = filterPublicCollections(publicLists.articles, publicLists.books);
        const articlesAreFallback = Boolean(
            publicLists.articlesFromFallback === true ||
            (publicLists.articlesLive === false && isSyntheticFallbackAppSet(publicRecords.articles))
        );
        const booksAreFallback = Boolean(
            publicLists.booksFromFallback === true ||
            (publicLists.booksLive === false && publicRecords.books.every(b => b?._isFallback === true))
        );
        const rawArticlesList = publicRecords.articles
            .filter(article => !isDeletedArticleRecord(article) && !isExcludedDummyBookRecord(article) && !isExcludedPublicRecord(article))
            .map(article => {
                const normalized = restoreFallbackFields(normalizeArticleDoc({
                    ...article,
                    title: sanitizeMalayalamText(article.title),
                    author: sanitizeMalayalamText(article.author),
                    excerpt: sanitizeMalayalamText(article.excerpt),
                    content: sanitizeMalayalamText(article.content),
                    playlistName: sanitizeMalayalamText(article.playlistName)
                }, article.id), fallbacksById, article);
                return {
                    ...normalized,
                    _isFallback: Boolean(article._isFallback || articlesAreFallback),
                    _imageCollection: article._imageCollection || "articles",
                    _imageDocId: article._imageDocId || article.id,
                    _hasAnyImageField: typeof article._hasAnyImageField === "boolean" ? article._hasAnyImageField : Boolean(getArticleImageUrl(article, "")),
                    _hasDeferredImage: Boolean(!getArticleImageUrl(normalized, "") && article._hasDeferredImage)
                };
            });

        const rawBooksList = publicRecords.books
            .filter(bookData => !isDeletedArticleRecord(bookData) && !isExcludedDummyBookRecord(bookData) && !isExcludedPublicRecord(bookData))
            .map(bookData => {
                const articleRecord = rawArticlesList.find(article =>
                    article.id === bookData.id ||
                    (bookData.slug && article.slug === bookData.slug) ||
                    (isBookEntity(article) && areSameBookByTitle(article, bookData))
                );
                const bookItem = normalizeArticleDoc({
                    ...bookData,
                    title: sanitizeMalayalamText(bookData.title),
                    author: sanitizeMalayalamText(bookData.author),
                    excerpt: sanitizeMalayalamText(bookData.excerpt)
                }, bookData.id);
                bookItem._isFallback = Boolean(bookData._isFallback || booksAreFallback);
                bookItem._imageCollection = bookData._imageCollection || "books";
                bookItem._imageDocId = bookData._imageDocId || bookData.id;
                bookItem._hasAnyImageField = typeof bookData._hasAnyImageField === "boolean" ? bookData._hasAnyImageField : Boolean(getArticleImageUrl(bookData, ""));
                bookItem._hasDeferredImage = Boolean(!getArticleImageUrl(bookItem, "") && bookData._hasDeferredImage);
                if (!bookItem.isChapter) {
                    bookItem.type = "BOOK";
                    bookItem.isBook = true;
                }
                const mergedBook = articleRecord
                    ? mergeRichBookRecord(articleRecord, bookItem)
                    : bookItem;
                const restored = restoreFallbackFields(mergedBook, fallbacksById, bookData);
                restored._isFallback = Boolean(bookItem._isFallback && (!articleRecord || articleRecord._isFallback));
                return restored;
            });

        const previousRealArticlesOnly = previousRealArticles.filter(item =>
            !isBookEntity(item) && !isDeletedArticleRecord(item) && !isExcludedDummyBookRecord(item) && !isExcludedPublicRecord(item)
        );
        const previousRealBooksOnly = previousRealArticles.filter(item =>
            isBookEntity(item) && !isChapterEntity(item) && !isDeletedArticleRecord(item) && !isExcludedDummyBookRecord(item) && !isExcludedPublicRecord(item)
        );

        const activeArticlesList = (articlesAreFallback && previousRealArticlesOnly.length > 0)
            ? previousRealArticlesOnly
            : rawArticlesList;
        const activeBooksList = (booksAreFallback && previousRealBooksOnly.length > 0)
            ? previousRealBooksOnly
            : rawBooksList;

        const fallbackArticlePool = activeArticlesList.length > 0
            ? []
            : (previousRealArticlesOnly.length > 0
                ? previousRealArticlesOnly
                : FALLBACK_ARTICLE_ITEMS.map(article => ({ ...normalizeArticleDoc(article, article.id), _isFallback: true })));

        const existingBookPool = activeBooksList.length > 0
            ? activeBooksList
            : previousRealBooksOnly;
        const missingFallbackBooks = FALLBACK_BOOKS
            .filter(fbBook => !existingBookPool.some(existing =>
                existing.id === fbBook.id ||
                (fbBook.slug && (existing.slug === fbBook.slug || existing.bookSlug === fbBook.slug)) ||
                areSameBookByTitle(existing, fbBook)
            ))
            .map(book => ({ ...normalizeArticleDoc(book, book.id), _isFallback: true }));
        const fallbackBookPool = activeBooksList.length > 0
            ? missingFallbackBooks
            : (previousRealBooksOnly.length > 0
                ? [...previousRealBooksOnly, ...missingFallbackBooks]
                : FALLBACK_BOOKS.map(book => ({ ...normalizeArticleDoc(book, book.id), _isFallback: true })));

        const combined = [...fallbackArticlePool, ...fallbackBookPool];
        activeArticlesList.forEach(article => {
            article._isFallback = Boolean(article._isFallback);
            const existingIndex = combined.findIndex(item => item.id === article.id || (article.slug && item.slug === article.slug));
            if (existingIndex < 0) combined.push(article);
            else if (isBookEntity(article) || isBookEntity(combined[existingIndex])) {
                combined[existingIndex] = mergeRichBookRecord(combined[existingIndex], article);
            } else {
                combined[existingIndex] = { ...combined[existingIndex], ...article };
            }
        });
        activeBooksList.forEach(book => {
            book._isFallback = Boolean(book._isFallback);
            const existingIndex = combined.findIndex(article =>
                article.id === book.id ||
                (book.slug && article.slug === book.slug && isBookEntity(article)) ||
                (isBookEntity(article) && areSameBookByTitle(article, book))
            );
            if (existingIndex < 0) combined.push(book);
            else combined[existingIndex] = mergeRichBookRecord(combined[existingIndex], book);
        });

        const publishedCombined = combined.filter(item =>
            isPubliclyPublished(item) && !isDeletedArticleRecord(item) && !isExcludedDummyBookRecord(item) && !isExcludedPublicRecord(item)
        );
        const cachedCategories = getCachedCategories();
        const baseCategories = (Array.isArray(resolvedCategories) && resolvedCategories.length > 0)
            ? resolvedCategories
            : cachedCategories;
        siteCategories = baseCategories.length > 0
            ? baseCategories
            : mergeCategoryOptions([], publishedCombined, [
                { slug: "history", name: "History", order: 1, visible: true },
                { slug: "study", name: "Study", order: 2, visible: true }
            ]);
        siteCategoryById = new Map(siteCategories.map(category => [category.slug, category]));

        const standalone = publishedCombined.filter(a => !isBookEntity(a) && !isChapterEntity(a));
        const booksAndChapters = publishedCombined.filter(a => isBookEntity(a) || isChapterEntity(a));
        allArticles = sortArticles([...deduplicateHomeArticles(standalone), ...booksAndChapters]);
        const realToCache = allArticles.filter(item => !item._isFallback && !isExcludedPublicRecord(item));
        if (realToCache.length > 0) {
            safeCacheArticles(realToCache);
        }
        renderFeed();
        if (!siteAuthorsMap) {
            refreshAuthorsInBackground();
        }
    })().catch(error => {
        console.error("[NUQTHA App] Could not load articles and books.", error);
        if (allArticles.length === 0) {
            allArticles = [
                ...deduplicateHomeArticles(FALLBACK_ARTICLE_ITEMS.map(article => ({ ...normalizeArticleDoc(article, article.id), _isFallback: true }))),
                ...FALLBACK_BOOKS.map(book => ({ ...normalizeArticleDoc(book, book.id), _isFallback: true }))
            ];
        }
        if (!siteCategories.length) {
            siteCategories = getCachedCategories();
            if (!siteCategories.length) {
                siteCategories = mergeCategoryOptions([], allArticles, [
                    { slug: "history", name: "History", order: 1, visible: true },
                    { slug: "study", name: "Study", order: 2, visible: true }
                ]);
            }
            siteCategoryById = new Map(siteCategories.map(category => [category.slug, category]));
        }
        renderFeed();
    });

    return appDataPromise;
}
window.initAppData = initAppData;
export const listenForArticles = initAppData;

function decodeFirestoreFields(fields) {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
    );
}

function decodeFirestoreValue(value) {
    if (!value || typeof value !== "object") return value;
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("referenceValue" in value) return value.referenceValue;
    if ("bytesValue" in value) return value.bytesValue;
    if ("geoPointValue" in value) return value.geoPointValue;
    if ("arrayValue" in value) {
        return (value.arrayValue.values || []).map(decodeFirestoreValue);
    }
    if ("mapValue" in value) {
        return decodeFirestoreFields(value.mapValue.fields || {});
    }
    return value;
}

function mergeArticles(...articleGroups) {
    const articlesById = new Map();
    articleGroups.flat().forEach(article => articlesById.set(article.id, article));
    return sortArticles(Array.from(articlesById.values()));
}

function sortArticles(articles) {
    return articles.sort((a, b) => {
        const timestampB = parseTimestampMillis(b.createdAt)
            || parseTimestampMillis(b.updatedAt)
            || parseTimestampMillis(b.date)
            || 0;
        const timestampA = parseTimestampMillis(a.createdAt)
            || parseTimestampMillis(a.updatedAt)
            || parseTimestampMillis(a.date)
            || 0;
        return timestampB - timestampA;
    });
}

/* ═══════════ Render Feed ═══════════ */
function renderFeed() {
    const container = document.getElementById("feed-container");
    if (!container) return;

    updateMoreCategoriesMenu();

    if (currentSearchQuery && currentSearchQuery.trim()) {
        renderSearchFeed(container, currentSearchQuery.trim());
    } else if (currentCategory === "ALL") {
        renderHomeFeed(container);
    } else if (currentCategory === "BOOKS" || currentCategory === "BOOK") {
        renderBooksCategoryFeed(container);
    } else if (currentCategory === "SAVED") {
        renderSavedFeed(container);
    } else {
        renderCategoryFeed(container, currentCategory);
    }

    scanImages(container);
    attachCardListeners();
    attachShowMoreListeners();
    setupCarousel();
}

/* ═══════════ Saved Articles Library Feed ═══════════ */
function renderSavedFeed(container) {
    let savedIds = [];
    try {
        savedIds = JSON.parse(localStorage.getItem("nuqtha_saved_books") || "[]");
    } catch (_) {}

    const matched = allArticles.filter(art =>
        savedIds.includes(art.id) &&
        !isDeletedArticleRecord(art) &&
        !isExcludedDummyBookRecord(art) &&
        !isExcludedPublicRecord(art)
    );

    let html = `
        <div class="mb-6 flex items-center justify-between pb-3 border-b border-[#ebdccb] dark:border-white/10">
            <div>
                <h2 class="text-xl sm:text-2xl font-black font-['Anek_Malayalam'] text-[#1e1b18] dark:text-white">സേവ് ചെയ്ത ലേഖനങ്ങൾ (Saved Articles)</h2>
                <p class="text-xs text-[#8c7a6b] dark:text-slate-400 font-english">${matched.length} saved in your library</p>
            </div>
            <button type="button" id="back-from-saved-btn" class="px-3.5 py-1.5 rounded-full bg-black/5 dark:bg-white/10 text-xs font-bold font-english uppercase tracking-wider text-[#5a4b41] dark:text-slate-300 hover:bg-[#b4532c] hover:text-white transition cursor-pointer">
                &larr; All Articles
            </button>
        </div>
    `;

    if (matched.length === 0) {
        html += `
        <div class="text-center py-16 px-4 space-y-4 max-w-md mx-auto">
            <div class="w-16 h-16 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center text-3xl shadow-xs">
                🔖
            </div>
            <h3 class="text-lg sm:text-xl font-bold font-['Anek_Malayalam'] text-[#1e1b18] dark:text-white">സേവ് ചെയ്ത ലേഖനങ്ങളില്ല</h3>
            <p class="text-xs text-[#8c7a6b] dark:text-slate-400 font-['Anek_Malayalam'] leading-relaxed">
                നിങ്ങൾ ഇതുവരെ ലേഖനങ്ങളൊന്നും സേവ് ചെയ്തിട്ടില്ല. ലേഖന പേജിലെ സേവ് (Save) ബട്ടൺ ക്ലിക്ക് ചെയ്ത് ഇവിടെ സൂക്ഷിക്കാം.
            </p>
            <div class="pt-2">
                <button type="button" id="browse-articles-empty-btn" class="px-5 py-2.5 rounded-2xl bg-[#b4532c] hover:bg-[#923e1b] text-white text-xs font-bold font-english uppercase tracking-wider transition shadow cursor-pointer">
                    Browse All Articles
                </button>
            </div>
        </div>
        `;
    } else {
        html += buildFeaturedCard(matched[0], true);
        if (matched.length > 1) {
            html += `<div class="category-cards-list space-y-3 mt-4">`;
            matched.slice(1).forEach(art => {
                html += buildCompactRecentCard(art);
            });
            html += `</div>`;
        }
    }

    container.innerHTML = html;
    const backBtn = document.getElementById("back-from-saved-btn");
    if (backBtn) backBtn.addEventListener("click", () => switchToCategory("ALL"));
    const emptyBtn = document.getElementById("browse-articles-empty-btn");
    if (emptyBtn) emptyBtn.addEventListener("click", () => switchToCategory("ALL"));
}

/* ═══════════ Search Feed: Displays matching articles ═══════════ */
function renderSearchFeed(container, query) {
    const lower = query.toLowerCase();
    const bookChapterIds = getBookChapterIds(allArticles);
    const matchesBookChapter = createBookChapterMatcher(allArticles);
    const matched = allArticles.filter(art => {
        if (isBookEntity(art) || isChapterEntity(art) || bookChapterIds.has(art.id) || matchesBookChapter(art)) return false;
        const title = (art.title || "").toLowerCase();
        const author = (art.author || "").toLowerCase();
        const excerpt = (art.excerpt || "").toLowerCase();
        const content = (art.content || "").toLowerCase();
        const cat = (art.category || "").toLowerCase();
        return title.includes(lower) || author.includes(lower) || excerpt.includes(lower) || content.includes(lower) || cat.includes(lower);
    });

    let html = `
    <div class="search-result-banner flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-white/80 dark:bg-[#12141d]/80 backdrop-blur-md border border-[#ebdccb] dark:border-white/10 shadow-sm">
        <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-[#b4532c]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <span class="text-xs font-bold text-[#1e1b18] dark:text-[#f1f5f9]">തിരഞ്ഞ ഫലങ്ങൾ: <strong class="text-[#b4532c]">"${escapeHtml(query)}"</strong></span>
            <span class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">(${matched.length} ലേഖനങ്ങൾ)</span>
        </div>
        <button id="clear-search-result-btn" class="text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] transition flex items-center gap-1 font-english">
            <span>&times; CLEAR</span>
        </button>
    </div>
    `;

    if (matched.length === 0) {
        html += `
        <div class="article-glass-card p-10 sm:p-14 text-center cursor-default space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-[#1e1b18] dark:text-white">തിരഞ്ഞ വാക്കിന് അനുയോജ്യമായ ലേഖനങ്ങൾ ലഭ്യമല്ല</h3>
            <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] max-w-sm mx-auto">മറ്റൊരു വാക്ക് നൽകി വീണ്ടും തിരഞ്ഞുനോക്കുക അല്ലെങ്കിൽ എല്ലാ ലേഖനങ്ങളിലേക്കും മടങ്ങുക.</p>
            <button id="empty-search-reset-btn" class="mt-2 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs font-bold hover:bg-[#923e1b] transition shadow-md font-english">
                VIEW ALL ARTICLES
            </button>
        </div>
        `;
    } else {
        html += buildFeaturedCard(matched[0], true);
        if (matched.length > 1) {
            html += `<div class="category-cards-list space-y-3 mt-4">`;
            matched.slice(1).forEach(art => {
                html += buildCompactRecentCard(art);
            });
            html += `</div>`;
        }
    }

    container.innerHTML = html;
    const clearResultBtn = document.getElementById("clear-search-result-btn");
    if (clearResultBtn) clearResultBtn.addEventListener("click", () => clearSearch(true));
    const emptyResetBtn = document.getElementById("empty-search-reset-btn");
    if (emptyResetBtn) emptyResetBtn.addEventListener("click", () => clearSearch(true));
}

function renderLazyHomeCategorySection(section, category, categoryArticles) {
    const selected = categoryArticles.filter(article =>
        getArticleCategoryId(article) === category.slug
    );
    if (selected.length === 0) {
        section.remove();
        return;
    }

    const theme = getCategoryTheme();
    const featuredArticle = selected[0];
    const initialGridArticles = selected.slice(1, 3);
    const remainingArticles = selected.slice(3);
    const gridId = `home-category-grid-${String(category.slug).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    section.innerHTML = `
        ${buildCategorySectionHeader(category.slug, false, false, theme)}
        ${featuredArticle ? `<div class="home-category-featured mb-4">${buildFeaturedCard(featuredArticle)}</div>` : ""}
        ${initialGridArticles.length ? `
            <div id="${gridId}" class="home-category-grid">
                ${initialGridArticles.map(article => buildHomeCategorySmallCard(article, theme)).join("")}
            </div>
        ` : ""}
        ${remainingArticles.length ? `
            <template class="home-category-more-template">
                ${remainingArticles.map(article => buildHomeCategorySmallCard(article, theme)).join("")}
            </template>
            <div class="home-category-show-more-wrap">
                <button type="button" class="home-category-show-more" data-category="${escapeHtml(category.slug)}" aria-controls="${gridId}">
                    <span>Show More</span>
                </button>
            </div>
        ` : `
            <div class="home-category-show-more-wrap">
                <a href="${escapeHtml(categoryUrl(category.slug))}" class="home-category-show-more">
                    <span>Show More</span>
                </a>
            </div>
        `}
    `;
    section.dataset.loaded = "true";
    // Category Show More button label: allArticlesLink.textContent = "Show More";
    attachShowMoreListeners();
    attachHomeCategoryLoadMoreListeners(section);
    attachCardListeners();
}

function buildHomeCategorySmallCard(article, theme) {
    if (!article) return "";
    const cleanTitle = stripMarkdown(article.title);
    const authorName = article.author || "NUQTHA";
    const image = buildCardImageMarkup(
        article,
        "home-category-small-image",
        cleanTitle,
        480,
        270,
        false,
        ""
    );
    const hasImage = hasImmediateCardImage(article);
    const placeholder = `<div class="home-category-small-placeholder${hasImage ? " hidden" : ""}" data-nuqtha-image-placeholder aria-hidden="true"><svg class="w-6 h-6 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg></div>`;

    return `
        <article class="compact-recent-card home-category-small-card ${theme.cardBorder}" data-id="${escapeHtml(article.id || "")}">
            <a href="${escapeHtml(getStoryUrl(article))}" class="home-category-small-cover">
                ${placeholder}
                ${image}
            </a>
            <div class="home-category-small-copy">
                ${categoryTag(article.category, { variant: "bracket", theme })}
                <h4><a href="${escapeHtml(getStoryUrl(article))}">${cleanTitle}</a></h4>
                <p>${escapeHtml(authorName)}</p>
            </div>
        </article>
    `;
}

function attachHomeCategoryLoadMoreListeners(root = document) {
    root.querySelectorAll("button.home-category-show-more:not([data-listener])").forEach(button => {
        button.dataset.listener = "true";
        button.addEventListener("click", () => {
            const section = button.closest("[data-home-category-section]");
            const grid = section?.querySelector(".home-category-grid");
            const template = section?.querySelector(".home-category-more-template");
            if (!grid || !template) {
                console.error("[NUQTHA App] Could not load more category articles: section markup is incomplete.");
                return;
            }

            for (let count = 0; count < 4 && template.content.firstElementChild; count += 1) {
                grid.appendChild(template.content.firstElementChild);
            }
            attachCardListeners();

            if (!template.content.firstElementChild) {
                template.remove();
                const allArticlesLink = document.createElement("a");
                allArticlesLink.className = button.className;
                allArticlesLink.href = categoryUrl(button.dataset.category);
                allArticlesLink.textContent = "Show More";
                button.replaceWith(allArticlesLink);
            }
        });
    });
}

function normalizeMalayalamChillu(text) {
    return String(text || "")
        .normalize("NFC")
        .replace(/\u0D7A/g, "\u0D23\u0D4D") // ൺ -> ണ്
        .replace(/\u0D7B/g, "\u0D28\u0D4D") // ൻ -> ന്
        .replace(/\u0D7C/g, "\u0D30\u0D4D") // ർ -> ര്
        .replace(/\u0D7D/g, "\u0D32\u0D4D") // ൽ -> ല്
        .replace(/\u0D7E/g, "\u0D33\u0D4D") // ൾ -> ള്
        .replace(/\u0D7F/g, "\u0D15\u0D4D") // ൿ -> ക്
        .replace(/[\u200B-\u200D\uFEFF]/g, ""); // ZWJ, ZWNJ, BOM
}

function getCanonicalTitleStem(raw) {
    let s = normalizeMalayalamChillu(raw)
        .toLowerCase()
        .replace(/[;:\x27",.\-–—!()?[\]{}]/g, " ")
        .replace(/\bയുദ്ധ[ംങ്‌]?\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const words = s.split(" ").filter(w => w.length > 1).map(w => {
        return w.replace(/[\u0D02\u0D41\u0D42\u0D4D\u0D3E-\u0D4C]+$/g, "");
    }).filter(Boolean);
    return words.join(" ");
}

function getCanonicalSlugStem(raw) {
    let s = String(raw || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/^\/+|\/+$/g, "");
    s = s.replace(/^story\/[^/]+\//, "").replace(/^story\//, "");
    s = s.replace(/uhud/g, "uhd")
         .replace(/-?yuddham-?/g, "-")
         .replace(/kuttashsheri/g, "kuttasseri")
         .replace(/-+/g, "-")
         .replace(/^-|-$/g, "");
    return s;
}

function getHomeArticleKeys(article) {
    if (!article) return [];
    const keys = [];
    const id = String(article.id || "").trim();
    const slug = String(article.slug || "").trim().normalize("NFC").toLowerCase();
    const title = stripMarkdown(article.title || "")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    if (id) keys.push(`id:${id}`);
    if (slug) keys.push(`slug:${slug}`);
    if (title) keys.push(`title:${getArticleCategoryId(article)}:${title}`);

    const cleanTitle = normalizeMalayalamChillu(title)
        .replace(/[;:\x27",.\-–—!()?[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (cleanTitle) {
        keys.push(`title:${cleanTitle}`);
    }
    const titleStem = getCanonicalTitleStem(title);
    if (titleStem && titleStem.length >= 6) {
        keys.push(`titlestem:${titleStem}`);
    }
    const slugStem = getCanonicalSlugStem(slug);
    if (slugStem && slugStem.length >= 6) {
        keys.push(`slugstem:${slugStem}`);
    }
    return keys;
}

function getHomeArticleImageScore(article) {
    if (getArticleImageUrl(article, "")) return 2;
    return getDeferredImageAttributes(article) ? 1 : 0;
}

function attachDuplicateImageFallbacks(winner, loser) {
    if (!winner || !loser || !loser._imageCollection || !loser._imageDocId) return;
    const primaryKey = winner._imageCollection && winner._imageDocId
        ? `${winner._imageCollection}:${winner._imageDocId}`
        : "";
    const pairs = [];
    const pushPair = (col, id) => {
        if (!col || !id) return;
        const pair = `${col}:${id}`;
        if (pair === primaryKey || pairs.includes(pair)) return;
        pairs.push(pair);
    };
    pushPair(winner._imageFallbackCollection, winner._imageFallbackDocId);
    if (Array.isArray(winner._imageFallbacks)) {
        winner._imageFallbacks.forEach(pair => {
            const idx = String(pair || "").indexOf(":");
            if (idx > 0) pushPair(pair.slice(0, idx), pair.slice(idx + 1));
        });
    }
    pushPair(loser._imageCollection, loser._imageDocId);
    pushPair(loser._imageFallbackCollection, loser._imageFallbackDocId);
    if (Array.isArray(loser._imageFallbacks)) {
        loser._imageFallbacks.forEach(pair => {
            const idx = String(pair || "").indexOf(":");
            if (idx > 0) pushPair(pair.slice(0, idx), pair.slice(idx + 1));
        });
    }
    if (pairs.length > 0) {
        const idx = pairs[0].indexOf(":");
        winner._imageFallbackCollection = pairs[0].slice(0, idx);
        winner._imageFallbackDocId = pairs[0].slice(idx + 1);
        winner._imageFallbacks = pairs;
    }
}

function mergeDuplicateArticleFields(winner, loser) {
    if (!winner || !loser) return winner;
    const winnerScore = getHomeArticleImageScore(winner);
    const loserScore = getHomeArticleImageScore(loser);
    if (loserScore > winnerScore) {
        ["imageUrl", "coverImage", "coverUrl", "cover", "image", "thumbnailUrl", "thumbnail", "ogImage"].forEach(field => {
            if (loser[field] && !winner[field]) winner[field] = loser[field];
        });
    } else {
        ["imageUrl", "coverImage", "coverUrl", "cover", "image", "thumbnailUrl", "thumbnail", "ogImage"].forEach(field => {
            if (!winner[field] && loser[field]) winner[field] = loser[field];
        });
    }

    attachDuplicateImageFallbacks(winner, loser);

    if ((loser.title || "").length > (winner.title || "").length && !loser.title.endsWith("...")) {
        winner.title = loser.title;
    }
    if (!winner.content && loser.content) winner.content = loser.content;
    if (!winner.excerpt && loser.excerpt) winner.excerpt = loser.excerpt;
    if (!winner.author && loser.author) winner.author = loser.author;
    if (!winner.date && loser.date) winner.date = loser.date;
    return winner;
}

function deduplicateHomeArticles(articles) {
    const uniqueArticles = [];
    const articleIndexByKey = new Map();

    articles.forEach(article => {
        const keys = getHomeArticleKeys(article);
        const duplicateIndex = keys
            .map(key => articleIndexByKey.get(key))
            .find(index => index !== undefined);
        if (duplicateIndex === undefined) {
            const index = uniqueArticles.push({ ...article }) - 1;
            keys.forEach(key => articleIndexByKey.set(key, index));
            return;
        }

        const previous = uniqueArticles[duplicateIndex];
        if (getHomeArticleImageScore(article) > getHomeArticleImageScore(uniqueArticles[duplicateIndex])) {
            uniqueArticles[duplicateIndex] = { ...previous, ...article };
            mergeDuplicateArticleFields(uniqueArticles[duplicateIndex], previous);
        } else {
            mergeDuplicateArticleFields(uniqueArticles[duplicateIndex], article);
        }
        keys.forEach(key => articleIndexByKey.set(key, duplicateIndex));
    });

    return uniqueArticles;
}

/* ─── HOME FEED: Scrolling Carousel + Hero Featured + Dedicated Books + Category Feeds ─── */
function renderHomeFeed(container) {
    // Distinguish book covers from standard articles
    const bookChapterIds = getBookChapterIds(allArticles);
    const matchesBookChapter = createBookChapterMatcher(allArticles);
    const isChapter = article => isChapterEntity(article) || bookChapterIds.has(article.id) || matchesBookChapter(article);
    const isBookCoverItem = article => isBookEntity(article) && !isChapter(article);
    const bookCovers = getBookCoverItems(allArticles);
    // Regular articles: keep only genuine standalone articles (exclude book covers AND all book chapters)
    const regularArticles = deduplicateHomeArticles(allArticles.filter(a =>
        !isBookCoverItem(a) && !isChapter(a) &&
        isPubliclyPublished(a) &&
        siteCategoryById.get(getArticleCategoryId(a))?.visible !== false
    ));

    const visibleCategories = getVisibleCategories(regularArticles);
    if (regularArticles.length === 0 && bookCovers.length === 0 && visibleCategories.length === 0) {
        allArticles = [...FALLBACK_ARTICLE_ITEMS, ...FALLBACK_BOOKS].map(a => ({
            ...normalizeArticleDoc(a, a.id),
            _isFallback: true
        }));
        renderHomeFeed(container);
        return;
    }

    // Helper: priority comparator (lower priority number = first; tiebreak by creation time desc)
    const comparePriority = (a, b) => {
        const pA = (a.priority !== undefined && a.priority !== null && !isNaN(a.priority)) ? a.priority : 10;
        const pB = (b.priority !== undefined && b.priority !== null && !isNaN(b.priority)) ? b.priority : 10;
        if (pA !== pB) return pA - pB;
        return 0;
    };

    // 1. Group regular articles by explicit Placement or AUTO.
    const explicitHero = regularArticles.filter(a => a.placement === "HERO").sort(comparePriority);
    const explicitCarousel = regularArticles.filter(a => a.placement === "CAROUSEL").sort(comparePriority);
    const autoArticles = regularArticles.filter(a => !a.placement || a.placement === "AUTO");

    // Determine Hero Article strictly from regular standalone articles
    let heroArticle = null;
    if (explicitHero.length > 0) {
        heroArticle = explicitHero[0];
    } else if (autoArticles.length > 0) {
        heroArticle = autoArticles[0];
    } else if (regularArticles.length > 0) {
        heroArticle = regularArticles[0];
    }

    // 2. Determine Carousel Articles for Top Horizontal Swipe:
    // Keep the hero separate so the same article is not shown twice above the fold.
    const heroKeys = new Set(getHomeArticleKeys(heroArticle));
    const carouselPool = [
        ...explicitCarousel,
        ...explicitHero,
        ...autoArticles
    ].filter(article => article && !getHomeArticleKeys(article).some(key => heroKeys.has(key)));
    const activeCarouselPool = carouselPool.length < 3
        ? regularArticles.filter(article => article && !getHomeArticleKeys(article).some(key => heroKeys.has(key)))
        : carouselPool;
    let swipeArticles = deduplicateHomeArticles(activeCarouselPool)
        .filter(article =>
            stripMarkdown(article.title || "").trim() &&
            Boolean(getStoryUrl(article))
        )
        .slice(0, 10);
    if (swipeArticles.length === 0) {
        swipeArticles = regularArticles.slice(0, 8);
    }
    const usedHomeArticleKeys = new Set([
        ...getHomeArticleKeys(heroArticle),
        ...swipeArticles.flatMap(getHomeArticleKeys)
    ]);

    // Track article identities so later sections do not repeat the featured content.
    let html = '';

    // ═══════════════════════════════════════════════════════════
    // 1. TOP HORIZONTAL SCROLLING CAROUSEL (AS SEEN IN PICTURE)
    // ═══════════════════════════════════════════════════════════
    if (swipeArticles.length > 0) {
        html += buildCarouselSection(swipeArticles);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. HERO FEATURED MAIN CARD (DIRECTLY BELOW CAROUSEL)
    // ═══════════════════════════════════════════════════════════
    if (heroArticle) {
        html += buildFeaturedCard(heroArticle, true);
    }

    // ═══════════════════════════════════════════════════════════
    // 3. DEDICATED BOOK SECTION
    // ═══════════════════════════════════════════════════════════
    if (bookCovers.length > 0) {
        html += buildBookShowcaseSection(bookCovers, allArticles);
    }

    const categoryGroups = new Map();
    regularArticles.forEach(article => {
        const articleKeys = getHomeArticleKeys(article);
        if (articleKeys.some(key => usedHomeArticleKeys.has(key))) return;
        const categoryId = getArticleCategoryId(article);
        if (!categoryId) return;
        articleKeys.forEach(key => usedHomeArticleKeys.add(key));
        if (!categoryGroups.has(categoryId)) categoryGroups.set(categoryId, []);
        categoryGroups.get(categoryId).push(article);
    });
    const usedCategorySectionKeys = new Set();
    categoryGroups.forEach(articles => {
        articles.forEach(article => {
            getHomeArticleKeys(article).forEach(key => usedCategorySectionKeys.add(key));
        });
    });
    visibleCategories.forEach(category => {
        const sectionArticles = categoryGroups.get(category.slug) || [];
        const selectedKeys = new Set(sectionArticles.flatMap(getHomeArticleKeys));
        const categoryArticles = regularArticles
            .filter(article => getArticleCategoryId(article) === category.slug)
            .sort(comparePriority);

        for (const article of categoryArticles) {
            if (sectionArticles.length >= 3) break;
            const articleKeys = getHomeArticleKeys(article);
            if (articleKeys.some(key => selectedKeys.has(key) || usedCategorySectionKeys.has(key))) continue;
            sectionArticles.push(article);
            articleKeys.forEach(key => {
                selectedKeys.add(key);
                usedCategorySectionKeys.add(key);
            });
        }

        if (sectionArticles.length > 0) categoryGroups.set(category.slug, sectionArticles);
    });
    const orderedCategories = visibleCategories.filter(category =>
        (categoryGroups.get(category.slug) || []).length > 0
    );
    const categorySections = [];
    orderedCategories.forEach(category => {
        const theme = getCategoryTheme();
        html += `
            <section class="category-section-block home-editorial-section category-section-${category.slug}" data-home-category-section="${escapeHtml(category.slug)}">
                ${buildCategorySectionHeader(category.slug, false, false, theme)}
                <div class="home-category-content min-h-[8rem]"></div>
            </section>
        `;
        categorySections.push({
            category,
            articles: (categoryGroups.get(category.slug) || []).sort(comparePriority)
        });
    });
    container.innerHTML = html;
    const sectionsBySlug = new Map(Array.from(
        container.querySelectorAll("[data-home-category-section]"),
        section => [section.dataset.homeCategorySection, section]
    ));
    categorySections.forEach(item => {
        const section = sectionsBySlug.get(item.category.slug);
        if (section) renderLazyHomeCategorySection(section, item.category, item.articles);
    });
    attachShowMoreListeners();
}

function renderCategoryFeed(container, category) {
    const targetNorm = slugifyCategory(normalizeCategoryName(category));
    const bookChapterIds = getBookChapterIds(allArticles);
    const matchesBookChapter = createBookChapterMatcher(allArticles);
    const isChapter = a => isChapterEntity(a) || bookChapterIds.has(a.id) || matchesBookChapter(a);
    const isBookCover = (a) => ((a.type || "").toUpperCase() === "BOOK" || (a.type || "").toLowerCase() === "free" || (a.type || "").toLowerCase() === "premium" || a.isBook === true) && !isChapter(a);

    const deduplicatedStandalone = deduplicateHomeArticles(allArticles.filter(a =>
        isPubliclyPublished(a) && !isBookCover(a) && !isChapter(a)
    ));
    const filtered = deduplicatedStandalone.filter(a => getArticleCategoryId(a) === targetNorm);

    if (filtered.length === 0) {
        if (allArticles.length === 0) return; // Keep skeleton while articles load
        let emptyHtml = `
        <div class="category-filter-banner flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-white/60 dark:bg-[#12141d]/70 backdrop-blur-md border border-[#ebdccb] dark:border-white/10">
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-[#8c7a6b] dark:text-[#94a3b8]">വിഭാഗം:</span>
                <span class="category-glass-badge">
                    <span class="font-english text-xs font-black tracking-widest uppercase">${categoryLabel(category)}</span>
                </span>
            </div>
            <button class="show-all-home-btn text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] dark:hover:text-white transition flex items-center gap-1 font-english">
                <span>&larr; ALL ARTICLES</span>
            </button>
        </div>
        <div class="article-glass-card p-10 sm:p-14 text-center cursor-default space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">ഈ വിഭാഗത്തിൽ ലേഖനങ്ങളില്ല</h3>
            <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] max-w-sm mx-auto font-['Noto_Sans_Malayalam']">തിരഞ്ഞെടുത്ത വിഭാഗത്തിൽ പുതിയ ലേഖനങ്ങൾ ഉടൻ പ്രസിദ്ധീകരിക്കും.</p>
            <button class="show-all-home-btn mt-2 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs font-bold hover:bg-[#923e1b] transition shadow-md font-english">
                &larr; ALL ARTICLES
            </button>
        </div>
        `;
        container.innerHTML = emptyHtml;
        container.querySelectorAll(".show-all-home-btn").forEach(btn => {
            btn.addEventListener("click", () => switchToCategory("ALL"));
        });
        return;
    }

    // Filter indicator banner with 'SHOW ALL' button to return home
    let html = `
    <div class="category-filter-banner flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-white/60 dark:bg-[#12141d]/70 backdrop-blur-md border border-[#ebdccb] dark:border-white/10">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-[#8c7a6b] dark:text-[#94a3b8]">വിഭാഗം:</span>
            <span class="category-glass-badge">
                <span class="font-english text-xs font-black tracking-widest uppercase">${categoryLabel(category)}</span>
            </span>
            <span class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">(${filtered.length} ലേഖനങ്ങൾ)</span>
        </div>
        <button class="show-all-home-btn text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] dark:hover:text-white transition flex items-center gap-1 font-english">
            <span>&larr; ALL ARTICLES</span>
        </button>
    </div>
    `;

    // Hero card is the latest article in this category
    html += buildFeaturedCard(filtered[0], true);

    if (filtered.length > 1) {
        const rest = filtered.slice(1);
        html += `<div class="category-section-block mt-6">`;
        html += buildCategorySectionHeader(category, false, true);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        rest.forEach(art => { html += buildCompactRecentCard(art); });
        html += `</div></div>`;
    }

    container.innerHTML = html;

    const showAllBtn = container.querySelector(".show-all-home-btn");
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => switchToCategory("ALL"));
    }
}

/* ─── Category Section Header: glass badge + show-more pill ─── */
function buildCategorySectionHeader(cat, hasMore, isFilteredView = false, theme = null) {
    const label = cat === "ALL" ? "പുതിയ ലേഖനങ്ങൾ" : categoryLabel(cat);
    const t = theme || getCategoryTheme();
    const showMoreBtn = (hasMore && !isFilteredView)
        ? `<a href="${categoryUrl(cat)}" class="show-more-pill" data-category="${cat}" title="${label} വിഭാഗത്തിലെ എല്ലാ ലേഖനങ്ങളും കാണുക" style="border-color: ${t.color}40; color: ${t.color};">
            <span class="font-english">VIEW ALL</span>
            <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
            <span class="text-xs">&rsaquo;</span>
           </a>`
        : ``;

    return `
    <div class="category-section-header flex items-center justify-between mb-2">
        ${categoryTag(cat, { variant: 'section-header', theme: t, displayText: label })}
        ${showMoreBtn}
    </div>`;
}

/* ─── Show-More → switch to category filter ─── */
function attachShowMoreListeners() {
    document.querySelectorAll(".show-more-pill:not([data-listener])").forEach(btn => {
        btn.dataset.listener = "true";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = btn.dataset.category;
            switchToCategory(cat);
        });
    });
    attachBookShelfListeners();
}

function attachBookShelfListeners() {
    const loadMoreBtn = document.getElementById("shelf-load-more-btn");
    if (!loadMoreBtn) return;

    loadMoreBtn.onclick = function() {
        const grid = document.getElementById("shelf-books-grid");
        if (!grid) return;

        const hiddenCards = grid.querySelectorAll(".premium-book-card-wrap.hidden");
        const toShow = Math.min(4, hiddenCards.length);
        for (let i = 0; i < toShow; i++) {
            hiddenCards[i].classList.remove("hidden");
        }

        const remaining = grid.querySelectorAll(".premium-book-card-wrap.hidden");
        if (remaining.length === 0) {
            const container = loadMoreBtn.parentElement;
            if (container) container.classList.add("hidden");
            loadMoreBtn.style.display = "none";
        }
    };
}

function switchToCategory(cat) {
    if (typeof window.showNuqthaView === "function") {
        window.showNuqthaView("articles");
    }
    const norm = normalizeCategoryName(cat);
    const isBooks = ["BOOK", "BOOKS"].includes((norm || "").toUpperCase());
    const upper = !norm || norm.toUpperCase() === "ALL"
        ? "ALL"
        : norm.toUpperCase() === "SAVED"
            ? "SAVED"
            : isBooks
                ? "BOOKS"
                : slugifyCategory(norm).toUpperCase();
    currentCategory = upper;
    const drawerLink = [...document.querySelectorAll("#sidebar-drawer .drawer-nav-item")]
        .find(item => (item.dataset.category || "").toUpperCase() === upper);
    setDrawerCurrentLink(drawerLink || null);
    clearSearch(false);

    // Update active state on nav links
    const articlesBtn = document.getElementById("articles-dropdown-btn");
    const booksLink = document.getElementById("nav-books-link");
    const isBook = isBooks;

    if (booksLink) booksLink.classList.toggle("active", isBook);
    if (articlesBtn) articlesBtn.classList.toggle("active", !isBook && upper !== "ALL");

    document.querySelectorAll("#category-nav .nav-category-link").forEach(link => {
        const linkCat = (link.dataset.category || "").toUpperCase();
        if (linkCat) {
            link.classList.toggle("active", linkCat === upper);
        }
    });

    // Update page title & URL hash
    if (upper === "ALL") {
        document.title = "NUQTHA | മലയാളം ഇ-മാഗസിൻ";
        if (window.location.hash && window.location.hash !== "#home") {
            try {
                history.pushState(null, "", window.location.pathname + window.location.search);
            } catch (_) {}
        }
    } else {
        const catName = isBook ? "Books" : categoryLabel(upper);
        document.title = `${catName} | NUQTHA`;
        const slug = isBook ? "books" : categorySlug(norm);
        const newHash = "#" + slug;
        if (window.location.hash !== newHash) {
            try {
                history.pushState(null, "", newHash);
            } catch (_) {}
        }
    }

    renderFeed();
    // Scroll to top of feed
    const feedEl = document.getElementById("feed-container");
    if (feedEl) feedEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

window.switchToCategory = switchToCategory;
window.filterBySavedArticles = function() {
    switchToCategory("SAVED");
};

/* ═══════════ Format Markdown/Rich Text (Render helper only) ═══════════ */
function formatRichContent(rawText, contentStyle = "") {
    if (!rawText || typeof rawText !== "string") return "";

    // 1. Clean Rendering: Collapse 3+ line breaks to standard double line break
    let cleaned = rawText
        .trim()
        .replace(/(?:\r?\n){3,}/g, "\n\n")
        .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");

    // 2. Strip clashing inline styles (font-size, color, font-family, line-height, text-align: justify)
    // while strictly keeping classes like text-marker, font-black, highlight-glass-card
    cleaned = cleaned.replace(/style\s*=\s*(["'])(.*?)\1/gi, (match, quote, styleStr) => {
        const kept = styleStr
            .split(";")
            .map(s => s.trim())
            .filter(rule => {
                if (!rule) return false;
                const lower = rule.toLowerCase();
                if (lower.startsWith("font-size") ||
                    lower.startsWith("font-family") ||
                    lower.startsWith("line-height") ||
                    lower.startsWith("color") ||
                    lower.includes("text-align: justify") ||
                    lower.includes("text-align:justify")) {
                    return false;
                }
                return true;
            })
            .join("; ");
        return kept ? `style="${kept}"` : "";
    });

    const paragraphs = cleaned
        .split(/\r?\n\r?\n/)
        .map(p => p.trim())
        .filter(p => {
            if (!p) return false;
            // Filter out empty HTML paragraphs like <p></p> or <p>&nbsp;</p>
            const stripped = p.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, "").trim();
            if (!stripped && !p.includes("<img") && !p.includes("![") && !p.includes(":::")) return false;
            return true;
        });

    return paragraphs
        .map(paragraph => {
            const p = paragraph.trim();

            // Dedicated Highlight Card Callout: :::highlight ... ::: or > [!NOTE]
            if (p.startsWith(":::highlight") && p.endsWith(":::")) {
                const inner = p.replace(/^:::highlight\s*/, "").replace(/\s*:::$/, "").trim();
                const formattedInner = inner
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black">$1</strong>')
                    .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');
                return `<div class="highlight-glass-card"><p>${formattedInner}</p></div>`;
            }

            // Subheadings: H2 (## ) and H3 (### )
            if (p.startsWith("## ")) {
                return `<h2 class="article-h2 text-xl font-bold mt-6 mb-2 text-[var(--text)] dark:text-white">${p.replace("## ", "")}</h2>`;
            }
            if (p.startsWith("### ")) {
                return `<h3 class="article-h3 text-lg font-bold mt-4 mb-2 text-[var(--text)] dark:text-white">${p.replace("### ", "")}</h3>`;
            }

            // Editorial Blockquote
            if (p.startsWith("> ")) {
                const quoteText = p.replace(/^>\s*/, "").trim()
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black">$1</strong>')
                    .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');
                return `<blockquote class="editorial-quote"><p>${quoteText}</p></blockquote>`;
            }

            // Inline Image with Layout/Size: ![caption|size](url) or ![caption](url)
            const imgMatch = p.match(/^!\[(.*?)(?:\|(small|medium|full))?\]\((.*?)\)$/);
            if (imgMatch) {
                const caption = imgMatch[1] || "";
                const url = imgMatch[3];
                return `
                    <figure class="article-image-wrap my-6">
                        <img src="${url}" alt="${caption}" class="w-full h-auto rounded-2xl mx-auto block" loading="lazy" decoding="async">
                        ${caption && caption !== "ചിത്രം" ? `<figcaption class="p-2 text-center text-xs text-[#8c7a6b] dark:text-[#94a3b8]">${caption}</figcaption>` : ''}
                    </figure>
                `;
            }

            // Parse bold (**text**) and highlight (==text==)
            let formatted = p
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-[var(--text)] dark:text-white">$1</strong>')
                .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');

            return `<p class="reading-p" ${contentStyle || ""}>${formatted}</p>`;
        })
        .join("");
}

/* ═══════════ Helper: Strip Markdown Artifacts ═══════════ */
function stripMarkdown(text) {
    if (!text || typeof text !== "string") return "";
    return text
        .replace(/:::highlight[\s\S]*?:::/g, "")
        .replace(/!\[.*?\](?:\(.*?\))?/g, "")
        .replace(/==(.*?)==/g, "$1")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/>\s+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/* ═══════════ Category Theme Helper & Subtle Variations ═══════════ */
function getCategoryTheme() {
    return {
        color: "#b4532c",
        darkColor: "#f87171",
        sectionBorder: "border-[#ebdccb] dark:border-white/10",
        cardBorder: "border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c]/40",
        bgTint: "from-white/40 to-transparent dark:from-white/[0.02] dark:to-transparent",
        badgeBg: "bg-[#b4532c]/10 dark:bg-[#b4532c]/20",
        badgeText: "text-[#b4532c] dark:text-[#f87171]",
        badgeBorder: "border-[#ebdccb] dark:border-white/20",
        accentGrad: "from-[#b8542c] to-[#803113]"
    };
}

/* ═══════════ Category Featured Card (Larger & More Prominent) ═══════════ */
function buildCategoryFeaturedCard(art, theme = null) {
    if (!art) return "";
    const t = theme || getCategoryTheme();
    const dateStr = art.date || formatDate(art.createdAt);
    const cleanTitle = stripMarkdown(art.title);
    const rawPreview = art.excerpt || (art.content ? art.content.substring(0, 160) : "");
    const cleanPreview = stripMarkdown(rawPreview);
    const preview = cleanPreview.substring(0, 150) + (cleanPreview.length > 150 ? "…" : "");
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';
    const contentStyle = art.contentColor ? `style="color: ${art.contentColor};"` : '';

    const authorName = art.author || "NUQTHA";
    const authorInitial = authorName.trim().charAt(0) || "N";
    const authorPhoto = (art && art.authorPhoto) || getAuthorPhoto(authorName, siteAuthorsMap) || "";
    const categoryMalayalam = categoryLabel(art.category);
    const categoryImage = buildCardImageMarkup(art, "w-full h-full object-cover transition-transform duration-700 group-hover:scale-105", cleanTitle, 1200, 675, false, "");
    const hasCategoryImage = hasImmediateCardImage(art);

    return `
    <article class="category-featured-card group cursor-pointer hover:shadow-xl transition-all duration-300 ${t.cardBorder}" data-id="${art.id}">
        <div class="block stretched-card-wrap">
            <!-- Large Prominent Cover Image -->
            <div class="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden bg-gradient-to-br ${t.accentGrad}">
                ${hasCategoryImage ? `
                    <div class="absolute inset-0 bg-gradient-to-br ${t.accentGrad} hidden" data-nuqtha-image-placeholder></div>
                    ${categoryImage}
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90" data-nuqtha-image-placeholder>
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                    ${categoryImage}
                `}
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"></div>
                <!-- Floating Category Badge -->
                <div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                    ${categoryTag(art.category, { variant: 'category-featured-badge', theme: t })}
                </div>
                <!-- Floating Date -->
                <div class="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/50 backdrop-blur-md text-white/90 border border-white/10 font-english">
                        ${dateStr}
                    </span>
                </div>
            </div>

            <!-- Content Area with Bolder Typography -->
            <div class="p-4 sm:p-6 space-y-2.5 sm:space-y-3">
                <h3 class="text-xl sm:text-2xl md:text-[1.65rem] font-black text-[#1e1b18] dark:text-white leading-snug tracking-tight group-hover:text-[${t.color}] transition-colors" ${titleStyle}>
                    <a href="${getStoryUrl(art)}" class="stretched-card-link text-inherit">${cleanTitle}</a>
                </h3>

                ${preview ? `
                <p class="text-xs sm:text-sm text-[#5a4b41] dark:text-[#cbd5e1] line-clamp-2 sm:line-clamp-3 leading-relaxed" ${contentStyle}>
                    ${preview}
                </p>
                ` : ''}

                <!-- Author Row -->
                <div class="flex items-center justify-start pt-3 border-t border-[#ebdccb]/60 dark:border-white/10 gap-2 flex-wrap">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
                            ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy" decoding="async">` : authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[10px] sm:text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 ${art.transcription}</span>` : ''}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </article>
    `;
}

/* ═══════════ 1. Featured Article Card (Reference Design) ═══════════ */
function buildFeaturedCard(art, eager = false) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const cleanTitle = stripMarkdown(art.title);
    const rawPreview = art.excerpt || (art.content ? art.content.substring(0, 160) : "");
    const cleanPreview = stripMarkdown(rawPreview);
    const preview = cleanPreview.substring(0, 160) + (cleanPreview.length > 160 ? "…" : "");
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';
    const contentStyle = art.contentColor ? `style="color: ${art.contentColor};"` : '';

    const authorName = art.author || "NUQTHA";
    const authorInitial = authorName.trim().charAt(0) || "N";
    const authorPhoto = (art && art.authorPhoto) || getAuthorPhoto(authorName, siteAuthorsMap) || "";
    const categoryMalayalam = categoryLabel(art.category);
    const featuredImage = buildCardImageMarkup(art, "w-full h-full object-cover transition-transform duration-700 group-hover:scale-105", cleanTitle, 1200, 750, eager, "");
    const hasFeaturedImage = hasImmediateCardImage(art);

    return `
    <article class="featured-article-card group cursor-pointer hover:shadow-2xl transition-all duration-300" data-id="${art.id}">
        <div class="block stretched-card-wrap">
            <!-- Large Top Cover Image Container -->
            <div class="featured-cover-container relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#b8542c] via-[#aa4923] to-[#803113]">
                ${hasFeaturedImage ? `
                    <div class="absolute inset-0 bg-gradient-to-br from-[#b8542c] via-[#aa4923] to-[#803113] hidden" data-nuqtha-image-placeholder></div>
                    ${featuredImage}
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90" data-nuqtha-image-placeholder>
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                    ${featuredImage}
                `}
            </div>

            <!-- Content Details Area -->
            <div class="featured-card-body p-6 sm:p-8 space-y-4">
                <!-- Category Pill & Date Row -->
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    ${categoryTag(art.category, { variant: 'featured-pill' })}
                    <span class="text-xs text-[#8c7a6b] dark:text-[#a0aec0] font-medium font-['Noto_Sans_Malayalam']">
                        ${dateStr}
                    </span>
                </div>

                <!-- Bold Title -->
                <h2 class="featured-title text-2xl sm:text-3xl font-black leading-snug tracking-tight hover:text-[#b4532c] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    <a href="${getStoryUrl(art)}" class="stretched-card-link text-inherit">${cleanTitle}</a>
                </h2>

                <!-- Excerpt text -->
                <p class="featured-excerpt text-sm sm:text-base leading-relaxed line-clamp-3 text-[#5a4b41] dark:text-[#cbd5e1]" ${contentStyle}>
                    ${preview}
                </p>

                <!-- Bottom Row: Author profile -->
                <div class="featured-bottom-row flex items-center justify-start pt-4 border-t border-[#ebdccb]/60 dark:border-white/10 gap-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center overflow-hidden flex-shrink-0">
                            ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy" decoding="async">` : authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 കേട്ടെഴുത്ത്: ${art.transcription}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </article>
    `;
}

/* ═══════════ 2. Compact Horizontal Recent Article Card ═══════════ */
function buildCompactRecentCard(art, theme = null) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const cleanTitle = stripMarkdown(art.title);
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';

    const categoryMalayalam = categoryLabel(art?.category);
    const authorName = (art && art.author) || "NUQTHA";
    const authorInitial = authorName.trim().charAt(0) || "N";
    const authorPhoto = (art && art.authorPhoto) || getAuthorPhoto(authorName, siteAuthorsMap) || "";
    const t = theme || getCategoryTheme();
    const compactImage = buildCardImageMarkup(art, "w-full h-full object-cover transition-transform duration-500 group-hover:scale-105", cleanTitle, 400, 300, false, "");
    const hasCompactImage = hasImmediateCardImage(art);

    return `
    <article class="compact-recent-card group cursor-pointer hover:shadow-lg transition-all duration-300 ${t.cardBorder}" data-id="${art.id}">
        <div class="flex items-center p-3 sm:p-4 gap-3.5 sm:gap-4 w-full stretched-card-wrap">
            <!-- Left Thumbnail -->
            <div class="compact-thumbnail-wrap relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br ${t.accentGrad}">
                ${hasCompactImage ? `
                    <div class="absolute inset-0 flex items-center justify-center text-white/80 hidden" data-nuqtha-image-placeholder>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
                    </div>
                    ${compactImage}
                ` : `
                    <div class="w-full h-full flex items-center justify-center text-white/80" data-nuqtha-image-placeholder>
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
                    </div>
                    ${compactImage}
                `}
            </div>

            <!-- Right Details -->
            <div class="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
                ${categoryTag(art.category, { variant: 'bracket', theme: t })}

                <h4 class="text-sm sm:text-base font-extrabold line-clamp-2 leading-snug group-hover:text-[${t.color}] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    <a href="${getStoryUrl(art)}" class="stretched-card-link text-inherit">${cleanTitle}</a>
                </h4>

                <div class="flex items-center gap-1.5 text-[11px] sm:text-xs flex-wrap font-['Noto_Sans_Malayalam']">
                    <div class="w-5 h-5 rounded-full overflow-hidden bg-[#ebdccb]/80 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-[#7a4124] dark:text-[#f8fafc] flex-shrink-0">
                        ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy" decoding="async">` : authorInitial}
                    </div>
                    <span class="font-bold text-[#1e1b18] dark:text-white">${authorName}</span>
                    ${art.transcription ? `<span class="text-[#8c7a6b] dark:text-[#a0aec0]">(📝 ${art.transcription})</span>` : ''}
                    <span class="text-[#8c7a6b] dark:text-[#a0aec0]">• ${dateStr}</span>
                </div>
            </div>
        </div>
    </article>
    `;
}

/* ═══════════ Backward Compatibility buildCard ═══════════ */
function buildCard(art) {
    return buildFeaturedCard(art);
}

/* ═══════════ Full-Width Auto-Play Banner Carousel ═══════════ */
function buildBannerCarousel(articles) {
    if (!articles || articles.length === 0) return '';

    const slides = articles.map((art, i) => {
        const dateStr = art.date || formatDate(art.createdAt);
        const catLabel = categoryLabel(art.category);
        const cleanTitle = stripMarkdown(art.title);
        const rawExcerpt = art.excerpt || (art.content ? art.content.substring(0, 160) : '');
        const cleanExcerpt = stripMarkdown(rawExcerpt);
        const excerpt = cleanExcerpt.substring(0, 130) + (cleanExcerpt.length > 130 ? '…' : '');
        const authorName = art.author || "NUQTHA";
        const slideCover = getArticleImageUrl(art, "/article-placeholder.svg");
        const bgStyle = 'background-image: url("' + slideCover + '"), url("/article-placeholder.svg"); background-size: cover; background-position: center;';

        return '<div class="banner-slide' + activeClass + '" data-index="' + i + '" data-id="' + art.id + '">' +
            '<div class="banner-slide-bg" style="' + bgStyle + '"></div>' +
            '<div class="banner-slide-overlay"></div>' +
            '<a href="' + getStoryUrl(art) + '" class="banner-slide-content" draggable="false">' +
                '<span class="banner-cat-pill">' + catLabel + '</span>' +
                '<h2 class="banner-slide-title">' + cleanTitle + '</h2>' +
                (excerpt ? '<p class="banner-slide-excerpt">' + excerpt + '</p>' : '') +
                '<div class="banner-slide-meta flex items-center gap-2">' +
                    '<span class="font-bold text-[#1e1b18] dark:text-white">' + authorName + '</span>' +
                    '<span>· ' + dateStr + '</span>' +
                '</div>' +
            '</a>' +
        '</div>';
    }).join('');

    const dots = articles.map((_, i) =>
        '<button class="banner-dot' + (i === 0 ? ' banner-dot--active' : '') + '" data-slide="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>'
    ).join('');

    return '<div class="banner-carousel" id="banner-carousel" role="region" aria-label="Featured Articles Banner">' +
        '<div class="banner-slides-track" id="banner-track">' + slides + '</div>' +
        '<button class="banner-arrow banner-arrow--prev" id="banner-prev" aria-label="Previous slide">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>' +
        '</button>' +
        '<button class="banner-arrow banner-arrow--next" id="banner-next" aria-label="Next slide">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>' +
        '</button>' +
        '<div class="banner-progress-bar" id="banner-progress"></div>' +
        '<div class="banner-dots" id="banner-dots">' + dots + '</div>' +
    '</div>';
}

/* ═══════════ Legacy Horizontal Swipe Carousel (kept for backward compat) ═══════════ */
function buildCarouselSection(articles) {
    if (!articles || articles.length === 0) return '';
    const cards = articles.map((art, index) => buildCarouselCard(art, index)).join('');
    return '<div class="carousel-section">' +
        '<div class="carousel-scroll-wrapper">' +
            '<div class="carousel-scroll-track" id="carousel-track">' + cards + '</div>' +
        '</div>' +
        '<div class="carousel-dots" id="carousel-dots"></div>' +
    '</div>';
}

function buildCarouselCard(art, index = 0) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const titleStyle = art.titleColor ? 'style="color: ' + art.titleColor + ';"' : '';
    const catLabel = categoryLabel(art.category);
    const cleanTitle = stripMarkdown(art.title);
    const authorName = art.author || "NUQTHA";

    const cardImg = buildCardImageMarkup(art, "carousel-card-img", cleanTitle, 400, 300, index < 4, "");
    const hasCardImage = hasImmediateCardImage(art);
    const imagePlaceholder = '<div class="carousel-card-img-placeholder" style="display:' + (hasCardImage ? 'none' : 'flex') + ';background: linear-gradient(135deg, #2a201c, #4a3328); align-items:center; justify-content:center; color:rgba(255,255,255,0.7); font-weight:bold; font-size:12px;" data-nuqtha-image-placeholder><span style=\"font-family: \'Anek Malayalam\', sans-serif;\">' + escapeHtml(catLabel || 'ലേഖനം') + '</span></div>';
    const imgHtml = hasCardImage ? cardImg + imagePlaceholder : imagePlaceholder + cardImg;

    return '<div class="carousel-card relative cursor-pointer stretched-card-wrap" data-id="' + art.id + '">' +
        '<div class="relative w-full h-[145px] overflow-hidden flex-shrink-0">' + imgHtml + '</div>' +
        '<div class="carousel-card-body">' +
            categoryTag(art.category, { variant: 'carousel' }) +
            '<h4 class="carousel-card-title" ' + titleStyle + '><a href="' + getStoryUrl(art) + '" class="stretched-card-link text-inherit">' + cleanTitle + '</a></h4>' +
            '<p class="carousel-card-meta font-bold text-[#1e1b18] dark:text-white">' + authorName + '</p>' +
            '<p class="carousel-card-meta">' + dateStr + '</p>' +
        '</div>' +
    '</div>';
}

/* ═══════════ Auto-Play Banner Setup (called after renderFeed) ═══════════ */
let bannerAutoPlayTimer = null;

function setupBannerCarousel() {
    const banner = document.getElementById('banner-carousel');
    if (!banner) return;

    // Clear any previous interval when re-rendering
    if (bannerAutoPlayTimer) {
        clearInterval(bannerAutoPlayTimer);
        bannerAutoPlayTimer = null;
    }

    const slides = Array.from(banner.querySelectorAll('.banner-slide'));
    const dots = Array.from(banner.querySelectorAll('.banner-dot'));
    const prevBtn = document.getElementById('banner-prev');
    const nextBtn = document.getElementById('banner-next');
    const progressBar = document.getElementById('banner-progress');
    if (slides.length === 0) return;

    // Single slide: no need for controls, progress bar, or auto-advance
    if (slides.length <= 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
        const dotsWrap = document.getElementById('banner-dots');
        if (dotsWrap) dotsWrap.style.display = 'none';
        return;
    }

    let currentIndex = 0;
    const INTERVAL = 4200; // 4.2 seconds for comfortable reading

    function goTo(index, direction = 'next') {
        const prev = currentIndex;
        currentIndex = (index + slides.length) % slides.length;

        slides[prev].classList.remove('banner-slide--active', 'banner-slide--exit-left', 'banner-slide--exit-right');
        slides[currentIndex].classList.remove('banner-slide--enter-left', 'banner-slide--enter-right');

        // Set enter direction class before making active
        if (direction === 'next') {
            slides[currentIndex].classList.add('banner-slide--enter-right');
        } else {
            slides[currentIndex].classList.add('banner-slide--enter-left');
        }

        // Force reflow for animation restart
        slides[currentIndex].getBoundingClientRect();

        // Remove enter class and activate (triggers CSS transition)
        slides[currentIndex].classList.remove('banner-slide--enter-right', 'banner-slide--enter-left');
        slides[prev].classList.add(direction === 'next' ? 'banner-slide--exit-left' : 'banner-slide--exit-right');
        slides[currentIndex].classList.add('banner-slide--active');

        // Clean up exit class after animation finishes
        setTimeout(() => {
            slides[prev].classList.remove('banner-slide--exit-left', 'banner-slide--exit-right');
        }, 620);

        // Update dots
        dots.forEach((d, i) => d.classList.toggle('banner-dot--active', i === currentIndex));

        // Restart progress bar
        restartProgress();
    }

    function goNext() { goTo(currentIndex + 1, 'next'); }
    function goPrev() { goTo(currentIndex - 1, 'prev'); }

    function restartProgress() {
        if (!progressBar) return;
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';
        progressBar.getBoundingClientRect();
        progressBar.style.transition = `width ${INTERVAL}ms linear`;
        progressBar.style.width = '100%';
    }

    function startAutoPlay() {
        stopAutoPlay();
        bannerAutoPlayTimer = setInterval(goNext, INTERVAL);
        restartProgress();
    }

    function stopAutoPlay() {
        if (bannerAutoPlayTimer) {
            clearInterval(bannerAutoPlayTimer);
            bannerAutoPlayTimer = null;
        }
        if (progressBar) {
            progressBar.style.transition = 'none';
        }
    }

    // Arrow buttons
    if (prevBtn) prevBtn.addEventListener('click', () => { goPrev(); startAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goNext(); startAutoPlay(); });

    // Dot clicks
    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            const dir = i > currentIndex ? 'next' : 'prev';
            goTo(i, dir);
            startAutoPlay();
        });
    });

    // Pause on hover / touch
    if (banner) {
        banner.addEventListener('mouseenter', stopAutoPlay);
        banner.addEventListener('mouseleave', startAutoPlay);
        banner.addEventListener('touchstart', stopAutoPlay, { passive: true });
        banner.addEventListener('touchend', () => setTimeout(startAutoPlay, 1200), { passive: true });

        // Touch / swipe support
        let touchStartX = 0;
        banner.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        banner.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 48) {
                if (dx < 0) goNext(); else goPrev();
                startAutoPlay();
            }
        }, { passive: true });
    }

    // Start auto-play
    startAutoPlay();
}

function setupCarousel() {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track) return;

    const cards = Array.from(track.querySelectorAll('.carousel-card'));
    if (cards.length === 0) return;

    // Staggered entrance via IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('carousel-visible');
                observer.unobserve(entry.target);
                setTimeout(() => { entry.target.style.transitionDelay = '0ms'; }, 700);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });

    cards.forEach((card, i) => {
        card.style.transitionDelay = `${i * 65}ms`;
        observer.observe(card);
    });

    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        cards.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => scrollToCard(i));
            dotsContainer.appendChild(dot);
        });
    }

    function getCardStride() {
        const card = track.querySelector('.carousel-card');
        if (!card) return 240;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.gap) || 14;
        return card.getBoundingClientRect().width + gap;
    }

    function scrollToCard(index) {
        track.scrollTo({ left: index * getCardStride(), behavior: 'smooth' });
    }

    function updateDots() {
        if (!dotsContainer) return;
        const index = Math.round(track.scrollLeft / getCardStride());
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) =>
            d.classList.toggle('active', i === index)
        );
    }

    if (track) track.addEventListener('scroll', updateDots, { passive: true });

    // Auto-scroll every 3 seconds (3000ms) with smooth step
    let autoScrollInterval = null;
    const AUTO_INTERVAL = 3000;

    function startAutoScroll() {
        stopAutoScroll();
        if (cards.length <= 1) return;
        autoScrollInterval = setInterval(() => {
            const stride = getCardStride();
            const maxScroll = track.scrollWidth - track.clientWidth;
            if (track.scrollLeft >= maxScroll - 10) {
                // Loop back to start smoothly
                track.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                track.scrollBy({ left: stride, behavior: 'smooth' });
            }
        }, AUTO_INTERVAL);
    }

    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }

    // Pause on hover & touch
    if (track) {
        track.addEventListener('mouseenter', stopAutoScroll);
        track.addEventListener('mouseleave', startAutoScroll);
        track.addEventListener('touchstart', stopAutoScroll, { passive: true });
        track.addEventListener('touchend', () => setTimeout(startAutoScroll, 1500), { passive: true });
    }

    // Desktop Mouse Drag to Scroll with Click Protection
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let moved = false;

    track.addEventListener('mousedown', (e) => {
        isDown = true;
        moved = false;
        stopAutoScroll();
        track.classList.add('is-dragging');
        startX = e.pageX - track.offsetLeft;
        scrollStart = track.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        track.classList.remove('is-dragging');
        startAutoScroll();
    });

    track.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - track.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) moved = true;
        track.scrollLeft = scrollStart - walk;
    });

    // Prevent navigation click when dragging
    track.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Start auto-scroll initially
    startAutoScroll();
}

/* ═══════════ Interactive Book / Article Series Widget ═══════════ */
function buildBookWidget(seriesName, articles) {
    if (!articles || articles.length === 0) return '';
    const totalCount = articles.length;

    const itemsHtml = articles.map((art, idx) => {
        const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';
        const dateStr = art.date || formatDate(art.createdAt);
        return `
        <div class="playlist-item-row group/row cursor-pointer stretched-card-wrap" data-id="${art.id}">
            <div class="playlist-index-badge">
                <span>0${idx + 1}</span>
            </div>
            <div class="playlist-item-info min-w-0 flex-1">
                <h5 class="playlist-item-title line-clamp-1 group-hover/row:text-[#b4532c] dark:group-hover/row:text-[#f87171] transition-colors" ${titleStyle}>
                    <a href="${getStoryUrl(art)}" class="stretched-card-link text-inherit">${art.title}</a>
                </h5>
                <div class="flex items-center gap-2 text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                    ${categoryTag(art.category, { className: 'hover:underline font-bold text-[#b4532c] dark:text-[#f87171]' })}
                    <span>•</span>
                    <span>${dateStr}</span>
                </div>
            </div>
            <div class="playlist-play-icon text-[#b4532c] dark:text-[#f87171] opacity-70 group-hover/row:opacity-100 group-hover/row:translate-x-1 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </div>
        </div>
        `;
    }).join('');

    return `
    <div class="playlist-glass-card mt-7 mb-3 overflow-hidden" data-playlist="${seriesName}">
        <div class="playlist-header flex items-center justify-between p-4 sm:p-5 border-b border-[#ebdccb]/60 dark:border-white/10">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 font-black">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                </div>
                <div>
                    <span class="text-[10px] font-black tracking-widest uppercase font-english text-blue-600 dark:text-blue-400">SERIES / COLLECTION</span>
                    <h3 class="text-base sm:text-lg font-black text-[#1e1b18] dark:text-[#f8fafc] font-['Manjari',sans-serif] leading-tight">
                        ${seriesName}
                    </h3>
                </div>
            </div>
            <div class="playlist-count-pill font-english text-xs font-bold px-3 py-1 rounded-full bg-white/70 dark:bg-white/10 text-blue-600 dark:text-blue-400 border border-[#ebdccb] dark:border-white/15">
                ${totalCount} Articles
            </div>
        </div>
        <div class="playlist-items-list p-3 sm:p-4 space-y-2">
            ${itemsHtml}
        </div>
    </div>
    `;
}

/* ═══════════ Book / Edition Collection Card (Risala Update Style) ═══════════ */
function buildBookCard(book, articles) {
    if (!book) return "";
    const cleanTitle = stripMarkdown(book.title);
    const count = articles.length;
    const dateStr = book.date || formatDate(book.createdAt);
    const coverImage = buildCardImageMarkup(book, "w-full h-full object-cover transition-transform duration-700 group-hover:scale-105", `${cleanTitle} cover`, 600, 800, false, "/cover-placeholder.svg");

    return `
    <div class="book-glass-card group cursor-pointer overflow-hidden transition-all duration-300 flex flex-col" data-id="${book.id}">
        <!-- Cover Image Container (Vertical Magazine Style) -->
        <div class="relative w-full aspect-[3/4] overflow-hidden bg-[#1e1b18]">
            ${coverImage}
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
        </div>
        <!-- Bottom Risala-Style Banner -->
        <div class="bg-[#b4532c] text-white p-4 text-center space-y-1 group-hover:bg-[#923e1b] transition-colors">
            <h3 class="text-sm sm:text-base font-bold tracking-tight font-['Anek_Malayalam']">
                ${cleanTitle}
            </h3>
            <p class="text-[11px] text-white/90 font-english uppercase tracking-wider font-bold">
                Volume 15 • ${count} Articles
            </p>
        </div>
    </div>
    `;
}

/* ═══════════ Attach Click → Direct Navigation ═══════════ */
function attachCardListeners() {
    document.querySelectorAll(".featured-article-card, .category-featured-card, .compact-recent-card, .carousel-card, .playlist-item-row, .article-glass-card, .book-glass-card, .premium-book-card").forEach(card => {
        if (card.dataset.cardListenersAttached === "true") return;
        card.dataset.cardListenersAttached = "true";

        const warmBookPage = () => {
            const art = allArticles.find(a => a.id === card.dataset.id);
            if (!art) return;
            indexArticleSlugs([art]);
            if (!isBookEntity(art)) return;
            const storyPath = getStoryUrl(art);
            const routeSlug = storyPath.split("/").filter(Boolean).pop();
            const chapters = filterAndSortChapters(art, allArticles);
            const lightData = prefetchBookPage({ ...art, slug: routeSlug || art.slug || art.bookSlug }, chapters.length);
            if (lightData) saveBookChapterListCache(lightData.slug, chapters);
        };
        card.addEventListener("pointerenter", warmBookPage, { once: true });
        card.addEventListener("focusin", warmBookPage, { once: true });
        card.addEventListener("touchstart", warmBookPage, { once: true, passive: true });
        card.addEventListener("click", function (e) {
            warmBookPage();
            // Direct navigation to article.html
            const id = this.dataset.id;
            const art = allArticles.find(a => a.id === id);
            if (art) indexArticleSlugs([art]);
            if (id && !e.target.closest("button") && !e.target.closest("a")) {
                if (art && ((art.type || "").toUpperCase() === "BOOK" || art.isBook === true)) {
                    // Open Book index page/modal
                    openBookIndex(art);
                } else {
                    window.location.href = getStoryUrl(art || { id });
                }
            }
        });
    });
}

function openBookIndex(book) {
    if (book) {
        const storyPath = getStoryUrl(book);
        const routeSlug = storyPath.split("/").filter(Boolean).pop();
        const chapters = filterAndSortChapters(book, allArticles);
        const lightData = prefetchBookPage({ ...book, slug: routeSlug || book.slug || book.bookSlug }, chapters.length);
        if (lightData) saveBookChapterListCache(lightData.slug, chapters);
    }
    window.location.href = getStoryUrl(book);
}

/* ═══════════ Empty State ═══════════ */
function renderEmpty(message) {
    const container = document.getElementById("feed-container");
    if (!container) return;
    container.innerHTML = `
    <div class="article-glass-card p-10 sm:p-14 text-center cursor-default hover:transform-none" style="cursor: default;">
        <div class="w-14 h-14 rounded-full bg-[#b4532c]/10 text-[#b4532c] flex items-center justify-center mx-auto mb-5">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        </div>
        <p class="text-lg font-bold text-[#4a3b32] mb-2">${message}</p>
    </div>`;
}

/* ═══════════ Option 2: Full Screen Reader Overlay ═══════════ */
window.openFullScreenReader = function(id) {
    const art = allArticles.find(a => a.id === id);
    if (!art) return;
    window.currentActiveArticle = art;

    const storyUrl = getStoryUrl(art);
    try {
        history.pushState({ readerOpen: true, articleId: id }, "", storyUrl);
    } catch (e) {}

    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (!overlay) return;

    const readerTitleEl = document.getElementById("reader-title");
    readerTitleEl.textContent = art.title;
    if (art.titleColor) {
        readerTitleEl.style.color = art.titleColor;
    } else {
        readerTitleEl.style.color = '';
    }

    const catEl = document.getElementById("reader-category");
    if (catEl) {
        catEl.textContent = categoryLabel(art.category);
        catEl.href = categoryUrl(art.category);
        catEl.onclick = (e) => {
            e.preventDefault();
            window.closeFullScreenReader(true);
            switchToCategory((art.category || 'HISTORY').toUpperCase());
        };
    }
    const authorEl = document.getElementById("reader-author");
    if (authorEl) authorEl.textContent = art.author || "NUQTHA";

    const transContainer = document.getElementById("reader-transcription-container");
    const transEl = document.getElementById("reader-transcription");
    if (transContainer && transEl) {
        if (art.transcription) {
            transEl.textContent = art.transcription;
            transContainer.classList.remove("hidden");
        } else {
            transContainer.classList.add("hidden");
        }
    }

    const dateEl = document.getElementById("reader-date");
    if (dateEl) dateEl.textContent = art.date || formatDate(art.createdAt);

    const contentStyle = art.contentColor ? `style="color: ${art.contentColor};"` : '';
    const contentColorStyle = contentStyle;

    const contentEl = document.getElementById("reader-content");
    if (contentEl) contentEl.innerHTML = formatRichContent(art.content || art.excerpt || "", contentColorStyle);
    if (overlay) overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
};

window.closeFullScreenReader = function(triggerHistoryBack = false) {
    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "auto";
    if (triggerHistoryBack) {
        try {
            if (history.state && history.state.readerOpen) {
                history.back();
            }
        } catch (e) {}
    }
};

window.addEventListener("popstate", (e) => {
    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (overlay && !overlay.classList.contains("hidden")) {
        if (!e.state || !e.state.readerOpen) {
            window.closeFullScreenReader(false);
        }
    }
});

window.shareArticle = function(platform) {
    let url = "";
    if (window.currentActiveArticle) {
        url = getStoryUrl(window.currentActiveArticle);
    }
    if (!url || url === "/" || url === "#") {
        url = window.location.href;
    }
    if (url.startsWith("/")) {
        url = window.location.origin + url;
    }
    const title = document.getElementById("reader-title")?.textContent || document.title || "NUQTHA Article";
    if (platform === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}`, '_blank');
    } else if (platform === 'telegram') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
    } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'instagram') {
        navigator.clipboard.writeText(url).then(() => {
            const label = document.getElementById('share-copy-label');
            if (label) {
                const prev = label.textContent;
                label.textContent = 'Link Copied!';
                setTimeout(() => { label.textContent = prev; }, 2000);
            }
            window.open('https://www.instagram.com/', '_blank');
        }).catch(() => {
            window.open('https://www.instagram.com/', '_blank');
        });
    } else if (platform === 'copy') {
        navigator.clipboard.writeText(url).then(() => {
            const label = document.getElementById('share-copy-label');
            if (label) {
                label.textContent = 'Copied!';
                setTimeout(() => { label.textContent = 'Copy Link'; }, 2000);
            }
        }).catch(() => {
            console.info('Article Link:', url);
        });
    }
};

function formatDate(ts) {
    if (!ts) return "";
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
}



/* ═══════════ HELPER: COUNT ARTICLES BELONGING TO A BOOK ═══════════ */
function getBookArticleCount(book, articles) {
    if (typeof countBookChapters === 'function') {
        return countBookChapters(book, articles);
    }
    if (!book || !articles) return 0;
    const bId = (book.id || "").trim();
    const bName = (book.bookName || "").trim();
    const bTitle = (book.title || "").trim();
    return articles.filter(a => {
        if (!a || a.id === book.id || a.type === "BOOK" || a.isBook === true) return false;
        if (bId && a.bookId && a.bookId === bId) return true;
        if (bName && a.bookName && a.bookName === bName) return true;
        if (bTitle && a.bookName && a.bookName === bTitle) return true;
        return false;
    }).length;
}

/* ═══════════ 1. HOME PAGE BOOK SHOWCASE / PREMIUM BOOK SHELF ═══════════ */
function buildBookShowcaseSection(bookCovers, allArticles) {
    const buildBooksHeading = includeShowMore => `
        <div class="category-section-header home-book-section-header">
            <h2 class="home-editorial-heading">
                <a href="${categoryUrl('BOOKS')}" class="category-pill-link category-section-title-link" data-category="BOOKS" title="എല്ലാ പുസ്തകങ്ങളും കാണുക (View all books)" aria-label="എല്ലാ പുസ്തകങ്ങളും കാണുക">
                    <span class="home-editorial-heading-dot" aria-hidden="true"></span>
                    <span class="font-english" translate="no">BOOKS &amp; EDITIONS</span>
                </a>
            </h2>
            ${includeShowMore ? `
                <a href="${categoryUrl('BOOKS')}" class="show-more-pill" data-category="BOOKS" title="എല്ലാ പുസ്തകങ്ങളും കാണുക" style="border-color: #b4532c40; color: #b4532c;">
                    <span class="font-english text-[11px] sm:text-xs" translate="no">SHOW MORE</span>
                    <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
                    <span class="text-xs">&rsaquo;</span>
                </a>
            ` : ""}
        </div>
    `;

    if (!bookCovers || bookCovers.length === 0) {
        return `
        <section class="premium-books-section home-editorial-section" aria-label="Books and Editions">
            ${buildBooksHeading(false)}
            <div class="py-10 px-4 text-center text-sm font-['Noto_Sans_Malayalam'] text-[#8c7a6b] dark:text-[#94a3b8] space-y-3">
                <p>പുസ്തകങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല.</p>
                <button type="button" onclick="window.location.reload()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-warm)] text-xs font-bold text-[var(--terracotta)] hover:bg-black/5 dark:hover:bg-white/5 transition">
                    <span>വീണ്ടും ശ്രമിക്കുക (Retry)</span>
                </button>
            </div>
        </section>
        `;
    }

    const booksHtml = bookCovers.map((book, idx) => {
        if (!book) return '';
        const cleanTitle = (typeof stripMarkdown === 'function' ? stripMarkdown(book.title || '') : (book.title || '')).trim() || 'Untitled Book';
        const count = typeof getBookArticleCount === 'function' ? getBookArticleCount(book, allArticles) : 0;
        const authorName = (book.author || book.authorName || 'നൂഖ്ത എഡിറ്റോറിയൽ').trim();
        const displayDate = book.date || book.publishDate || '';
        const isHidden = idx >= 4;

        // Premium & Pricing Check
        const isPremium = Boolean(
            book.isPremium === true ||
            book.category === 'Premium Book' ||
            (typeof book.category === 'string' && book.category.toLowerCase().includes('premium')) ||
            (Array.isArray(book.tags) && book.tags.some(t => String(t).toLowerCase().includes('premium')))
        );
        const rawPrice = Number(book.price);
        const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
        const isFree = !isPremium || price === 0;

        const bookCoverMarkup = buildCardImageMarkup(book, "premium-book-img", cleanTitle, 300, 400, idx < 4, "/cover-placeholder.svg");
        const bookId = book.id || '';
        const bookHref = bookId ? getStoryUrl(book) : '#';

        return `
        <div class="premium-book-card-wrap ${isHidden ? 'hidden' : ''}">
            <a href="${bookHref}" class="premium-book-card group" data-id="${bookId}" aria-label="${cleanTitle}">
                <div class="premium-book-3d-wrap">
                    <div class="premium-book-floor-shadow" aria-hidden="true"></div>
                    <div class="premium-book-cover">
                        <div class="premium-book-spine" aria-hidden="true"></div>
                        ${isFree ? `
                            <span class="premium-book-ribbon" style="background: linear-gradient(135deg, #059669, #0d9488); color: #fff;" translate="no">₹0 FREE</span>
                        ` : `
                            <span class="premium-book-ribbon" translate="no">₹${price} • PREMIUM</span>
                        `}
                        ${bookCoverMarkup}
                    </div>
                </div>
                <div class="premium-book-info">
                    <h3 class="premium-book-title">${cleanTitle}</h3>
                    <p class="premium-book-author">${authorName}</p>
                    <div class="premium-book-meta-row">
                        <span class="premium-book-chip">
                            <span aria-hidden="true">📖</span>
                            <span>${count} അധ്യായങ്ങൾ</span>
                        </span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-english ${isFree ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'}">
                            ${isFree ? '₹0 • സൗജന്യം' : `₹${price} • PREMIUM`}
                        </span>
                        ${displayDate ? `<span>${displayDate}</span>` : ''}
                    </div>
                </div>
            </a>
        </div>
        `;
    }).join('');

    const showMoreBtnHtml = bookCovers.length > 4 ? `
    <div class="flex justify-center mt-4 sm:mt-6">
        <button id="shelf-load-more-btn" class="premium-books-load-more-btn" type="button" aria-controls="shelf-books-grid">
            <span>കൂടുതൽ കാണുക</span>
            <span class="opacity-70 font-english text-xs" translate="no">(Show more)</span>
            <span aria-hidden="true">&darr;</span>
        </button>
    </div>
    ` : '';

    return `
    <section class="premium-books-section home-editorial-section" aria-label="Books and Editions">
        ${buildBooksHeading(true)}

        <div id="shelf-books-grid" class="premium-books-grid">
            ${booksHtml}
        </div>

        ${showMoreBtnHtml}
    </section>
    `;
}

/* ═══════════ 2. BOOKS CATEGORY PAGE LAYOUT ═══════════ */
function renderBooksCategoryFeed(container) {
    const bookCovers = getBookCoverItems(allArticles.filter(isPubliclyPublished));

    let html = `
    <div class="category-filter-banner flex items-center justify-between p-4 mb-6 rounded-2xl bg-white/70 dark:bg-[#12141d]/70 backdrop-blur-md border border-[#ebdccb] dark:border-white/10 shadow-xs">
        <div class="flex items-center gap-3">
            <span class="text-2xl sm:text-3xl">📚</span>
            <div>
                <h2 class="text-base sm:text-lg font-black text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                    പുസ്തകങ്ങളും പ്രത്യേക പതിപ്പുകളും (Books & Editions)
                </h2>
                <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                    ${bookCovers.length} പ്രസിദ്ധീകരണങ്ങൾ ലഭ്യമാണ് (Published Issues & Volumes)
                </p>
            </div>
        </div>
        <button class="show-all-home-btn text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] dark:hover:text-white transition flex items-center gap-1 font-english cursor-pointer">
            <span>&larr; ALL STORIES</span>
        </button>
    </div>
    `;

    if (bookCovers.length === 0) {
        html += `
        <div class="p-12 text-center rounded-3xl bg-white/50 border border-dashed border-[#ebdccb] text-slate-400 text-xs">
            നിലവിൽ പുസ്തകങ്ങളൊന്നും പ്രസിദ്ധീകരിച്ചിട്ടില്ല.
        </div>
        `;
    } else {
        html += `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            ${bookCovers.map((book, index) => {
                const cleanTitle = stripMarkdown(book.title);
                const isPremium = Boolean(
                    book.type === 'premium' ||
                    book.bookType === 'premium' ||
                    book.accessType === 'premium' ||
                    book.isPremium === true ||
                    book.category === 'Premium Book' ||
                    (typeof book.category === 'string' && book.category.toLowerCase().includes('premium'))
                );
                const rawPrice = Number(book.price);
                const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
                const isFree = !isPremium || price === 0;
                const bookCoverMarkup = buildCardImageMarkup(book, "w-full h-full object-cover transition-transform duration-700 group-hover:scale-105", cleanTitle, 600, 800, index < 4, "/cover-placeholder.svg");
                        const volumeText = String(book.volume || "");
                        const issueText = String(book.issue || "");
                        const volumeLabel = volumeText
                            ? (volumeText.toLowerCase().includes("vol") ? volumeText : `Volume ${volumeText}`)
                    : "";
                        const issueLabel = issueText
                            ? (issueText.toLowerCase().includes("issue") ? issueText : `Issue: ${issueText}`)
                    : "";
                const volumeIssueLabel = [volumeLabel, issueLabel].filter(Boolean).map(escapeHtml).join(" • ");

                return `
                <div class="book-glass-card group cursor-pointer flex flex-col bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] dark:hover:border-[#f87171] shadow-2xs hover:shadow-lg transition-all duration-300 relative" data-id="${book.id}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        <span class="absolute top-2.5 right-2.5 z-10 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-english ${isFree ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700 shadow-md' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-md'}">
                            ${isFree ? 'FREE' : 'PREMIUM'}
                        </span>
                        ${bookCoverMarkup}
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <span class="text-[11px] font-bold text-white uppercase font-english tracking-wider flex items-center gap-1 bg-[#b4532c] px-3 py-1 rounded-full shadow">
                                <span>തുറക്കുക</span>
                                <span>&rarr;</span>
                            </span>
                        </div>
                    </div>
                    <!-- Maroon Title Banner -->
                    <div class="bg-[#b4532c] text-white py-1.5 px-2 text-center text-xs font-black font-['Anek_Malayalam'] truncate shadow-xs">
                        ${cleanTitle}
                    </div>
                    <!-- Details / Meta Underneath -->
                    <div class="py-2.5 px-2.5 text-center bg-[#fbf7ee]/40 dark:bg-white/[0.02] border-t border-[#ebdccb]/60 dark:border-white/10 space-y-1">
                        ${volumeIssueLabel ? `<p class="text-xs font-bold text-[#1e1b18] dark:text-white font-english tracking-wide truncate">${volumeIssueLabel}</p>` : ""}
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                            ${book.date || 'Recent Issue'}
                        </p>
                        <div class="pt-1.5">
                            <span class="inline-block w-full text-center bg-[#A75D3A] text-white py-1 px-2.5 rounded-lg text-xs font-bold shadow-2xs hover:opacity-90 transition">
                                ${isFree ? 'Read Free' : 'Buy Now'}
                            </span>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        `;
    }

    container.innerHTML = html;

    const showAllBtn = container.querySelector(".show-all-home-btn");
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => switchToCategory("ALL"));
    }
}

// ========================================================
// SECTION 3: APP.JS - Load Books Dynamically (Fix Delete Issue)
// ========================================================
export async function loadBooksToFrontend() {
  const container = document.getElementById('booksContainer');
  if (!container) return;

  try {
    const { books } = await fetchPublicCollections();
    const visibleBooks = books.filter(isPubliclyPublished);
    container.innerHTML = "";

    if (visibleBooks.length === 0) {
      container.innerHTML = "<p class='text-gray-500 py-6 text-center text-xs'>No books found.</p>";
      return;
    }

    visibleBooks.forEach((book) => {
      const isPremium = book.type === 'premium' || book.isPremium === true;
      const targetUrl = book.slug ? `/book/${encodeURIComponent(book.slug)}` : `/article.html?id=${encodeURIComponent(book.id)}`;

      const card = document.createElement("div");
      card.className = "bg-white dark:bg-[#12141d] p-4 rounded-xl shadow border border-gray-100 dark:border-white/10 flex flex-col justify-between";
      card.innerHTML = `
        <div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded ${isPremium ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'}">
            ${isPremium ? 'PREMIUM' : 'FREE'}
          </span>
          <h3 class="font-bold text-lg mt-2 text-gray-800 dark:text-white">${book.title || 'Untitled Book'}</h3>
          <p class="text-sm text-gray-600 dark:text-slate-400">Author: ${book.author || 'Nuqtha Press'}</p>
        </div>
        <a href="${targetUrl}" class="mt-4 bg-[#A75D3A] text-white px-3 py-1.5 rounded text-sm hover:opacity-90 transition text-center inline-block font-semibold">
          ${isPremium ? 'Buy Now' : 'Read Free'}
        </a>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.warn("[Books] Dynamic load error:", err);
  }
}
window.loadBooksToFrontend = loadBooksToFrontend;
