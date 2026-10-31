/**
 * NUQTHA Author Service
 * Handles author profile fetching, Unicode normalization, avatar resolution, and robust caching
 */
import { collection, getDocs } from "../firebase-config.js";

export const PRIMARY_AUTHORS = [
    {
        name: "സുലൈമാൻ ഫൈസി കിഴിശ്ശേരി",
        role: "CHIEF EDITOR · മുഖ്യ പത്രാധിപർ",
        slug: "സുലൈമാൻ-ഫൈസി-കിഴിശ്ശേരി",
        bio: "ഇസ്ലാമിക ചരിത്ര പണ്ഡിതൻ, പ്രഭാഷകൻ, NUQTHA മുഖ്യ പത്രാധിപർ.",
        photoUrl: ""
    },
    {
        name: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        role: "FOUNDING EDITOR · സ്ഥാപക പത്രാധിപർ",
        slug: "സയ്യിദ്-സൽമാൻ-അദനി-കരിപ്പൂർ",
        bio: "NUQTHA സ്ഥാപക പത്രാധിപർ, ചരിത്ര-സാഹിത്യ ഗവേഷകൻ, എഴുത്തുകാരൻ.",
        photoUrl: ""
    }
];

/**
 * Normalizes Malayalam text to canonical Unicode NFC and converts legacy decomposed chillu sequences
 * to atomic chillu characters for consistent string comparisons and slug generation.
 */
export function cleanMalayalamText(str) {
    if (!str) return '';
    return String(str)
        .normalize('NFC')
        .replace(/\u0D23\u0D4D\u200D/g, '\u0D7A') // ൺ
        .replace(/\u0D28\u0D4D\u200D/g, '\u0D7B') // ൻ
        .replace(/\u0D30\u0D4D\u200D/g, '\u0D7C') // ർ
        .replace(/\u0D32\u0D4D\u200D/g, '\u0D7D') // ൽ
        .replace(/\u0D33\u0D4D\u200D/g, '\u0D7E') // ൾ
        .replace(/\u0D15\u0D4D\u200D/g, '\u0D7F') // ൿ
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLowerCase();
}

/**
 * Generates clean, URL-safe slugs for Malayalam and English text.
 */
export function slugifyAuthor(text) {
    if (!text) return '';
    return cleanMalayalamText(text)
        .replace(/[^a-z0-9\u0D00-\u0D7F]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Safely decodes URL parameters without throwing URIError.
 */
export function safeDecodeParam(val) {
    if (!val) return '';
    try {
        return decodeURIComponent(val).trim();
    } catch (e) {
        try {
            return unescape(val).trim();
        } catch (e2) {
            return String(val).trim();
        }
    }
}

/**
 * Checks if an article's author matches a target author identifier (name, slug, or ID).
 * Handles partial names, prefix matching, and collaborative author strings (e.g. "author കേട്ടെഴുത്ത്: scribe").
 */
export function isAuthorMatch(artAuthor, targetIdentifier) {
    if (!artAuthor || !targetIdentifier) return false;
    const aClean = cleanMalayalamText(artAuthor);
    const tClean = cleanMalayalamText(targetIdentifier);
    const aSlug = slugifyAuthor(artAuthor);
    const tSlug = slugifyAuthor(targetIdentifier);

    if (aSlug === tSlug) return true;
    if (aClean === tClean) return true;

    // Word array comparison
    const tCleanWords = tClean.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    const aCleanWords = aClean.replace(/-/g, ' ').split(/\s+/).filter(Boolean);

    // If key distinguishing words match (e.g., "സുലൈമാൻ" and "കിഴിശ്ശേരി")
    if (tCleanWords.length >= 2 && tCleanWords.every(w => aClean.includes(w))) return true;
    if (aCleanWords.length >= 2 && aCleanWords.every(w => tClean.includes(w))) return true;

    if (aSlug.startsWith(tSlug + '-') || tSlug.startsWith(aSlug + '-')) return true;
    if (aClean.includes(tClean) || tClean.includes(aClean)) return true;

    return false;
}

let cachedAuthorsMap = null;

/**
 * Fetches all author profiles from Firestore (with SDK + REST fallback & 3.5s timeout).
 * Populates cache and returns a map keyed by slug and normalized name.
 */
export async function getAuthorsMap(db) {
    if (cachedAuthorsMap && Object.keys(cachedAuthorsMap).length > 0) {
        return cachedAuthorsMap;
    }

    try {
        const stored = sessionStorage.getItem('nuqtha_cached_authors');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                cachedAuthorsMap = parsed;
                // Fetch network in background to refresh
                fetchAuthorsNetwork(db).catch(() => {});
                return cachedAuthorsMap;
            }
        }
    } catch (e) {}

    return await fetchAuthorsNetwork(db);
}

async function fetchAuthorsNetwork(db) {
    const authors = {};

    // Seed primary authors
    PRIMARY_AUTHORS.forEach(p => {
        authors[p.slug] = { ...p };
        authors[cleanMalayalamText(p.name)] = { ...p };
    });

    let docs = [];

    // 1. Try SDK with a 3.5s timeout
    if (db) {
        try {
            const sdkPromise = getDocs(collection(db, "authors"));
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
            const snap = await Promise.race([sdkPromise, timeoutPromise]);
            snap.forEach(d => {
                docs.push({ id: d.id, ...d.data() });
            });
        } catch (e) {
            // SDK error or timeout, proceed to REST
        }
    }

    // 2. REST fallback
    if (docs.length === 0) {
        try {
            const res = await fetch("https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/authors?key=AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e");
            if (res.ok) {
                const json = await res.json();
                if (json && json.documents) {
                    json.documents.forEach(docItem => {
                        const docId = decodeURIComponent(docItem.name.split("/").pop());
                        const data = { id: docId };
                        if (docItem.fields) {
                            for (const [k, v] of Object.entries(docItem.fields)) {
                                if (v.stringValue !== undefined) data[k] = v.stringValue;
                            }
                        }
                        docs.push(data);
                    });
                }
            }
        } catch (e) {}
    }

    // Merge loaded documents
    docs.forEach(d => {
        const docName = d.name || d.id.replace(/-/g, ' ');
        const slug = slugifyAuthor(d.slug || d.id || docName);
        const normName = cleanMalayalamText(docName);
        const authorObj = {
            id: d.id,
            name: docName,
            role: d.role || "CONTRIBUTOR · എഴുത്തുകാരൻ",
            photoUrl: d.photoUrl || "",
            bio: d.bio || "",
            slug: slug
        };
        authors[slug] = authorObj;
        authors[normName] = authorObj;
        if (d.id) authors[d.id] = authorObj;
    });

    cachedAuthorsMap = authors;
    try {
        sessionStorage.setItem('nuqtha_cached_authors', JSON.stringify(authors));
    } catch (e) {}

    return authors;
}

/**
 * Finds an author profile by author name, slug, or partial match.
 */
export function findAuthorInMap(authorName, authorsMap) {
    if (!authorName || !authorsMap) return null;
    const slug = slugifyAuthor(authorName);
    const clean = cleanMalayalamText(authorName);

    if (authorsMap[slug]) return authorsMap[slug];
    if (authorsMap[clean]) return authorsMap[clean];

    for (const key of Object.keys(authorsMap)) {
        if (isAuthorMatch(authorName, key)) {
            return authorsMap[key];
        }
    }
    return null;
}

/**
 * Retrieves an author's photoUrl if available.
 */
export function getAuthorPhoto(authorName, authorsMap) {
    const profile = findAuthorInMap(authorName, authorsMap);
    return (profile && profile.photoUrl) ? profile.photoUrl : "";
}
