/**
 * NUQTHA Category Link Helper (js/category-link.js)
 * Provides centralized category URL generation, slug normalization,
 * and safe accessible clickable markup site-wide.
 */

function escapeCategoryHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizeCategoryName(raw) {
    if (!raw) return '';
    const cleaned = String(raw).trim().replace(/^\[|\]$/g, '').trim();
    if (!cleaned) return '';
    const upper = cleaned.toUpperCase();
    if (upper === 'BOOK' || upper === 'BOOKS' || upper === 'PREMIUM BOOK' || upper.includes('PREMIUM')) {
        return 'BOOKS';
    }
    return cleaned;
}

function categorySlug(raw) {
    const norm = normalizeCategoryName(raw);
    if (!norm || norm.toUpperCase() === 'ALL') return '';
    if (norm.toUpperCase() === 'BOOKS') return 'books';
    return encodeURIComponent(norm.toLowerCase());
}

function getIndexBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:') return 'index.html';
        const pathname = window.location.pathname || '';
        if (pathname.startsWith('/story/') || pathname.startsWith('/profile/') || pathname.startsWith('/author/')) {
            return '/index.html';
        }
    }
    return 'index.html';
}

function categoryUrl(name) {
    const norm = normalizeCategoryName(name);
    if (!norm || norm.toUpperCase() === 'ALL') {
        return getIndexBaseUrl();
    }
    if (norm.toUpperCase() === 'BOOKS') {
        return `${getIndexBaseUrl()}#books`;
    }
    const slug = categorySlug(norm);
    return slug ? `${getIndexBaseUrl()}#${slug}` : getIndexBaseUrl();
}

function getCategoryDisplayLabel(cat) {
    if (typeof window !== 'undefined' && typeof window.categoryLabel === 'function') {
        return window.categoryLabel(cat);
    }
    const c = normalizeCategoryName(cat);
    if (!c) return 'GENERAL';
    const upper = c.toUpperCase();
    const map = {
        'HISTORY': 'HISTORY',
        'STUDY': 'STUDY',
        'STORY': 'STORY',
        'BOOKS': 'പുസ്തകങ്ങൾ',
        'GENERAL': 'GENERAL'
    };
    return map[upper] || upper;
}

function handleCategoryLinkClick(event, cat) {
    if (!event) return;
    event.stopPropagation();
    const norm = normalizeCategoryName(cat);
    const upper = norm ? norm.toUpperCase() : 'ALL';
    if (typeof window !== 'undefined' && typeof window.switchToCategory === 'function') {
        event.preventDefault();
        window.switchToCategory(upper);
        return false;
    }
    return true;
}

/**
 * Generates an accessible, styled clickable anchor tag for any category.
 *
 * @param {string} name - Raw category name (e.g. "HISTORY", "STUDY", "BOOKS")
 * @param {object} [options]
 * @param {string} [options.variant] - 'bracket' | 'pill' | 'featured-pill' | 'category-featured-badge' | 'section-header' | 'carousel' | 'article-badge'
 * @param {string} [options.className] - Additional CSS classes
 * @param {object} [options.theme] - Theme styling object with { color, badgeBorder, badgeText }
 * @param {string} [options.displayText] - Custom display label override
 * @returns {string} HTML markup for category tag
 */
function categoryTag(name, options = {}) {
    const raw = name || 'GENERAL';
    const norm = normalizeCategoryName(raw);
    const upper = norm.toUpperCase();
    const url = categoryUrl(norm);
    const displayText = options.displayText || (options.variant === 'section-header' && upper === 'ALL' ? 'പുതിയ ലേഖനങ്ങൾ' : getCategoryDisplayLabel(norm));
    const safeText = escapeCategoryHtml(displayText);
    const ariaLabel = `${escapeCategoryHtml(norm || safeText)} വിഭാഗത്തിലെ ലേഖനങ്ങൾ`;
    const theme = options.theme || null;
    const customClass = options.className || '';
    const variant = options.variant || 'default';

    let innerContent = safeText;
    let variantClasses = '';
    let extraStyles = '';

    if (variant === 'bracket') {
        innerContent = `[${safeText}]`;
        variantClasses = 'category-tag-bracket';
    } else if (variant === 'featured-pill') {
        innerContent = safeText;
        variantClasses = 'featured-category-pill';
    } else if (variant === 'category-featured-badge') {
        const dotColor = (theme && theme.color) ? theme.color : '#b4532c';
        innerContent = `<span class="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style="background-color: ${dotColor};"></span><span>FEATURED · ${safeText}</span>`;
        variantClasses = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/20 shadow-sm font-english';
    } else if (variant === 'section-header') {
        const dotColor = (theme && theme.color) ? theme.color : '#b4532c';
        const borderCls = (theme && theme.badgeBorder) ? theme.badgeBorder : 'border-[#ebdccb] dark:border-white/10';
        const textCls = (theme && theme.badgeText) ? theme.badgeText : 'text-[#b4532c] dark:text-[#f87171]';
        innerContent = `<span class="w-2 h-2 rounded-full inline-block flex-shrink-0" style="background-color: ${dotColor};"></span><span class="font-english text-xs font-black tracking-wider uppercase ${textCls}">${safeText}</span>`;
        variantClasses = `category-glass-badge border ${borderCls}`;
    } else if (variant === 'carousel') {
        innerContent = safeText;
        variantClasses = 'carousel-card-cat category-badge-pill';
    } else if (variant === 'article-badge') {
        innerContent = safeText;
        variantClasses = 'category-badge font-english uppercase';
    } else {
        variantClasses = 'category-badge-pill';
    }

    if (theme && theme.color && !variantClasses.includes('bg-black/60')) {
        extraStyles = `style="--cat-accent: ${theme.color};"`;
    }

    return `<a href="${url}" class="category-pill-link ${variantClasses} ${customClass}" data-category="${escapeCategoryHtml(upper)}" aria-label="${ariaLabel}" title="${safeText} വിഭാഗത്തിലെ ലേഖനങ്ങൾ" onclick="if(window.handleCategoryLinkClick) return window.handleCategoryLinkClick(event, '${escapeCategoryHtml(upper)}'); event.stopPropagation();" ${extraStyles}>${innerContent}</a>`;
}

// Global window registration
if (typeof window !== 'undefined') {
    window.escapeCategoryHtml = escapeCategoryHtml;
    window.normalizeCategoryName = normalizeCategoryName;
    window.categorySlug = categorySlug;
    window.categoryUrl = categoryUrl;
    window.getCategoryDisplayLabel = getCategoryDisplayLabel;
    window.handleCategoryLinkClick = handleCategoryLinkClick;
    window.categoryTag = categoryTag;
}

// ES module exports for bundlers
export {
    escapeCategoryHtml,
    normalizeCategoryName,
    categorySlug,
    categoryUrl,
    getCategoryDisplayLabel,
    handleCategoryLinkClick,
    categoryTag
};
