/**
 * NUQTHA — Frosted Glass Feed Engine
 * Realtime Firestore → Category-Sectioned Feed, Latest-First
 */
import { db, collection, getDocs, doc, query, orderBy, onSnapshot } from "./firebase-config.js";

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

/* ═══════════ Firestore Realtime Listener ═══════════ */
function listenForArticles() {
    const articlesCol = collection(db, "articles");

    function renderWithData(fsList) {
        const localList = getLocalArticles();
        const ids = new Set(fsList.map(a => a.id));
        allArticles = [...fsList, ...localList.filter(a => !ids.has(a.id))];

        // Global latest-first sort (createdAt: desc)
        allArticles.sort((a, b) => {
            const getMillis = (item) => {
                if (item.createdAt?.toMillis) return item.createdAt.toMillis();
                if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
                if (item.createdAt) return new Date(item.createdAt).getTime();
                return 0;
            };
            return getMillis(b) - getMillis(a);
        });

        renderFeed();
    }

    // Direct listener on articles collection - works in 100% of Firestore configs
    onSnapshot(articlesCol, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderWithData(items);
    }, async (err) => {
        console.warn("Realtime listener failed, attempting one-time getDocs:", err);
        try {
            const snap = await getDocs(articlesCol);
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderWithData(items);
        } catch(fallbackErr) {
            console.error("Firestore getDocs failed:", fallbackErr);
            const local = getLocalArticles();
            if (local.length > 0) {
                allArticles = local;
                renderFeed();
            } else {
                renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
            }
        }
    });
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
}

/* ─── HOME: Hero card from global latest + per-category sections ─── */
function renderHomeFeed(container) {
    if (allArticles.length === 0) {
        renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
        return;
    }

    // Global hero: the single latest article across all categories
    let html = buildFeaturedCard(allArticles[0]);

    // Per-category sections (only categories that have articles)
    const categoriesWithArticles = CATEGORY_ORDER.filter(cat =>
        allArticles.some(a => (a.category || "").toUpperCase() === cat)
    );

    categoriesWithArticles.forEach(cat => {
        const catArticles = allArticles.filter(a => (a.category || "").toUpperCase() === cat);
        if (catArticles.length === 0) return;

        // Show up to 4 compact cards per section
        const preview = catArticles.slice(0, 4);
        const hasMore = catArticles.length > 4;

        html += buildCategorySectionHeader(cat, hasMore);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        preview.forEach(art => {
            html += buildCompactRecentCard(art);
        });
        html += `</div>`;
    });

    // If no known categories have articles, show compact list of remaining
    if (categoriesWithArticles.length === 0 && allArticles.length > 1) {
        const rest = allArticles.slice(1);
        html += `<div class="category-section-block mt-6">`;
        html += buildCategorySectionHeader("ALL", false);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        rest.forEach(art => { html += buildCompactRecentCard(art); });
        html += `</div></div>`;
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

    // Hero card is the latest in this category
    let html = buildFeaturedCard(filtered[0]);

    if (filtered.length > 1) {
        const rest = filtered.slice(1);
        html += `<div class="category-section-block mt-6">`;
        html += buildCategorySectionHeader(category, false);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        rest.forEach(art => { html += buildCompactRecentCard(art); });
        html += `</div></div>`;
    }

    container.innerHTML = html;
}

/* ─── Category Section Header: glass badge + show-more pill ─── */
function buildCategorySectionHeader(cat, hasMore) {
    const label = cat === "ALL" ? "പുതിയ ലേഖനങ്ങൾ" : categoryLabel(cat);
    const showMoreBtn = hasMore
        ? `<button class="show-more-pill" data-category="${cat}">SHOW MORE &rsaquo;</button>`
        : ``;
    return `
    <div class="category-section-header flex items-center justify-between mt-6 mb-0">
        <div class="category-glass-badge">
            <span class="font-english text-xs font-black tracking-widest uppercase">${cat === "ALL" ? "" : cat + " · "}</span><span class="font-['Noto_Sans_Malayalam'] text-xs font-bold">${label}</span>
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

/* ═══════════ Attach Click → Direct Navigation ═══════════ */
function attachCardListeners() {
    document.querySelectorAll(".article-glass-card").forEach(card => {
        card.addEventListener("click", function (e) {
            // Direct navigation to article.html
            const id = this.dataset.id;
            if (id && !e.target.closest("button")) {
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

    const fullContent = (art.content || art.excerpt || "")
        .split("\n\n")
        .filter(p => p.trim())
        .map(p => `<p class="text-lg leading-relaxed mb-6" ${contentColorStyle}>${p}</p>`)
        .join("");

    document.getElementById("reader-content").innerHTML = fullContent;
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
