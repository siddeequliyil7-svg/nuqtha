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

        // Fetch or complete book doc via REST direct if missing or chapters array missing
        if (!bookDoc || !Array.isArray(bookDoc.chapters) || bookDoc.chapters.length === 0) {
            try {
                const bookRes = await fetch(
                    `https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/articles/${encodeURIComponent(bookId)}`,
                    { signal: controller.signal }
                );
                if (bookRes.ok) {
                    const bookJson = await bookRes.json();
                    const directDoc = parseFirestoreRestDoc(bookJson, bookId);
                    bookDoc = { ...(bookDoc || {}), ...directDoc };
                }
            } catch (bErr) {
                console.warn("[BookData] Direct book fetch error:", bErr);
            }
        }

        if (!bookDoc) {
            throw new Error("പുസ്തകം കണ്ടെത്താനായില്ല.");
        }

        // Build pool map from options pool
        const pool = Array.isArray(options.articlesPool) ? [...options.articlesPool] : [];
        const poolMap = new Map();
        pool.forEach(a => { if (a && a.id) poolMap.set(a.id, a); });

        // Query Firestore specifically for articles with this bookId
        try {
            const runQueryRes = await fetch(
                `https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents:runQuery`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        structuredQuery: {
                            from: [{ collectionId: "articles" }],
                            where: {
                                fieldFilter: {
                                    field: { fieldPath: "bookId" },
                                    op: "EQUAL",
                                    value: { stringValue: bookDoc.id || bookId }
                                }
                            }
                        }
                    }),
                    signal: controller.signal
                }
            );
            if (runQueryRes.ok) {
                const queryJson = await runQueryRes.json();
                if (Array.isArray(queryJson)) {
                    queryJson.forEach(item => {
                        if (item.document) {
                            const parsed = parseFirestoreRestDoc(item.document);
                            if (parsed && parsed.id) {
                                poolMap.set(parsed.id, parsed);
                                if (!pool.some(p => p.id === parsed.id)) pool.push(parsed);
                            }
                        }
                    });
                }
            }
        } catch (qErr) {
            console.warn("[BookData] runQuery by bookId fallback:", qErr);
        }

        // Fetch any missing chapter documents specifically listed in bookDoc.chapters array
        if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
            const missingIds = bookDoc.chapters
                .map(ch => (typeof ch === "string" ? ch : ch?.id))
                .filter(id => id && (!poolMap.has(id) || !poolMap.get(id).title));

            if (missingIds.length > 0) {
                try {
                    const fetchedDocs = await Promise.allSettled(
                        missingIds.map(id =>
                            fetch(`https://firestore.googleapis.com/v1/projects/nuqtha-c0900/databases/(default)/documents/articles/${encodeURIComponent(id)}`, { signal: controller.signal })
                                .then(r => r.ok ? r.json() : null)
                                .then(j => j ? parseFirestoreRestDoc(j, id) : null)
                        )
                    );
                    fetchedDocs.forEach(res => {
                        if (res.status === "fulfilled" && res.value && res.value.id) {
                            poolMap.set(res.value.id, res.value);
                            if (!pool.some(p => p.id === res.value.id)) pool.push(res.value);
                        }
                    });
                } catch (mErr) {
                    console.warn("[BookData] Missing chapter fetch fallback:", mErr);
                }
            }
        }

        clearTimeout(timer);

        // Assemble full chapter list preserving bookDoc.chapters order and all bookId matches
        let chapters = [];
        const seenIds = new Set();

        if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
            bookDoc.chapters.forEach((ch, idx) => {
                const chId = typeof ch === "string" ? ch : ch?.id;
                const found = chId ? poolMap.get(chId) : null;
                if (found) {
                    seenIds.add(found.id);
                    chapters.push({
                        ...found,
                        order: found.order !== undefined && found.order !== null ? Number(found.order) : (idx + 1)
                    });
                } else if (typeof ch === "object" && ch) {
                    if (ch.id) seenIds.add(ch.id);
                    chapters.push({
                        ...ch,
                        order: ch.order !== undefined && ch.order !== null ? Number(ch.order) : (idx + 1)
                    });
                } else if (chId) {
                    seenIds.add(chId);
                    chapters.push({ id: chId, title: `അധ്യായം ${idx + 1}`, order: idx + 1 });
                }
            });
        }

        // Include any additional articles matched by bookId or bookName not already included
        pool.forEach(art => {
            if (art && art.id && !seenIds.has(art.id) && art.type !== "BOOK") {
                if (isArticleInBook(art, bookDoc)) {
                    seenIds.add(art.id);
                    chapters.push(art);
                }
            }
        });

        chapters.sort(compareChaptersOrder);

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
export function parseFirestoreRestDoc(docItem, fallbackId = "") {
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
