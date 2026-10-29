/**
 * NUQTHA — Shared Book Data Helper (js/book-data.js)
 * Single source of truth for querying book chapters, matching book entities,
 * and counting articles across Admin, Home feed, and Reader mode.
 */

// Helper to normalize strings for robust comparison
export function normalizeBookKey(s) {
    if (!s) return "";
    return s.toString()
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

/**
 * Returns true if an article belongs to the target book doc.
 * Supports:
 * - targetBook.chapters array of IDs or objects
 * - art.bookId === targetBook.id
 * - art.bookName / playlistName matching targetBook.title or targetBook.bookName
 */
export function isArticleInBook(article, targetBook) {
    if (!article || !targetBook) return false;
    if (article.id && targetBook.id && article.id === targetBook.id) return false;
    if (article.type === "BOOK") return false;

    // Check chapters array on targetBook doc if present
    if (Array.isArray(targetBook.chapters)) {
        const inArray = targetBook.chapters.some(ch => {
            if (!ch) return false;
            if (typeof ch === "string") return ch === article.id;
            if (typeof ch === "object" && ch.id) return ch.id === article.id;
            return false;
        });
        if (inArray) return true;
    }

    const bId = (targetBook.id || "").toString().trim();
    const aBookId = (article.bookId || "").toString().trim();
    if (bId && aBookId && bId === aBookId) return true;

    const bTitle = normalizeBookKey(targetBook.title);
    const bName = normalizeBookKey(targetBook.bookName);
    const aBook = normalizeBookKey(article.bookName || article.playlistName);

    if (aBook) {
        if (bId && aBookId && bId === aBookId) return true;
        if (bName && aBook === bName) return true;
        if (bTitle && aBook === bTitle) return true;
        if (bName.length >= 3 && (aBook.includes(bName) || bName.includes(aBook))) return true;
        if (bTitle.length >= 3 && (aBook.includes(bTitle) || bTitle.includes(aBook))) return true;
    }

    return false;
}

/**
 * Comparator to sort book chapters strictly by "order" / "priority" ascending,
 * with tie-breaking by createdAt.
 */
export function compareChaptersOrder(a, b) {
    const orderA = (a.order !== undefined && a.order !== null && !isNaN(a.order))
        ? Number(a.order)
        : (a.priority !== undefined && a.priority !== null && !isNaN(a.priority))
            ? Number(a.priority)
            : 999;

    const orderB = (b.order !== undefined && b.order !== null && !isNaN(b.order))
        ? Number(b.order)
        : (b.priority !== undefined && b.priority !== null && !isNaN(b.priority))
            ? Number(b.priority)
            : 999;

    if (orderA !== orderB) return orderA - orderB;

    const timeA = a.createdAt ? (a.createdAt.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime() || 0) : 0;
    const timeB = b.createdAt ? (b.createdAt.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime() || 0) : 0;
    return timeB - timeA;
}

/**
 * Filter and sort chapters from an in-memory list of articles.
 */
export function filterAndSortChapters(bookDoc, allArticles) {
    if (!bookDoc || !Array.isArray(allArticles)) return [];

    let chapters = [];

    // Check if bookDoc itself has embedded chapters array
    if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
        const idMap = new Map(allArticles.map(a => [a.id, a]));
        chapters = bookDoc.chapters.map((ch, idx) => {
            if (typeof ch === "string") {
                const found = idMap.get(ch);
                return found || { id: ch, title: `Chapter ${idx + 1}`, order: idx + 1 };
            }
            if (typeof ch === "object" && ch.id) {
                const found = idMap.get(ch.id);
                return { ...ch, ...(found || {}) };
            }
            return ch;
        }).filter(Boolean);
    }

    // Merge or fallback to query by bookId / bookName / playlistName
    const matched = allArticles.filter(art => isArticleInBook(art, bookDoc));
    const seen = new Set(chapters.map(c => c.id));
    for (const m of matched) {
        if (!seen.has(m.id)) {
            seen.add(m.id);
            chapters.push(m);
        }
    }

    // Sort strictly by order / priority
    chapters.sort(compareChaptersOrder);
    return chapters;
}

/**
 * Count how many chapters belong to a book.
 */
export function countBookChapters(bookDoc, allArticles) {
    if (!bookDoc) return 0;
    if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
        return bookDoc.chapters.length;
    }
    if (!Array.isArray(allArticles)) return 0;
    return allArticles.filter(art => isArticleInBook(art, bookDoc)).length;
}

/**
 * Primary helper: fetch a book and all its chapters with a 10s timeout,
 * supporting both Firestore shapes (embedded chapters array on book doc OR
 * separate article documents tagged with bookId/bookName).
 *
 * @param {string} bookId - ID of the target book
 * @param {object} [options]
 * @param {object} [options.db] - Optional Firestore instance
 * @param {number} [options.timeoutMs=10000] - Timeout in milliseconds (default 10s)
 * @param {Array}  [options.articlesPool] - Pre-fetched array of articles if available
 * @returns {Promise<{ book: object, chapters: Array<object> }>}
 */
export async function getBookChapters(bookId, options = {}) {
    if (!bookId) {
        throw new Error("പുസ്തകത്തിന്റെ ഐഡി നൽകിയിട്ടില്ല (Missing bookId).");
    }

    const timeoutMs = options.timeoutMs || 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let bookDoc = null;

        // If a pre-fetched pool is passed and contains the book:
        if (Array.isArray(options.articlesPool)) {
            bookDoc = options.articlesPool.find(a => a.id === bookId);
            if (!bookDoc) {
                const norm = normalizeBookKey(bookId);
                bookDoc = options.articlesPool.find(a => 
                    a.type === "BOOK" && (normalizeBookKey(a.bookName) === norm || normalizeBookKey(a.title) === norm)
                );
            }
        }

        // Otherwise fetch target book doc via REST direct
        if (!bookDoc) {
            const bookRes = await fetch(
                `https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/articles/${encodeURIComponent(bookId)}`,
                { signal: controller.signal }
            );
            if (!bookRes.ok) {
                throw new Error(`പുസ്തകം കണ്ടെത്താനായില്ല (HTTP ${bookRes.status})`);
            }
            const bookJson = await bookRes.json();
            bookDoc = parseFirestoreRestDoc(bookJson, bookId);
        }

        // Fetch or use pool for lightweight articles
        let allArticles = options.articlesPool;
        if (!Array.isArray(allArticles) || allArticles.length === 0) {
            const listRes = await fetch(
                `https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/articles?pageSize=100`,
                { signal: controller.signal }
            );
            if (listRes.ok) {
                const listJson = await listRes.json();
                if (listJson && Array.isArray(listJson.documents)) {
                    allArticles = listJson.documents.map(d => parseFirestoreRestDoc(d));
                } else {
                    allArticles = [];
                }
            } else {
                allArticles = [];
            }
        }

        clearTimeout(timer);

        const chapters = filterAndSortChapters(bookDoc, allArticles);
        return {
            book: bookDoc,
            chapters
        };
    } catch (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
            throw new Error("കണക്ഷൻ ടൈംഔട്ട് ആയി (10 seconds timeout). ദയവായി വീണ്ടും ശ്രമിക്കുക.");
        }
        throw err;
    }
}

/**
 * Utility to parse Firestore REST doc format into a clean flat JS object.
 */
function parseFirestoreRestDoc(docItem, fallbackId = "") {
    if (!docItem) return null;
    const id = docItem.name ? docItem.name.split("/").pop() : fallbackId;
    const data = { id };

    if (docItem.fields) {
        for (const [k, v] of Object.entries(docItem.fields)) {
            if (v.stringValue !== undefined) data[k] = v.stringValue;
            else if (v.integerValue !== undefined) data[k] = parseInt(v.integerValue, 10);
            else if (v.doubleValue !== undefined) data[k] = parseFloat(v.doubleValue);
            else if (v.booleanValue !== undefined) data[k] = v.booleanValue;
            else if (v.timestampValue !== undefined) data[k] = v.timestampValue;
            else if (v.arrayValue && v.arrayValue.values) {
                data[k] = v.arrayValue.values.map(val => {
                    if (val.stringValue !== undefined) return val.stringValue;
                    if (val.mapValue && val.mapValue.fields) {
                        const sub = {};
                        for (const [sk, sv] of Object.entries(val.mapValue.fields)) {
                            sub[sk] = sv.stringValue || sv.integerValue || sv.booleanValue;
                        }
                        return sub;
                    }
                    return val;
                });
            } else {
                data[k] = null;
            }
        }
    }
    return data;
}
