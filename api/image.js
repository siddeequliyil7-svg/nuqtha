/**
 * NUQTHA — Social Image Serving Endpoint
 * Redirects remote HTTPS thumbnail URLs and uses a neutral fallback for inline or invalid images.
 * Supports document IDs, slugs, and parent book image inheritance across articles & books collections.
 */

import { resolveFirebaseProjectId } from "../js/firebase-project.js";

const FIRESTORE_PROJECT_ID = resolveFirebaseProjectId(process.env.VITE_FIREBASE_PROJECT_ID);
const FIRESTORE_API_KEY = "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";
const DEFAULT_BANNER = "https://nuqtha.vercel.app/og-cover.svg";

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

async function fetchArticleDoc(identifier) {
    if (!identifier) return null;
    const cleanId = decodeURIComponent(identifier).trim();
    const cleanNoPrefix = cleanId.replace(/^(?:story|book|article)[\/\\]+/gi, "").replace(/^\/+|\/+$/g, "");

    const candidateSlugs = Array.from(new Set([
        cleanId,
        cleanNoPrefix,
        `story/${cleanNoPrefix}`,
        `book/${cleanNoPrefix}`,
        slugifyText(cleanNoPrefix),
        slugifyText(cleanId)
    ])).filter(Boolean);

    const collections = ["articles", "books"];

    // 1. Direct fetch by ID across articles and books
    for (const col of collections) {
        try {
            const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${col}/${encodeURIComponent(cleanId)}?key=${FIRESTORE_API_KEY}`;
            const response = await fetch(firestoreUrl);
            if (response.ok) {
                const data = await response.json();
                if (data && data.fields) return data.fields;
            }
        } catch (_) {}
    }

    // 2. Structured query with IN filter for candidate slugs across articles and books
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
                if (matched && matched.fields) return matched.fields;
            }
        } catch (_) {}
    }

    // 3. Scan recent documents across articles and books
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
                            return fields;
                        }
                    }
                }
            }
        } catch (_) {}
    }

    return null;
}

export default async function handler(req, res) {
    let rawId = (req.query?.id || req.query?.slug || req.query?.articleId || "").trim();

    // Fallback URL query parsing if req.query is incomplete
    if (!rawId && req.url) {
        try {
            const u = new URL(req.url, "http://localhost");
            rawId = (u.searchParams.get("id") || u.searchParams.get("slug") || u.searchParams.get("articleId") || "").trim();
        } catch (_) {}
    }

    if (!rawId) {
        return res.redirect(302, DEFAULT_BANNER);
    }

    try {
        const fields = await fetchArticleDoc(rawId);
        if (!fields) {
            return res.redirect(302, DEFAULT_BANNER);
        }

        // Priority: thumbnailUrl -> ogImage -> imageUrl -> coverImage
        let rawImage = fields.thumbnailUrl?.stringValue || 
                       fields.ogImage?.stringValue || 
                       fields.imageUrl?.stringValue || 
                       fields.coverImage?.stringValue ||
                       fields.coverUrl?.stringValue ||
                       fields.thumbnail?.stringValue ||
                       fields.image?.stringValue || "";

        // If chapter has no own image, fallback to parent book
        if (!rawImage && (fields.bookId?.stringValue || fields.bookName?.stringValue)) {
            const bookFields = await fetchArticleDoc(fields.bookId?.stringValue || fields.bookName?.stringValue);
            if (bookFields) {
                rawImage = bookFields.thumbnailUrl?.stringValue || 
                           bookFields.ogImage?.stringValue || 
                           bookFields.imageUrl?.stringValue || 
                           bookFields.coverImage?.stringValue ||
                           bookFields.coverUrl?.stringValue ||
                           bookFields.thumbnail?.stringValue ||
                           bookFields.image?.stringValue || "";
            }
        }

        if (!rawImage) {
            return res.redirect(302, DEFAULT_BANNER);
        }

        // If it's a remote HTTPS URL, redirect directly
        if (rawImage.startsWith("http://") || rawImage.startsWith("https://")) {
            const secureUrl = rawImage.replace(/^http:\/\//, "https://");
            return res.redirect(302, secureUrl);
        }

        return res.redirect(302, DEFAULT_BANNER);
    } catch (err) {
        console.error("[api/image] Error serving image:", err);
        return res.redirect(302, DEFAULT_BANNER);
    }
}
