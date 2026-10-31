import { safeInit } from "./js/ui-safe.js";
/**
 * NUQTHA — Frosted Glass Feed Engine
 * Realtime Firestore → Category-Sectioned Feed, Latest-First
 * Protected by Strict Schema Validator & Safe Fallbacks
 */
import { db, collection, onSnapshot } from "./firebase-config.js";
import { normalizeArticleDoc, parseTimestampMillis, formatDateSafe } from "./schema-validator.js";
import { getSiteOrigin, getAbsoluteUrl, updatePageMeta, PRIMARY_DOMAIN } from "./site-config.js";
import { countBookChapters, filterAndSortChapters } from "./js/book-data.js";
import { getAuthorsMap, getAuthorPhoto, slugifyAuthor } from "./js/author-service.js";

let allArticles = [];
try {
    const cachedArts = sessionStorage.getItem('nuqtha_cached_articles');
    if (cachedArts) allArticles = JSON.parse(cachedArts);
} catch (e) {}
let siteAuthorsMap = null;
try {
    const stored = sessionStorage.getItem('nuqtha_cached_authors');
    if (stored) siteAuthorsMap = JSON.parse(stored);
} catch (e) {}

getAuthorsMap(db).then(map => {
    siteAuthorsMap = map;
    if (typeof renderFeed === 'function' && allArticles.length > 0) {
        renderFeed();
    }
}).catch(() => {});
let currentCategory = "ALL";

// Ordered list of categories shown on HOME
const CATEGORY_ORDER = ["HISTORY", "STUDY", "STORY"];

// Category labels map (English)
const CATEGORY_ML = {
    "HISTORY": "HISTORY",
    "STUDY": "STUDY",
    "STORY": "STORY"
};

function categoryLabel(cat) {
    if (!cat) return "GENERAL";
    return CATEGORY_ML[cat.toUpperCase()] || cat.toUpperCase();
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

let currentSearchQuery = "";

function initApp() {
    setupThemeToggle();
    setupCategoryNav();
    setupArticlesDropdown();
    setupBooksNavLink();
    setupMoreDropdown();
    setupHomeLink();
    setupSidebarDrawer();
    setupSearch();
    checkUrlCategory();
    listenForArticles();
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

function setupMoreDropdown() {
    const moreBtn = document.getElementById("more-categories-btn");
    const dropdown = document.getElementById("more-categories-dropdown");
    const arrow = document.getElementById("more-arrow");

    if (!moreBtn || !dropdown) return;

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

function isBookEntity(article) {
    if (!article) return false;
    if (article.type === "BOOK") return true;
    if (article.bookId && String(article.bookId).trim()) return true;
    if (article.bookName && String(article.bookName).trim()) return true;
    if (article.playlistName && String(article.playlistName).trim()) return true;
    if (article.category && (article.category.toLowerCase() === "premium book" || article.category.toLowerCase() === "book")) return true;
    return false;
}

function updateMoreCategoriesMenu() {
    // Populate dynamic categories into Articles dropdown
    const container = document.getElementById("dynamic-articles-categories");
    if (!container) return;

    const baseCats = new Set(["ALL", "HISTORY", "STUDY", "STORY", "BOOKS", "BOOK", "PREMIUM BOOK"]);
    const extraCats = new Set();

    allArticles.forEach(a => {
        if (isBookEntity(a)) return;
        const cat = (a.category || "").toUpperCase().trim();
        if (cat && !baseCats.has(cat)) {
            extraCats.add(cat);
        }
    });

    if (extraCats.size === 0) {
        container.innerHTML = "";
        return;
    }

    let html = `<div class="border-t border-[#ebdccb]/60 dark:border-white/10 my-1"></div>`;
    extraCats.forEach(cat => {
        const malLabel = categoryLabel(cat);
        html += `
            <a href="#" data-category="${cat}" class="articles-dropdown-item flex items-center justify-between px-4 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#1e1b18] dark:text-white transition uppercase font-english">
                <span>${cat}</span>
                <span class="text-[10px] text-[#8c7a6b] font-normal font-['Noto_Sans_Malayalam']">${malLabel}</span>
            </a>
        `;
    });
    container.innerHTML = html;
}

function setupGlobalCategoryBadges() {
    document.addEventListener("click", (e) => {
        const badge = e.target.closest(".category-glass-badge, .category-badge-pill, .carousel-card-cat, [data-badge-category]");
        if (badge) {
            const cat = badge.dataset.badgeCategory || badge.dataset.category;
            if (cat) {
                e.preventDefault();
                e.stopPropagation();
                switchToCategory(cat.toUpperCase());
            }
        }
    });
}

function checkUrlCategory() {
    const params = new URLSearchParams(window.location.search);
    const catParam = params.get('category') || params.get('cat');
    const hash = window.location.hash.replace(/^#/, '').trim();

    let targetCat = catParam || '';
    if (!targetCat && hash && hash !== 'home') {
        const hashClean = hash.replace(/^category=/, '').trim();
        targetCat = hashClean;
    }

    if (targetCat) {
        const upper = targetCat.toUpperCase();
        if (upper === 'BOOK' || upper === 'BOOKS') {
            switchToCategory('BOOKS');
        } else {
            switchToCategory(upper);
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
        if (sunIcon) sunIcon.classList.remove("hidden");
        if (moonIcon) moonIcon.classList.add("hidden");
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-mode");
            localStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");

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
            document.getElementById("sidebar-drawer")?.classList.remove("drawer-open");
            document.getElementById("sidebar-backdrop")?.classList.remove("backdrop-active");
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

    function openDrawer() {
        if (drawer) drawer.classList.add("drawer-open");
        if (backdrop) backdrop.classList.add("backdrop-active");
        document.body.style.overflow = "hidden";
    }

    function closeDrawer() {
        if (drawer) drawer.classList.remove("drawer-open");
        if (backdrop) backdrop.classList.remove("backdrop-active");
        document.body.style.overflow = "";
    }

    if (toggleBtn) toggleBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    document.querySelectorAll(".drawer-nav-item").forEach(item => {
        if (!item) return;
        item.addEventListener("click", (e) => {
            const cat = item.dataset.category;
            if (cat) {
                e.preventDefault();
                switchToCategory(cat);
                closeDrawer();
            }
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeDrawer();
    });
}

/* ═══════════ Real-Time Article Search Setup ═══════════ */
function setupSearch() {
    const searchToggleBtn = document.getElementById("header-search-btn");
    const searchContainer = document.getElementById("header-search-container");
    const headerInput = document.getElementById("header-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");
    const drawerInput = document.getElementById("drawer-search-input");

    function onSearchChange(val) {
        currentSearchQuery = val;
        if (headerInput && headerInput.value !== val) headerInput.value = val;
        if (drawerInput && drawerInput.value !== val) drawerInput.value = val;
        if (headerClearBtn) {
            headerClearBtn.classList.toggle("hidden", !val.trim());
        }
        renderFeed();
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

    if (drawerInput) {
        drawerInput.addEventListener("input", (e) => {
            onSearchChange(e.target.value);
            // Open header search container as well so state is consistent
            if (searchContainer && searchContainer.classList.contains("hidden")) {
                searchContainer.classList.remove("hidden");
            }
        });
    }

    if (headerClearBtn) {
        headerClearBtn.addEventListener("click", () => clearSearch(true));
    }
}

function clearSearch(triggerRender = true) {
    currentSearchQuery = "";
    const headerInput = document.getElementById("header-search-input");
    const drawerInput = document.getElementById("drawer-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");
    if (headerInput) headerInput.value = "";
    if (drawerInput) drawerInput.value = "";
    if (headerClearBtn) headerClearBtn.classList.add("hidden");
    if (triggerRender) renderFeed();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ═══════════ Shared Firestore Article Listener ═══════════ */
function listenForArticles() {
    const articlesRef = collection(db, "articles");
    let hasServerSnapshot = false;
    let restArticles = [];
    let restFetchPromise = null;

    onSnapshot(articlesRef, snapshot => {
        const snapshotArticles = snapshot.docs.map(articleDoc => {
            const article = articleDoc.data();
            return normalizeArticleDoc({
                ...article,
                title: sanitizeMalayalamText(article.title),
                author: sanitizeMalayalamText(article.author),
                excerpt: sanitizeMalayalamText(article.excerpt),
                content: sanitizeMalayalamText(article.content),
                playlistName: sanitizeMalayalamText(article.playlistName)
            }, articleDoc.id);
        });

        hasServerSnapshot = !snapshot.metadata.fromCache;
        if (snapshotArticles.length > 0) {
            allArticles = sortArticles(snapshotArticles);
            try { sessionStorage.setItem('nuqtha_cached_articles', JSON.stringify(allArticles)); } catch (e) {}
            renderFeed();
        } else if (!snapshot.metadata.fromCache) {
            allArticles = [];
            renderFeed();
        }
    }, error => {
        console.error("Firestore articles listener failed:", error);
        loadArticlesFromRest();
    });

    loadArticlesFromRest();

    async function loadArticlesFromRest() {
        if (restFetchPromise) return restFetchPromise;

        restFetchPromise = (async () => {
            try {
                const { apiKey, projectId } = db.app.options;
                if (!apiKey || !projectId) {
                    throw new Error("Firebase project ID or API key is missing.");
                }

                const documents = [];
                let nextPageToken = "";
                do {
                    const params = new URLSearchParams({ pageSize: "300", key: apiKey });
                    if (nextPageToken) params.set("pageToken", nextPageToken);
                    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/articles?${params}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Firestore REST request failed (${response.status}): ${await response.text()}`);
                    }

                    const page = await response.json();
                    documents.push(...(page.documents || []));
                    nextPageToken = page.nextPageToken || "";
                } while (nextPageToken);

                restArticles = documents.map(document => {
                    const id = document.name.split("/").pop();
                    const fields = decodeFirestoreFields(document.fields || {});
                    return normalizeArticleDoc({
                        ...fields,
                        createdAt: fields.createdAt || document.createTime,
                        updatedAt: fields.updatedAt || document.updateTime
                    }, id);
                });

                if (restArticles.length > 0) {
                    allArticles = sortArticles(restArticles);
                    try { sessionStorage.setItem('nuqtha_cached_articles', JSON.stringify(allArticles)); } catch (e) {}
                    renderFeed();
                } else if (!hasServerSnapshot && allArticles.length === 0) {
                    renderFeed();
                }
            } catch (error) {
                console.error("Firestore REST article fetch failed:", error);
                if (!hasServerSnapshot && allArticles.length === 0) {
                    renderEmpty("ലേഖനങ്ങൾ Firestore-ൽ നിന്ന് ലോഡ് ചെയ്യാനായില്ല. നെറ്റ്‌വർക്ക്, Firebase project ID, Firestore Rules എന്നിവ പരിശോധിക്കുക.");
                }
            } finally {
                restFetchPromise = null;
            }
        })();

        return restFetchPromise;
    }
}

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
    } else {
        renderCategoryFeed(container, currentCategory);
    }

    attachCardListeners();
    attachShowMoreListeners();
    setupCarousel();
}

/* ═══════════ Search Feed: Displays matching articles ═══════════ */
function renderSearchFeed(container, query) {
    const lower = query.toLowerCase();
    const matched = allArticles.filter(art => {
        if (isBookEntity(art)) return false;
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
        html += buildFeaturedCard(matched[0]);
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

/* ─── HOME FEED: Scrolling Carousel + Hero Featured + Dedicated Books + Category Feeds ─── */
function renderHomeFeed(container) {
    // Filter out book covers and chapters completely from standard home feed
    const regularArticles = allArticles.filter(a => !isBookEntity(a));
    const bookCovers = allArticles.filter(a => a.type === "BOOK");

    if (regularArticles.length === 0 && bookCovers.length === 0) {
        if (allArticles.length === 0) return;
        renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
        return;
    }

    if (regularArticles.length === 0 && bookCovers.length > 0) {
        container.innerHTML = buildBookShowcaseSection(bookCovers, allArticles);
        attachShowMoreListeners();
        return;
    }

    // Helper: priority comparator (lower priority number = first; tiebreak by creation time desc)
    const comparePriority = (a, b) => {
        const pA = (a.priority !== undefined && a.priority !== null && !isNaN(a.priority)) ? a.priority : 10;
        const pB = (b.priority !== undefined && b.priority !== null && !isNaN(b.priority)) ? b.priority : 10;
        if (pA !== pB) return pA - pB;
        return 0;
    };

    // 1. Group regular articles by explicit Placement or AUTO (No books/chapters!)
    const explicitHero = regularArticles.filter(a => a.placement === "HERO").sort(comparePriority);
    const explicitCarousel = regularArticles.filter(a => a.placement === "CAROUSEL").sort(comparePriority);
    const autoArticles = regularArticles.filter(a => !a.placement || a.placement === "AUTO");

    // Determine Hero Article strictly from regular standalone articles
    let heroArticle = null;
    let usedIds = new Set();

    if (explicitHero.length > 0) {
        heroArticle = explicitHero[0];
        usedIds.add(heroArticle.id);
    } else if (autoArticles.length > 0) {
        heroArticle = autoArticles[0];
        usedIds.add(heroArticle.id);
    } else if (regularArticles.length > 0) {
        heroArticle = regularArticles[0];
        usedIds.add(heroArticle.id);
    }

    // 2. Determine Carousel Articles for Top Horizontal Swipe:
    // Pool regular articles marked for CAROUSEL or HERO or recent AUTO (No books/chapters!)
    const carouselPool = [
        ...explicitCarousel,
        heroArticle,
        ...explicitHero.filter(a => a.id !== heroArticle?.id),
        ...autoArticles.filter(a => a.id !== heroArticle?.id)
    ].filter(Boolean);

    // Deduplicate
    const carouselSeen = new Set();
    const swipeArticles = carouselPool.filter(a => {
        if (carouselSeen.has(a.id)) return false;
        carouselSeen.add(a.id);
        return true;
    }).slice(0, 10);

    // Track used IDs for subsequent sections
    swipeArticles.forEach(a => usedIds.add(a.id));

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
        html += buildFeaturedCard(heroArticle);
    }

    // ═══════════════════════════════════════════════════════════
    // 3. DEDICATED BOOK SECTION
    // ═══════════════════════════════════════════════════════════
    if (bookCovers.length > 0) {
        html += buildBookShowcaseSection(bookCovers, allArticles);
    }

    // ═══════════════════════════════════════════════════════════
    // 4. CATEGORY FEEDS
    // ═══════════════════════════════════════════════════════════
    const existingCats = new Set(regularArticles.map(a => (a.category || "").toUpperCase().trim()).filter(Boolean));
    const orderedCats = [...CATEGORY_ORDER.filter(c => existingCats.has(c)), ...[...existingCats].filter(c => !CATEGORY_ORDER.includes(c) && c !== "BOOKS" && c !== "BOOK" && c !== "PREMIUM BOOK")];

    orderedCats.forEach(cat => {
        const catArticles = regularArticles.filter(a => (a.category || "").toUpperCase().trim() === cat).sort(comparePriority);
        if (catArticles.length === 0) return;

        const theme = getCategoryTheme(cat);
        const featuredArt = catArticles[0];
        const subsequentArticles = catArticles.slice(1, 5);
        const hasMore = catArticles.length > 5;
        const catName = categoryLabel(cat);

        html += `
        <section class="category-section-block category-section-${cat.toLowerCase()} mt-7 sm:mt-9 p-4 sm:p-5 rounded-3xl border ${theme.sectionBorder} bg-gradient-to-b ${theme.bgTint}">
            ${buildCategorySectionHeader(cat, hasMore, false, theme)}
            
            <!-- Category Featured Card -->
            <div class="category-featured-wrapper mt-3 mb-3 sm:mb-4">
                ${buildCategoryFeaturedCard(featuredArt, theme)}
            </div>

            <!-- Subsequent Compact Cards -->
            ${subsequentArticles.length > 0 ? `
            <div class="category-cards-list space-y-2.5 sm:space-y-3">
                ${subsequentArticles.map(art => buildCompactRecentCard(art, theme)).join('')}
            </div>
            ` : ''}

            ${hasMore ? `
            <div class="flex justify-end pt-3">
                <button class="show-more-pill" data-category="${cat}" title="${catName} വിഭാഗത്തിലെ കൂടുതൽ ലേഖനങ്ങൾ കാണുക" style="border-color: ${theme.color}40; color: ${theme.color};">
                    <span class="font-english">VIEW ALL ${catName}</span>
                    <span class="text-xs">&rarr;</span>
                </button>
            </div>
            ` : ''}
        </section>
        `;
    });

    container.innerHTML = html;
    attachShowMoreListeners();
}

function renderCategoryFeed(container, category) {
    const filtered = allArticles.filter(a => !isBookEntity(a) && (a.category || "").toUpperCase() === category);

    if (filtered.length === 0) {
        renderEmpty(`${category} വിഭാഗത്തിൽ ലേഖനങ്ങൾ ഇപ്പോൾ ലഭ്യമല്ല.`);
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
    html += buildFeaturedCard(filtered[0]);

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
    const t = theme || getCategoryTheme(cat);
    const showMoreBtn = (hasMore && !isFilteredView)
        ? `<button class="show-more-pill" data-category="${cat}" title="${label} വിഭാഗത്തിലെ എല്ലാ ലേഖനങ്ങളും കാണുക" style="border-color: ${t.color}40; color: ${t.color};">
            <span class="font-english">SHOW MORE</span>
            <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
            <span class="text-xs">&rsaquo;</span>
           </button>`
        : ``;

    return `
    <div class="category-section-header flex items-center justify-between mb-2">
        <div class="category-glass-badge border ${t.badgeBorder}">
            <span class="w-2 h-2 rounded-full inline-block flex-shrink-0" style="background-color: ${t.color};"></span>
            <span class="font-english text-xs font-black tracking-wider uppercase ${t.badgeText}">${label}</span>
        </div>
        ${showMoreBtn}
    </div>`;
}

/* ─── Show-More → switch to category filter ─── */
function attachShowMoreListeners() {
    document.querySelectorAll(".show-more-pill").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = btn.dataset.category;
            switchToCategory(cat);
        });
    });
}

function switchToCategory(cat) {
    currentCategory = cat;
    clearSearch(false);

    // Update active state on nav links
    const articlesBtn = document.getElementById("articles-dropdown-btn");
    const booksLink = document.getElementById("nav-books-link");
    const isBook = cat === "BOOKS" || cat === "BOOK";

    if (booksLink) booksLink.classList.toggle("active", isBook);
    if (articlesBtn) articlesBtn.classList.toggle("active", !isBook);

    // Update URL hash
    if (cat === "ALL") {
        if (window.location.hash) {
            history.pushState(null, "", window.location.pathname + window.location.search);
        }
    } else {
        const newHash = "#" + cat.toLowerCase();
        if (window.location.hash !== newHash) {
            history.pushState(null, "", newHash);
        }
    }

    renderFeed();
    // Scroll to top of feed
    const feedEl = document.getElementById("feed-container");
    if (feedEl) feedEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ═══════════ Format Markdown/Rich Text (Bold, Highlight, Subheadings, Inline Images, Highlight Cards) ═══════════ */
function formatRichContent(rawText, contentStyle = "") {
    if (!rawText) return "";
    return rawText
        .split("\n\n")
        .filter(p => p.trim())
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
                return `<h2 class="article-h2">${p.replace("## ", "")}</h2>`;
            }
            if (p.startsWith("### ")) {
                return `<h3 class="article-h3">${p.replace("### ", "")}</h3>`;
            }

            // Inline Image with Layout/Size: ![caption|size](url) or ![caption](url)
            const imgMatch = p.match(/^!\[(.*?)(?:\|(small|medium|full))?\]\((.*?)\)$/);
            if (imgMatch) {
                const caption = imgMatch[1] || "";
                const size = imgMatch[2] || "full";
                const url = imgMatch[3];
                const sizeClass = size === "small" ? "img-small" : size === "medium" ? "img-medium" : "img-full";
                return `
                    <div class="article-img-wrap ${sizeClass}">
                        <img src="${url}" alt="${caption}">
                        ${caption && caption !== "ചിത്രം" ? `<div class="article-img-caption">${caption}</div>` : ''}
                    </div>
                `;
            }

            // Parse bold (**text**) and highlight (==text==)
            let formatted = p
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-[#1e1b18] dark:text-white">$1</strong>')
                .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');

            return `<p class="text-base sm:text-lg leading-relaxed mb-4" ${contentStyle || ""}>${formatted}</p>`;
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
function getCategoryTheme(cat) {
    const c = (cat || "").toUpperCase();
    if (c === "HISTORY") {
        return {
            color: "#b4532c",
            darkColor: "#f87171",
            sectionBorder: "border-[#b4532c]/25 dark:border-[#b4532c]/30",
            cardBorder: "border-[#b4532c]/25 dark:border-[#b4532c]/30 hover:border-[#b4532c]/50",
            bgTint: "from-[#b4532c]/[0.03] to-transparent dark:from-[#b4532c]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#b4532c]/10 dark:bg-[#b4532c]/20",
            badgeText: "text-[#b4532c] dark:text-[#f87171]",
            badgeBorder: "border-[#b4532c]/30 dark:border-[#b4532c]/40",
            accentGrad: "from-[#b4532c] via-[#aa4923] to-[#7c2d12]"
        };
    } else if (c === "STUDY") {
        return {
            color: "#1d4ed8",
            darkColor: "#60a5fa",
            sectionBorder: "border-[#1d4ed8]/25 dark:border-[#3b82f6]/30",
            cardBorder: "border-[#1d4ed8]/25 dark:border-[#3b82f6]/30 hover:border-[#1d4ed8]/50",
            bgTint: "from-[#1d4ed8]/[0.03] to-transparent dark:from-[#1d4ed8]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#1d4ed8]/10 dark:bg-[#1d4ed8]/20",
            badgeText: "text-[#1d4ed8] dark:text-[#60a5fa]",
            badgeBorder: "border-[#1d4ed8]/30 dark:border-[#1d4ed8]/40",
            accentGrad: "from-[#1e40af] via-[#1d4ed8] to-[#172554]"
        };
    } else if (c === "STORY") {
        return {
            color: "#059669",
            darkColor: "#34d399",
            sectionBorder: "border-[#059669]/25 dark:border-[#10b981]/30",
            cardBorder: "border-[#059669]/25 dark:border-[#10b981]/30 hover:border-[#059669]/50",
            bgTint: "from-[#059669]/[0.03] to-transparent dark:from-[#059669]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#059669]/10 dark:bg-[#059669]/20",
            badgeText: "text-[#059669] dark:text-[#34d399]",
            badgeBorder: "border-[#059669]/30 dark:border-[#059669]/40",
            accentGrad: "from-[#047857] via-[#059669] to-[#064e3b]"
        };
    }
    // Dynamic / General Fallback
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
    const t = theme || getCategoryTheme(art.category);
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

    return `
    <article class="category-featured-card group cursor-pointer hover:shadow-xl transition-all duration-300 ${t.cardBorder}" data-id="${art.id}">
        <a href="article.html?id=${art.id}" class="block">
            <!-- Large Prominent Cover Image -->
            <div class="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden bg-gradient-to-br ${t.accentGrad}">
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90">
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                `}
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"></div>
                <!-- Floating Category Badge -->
                <div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/20 shadow-sm font-english">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${t.color};"></span>
                        FEATURED · ${categoryMalayalam}
                    </span>
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
                    ${cleanTitle}
                </h3>

                ${preview ? `
                <p class="text-xs sm:text-sm text-[#5a4b41] dark:text-[#cbd5e1] line-clamp-2 sm:line-clamp-3 leading-relaxed" ${contentStyle}>
                    ${preview}
                </p>
                ` : ''}

                <!-- Author & CTA Row -->
                <div class="flex items-center justify-between pt-3 border-t border-[#ebdccb]/60 dark:border-white/10 gap-2 flex-wrap">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center flex-shrink-0 overflow-hidden">
                            ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy">` : authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[10px] sm:text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 ${art.transcription}</span>` : ''}
                        </div>
                    </div>

                    <div class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold font-english text-white shadow-sm transition-all group-hover:shadow-md" style="background-color: ${t.color};">
                        <span>വായിക്കുക</span>
                        <span class="text-xs">&rarr;</span>
                    </div>
                </div>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ 1. Featured Article Card (Reference Design) ═══════════ */
function buildFeaturedCard(art) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
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

    return `
    <article class="featured-article-card group cursor-pointer hover:shadow-2xl transition-all duration-300" data-id="${art.id}">
        <a href="article.html?id=${art.id}" class="block">
            <!-- Large Top Cover Image Container -->
            <div class="featured-cover-container relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#b8542c] via-[#aa4923] to-[#803113]">
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90">
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                `}
            </div>

            <!-- Content Details Area -->
            <div class="featured-card-body p-6 sm:p-8 space-y-4">
                <!-- Category Pill & Date / Read Time Row -->
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <span class="featured-category-pill">
                        ${categoryMalayalam}
                    </span>
                    <span class="text-xs text-[#8c7a6b] dark:text-[#a0aec0] font-medium font-['Noto_Sans_Malayalam']">
                        ${dateStr}
                    </span>
                </div>

                <!-- Bold Title -->
                <h2 class="featured-title text-2xl sm:text-3xl font-black leading-snug tracking-tight hover:text-[#b4532c] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${cleanTitle}
                </h2>

                <!-- Excerpt text -->
                <p class="featured-excerpt text-sm sm:text-base leading-relaxed line-clamp-3 text-[#5a4b41] dark:text-[#cbd5e1]" ${contentStyle}>
                    ${preview}
                </p>

                <!-- Bottom Row: Author profile & Sleek 'വായിക്കുക →' Button -->
                <div class="featured-bottom-row flex items-center justify-between pt-4 border-t border-[#ebdccb]/60 dark:border-white/10 gap-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center overflow-hidden flex-shrink-0">
                            ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy">` : authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 കേട്ടെഴുത്ത്: ${art.transcription}</span>` : ''}
                        </div>
                    </div>

                    <div class="featured-read-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs sm:text-sm font-bold shadow-md hover:bg-[#923e1b] transition-all group-hover:shadow-lg">
                        <span>വായിക്കുക</span>
                        <span class="text-base">&rarr;</span>
                    </div>
                </div>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ 2. Compact Horizontal Recent Article Card ═══════════ */
function buildCompactRecentCard(art, theme = null) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
    const cleanTitle = stripMarkdown(art.title);
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';

    const categoryMalayalam = categoryLabel(art?.category);
    const authorName = (art && art.author) || "NUQTHA";
    const authorInitial = authorName.trim().charAt(0) || "N";
    const authorPhoto = (art && art.authorPhoto) || getAuthorPhoto(authorName, siteAuthorsMap) || "";
    const t = theme || getCategoryTheme(art?.category);

    return `
    <article class="compact-recent-card group cursor-pointer hover:shadow-lg transition-all duration-300 ${t.cardBorder}" data-id="${art.id}">
        <a href="article.html?id=${art.id}" class="flex items-center p-3 sm:p-4 gap-3.5 sm:gap-4 w-full">
            <!-- Left Thumbnail -->
            <div class="compact-thumbnail-wrap w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br ${t.accentGrad}">
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
                ` : `
                    <div class="w-full h-full flex items-center justify-center text-white/70 text-[10px]">
                        ചിത്രം
                    </div>
                `}
            </div>

            <!-- Right Details -->
            <div class="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
                <span class="text-[11px] font-bold ${t.badgeText} uppercase font-['Noto_Sans_Malayalam'] tracking-wide">
                    [${categoryMalayalam}]
                </span>

                <h4 class="text-sm sm:text-base font-extrabold line-clamp-2 leading-snug group-hover:text-[${t.color}] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${cleanTitle}
                </h4>

                <div class="flex items-center gap-1.5 text-[11px] sm:text-xs flex-wrap font-['Noto_Sans_Malayalam']">
                    <div class="w-5 h-5 rounded-full overflow-hidden bg-[#ebdccb]/80 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-[#7a4124] dark:text-[#f8fafc] flex-shrink-0">
                        ${authorPhoto ? `<img src="${authorPhoto}" alt="${authorName}" class="w-full h-full object-cover" loading="lazy">` : authorInitial}
                    </div>
                    <span class="font-bold text-[#1e1b18] dark:text-white">${authorName}</span>
                    ${art.transcription ? `<span class="text-[#8c7a6b] dark:text-[#a0aec0]">(📝 ${art.transcription})</span>` : ''}
                    <span class="text-[#8c7a6b] dark:text-[#a0aec0]">• ${dateStr}</span>
                </div>
            </div>
        </a>
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
        let bgStyle = 'background: linear-gradient(135deg, #b8542c 0%, #803113 100%);';
        if (art.imageUrl) {
            bgStyle = 'background-image: url("' + art.imageUrl + '"); background-size: cover; background-position: center;';
        }

        return '<div class="banner-slide' + activeClass + '" data-index="' + i + '" data-id="' + art.id + '">' +
            '<div class="banner-slide-bg" style="' + bgStyle + '"></div>' +
            '<div class="banner-slide-overlay"></div>' +
            '<a href="article.html?id=' + art.id + '" class="banner-slide-content" draggable="false">' +
                '<span class="banner-cat-pill">' + catLabel + '</span>' +
                '<h2 class="banner-slide-title">' + cleanTitle + '</h2>' +
                (excerpt ? '<p class="banner-slide-excerpt">' + excerpt + '</p>' : '') +
                '<div class="banner-slide-meta flex items-center gap-2">' +
                    '<span class="font-bold text-[#1e1b18] dark:text-white">' + authorName + '</span>' +
                    '<span>· ' + dateStr + '</span>' +
                    '<span class="banner-read-btn">വായിക്കുക &rarr;</span>' +
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
    const cards = articles.map(art => buildCarouselCard(art)).join('');
    return '<div class="carousel-section">' +
        '<div class="carousel-section-header">' +
            '<div class="carousel-nav-btns" style="margin-left: auto;">' +
                '<button class="carousel-nav-btn" id="carousel-prev" aria-label="Previous">' +
                    '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>' +
                '</button>' +
                '<button class="carousel-nav-btn" id="carousel-next" aria-label="Next">' +
                    '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="carousel-scroll-wrapper">' +
            '<div class="carousel-scroll-track" id="carousel-track">' + cards + '</div>' +
        '</div>' +
        '<div class="carousel-dots" id="carousel-dots"></div>' +
    '</div>';
}

function buildCarouselCard(art) {
    if (!art) return "";
    const dateStr = art.date || formatDate(art.createdAt);
    const titleStyle = art.titleColor ? 'style="color: ' + art.titleColor + ';"' : '';
    const catLabel = categoryLabel(art.category);
    const cleanTitle = stripMarkdown(art.title);
    const authorName = art.author || "NUQTHA";

    const imgHtml = art.imageUrl
        ? '<img src="' + art.imageUrl + '" alt="' + cleanTitle + '" class="carousel-card-img" loading="lazy">'
        : '<div class="carousel-card-img-placeholder"><svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.45)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';

    return '<a href="article.html?id=' + art.id + '" class="carousel-card" data-id="' + art.id + '">' +
        imgHtml +
        '<div class="carousel-card-body">' +
            '<span class="carousel-card-cat category-badge-pill cursor-pointer hover:underline transition" data-category="' + (art.category || 'GENERAL') + '" title="View ' + catLabel + ' articles">' + catLabel + '</span>' +
            '<h4 class="carousel-card-title" ' + titleStyle + '>' + cleanTitle + '</h4>' +
            '<p class="carousel-card-meta font-bold text-[#1e1b18] dark:text-white">' + authorName + '</p>' +
            '<p class="carousel-card-meta">' + dateStr + '</p>' +
        '</div>' +
    '</a>';
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
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
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

    if (prevBtn) prevBtn.addEventListener('click', () => track && track.scrollBy({ left: -getCardStride() * 2, behavior: 'smooth' }));
    if (nextBtn) nextBtn.addEventListener('click', () => track && track.scrollBy({ left: getCardStride() * 2, behavior: 'smooth' }));
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
        <a href="article.html?id=${art.id}" class="playlist-item-row group/row" data-id="${art.id}">
            <div class="playlist-index-badge">
                <span>0${idx + 1}</span>
            </div>
            <div class="playlist-item-info min-w-0 flex-1">
                <h5 class="playlist-item-title line-clamp-1 group-hover/row:text-[#b4532c] dark:group-hover/row:text-[#f87171] transition-colors" ${titleStyle}>
                    ${art.title}
                </h5>
                <div class="flex items-center gap-2 text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                    <span>${categoryLabel(art.category)}</span>
                    <span>•</span>
                    <span>${dateStr}</span>
                </div>
            </div>
            <div class="playlist-play-icon text-[#b4532c] dark:text-[#f87171] opacity-70 group-hover/row:opacity-100 group-hover/row:translate-x-1 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </div>
        </a>
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

    return `
    <div class="book-glass-card group cursor-pointer overflow-hidden transition-all duration-300 flex flex-col" data-id="${book.id}">
        <!-- Cover Image Container (Vertical Magazine Style) -->
        <div class="relative w-full aspect-[3/4] overflow-hidden bg-[#1e1b18]">
            ${book.imageUrl ? `
                <img src="${book.imageUrl}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
            ` : `
                <div class="w-full h-full flex items-center justify-center text-white/50 text-xl font-bold">📘</div>
            `}
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
    document.querySelectorAll(".featured-article-card, .category-featured-card, .compact-recent-card, .carousel-card, .playlist-item-row, .article-glass-card, .book-glass-card").forEach(card => {
        card.addEventListener("click", function (e) {
            // Direct navigation to article.html
            const id = this.dataset.id;
            const art = allArticles.find(a => a.id === id);
            if (id && !e.target.closest("button") && !e.target.closest("a")) {
                if (art && art.type === "BOOK") {
                    // Open Book index page/modal
                    openBookIndex(art);
                } else {
                    window.location.href = `article.html?id=${id}`;
                }
            }
        });
    });
}

function openBookIndex(book) {
    if (book && book.id) {
        try {
            sessionStorage.setItem(`nuqtha_book_${book.id}`, JSON.stringify(book));
            if (Array.isArray(allArticles)) {
                const bookChapters = filterAndSortChapters(book, allArticles);
                sessionStorage.setItem(`nuqtha_book_articles_${book.id}`, JSON.stringify(bookChapters));
            }
        } catch (e) {}
    }
    window.location.href = `article.html?id=${book.id}`;
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
    if (catEl) catEl.textContent = categoryLabel(art.category);
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

window.closeFullScreenReader = function() {
    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "auto";
};

window.shareArticle = function(platform) {
    const url = window.location.href;
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
    return articles.filter(a => a && a.id !== book.id && a.type !== "BOOK" && ((bId && a.bookId === bId) || a.bookName === book.bookName || a.bookName === book.title)).length;
}

/* ═══════════ 1. HOME PAGE BOOK SHOWCASE / CAROUSEL SECTION (COMPACT IN MIDDLE) ═══════════ */
function buildBookShowcaseSection(bookCovers, allArticles) {
    if (!bookCovers || bookCovers.length === 0) return '';

    return `
    <section class="category-section-block book-showcase-section mt-6 sm:mt-8 p-3.5 sm:p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 bg-white/70 dark:bg-[#12141d]/70 backdrop-blur-md shadow-xs">
        <div class="category-section-header flex items-center justify-between mb-3.5">
            <div class="flex items-center gap-2">
                <div class="category-glass-badge border-[#b4532c]/30 bg-[#b4532c]/5 cursor-pointer hover:bg-[#b4532c]/10 transition" data-category="BOOKS" title="എല്ലാ പുസ്തകങ്ങളും കാണുക (View all books)">
                    <span class="w-2 h-2 rounded-full inline-block flex-shrink-0 bg-[#b4532c]"></span>
                    <span class="font-english text-[11px] sm:text-xs font-black tracking-widest uppercase text-[#b4532c] dark:text-[#f87171]">BOOKS & EDITIONS</span>
                    <span class="font-['Noto_Sans_Malayalam'] text-xs font-bold text-[#1e1b18] dark:text-white">പുസ്തകങ്ങൾ</span>
                </div>
            </div>
            <button class="show-more-pill" data-category="BOOKS" title="എല്ലാ പുസ്തകങ്ങളും കാണുക" style="border-color: #b4532c40; color: #b4532c;">
                <span class="font-english text-[11px] sm:text-xs">SHOW MORE</span>
                <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
                <span class="text-xs">&rsaquo;</span>
            </button>
        </div>

        <!-- Horizontal Swipe Showcase (Compact sizing for future additions) -->
        <div class="flex gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory">
            ${bookCovers.map(book => {
                const cleanTitle = stripMarkdown(book.title);
                const count = getBookArticleCount(book, allArticles);
                return `
                <div class="book-glass-card w-32 sm:w-36 md:w-40 flex-shrink-0 snap-start group cursor-pointer bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col" data-id="${book.id}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        ${book.imageUrl ? `
                            <img src="${book.imageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                        ` : `
                            <div class="w-full h-full flex flex-col items-center justify-center text-[#b4532c] dark:text-white/40 space-y-1">
                                <span class="text-2xl">📚</span>
                                <span class="text-[9px] font-bold font-english uppercase">Edition</span>
                            </div>
                        `}
                    </div>
                    <!-- Maroon Title Banner -->
                    <div class="bg-[#b4532c] text-white py-1 px-2 text-center text-[11px] font-bold font-['Anek_Malayalam'] truncate">
                        ${cleanTitle}
                    </div>
                    <!-- Details / Count -->
                    <div class="py-1 px-1.5 text-center bg-[#fbf7ee]/40 dark:bg-white/[0.02] border-t border-[#ebdccb]/60 dark:border-white/10 space-y-0.5">
                        <p class="text-[10px] font-bold text-[#1e1b18] dark:text-white font-english truncate">
                            ${book.date || book.category || 'Special Issue'}
                        </p>
                        <p class="text-[9px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam'] truncate">
                            ${count} ലേഖനങ്ങൾ
                        </p>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    </section>
    `;
}

/* ═══════════ 2. BOOKS CATEGORY PAGE LAYOUT ═══════════ */
function renderBooksCategoryFeed(container) {
    const bookCovers = allArticles.filter(a => a.type === "BOOK");

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
            ${bookCovers.map(book => {
                const cleanTitle = stripMarkdown(book.title);
                const count = getBookArticleCount(book, allArticles);
                return `
                <div class="book-glass-card group cursor-pointer flex flex-col bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] dark:hover:border-[#f87171] shadow-2xs hover:shadow-lg transition-all duration-300" data-id="${book.id}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        ${book.imageUrl ? `
                            <img src="${book.imageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                        ` : `
                            <div class="w-full h-full flex flex-col items-center justify-center text-[#b4532c] dark:text-white/40 space-y-1">
                                <span class="text-3xl">📚</span>
                                <span class="text-xs font-bold font-english uppercase">Book Edition</span>
                            </div>
                        `}
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
                    <div class="py-2 px-2.5 text-center bg-[#fbf7ee]/40 dark:bg-white/[0.02] border-t border-[#ebdccb]/60 dark:border-white/10 space-y-0.5">
                        <p class="text-xs font-bold text-[#1e1b18] dark:text-white font-english tracking-wide truncate">
                            ${book.volume ? (book.volume.toLowerCase().includes('vol') ? book.volume : 'Volume ' + book.volume) : 'Volume 36'} • ${book.issue ? (book.issue.toLowerCase().includes('issue') ? book.issue : 'Issue: ' + book.issue) : 'Issue: 27'}
                        </p>
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                            ${book.date || 'Recent Issue'}
                        </p>
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                            ${count} ലേഖനങ്ങൾ ഉൾക്കൊള്ളുന്നു
                        </p>
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
