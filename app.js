/**
 * NUQTHA — Frosted Glass Feed Engine
 * Realtime Firestore → Category-Sectioned Feed, Latest-First
 */
import { db, collection, query, orderBy, onSnapshot } from "./firebase-config.js";

let allArticles = [];
let currentCategory = "ALL";

// Ordered list of categories shown on HOME
const CATEGORY_ORDER = ["HISTORY", "STUDY", "STORY"];

// Malayalam labels map
const CATEGORY_ML = {
    "HISTORY": "ചരിത്രം",
    "STUDY": "പഠനം",
    "STORY": "കഥ"
};

function categoryLabel(cat) {
    return CATEGORY_ML[cat] || cat || "ലേഖനം";
}

document.addEventListener("DOMContentLoaded", () => {
    setupThemeToggle();
    setupCategoryNav();
    setupDotsMenu();
    listenForArticles();
});

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

/* ═══════════ 3-Dots Dropdown Menu ═══════════ */
function setupDotsMenu() {
    const dotsBtn = document.getElementById("dots-menu-btn");
    const dropdown = document.getElementById("dots-dropdown");

    if (dotsBtn && dropdown) {
        dotsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
        });

        // Close dropdown when tapping anywhere outside
        document.addEventListener("click", (e) => {
            if (!dropdown.contains(e.target) && e.target !== dotsBtn) {
                dropdown.classList.add("hidden");
            }
        });
    }
}

/* ═══════════ Category Tab Switching ═══════════ */
function setupCategoryNav() {
    const links = document.querySelectorAll("#category-nav .nav-category-link");
    links.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            switchToCategory(link.dataset.category);
        });
    });
}

/* ═══════════ Firestore Realtime Listener & Hard Diagnostic Engine ═══════════ */
const POSSIBLE_COLLECTIONS = ["articles", "posts", "content"];

async function listenForArticles() {
    console.group("%c[NUQTHA DIAGNOSTIC] Initializing Article Fetch Engine", "color: #b4532c; font-weight: bold; font-size: 14px;");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Configured Project ID:", "nuqtha-c0900");
    console.log("Checking collections:", POSSIBLE_COLLECTIONS);
    console.groupEnd();

    let dataLoaded = false;

    function processAndRender(fsList, sourceCol) {
        if (!Array.isArray(fsList) || fsList.length === 0) {
            console.warn(`[NUQTHA DIAGNOSTIC] processAndRender received empty or non-array from ${sourceCol}:`, fsList);
            return;
        }

        console.log(`%c[NUQTHA SUCCESS] Received ${fsList.length} articles from '${sourceCol}'! Processing...`, "color: #16a34a; font-weight: bold; font-size: 13px;", fsList);

        dataLoaded = true;
        const localList = getLocalArticles();
        const ids = new Set(fsList.map(a => a.id));
        allArticles = [...fsList, ...localList.filter(a => !ids.has(a.id))];

        // Global latest-first client-side sorting (No Firestore composite index required)
        allArticles.sort((a, b) => {
            const getMillis = (item) => {
                if (item.createdAt?.toMillis) return item.createdAt.toMillis();
                if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
                if (item.updatedAt?.toMillis) return item.updatedAt.toMillis();
                if (item.updatedAt?.seconds) return item.updatedAt.seconds * 1000;
                if (item.createdAt) {
                    const parsed = new Date(item.createdAt).getTime();
                    if (!isNaN(parsed)) return parsed;
                }
                if (item.date) {
                    const parsed = new Date(item.date).getTime();
                    if (!isNaN(parsed)) return parsed;
                }
                return 0;
            };
            return getMillis(b) - getMillis(a);
        });

        console.log(`[NUQTHA DIAGNOSTIC] Successfully mapped & sorted ${allArticles.length} total articles. Rendering feed...`);
        renderFeed();
    }

    // Pipeline 1: Native Firestore SDK Collection Listeners (Direct collection bypass without complex indexes)
    POSSIBLE_COLLECTIONS.forEach(colName => {
        try {
            console.log(`[NUQTHA DIAGNOSTIC] Attaching Firestore SDK listener to collection: '${colName}'...`);
            const colRef = collection(db, colName);

            // 1. Direct onSnapshot (bypasses all indexing requirements)
            onSnapshot(colRef, (snapshot) => {
                console.log(`[NUQTHA DIAGNOSTIC] SDK onSnapshot event on '${colName}': docs count = ${snapshot.size}, empty = ${snapshot.empty}`);
                if (!snapshot.empty) {
                    const items = snapshot.docs.map(d => {
                        const data = d.data();
                        console.log(`[NUQTHA DIAGNOSTIC] Raw Doc [${d.id}]:`, data);
                        return { id: d.id, ...data };
                    });
                    processAndRender(items, `Firestore-SDK:${colName}`);
                } else if (!dataLoaded && colName === "articles") {
                    console.info(`[NUQTHA DIAGNOSTIC] Collection '${colName}' snapshot is currently empty.`);
                }
            }, (err) => {
                console.error(`%c[NUQTHA PERMISSION/QUERY ERROR] Failed onSnapshot on '${colName}':`, "color: #dc2626; font-weight: bold;", err.code, err.message, err);
            });

            // 2. Direct getDocs fallback in parallel
            getDocs(colRef).then(snap => {
                if (!snap.empty && !dataLoaded) {
                    console.log(`%c[NUQTHA DIAGNOSTIC] getDocs resolved with ${snap.size} docs from '${colName}'!`, "color: #0284c7; font-weight: bold;");
                    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    processAndRender(items, `Firestore-getDocs:${colName}`);
                }
            }).catch(getErr => {
                console.warn(`[NUQTHA DIAGNOSTIC] getDocs('${colName}') notice:`, getErr.message);
            });

        } catch(e) {
            console.error(`[NUQTHA DIAGNOSTIC] Error initializing SDK listener for '${colName}':`, e);
        }
    });

    // Pipeline 2: Instant REST HTTP API (Works even if WebSockets or gRPC are blocked by ISP/browser)
    async function fetchViaRest() {
        for (const colName of POSSIBLE_COLLECTIONS) {
            try {
                const url = `https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/${colName}?key=AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e`;
                console.log(`[NUQTHA DIAGNOSTIC] Querying REST endpoint: ${url}`);
                const res = await fetch(url);
                console.log(`[NUQTHA DIAGNOSTIC] REST Response for '${colName}': HTTP ${res.status}`);
                
                if (res.ok) {
                    const data = await res.json();
                    console.log(`[NUQTHA DIAGNOSTIC] REST Data payload for '${colName}':`, data);
                    if (data && data.documents && data.documents.length > 0) {
                        const restArticles = data.documents.map(doc => {
                            const id = doc.name.split("/").pop();
                            const f = doc.fields || {};
                            return {
                                id,
                                title: f.title?.stringValue || "",
                                category: f.category?.stringValue || "GENERAL",
                                author: f.author?.stringValue || "NUQTHA",
                                imageUrl: f.imageUrl?.stringValue || "",
                                excerpt: f.excerpt?.stringValue || "",
                                content: f.content?.stringValue || "",
                                titleColor: f.titleColor?.stringValue || "#1e1b18",
                                contentColor: f.contentColor?.stringValue || "#2b2118",
                                placement: f.placement?.stringValue || "AUTO",
                                priority: f.priority ? (parseInt(f.priority.integerValue || f.priority.doubleValue || f.priority.stringValue, 10) || 10) : 10,
                                playlistName: f.playlistName?.stringValue || "",
                                date: f.date?.stringValue || "",
                                createdAt: f.createdAt?.timestampValue || doc.createTime
                            };
                        });
                        console.log(`%c[NUQTHA SUCCESS] REST pipeline parsed ${restArticles.length} articles from '${colName}'!`, "color: #16a34a; font-weight: bold;");
                        processAndRender(restArticles, `REST:${colName}`);
                        break;
                    }
                } else {
                    const errText = await res.text();
                    console.error(`%c[NUQTHA REST ERROR] HTTP ${res.status} on '${colName}':`, "color: #dc2626;", errText);
                }
            } catch(e) {
                console.warn(`[NUQTHA DIAGNOSTIC] REST attempt on '${colName}' failed:`, e.message);
            }
        }

        // Final local fallback check if remote has not responded
        setTimeout(() => {
            if (!dataLoaded) {
                const local = getLocalArticles();
                if (local.length > 0) {
                    console.log(`[NUQTHA DIAGNOSTIC] Using local storage articles as fallback (${local.length} found).`);
                    allArticles = local;
                    renderFeed();
                } else {
                    console.warn("[NUQTHA DIAGNOSTIC] No articles retrieved from Firestore or LocalStorage. Displaying empty state banner.");
                    renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
                }
            }
        }, 1500);
    }

    fetchViaRest();
}

function getLocalArticles() {
    try {
        return JSON.parse(localStorage.getItem("nuqtha_local_articles") || "[]");
    } catch(e) {
        return [];
    }
}

/* ═══════════ Render Feed ═══════════ */
function renderFeed() {
    const container = document.getElementById("feed-container");
    if (!container) return;

    if (currentCategory === "ALL") {
        renderHomeFeed(container);
    } else {
        renderCategoryFeed(container, currentCategory);
    }

    attachCardListeners();
    attachShowMoreListeners();
    setupCarousel();
}

/* ─── HOME: Layout Manager Aware (Hero, Carousel, Playlist Series, Category Feed) ─── */
function renderHomeFeed(container) {
    if (allArticles.length === 0) {
        renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
        return;
    }

    // Helper: priority comparator (lower priority number = first; tiebreak by creation time desc)
    const comparePriority = (a, b) => {
        const pA = (a.priority !== undefined && a.priority !== null && !isNaN(a.priority)) ? a.priority : 10;
        const pB = (b.priority !== undefined && b.priority !== null && !isNaN(b.priority)) ? b.priority : 10;
        if (pA !== pB) return pA - pB;
        return 0; // maintain latest-first sorted order
    };

    // 1. Group articles by explicit Placement or AUTO
    const explicitHero = allArticles.filter(a => a.placement === "HERO").sort(comparePriority);
    const explicitCarousel = allArticles.filter(a => a.placement === "CAROUSEL").sort(comparePriority);
    const explicitFeed = allArticles.filter(a => a.placement === "FEED").sort(comparePriority);
    const autoArticles = allArticles.filter(a => !a.placement || a.placement === "AUTO");

    let usedIds = new Set();
    let html = "";

    // ═══════════ TOP BANNER CAROUSEL (Directly under floating glass nav) ═══════════
    // Pools CAROUSEL items, HERO items, and latest AUTO articles for a rich auto-playing slider
    const carouselPool = [
        ...explicitCarousel,
        ...explicitHero,
        ...autoArticles
    ];
    carouselPool.sort(comparePriority);

    const carouselSelection = [];
    carouselPool.forEach(a => {
        if (!carouselSelection.some(c => c.id === a.id) && carouselSelection.length < 10) {
            carouselSelection.push(a);
        }
    });

    if (carouselSelection.length > 0) {
        html += buildCarouselSection(carouselSelection);
    }

    // ═══════════ MAIN FEATURED HERO CARD (Directly below banner) ═══════════
    let heroArticle = null;
    if (explicitHero.length > 0) {
        heroArticle = explicitHero[0];
    } else if (autoArticles.length > 0) {
        heroArticle = autoArticles[0];
    } else {
        heroArticle = allArticles[0];
    }

    if (heroArticle) {
        html += buildFeaturedCard(heroArticle);
        usedIds.add(heroArticle.id);
    }

    // 3. Playlist / Article Series Section (Group 3-4 articles into named series widget)
    const playlistsMap = {};
    allArticles.forEach(a => {
        if (a.playlistName && a.playlistName.trim()) {
            const key = a.playlistName.trim();
            if (!playlistsMap[key]) playlistsMap[key] = [];
            playlistsMap[key].push(a);
        }
    });

    // Render interactive playlist widget for any playlist with 2+ articles
    Object.keys(playlistsMap).forEach(pName => {
        const pArticles = playlistsMap[pName].sort(comparePriority);
        if (pArticles.length >= 2) {
            html += buildPlaylistWidget(pName, pArticles);
        }
    });

    // 4. Category Feed: Standard categorized list with remaining articles
    // Discover all unique categories present across articles
    const existingCats = new Set(allArticles.map(a => (a.category || "").toUpperCase()).filter(Boolean));
    const orderedCats = [...CATEGORY_ORDER.filter(c => existingCats.has(c)), ...[...existingCats].filter(c => !CATEGORY_ORDER.includes(c))];

    orderedCats.forEach(cat => {
        // Collect articles for this category that can appear in the feed
        const catArticles = allArticles.filter(a => (a.category || "").toUpperCase() === cat).sort(comparePriority);
        if (catArticles.length === 0) return;

        // Show up to 4 compact cards per section under each category
        const preview = catArticles.slice(0, 4);
        const hasMore = catArticles.length > 4;

        html += buildCategorySectionHeader(cat, hasMore);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        preview.forEach(art => {
            html += buildCompactRecentCard(art);
        });
        html += `</div>`;
    });

    // If no categorized articles exist, list remaining articles in a default section
    if (orderedCats.length === 0 && allArticles.length > 1) {
        const rest = allArticles.filter(a => a.id !== heroArticle.id);
        html += buildCategorySectionHeader("ALL", false);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        rest.forEach(art => { html += buildCompactRecentCard(art); });
        html += `</div>`;
    }

    container.innerHTML = html;
}

/* ─── CATEGORY VIEW: full filtered feed ─── */
function renderCategoryFeed(container, category) {
    const filtered = allArticles.filter(a => (a.category || "").toUpperCase() === category);

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
                <span class="font-english text-xs font-black tracking-widest uppercase">${category}</span>
                <span class="font-['Noto_Sans_Malayalam'] text-xs font-bold">· ${categoryLabel(category)}</span>
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
function buildCategorySectionHeader(cat, hasMore, isFilteredView = false) {
    const label = cat === "ALL" ? "പുതിയ ലേഖനങ്ങൾ" : categoryLabel(cat);
    const showMoreBtn = (hasMore && !isFilteredView)
        ? `<button class="show-more-pill" data-category="${cat}" title="${label} വിഭാഗത്തിലെ എല്ലാ ലേഖനങ്ങളും കാണുക">
            <span class="font-english">SHOW MORE</span>
            <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
            <span class="text-xs">&rsaquo;</span>
           </button>`
        : ``;

    return `
    <div class="category-section-header flex items-center justify-between mt-7 mb-1">
        <div class="category-glass-badge">
            <span class="font-english text-xs font-black tracking-wider uppercase text-[#b4532c] dark:text-[#f87171]">${cat === "ALL" ? "" : cat + " · "}</span>
            <span class="font-['Noto_Sans_Malayalam'] text-xs font-bold text-[#1e1b18] dark:text-[#f1f5f9]">${label}</span>
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
    // Update nav active state
    document.querySelectorAll("#category-nav .nav-category-link").forEach(link => {
        link.classList.toggle("active", link.dataset.category === cat);
    });
    renderFeed();
    // Scroll to top of feed
    const feedEl = document.getElementById("feed-container");
    if (feedEl) feedEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ═══════════ Format Markdown/Rich Text (Bold, Highlight, Subheadings, Inline Images, Highlight Cards) ═══════════ */
function formatRichContent(rawText, contentStyle) {
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

            return `<p class="text-base sm:text-lg leading-relaxed mb-4" ${contentStyle}>${formatted}</p>`;
        })
        .join("");
}

/* ═══════════ 1. Featured Article Card (Reference Design) ═══════════ */
function buildFeaturedCard(art) {
    const dateStr = art.date || formatDate(art.createdAt);
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
    const preview = art.excerpt || (art.content ? art.content.substring(0, 160) + "…" : "");
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';
    const contentStyle = art.contentColor ? `style="color: ${art.contentColor};"` : '';

    const authorName = art.author || "NUQTHA";
    const authorInitial = authorName.trim().charAt(0) || "N";

    const categoryMalayalam = categoryLabel(art.category);

    return `
    <article class="featured-article-card group cursor-pointer hover:shadow-2xl transition-all duration-300" data-id="${art.id}">
        <a href="article.html?id=${art.id}" class="block">
            <!-- Large Top Cover Image Container -->
            <div class="featured-cover-container relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#b8542c] via-[#aa4923] to-[#803113]">
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="${art.title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90">
                        <span class="text-sm font-semibold tracking-wide text-white/75">[ലേഖന ചിത്രം ഇവിടെ]</span>
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
                        ${dateStr} &bull; ${readMin} മിനിറ്റ് വായന
                    </span>
                </div>

                <!-- Bold Title -->
                <h2 class="featured-title text-2xl sm:text-3xl font-black leading-snug tracking-tight hover:text-[#b4532c] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${art.title}
                </h2>

                <!-- Excerpt text -->
                <p class="featured-excerpt text-sm sm:text-base leading-relaxed line-clamp-3 text-[#5a4b41] dark:text-[#cbd5e1]" ${contentStyle}>
                    ${preview}
                </p>

                <!-- Bottom Row: Author profile & Sleek 'വായിക്കുക →' Button -->
                <div class="featured-bottom-row flex items-center justify-between pt-4 border-t border-[#ebdccb]/60 dark:border-white/10 gap-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center">
                            ${authorInitial}
                        </div>
                        <span class="text-xs font-bold text-[#4a3c33] dark:text-[#e2e8f0] font-['Noto_Sans_Malayalam']">
                            ${authorName}
                        </span>
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
function buildCompactRecentCard(art) {
    const dateStr = art.date || formatDate(art.createdAt);
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';

    const categoryMalayalam = categoryLabel(art.category);

    return `
    <article class="compact-recent-card group cursor-pointer hover:shadow-lg transition-all duration-300" data-id="${art.id}">
        <a href="article.html?id=${art.id}" class="flex items-center p-3 sm:p-4 gap-3.5 sm:gap-4 w-full">
            <!-- Left Thumbnail -->
            <div class="compact-thumbnail-wrap w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-[#b8542c] to-[#803113]">
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="${art.title}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                ` : `
                    <div class="w-full h-full flex items-center justify-center text-white/70 text-[10px]">
                        ചിത്രം
                    </div>
                `}
            </div>

            <!-- Right Details -->
            <div class="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
                <span class="text-[11px] font-bold text-[#b4532c] dark:text-[#f87171] uppercase font-['Noto_Sans_Malayalam'] tracking-wide">
                    [${categoryMalayalam}]
                </span>

                <h4 class="text-sm sm:text-base font-extrabold line-clamp-2 leading-snug group-hover:text-[#b4532c] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${art.title}
                </h4>

                <p class="text-[11px] sm:text-xs text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                    ${dateStr} &bull; ${readMin} മിനിറ്റ് വായന
                </p>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ Backward Compatibility buildCard ═══════════ */
function buildCard(art) {
    return buildFeaturedCard(art);
}

/* ═══════════ Top Banner Auto-Playing Carousel ═══════════ */
let carouselTimer = null;

function buildCarouselSection(articles) {
    if (!articles || articles.length === 0) return '';
    const cards = articles.map(art => buildCarouselCard(art)).join('');
    return `
    <div class="carousel-section top-banner-carousel" id="top-banner-carousel">
        <div class="carousel-section-header">
            <div class="category-glass-badge">
                <span class="pulse-indicator"></span>
                <span class="font-english text-xs font-black tracking-wider uppercase text-terracotta">TRENDING · </span>
                <span style="font-family: 'Noto Sans Malayalam', sans-serif;" class="text-xs font-bold">പുതിയ ലേഖനങ്ങൾ</span>
            </div>
            <div class="carousel-nav-btns">
                <button class="carousel-nav-btn" id="carousel-prev" aria-label="Previous">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button class="carousel-nav-btn" id="carousel-next" aria-label="Next">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        </div>
        <div class="carousel-scroll-wrapper">
            <div class="carousel-scroll-track" id="carousel-track">${cards}</div>
        </div>
        <div class="carousel-dots" id="carousel-dots"></div>
    </div>`;
}

function buildCarouselCard(art) {
    const dateStr = art.date || formatDate(art.createdAt);
    const words = (art.content || '').length;
    const readMin = Math.max(1, Math.round(words / 400));
    const titleStyle = art.titleColor ? `style="color: ${art.titleColor};"` : '';
    const catLabel = categoryLabel(art.category);
    return `
    <a href="article.html?id=${art.id}" class="carousel-card" data-id="${art.id}">
        <div class="carousel-card-img-wrap">
            ${art.imageUrl
                ? `<img src="${art.imageUrl}" alt="${art.title}" class="carousel-card-img" loading="lazy">`
                : `<div class="carousel-card-img-placeholder"><svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.45)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>`
            }
            <span class="carousel-card-cat-badge">${catLabel}</span>
        </div>
        <div class="carousel-card-body">
            <h4 class="carousel-card-title" ${titleStyle}>${art.title}</h4>
            <div class="carousel-card-meta">
                <span>${dateStr}</span>
                <span>•</span>
                <span>${readMin} min വായന</span>
            </div>
        </div>
    </a>`;
}

function setupCarousel() {
    const track = document.getElementById('carousel-track');
    const container = document.getElementById('top-banner-carousel');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track) return;

    // Clear any previous auto-play timers to prevent leaks
    if (carouselTimer) {
        clearInterval(carouselTimer);
        carouselTimer = null;
    }

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
        card.style.transitionDelay = `${i * 60}ms`;
        observer.observe(card);
    });

    // Build dot indicators
    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        cards.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => {
                scrollToCard(i);
                resetAutoPlay();
            });
            dotsContainer.appendChild(dot);
        });
    }

    function getCardStride() {
        const card = track.querySelector('.carousel-card');
        if (!card) return 260;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.gap) || 16;
        return card.getBoundingClientRect().width + gap;
    }

    function getActiveIndex() {
        const stride = getCardStride();
        return Math.round(track.scrollLeft / stride);
    }

    function scrollToCard(index) {
        const stride = getCardStride();
        const maxScroll = track.scrollWidth - track.clientWidth;
        let targetScroll = index * stride;
        if (targetScroll > maxScroll) targetScroll = maxScroll;
        track.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }

    function stepNext() {
        const maxScroll = track.scrollWidth - track.clientWidth - 10;
        if (track.scrollLeft >= maxScroll) {
            // Loop back to beginning smoothly
            track.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            const currentIdx = getActiveIndex();
            const nextIdx = (currentIdx + 1) >= cards.length ? 0 : currentIdx + 1;
            scrollToCard(nextIdx);
        }
    }

    function stepPrev() {
        if (track.scrollLeft <= 10) {
            scrollToCard(cards.length - 1);
        } else {
            const currentIdx = getActiveIndex();
            const prevIdx = (currentIdx - 1) < 0 ? 0 : currentIdx - 1;
            scrollToCard(prevIdx);
        }
    }

    function updateDots() {
        if (!dotsContainer) return;
        const index = Math.min(cards.length - 1, Math.max(0, getActiveIndex()));
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) =>
            d.classList.toggle('active', i === index)
        );
    }

    // Auto-Play: shifts every 3.5 seconds
    function startAutoPlay() {
        if (carouselTimer || cards.length <= 1) return;
        carouselTimer = setInterval(() => {
            stepNext();
        }, 3500);
    }

    function stopAutoPlay() {
        if (carouselTimer) {
            clearInterval(carouselTimer);
            carouselTimer = null;
        }
    }

    function resetAutoPlay() {
        stopAutoPlay();
        startAutoPlay();
    }

    // Hover & touch pauses auto-play
    if (container) {
        container.addEventListener('mouseenter', stopAutoPlay);
        container.addEventListener('mouseleave', startAutoPlay);
        container.addEventListener('touchstart', stopAutoPlay, { passive: true });
        container.addEventListener('touchend', () => {
            setTimeout(startAutoPlay, 2000);
        }, { passive: true });
    }

    if (prevBtn) prevBtn.addEventListener('click', () => {
        stepPrev();
        resetAutoPlay();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        stepNext();
        resetAutoPlay();
    });

    track.addEventListener('scroll', updateDots, { passive: true });

    // Launch auto-play
    startAutoPlay();
}

/* ═══════════ Interactive Playlist / Article Series Widget ═══════════ */
function buildPlaylistWidget(seriesName, articles) {
    if (!articles || articles.length === 0) return '';
    const totalCount = articles.length;
    const leadArticle = articles[0];

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
        <!-- Playlist Header Banner -->
        <div class="playlist-header flex items-center justify-between p-4 sm:p-5 border-b border-[#ebdccb]/60 dark:border-white/10">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-[#b4532c]/10 dark:bg-white/10 text-[#b4532c] dark:text-[#f87171] flex items-center justify-center flex-shrink-0 font-black">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                </div>
                <div>
                    <span class="text-[10px] font-black tracking-widest uppercase font-english text-[#b4532c] dark:text-[#f87171]">SERIES PLAYLIST</span>
                    <h3 class="text-base sm:text-lg font-black text-[#1e1b18] dark:text-[#f8fafc] font-['Manjari',sans-serif] leading-tight">
                        ${seriesName}
                    </h3>
                </div>
            </div>
            <div class="playlist-count-pill font-english text-xs font-bold px-3 py-1 rounded-full bg-white/70 dark:bg-white/10 text-[#b4532c] dark:text-[#f87171] border border-[#ebdccb] dark:border-white/15">
                ${totalCount} Articles
            </div>
        </div>

        <!-- Articles List Container -->
        <div class="playlist-items-list p-3 sm:p-4 space-y-2">
            ${itemsHtml}
        </div>
    </div>
    `;
}

/* ═══════════ Attach Click → Direct Navigation ═══════════ */
function attachCardListeners() {
    document.querySelectorAll(".featured-article-card, .compact-recent-card, .carousel-card, .playlist-item-row, .article-glass-card").forEach(card => {
        card.addEventListener("click", function (e) {
            // Direct navigation to article.html
            const id = this.dataset.id;
            if (id && !e.target.closest("button") && !e.target.closest("a")) {
                window.location.href = `article.html?id=${id}`;
            }
        });
    });
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
        <a href="admin.html" class="inline-flex items-center gap-2 mt-3 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs font-bold uppercase tracking-wider font-english hover:bg-[#923e1b] transition shadow-md">
            Admin Dashboard
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </a>
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

    document.getElementById("reader-category").textContent = art.category || "GENERAL";
    document.getElementById("reader-author").textContent = art.author || "NUQTHA";
    document.getElementById("reader-date").textContent = art.date || formatDate(art.createdAt);

    const contentColorStyle = art.contentColor ? `style="color: ${art.contentColor};"` : 'style="color: #2b2118;"';

    document.getElementById("reader-content").innerHTML = formatRichContent(art.content || art.excerpt || "", contentColorStyle);
    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
};

window.closeFullScreenReader = function() {
    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "auto";
};
function formatDate(ts) {
    if (!ts) return "";
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
}
