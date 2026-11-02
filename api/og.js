/**
 * NUQTHA — Dynamic Open Graph (OG) & Twitter Card Meta Tag Injector
 * Serverless function for Vercel. Fetches article from Firestore and injects
 * dynamic metadata for social media crawlers (WhatsApp, Facebook, Twitter, etc.)
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

async function fetchArticle(idOrSlug) {
    if (!idOrSlug) return null;

    // 1. Try direct fetch by document ID
    try {
        const docUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/articles/${encodeURIComponent(idOrSlug)}?key=${FIRESTORE_API_KEY}`;
        const res = await fetch(docUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && data.fields) {
                return { id: idOrSlug, fields: data.fields };
            }
        }
    } catch (e) {
        console.warn("[api/og] Direct document fetch error:", e);
    }

    // 2. Try structured query by slug
    try {
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: "articles" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "slug" },
                        op: "EQUAL",
                        value: { stringValue: idOrSlug }
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
            if (Array.isArray(results) && results[0] && results[0].document) {
                const doc = results[0].document;
                const docId = doc.name ? doc.name.split("/").pop() : idOrSlug;
                return { id: docId, fields: doc.fields || {} };
            }
        }
    } catch (e) {
        console.warn("[api/og] Slug query error:", e);
    }

    return null;
}

export default async function handler(req, res) {
    const rawId = (req.query.id || req.query.articleId || req.query.slug || "").trim();
    const userAgent = req.headers["user-agent"] || "";

    // Check if requester is a bot/crawler
    const isBot = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|LinkedInBot|Slackbot|Discordbot|SkypeUriPreview|Googlebot|bingbot|crawler|spider|bot/i.test(userAgent);

    // If a human visits /api/og directly in their browser, redirect them to the article page
    if (!isBot && rawId && !req.query.debug) {
        return res.redirect(302, `${DOMAIN}/article.html?id=${encodeURIComponent(rawId)}`);
    }

    let title = DEFAULT_SITE_TITLE;
    let description = DEFAULT_SITE_DESC;
    let imageUrl = DEFAULT_BANNER;
    let imageMime = "image/png";
    let shareUrl = `${DOMAIN}/`;
    let articleId = rawId;

    if (rawId) {
        shareUrl = `${DOMAIN}/article.html?id=${encodeURIComponent(rawId)}`;
        const article = await fetchArticle(rawId);

        if (article && article.fields) {
            articleId = article.id || rawId;
            shareUrl = `${DOMAIN}/article.html?id=${encodeURIComponent(articleId)}`;

            const f = article.fields;
            if (f.title?.stringValue) {
                title = cleanText(f.title.stringValue, 120);
            }
            if (f.excerpt?.stringValue) {
                description = cleanText(f.excerpt.stringValue, 200);
            } else if (f.content?.stringValue) {
                description = cleanText(f.content.stringValue, 200);
            }

            // Image resolution
            const rawImage = f.thumbnailUrl?.stringValue || 
                             f.ogImage?.stringValue || 
                             f.imageUrl?.stringValue || 
                             f.coverImage?.stringValue || "";

            if (rawImage.startsWith("data:image/")) {
                imageUrl = `${DOMAIN}/api/image?id=${encodeURIComponent(articleId)}`;
                const match = rawImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
                imageMime = match ? match[1] : "image/jpeg";
            } else if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
                imageUrl = rawImage.replace(/^http:\/\//, "https://");
                imageMime = imageUrl.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
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

        // Inject our rich dynamic meta block right inside <head>
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
<body style="font-family: sans-serif; padding: 2rem; text-align: center; background: #fbf7ee; color: #1e1b18;">
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
