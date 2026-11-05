/**
 * NUQTHA — Social Image Serving Endpoint
 * Decodes base64 images from Firestore into binary JPEG/PNG with proper MIME types,
 * or redirects to remote HTTPS thumbnail URLs.
 * Supports document IDs, slugs, and parent book image inheritance.
 */

const FIRESTORE_PROJECT_ID = "nuqtha-c0900";
const FIRESTORE_API_KEY = "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";
const DEFAULT_BANNER = "https://nuqtha.vercel.app/og-cover.png";

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

    // 1. Direct fetch by ID
    try {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/articles/${encodeURIComponent(cleanId)}?key=${FIRESTORE_API_KEY}`;
        const response = await fetch(firestoreUrl);
        if (response.ok) {
            const data = await response.json();
            if (data && data.fields) return data.fields;
        }
    } catch (_) {}

    // 2. Structured query by slug
    try {
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_API_KEY}`;
        const queryBody = {
            structuredQuery: {
                from: [{ collectionId: "articles" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "slug" },
                        op: "EQUAL",
                        value: { stringValue: cleanId }
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
                return results[0].document.fields || null;
            }
        }
    } catch (_) {}

    // 3. Scan recent documents for slug match
    try {
        const listUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/articles?pageSize=100&key=${FIRESTORE_API_KEY}`;
        const res = await fetch(listUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.documents)) {
                const targetSlug = slugifyText(cleanId);
                for (const doc of data.documents) {
                    const fields = doc.fields || {};
                    const titleSlug = slugifyText(fields.title?.stringValue || "");
                    const bookNameSlug = slugifyText(fields.bookName?.stringValue || "");
                    const docId = doc.name ? doc.name.split("/").pop() : "";

                    if (titleSlug === targetSlug || docId === cleanId || bookNameSlug === targetSlug) {
                        return fields;
                    }
                }
            }
        }
    } catch (_) {}

    return null;
}

export default async function handler(req, res) {
    const rawId = (req.query.id || req.query.slug || req.query.articleId || "").trim();

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
                       fields.coverImage?.stringValue || "";

        // If chapter has no own image, fallback to parent book
        if (!rawImage && (fields.bookId?.stringValue || fields.bookName?.stringValue)) {
            const bookFields = await fetchArticleDoc(fields.bookId?.stringValue || fields.bookName?.stringValue);
            if (bookFields) {
                rawImage = bookFields.thumbnailUrl?.stringValue || 
                           bookFields.ogImage?.stringValue || 
                           bookFields.imageUrl?.stringValue || 
                           bookFields.coverImage?.stringValue || "";
            }
        }

        if (!rawImage) {
            return res.redirect(302, DEFAULT_BANNER);
        }

        // If it's a base64 data URI (e.g. data:image/jpeg;base64,...)
        if (rawImage.startsWith("data:image/")) {
            const matches = rawImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1].toLowerCase();
                // Whitelist only safe raster image formats (blocks SVG script execution vectors)
                const safeMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
                if (!safeMimes.includes(mimeType)) {
                    return res.redirect(302, DEFAULT_BANNER);
                }

                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, "base64");

                res.setHeader("Content-Type", mimeType);
                res.setHeader("Content-Length", buffer.length);
                res.setHeader("X-Content-Type-Options", "nosniff");
                res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
                return res.status(200).send(buffer);
            }
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
