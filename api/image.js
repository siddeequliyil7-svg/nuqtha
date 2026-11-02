/**
 * NUQTHA — Social Image Serving Endpoint
 * Decodes base64 images from Firestore into binary JPEG/PNG with proper MIME types,
 * or redirects to remote HTTPS thumbnail URLs.
 */

const FIRESTORE_PROJECT_ID = "nuqtha-c0900";
const FIRESTORE_API_KEY = "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";
const DEFAULT_BANNER = "https://nuqtha.vercel.app/og-cover.png";

export default async function handler(req, res) {
    const articleId = (req.query.id || req.query.articleId || req.query.slug || "").trim();

    if (!articleId) {
        return res.redirect(302, DEFAULT_BANNER);
    }

    try {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/articles/${encodeURIComponent(articleId)}?key=${FIRESTORE_API_KEY}`;
        const response = await fetch(firestoreUrl);

        if (!response.ok) {
            return res.redirect(302, DEFAULT_BANNER);
        }

        const data = await response.json();
        const fields = data.fields || {};

        // Resolve image source in priority order: thumbnailUrl -> ogImage -> imageUrl -> coverImage
        const rawImage = fields.thumbnailUrl?.stringValue || 
                         fields.ogImage?.stringValue || 
                         fields.imageUrl?.stringValue || 
                         fields.coverImage?.stringValue || "";

        if (!rawImage) {
            return res.redirect(302, DEFAULT_BANNER);
        }

        // If it's a base64 data URI (e.g. data:image/jpeg;base64,...)
        if (rawImage.startsWith("data:image/")) {
            const matches = rawImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, "base64");

                res.setHeader("Content-Type", mimeType);
                res.setHeader("Content-Length", buffer.length);
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
