/**
 * NUQTHA — Dynamic Open Graph (OG) & Twitter Card Meta Tag Injector
 * Serverless function for Vercel. Fetches article or book from Firestore and injects
 * dynamic metadata for social media crawlers (WhatsApp, Facebook, Twitter, Telegram, etc.)
 */

import fs from "fs";
import path from "path";

const FIRESTORE_PROJECT_ID = "nuqtha-c0900";
const FIRESTORE_API_KEY = "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";
const DEFAULT_SITE_TITLE = "NUQTHA - നുഖ്ത | Malayalam Publishing Platform";
const DEFAULT_SITE_DESC = "A modern Malayalam personal publishing platform and newsroom with realtime articles, category feeds, reader mode, and admin publisher.";
const DEFAULT_BANNER = "https://nuqtha.vercel.app/og-cover.png";
const DOMAIN = "https://nuqtha.vercel.app";

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function cleanText(text = "", maxLen = 200) {
    if (!text) return "";
    const clean = text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen).trim() + "…";
}

function slugifyText(str = "") {
    if (!str) return "";
    return String(str)
        .normalize("NFC")
        .replace(/\u0D23\u0D4D\u200D/g, "\u0D7A")
        .replace(/\u0D28\u0D4D\u200D/g, "\u0D7B")
        .replace(/\u0D30\u0D4D\u200D/g, "\u0D7C")
        .replace(/\u0D32\u0D4D\u200D/g, "\u0D7D")
        .replace(/\u0D33\u0D4D\u200D/g, "\u0D7E")
        .replace(/\u0D15\u0D4D\u200D/g, "\u0D7F")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u0D00-\u0D7F]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function fetchArticle(idOrSlug, bookSlug = "") {
    if (!idOrSlug) return null;
    const cleanId = decodeURIComponent(idOrSlug).trim();
    const cleanNoPrefix = cleanId.replace(/^(?:story|book|article)[\/\\]+/gi, "").replace(/^\/+|\/+$/g, "");
    const bSlug = bookSlug ? decodeURIComponent(bookSlug).trim().replace(/^(?:story|book|article)[\/\\]+/gi, "") : "";

    const candidateSlugs = Array.from(new Set([
        cleanId,
        cleanNoPrefix,
        bSlug ? `story/${bSlug}/${cleanNoPrefix}` : "",
        bSlug ? `${bSlug}/${cleanNoPrefix}` : "",
        `story/${cleanNoPrefix}`,
        `book/${cleanNoPrefix}`,
        slugifyText(cleanNoPrefix),
        slugifyText(cleanId)
    ])).filter(Boolean);

    const collections = ["articles", "books"];

    // 1. Direct fetch by ID across articles and books
    for (const col of collections) {
        try {
            const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(cleanId)}?key=${FIRESTORE_API_KEY}`;
            const res = await fetch(docUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.fields) {
                    return { id: cleanId, fields: data.fields, collection: col };
                }
            }
        } catch (_) {}
    }

    // 2. Structured query with IN filter for candidates across articles and books
    for (const col of collections) {
        try {
            const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
            const queryBody = {
                structuredQuery: {
                    from: [{ collectionId: col }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "slug" },
                            op: "IN",
                            value: {
                                arrayValue: {
                                    values: candidateSlugs.map(s => ({ stringValue: s }))
                                }
                            }
                        }
                    },
                    limit: 1
                }
            };
            const res = await fetch(queryUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(queryBody)
            });
            if (res.ok) {
                const results = await res.json();
                const matched = Array.isArray(results) ? results.find(r => r && r.document)?.document : null;
                if (matched) {
                    const docId = matched.name ? matched.name.split("/").pop() : cleanId;
                    return { id: docId, fields: matched.fields || {}, collection: col };
                }
            }
        } catch (_) {}
    }

    // 3. Scan recent documents across articles and books as fallback
    for (const col of collections) {
        try {
            const listUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${col}?pageSize=100&key=${FIRESTORE_API_KEY}`;
            const res = await fetch(listUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.documents)) {
                    const targetSlug = slugifyText(cleanNoPrefix);
                    for (const doc of data.documents) {
                        const fields = doc.fields || {};
                        const titleSlug = slugifyText(fields.title?.stringValue || "");
                        const docId = doc.name ? doc.name.split("/").pop() : "";
                        const itemSlug = fields.slug?.stringValue || "";
                        const itemNoPrefix = itemSlug.split("/").pop();

                        if (
                            candidateSlugs.includes(itemSlug) ||
                            itemNoPrefix === cleanNoPrefix ||
                            itemNoPrefix === targetSlug ||
                            itemSlug.endsWith(`/${cleanNoPrefix}`) ||
                            itemSlug.endsWith(`/${targetSlug}`) ||
                            titleSlug === targetSlug ||
                            docId === cleanId ||
                            docId === cleanNoPrefix
                        ) {
                            return { id: docId, fields, collection: col };
                        }
                    }
                }
            }
        } catch (_) {}
    }

    return null;
}

export default async function handler(req, res) {
    let rawId = (req.query?.slug || req.query?.id || req.query?.chapterSlug || req.query?.articleId || "").trim();
    let bookSlug = (req.query?.bookSlug || "").trim();
    let isEdition = req.query?.edition === "true" || req.query?.edition === true;

    // Parse URL query if req.query is incomplete (common with custom vercel rewrites)
    if ((!rawId || !bookSlug) && req.url) {
        try {
            const u = new URL(req.url, "http://localhost");
            if (!rawId) rawId = (u.searchParams.get("slug") || u.searchParams.get("id") || u.searchParams.get("chapterSlug") || u.searchParams.get("articleId") || "").trim();
            if (!bookSlug) bookSlug = (u.searchParams.get("bookSlug") || "").trim();
            if (!isEdition) isEdition = u.searchParams.get("edition") === "true";
        } catch (_) {}
    }

    const userAgent = req.headers["user-agent"] || "";

    // Check if requester is a bot/crawler
    const isBot = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|SkypeUriPreview|Googlebot|bingbot|crawler|spider|bot/i.test(userAgent);

    // Resolve clean share path
    let cleanPath = "/";
    if (rawId) {
        if (bookSlug) {
            cleanPath = `/story/${encodeURIComponent(bookSlug)}/${encodeURIComponent(rawId)}`;
        } else if (isEdition) {
            cleanPath = `/book/${encodeURIComponent(rawId)}`;
        } else {
            cleanPath = `/story/${encodeURIComponent(rawId)}`;
        }
    }

    // If a human visits /api/og directly in their browser, redirect to the clean story path
    if (!isBot && rawId && !req.query?.debug) {
        return res.redirect(302, `${DOMAIN}${cleanPath}`);
    }

    let title = DEFAULT_SITE_TITLE;
    let description = DEFAULT_SITE_DESC;
    let imageUrl = DEFAULT_BANNER;
    let imageMime = "image/png";
    let shareUrl = `${DOMAIN}${cleanPath}`;
    let articleId = rawId;

    if (rawId) {
        const article = await fetchArticle(rawId, bookSlug);

        if (article && article.fields) {
            articleId = article.id || rawId;
            const f = article.fields;

            if (f.title?.stringValue) {
                title = cleanText(f.title.stringValue, 120);
            }
            if (f.excerpt?.stringValue) {
                description = cleanText(f.excerpt.stringValue, 200);
            } else if (f.content?.stringValue) {
                description = cleanText(f.content.stringValue, 200);
            } else if (f.introduction?.stringValue) {
                description = cleanText(f.introduction.stringValue, 200);
            }

            // Image resolution
            let rawImage = f.thumbnailUrl?.stringValue || 
                           f.ogImage?.stringValue || 
                           f.imageUrl?.stringValue || 
                           f.coverImage?.stringValue || "";

            // Fallback: If chapter has no own image, inherit from parent book
            if (!rawImage && (f.bookId?.stringValue || f.bookName?.stringValue)) {
                const bookDoc = await fetchArticle(f.bookId?.stringValue || f.bookName?.stringValue);
                if (bookDoc && bookDoc.fields) {
                    rawImage = bookDoc.fields.thumbnailUrl?.stringValue || 
                               bookDoc.fields.ogImage?.stringValue || 
                               bookDoc.fields.imageUrl?.stringValue || 
                               bookDoc.fields.coverImage?.stringValue || "";
                }
            }

            if (rawImage.startsWith("data:image/")) {
                // Use a single query parameter ?id=... to prevent & / &amp; delimiter corruption by social scrapers
                imageUrl = `${DOMAIN}/api/image?id=${encodeURIComponent(articleId)}`;
                const match = rawImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                imageMime = match ? match[1] : "image/jpeg";
            } else if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
                imageUrl = rawImage.replace(/^http:\/\//, "https://");
                imageMime = imageUrl.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
            } else {
                imageUrl = DEFAULT_BANNER;
            }

            // Refine clean share path based on resolved article type & bookName
            const artSlug = f.slug?.stringValue || slugifyText(f.title?.stringValue) || articleId;
            const isBookDoc = article.collection === "books" || f.type?.stringValue === "BOOK" || isEdition;
            if (isBookDoc) {
                shareUrl = `${DOMAIN}/book/${encodeURIComponent(artSlug.replace(/^book\//, ''))}`;
            } else if (f.bookName?.stringValue || bookSlug) {
                const bSlug = bookSlug || f.bookSlug?.stringValue || slugifyText(f.bookName.stringValue);
                const cSlug = artSlug.replace(/^story\//, '').replace(new RegExp(`^${bSlug}/`), '');
                shareUrl = `${DOMAIN}/story/${encodeURIComponent(bSlug)}/${encodeURIComponent(cSlug)}`;
            } else {
                shareUrl = `${DOMAIN}/story/${encodeURIComponent(artSlug.replace(/^story\//, ''))}`;
            }
        }
    }

    const metaTagsBlock = `
    <!-- Dynamically Injected Open Graph (OG) & Twitter Cards by NUQTHA Serverless -->
    <title>${escapeHtml(title)} | NUQTHA</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(shareUrl)}" />

    <!-- Open Graph / WhatsApp / Facebook -->
    <meta property="og:site_name" content="NUQTHA - നുഖ്ത" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="${escapeHtml(imageMime)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${escapeHtml(shareUrl)}" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />
    `;

    // Try reading article.html or dist/article.html to deliver full page
    let baseHtml = "";
    const possiblePaths = [
        path.join(process.cwd(), "dist", "article.html"),
        path.join(process.cwd(), "article.html")
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            try {
                baseHtml = fs.readFileSync(p, "utf8");
                break;
            } catch (_) {}
        }
    }

    let finalHtml = "";
    if (baseHtml) {
        // Strip out existing generic title and og meta tags in <head>
        let cleanedHead = baseHtml
            .replace(/<title>.*?<\/title>/gi, "")
            .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
            .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
            .replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, "")
            .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, "");

        // Inject dynamic meta block right inside <head>
        finalHtml = cleanedHead.replace("<head>", `<head>\n${metaTagsBlock}`);
    } else {
        // High-fidelity fallback HTML for bots & redirect for browsers
        finalHtml = `<!DOCTYPE html>
<html lang="ml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${metaTagsBlock}
    <script>
        // Smoothly redirect human visitors to the client reader view
        if (!navigator.userAgent.match(/bot|crawler|spider|facebook|twitter|whatsapp|telegram/i)) {
            window.location.replace("${escapeHtml(shareUrl)}");
        }
    </script>
</head>
<body style="font-family: sans-serif; padding: 2rem; text-align: center; background: #FAF9F5; color: #1F1A14;">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
    <p><a href="${escapeHtml(shareUrl)}" style="color: #b4532c; font-weight: bold;">ലേഖനം വായിക്കുക (Read on NUQTHA) &rarr;</a></p>
</body>
</html>`;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    return res.status(200).send(finalHtml);
}
