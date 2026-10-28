/**
 * NUQTHA — Central Site & Domain Configuration
 * Single source of truth for base URLs, primary domains, and dynamic resolution.
 * To change the primary canonical domain, update PRIMARY_DOMAIN below.
 */

export const PRIMARY_DOMAIN = "https://nuqtha.vercel.app";

/**
 * Returns the active origin dynamically at runtime.
 * Works seamlessly across nuqtha.vercel.app, nuqtha-official.vercel.app, localhost, or any custom domain.
 */
export function getSiteOrigin() {
    if (typeof window !== "undefined" && window.location && window.location.origin) {
        return window.location.origin;
    }
    return PRIMARY_DOMAIN;
}

/**
 * Builds an absolute canonical or share URL using the current runtime domain.
 * @param {string} path - Relative path (e.g. "/article.html?id=123" or "article.html?id=123")
 */
export function getAbsoluteUrl(path = "") {
    const origin = getSiteOrigin();
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${origin}${cleanPath}`;
}

/**
 * Updates or injects canonical and OpenGraph/Twitter URL meta tags dynamically at runtime.
 * @param {Object} options
 * @param {string} [options.path] - Relative path or full URL
 * @param {string} [options.title] - Document / OG title
 * @param {string} [options.description] - OG description
 * @param {string} [options.imageUrl] - OG image URL
 */
export function updatePageMeta({ path, title, description, imageUrl } = {}) {
    if (typeof document === "undefined") return;

    const resolvedPath = path !== undefined ? path : (window.location.pathname + window.location.search);
    const absoluteUrl = resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://") 
        ? resolvedPath 
        : getAbsoluteUrl(resolvedPath);

    // 1. Canonical Link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement("link");
        canonical.setAttribute("rel", "canonical");
        document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", absoluteUrl);

    // 2. OpenGraph URL
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
        ogUrl = document.createElement("meta");
        ogUrl.setAttribute("property", "og:url");
        document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute("content", absoluteUrl);

    // 3. OpenGraph Title
    if (title) {
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute("content", title);
    }

    // 4. OpenGraph Description
    if (description) {
        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.setAttribute("content", description);
    }

    // 5. OpenGraph Image
    if (imageUrl) {
        let ogImage = document.querySelector('meta[property="og:image"]');
        if (!ogImage) {
            ogImage = document.createElement("meta");
            ogImage.setAttribute("property", "og:image");
            document.head.appendChild(ogImage);
        }
        ogImage.setAttribute("content", imageUrl);
    }
}

// Expose globally for vanilla HTML scripts if needed
if (typeof window !== "undefined") {
    window.NUQTHA_SITE_CONFIG = {
        PRIMARY_DOMAIN,
        getSiteOrigin,
        getAbsoluteUrl,
        updatePageMeta
    };
}
