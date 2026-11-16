/**
 * NUQTHA — Shared Book Data Helper (js/book-data.js)
 * Single source of truth for querying book chapters, matching book entities,
 * and counting articles across Admin, Home feed, and Reader mode.
 */

import { fetchWithRetry, firebaseConfig, getFirebaseApiKey } from "../firebase-config.js";

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`;
const CHAPTER_LIST_FIELDS = [
    "title", "author", "date", "order", "priority", "createdAt", "isChapter",
    "bookId", "parentBookId", "bookName", "playlistName", "bookSlug", "type",
    "category", "imageUrl", "thumbnailUrl", "ogImage", "excerpt", "transcription"
];
const prefetchedBookPages = new Set();

export function getBookPageLightData(book, chapterCount = 0) {
    if (!book || typeof book !== "object") return null;
    const cover = [book.imageUrl, book.coverUrl, book.coverImage, book.image, book.thumbnailUrl, book.thumbnail, book.ogImage]
        .find(value => typeof value === "string" && value.trim())?.trim() || "";
    if (/^data:/i.test(cover)) return null;

    let slug = String(book.slug || book.bookSlug || book.id || "").trim();
    try { slug = decodeURIComponent(slug); } catch (_) {}
    if (!slug) return null;
    return {
        slug,
        title: typeof book.title === "string" ? book.title : "",
        author: typeof book.author === "string" ? book.author : "",
        date: typeof book.date === "string" ? book.date : "",
        coverUrl: cover,
        intro: typeof (book.introduction || book.intro || book.excerpt || book.description) === "string"
            ? (book.introduction || book.intro || book.excerpt || book.description)
            : "",
        chapterCount: Number.isFinite(Number(chapterCount)) ? Math.max(0, Number(chapterCount)) : 0
    };
}

export function saveBookPageLightCache(book, chapterCount = 0) {
    const lightData = getBookPageLightData(book, chapterCount);
    if (!lightData || /^data:/i.test(lightData.coverUrl)) return null;
    try {
        const serialized = JSON.stringify(lightData);
        if (new Blob([serialized]).size >= 50 * 1024) return null;
        sessionStorage.setItem(`nuqtha_cache_book_${lightData.slug}_v2`, serialized);
        return lightData;
    } catch (error) {
        console.warn("[BookData] Could not save the lightweight book cache.", error);
        return null;
    }
}

export function saveBookChapterListCache(slug, chapters) {
    if (!slug || !Array.isArray(chapters)) return false;
    try {
        const safeChapters = chapters.filter(chapter => chapter && typeof chapter === "object" && chapter.id).map(chapter => {
            const image = [chapter.thumbnailUrl, chapter.ogImage, chapter.imageUrl]
                .find(value => typeof value === "string" && value.trim() && !/^data:/i.test(value)) || "";
            return {
                id: String(chapter.id),
                title: typeof chapter.title === "string" ? chapter.title : "",
                author: typeof chapter.author === "string" ? chapter.author : "",
                order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : null,
                imageUrl: image
            };
        });
        const serialized = JSON.stringify(safeChapters);
        if (new Blob([serialized]).size >= 50 * 1024) return false;
        const cleanSlug = decodeURIComponent(String(slug));
        sessionStorage.setItem(`nuqtha_cache_book_chapters_${cleanSlug}_v1`, serialized);
        return true;
    } catch (error) {
        console.warn("[BookData] Could not save the chapter-list prefetch.", error);
        return false;
    }
}

export function readBookChapterListCache(slug) {
    if (!slug) return [];
    try {
        const cleanSlug = decodeURIComponent(String(slug));
        const stored = sessionStorage.getItem(`nuqtha_cache_book_chapters_${cleanSlug}_v1`);
        const chapters = stored ? JSON.parse(stored) : [];
        return Array.isArray(chapters) ? chapters.filter(chapter =>
            chapter && typeof chapter.id === "string"
        ) : [];
    } catch (error) {
        console.warn("[BookData] Could not restore the chapter-list prefetch.", error);
        return [];
    }
}

export function prefetchBookPage(book, chapterCount = 0) {
    if (!book || typeof book !== "object") return null;
    const lightData = saveBookPageLightCache(book, chapterCount);
    if (!lightData) return null;
    if (typeof document === "undefined") return lightData;

    if (lightData.coverUrl) {
        try {
            const resolvedCover = new URL(lightData.coverUrl, window.location.href).href;
            const hasPreload = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'))
                .some(link => link.href === resolvedCover);
            if (!hasPreload) {
                const preload = document.createElement("link");
                preload.rel = "preload";
                preload.as = "image";
                preload.href = resolvedCover;
                preload.fetchPriority = "high";
                document.head.appendChild(preload);
            }
        } catch (error) {
            console.warn("[BookData] Could not preload the book cover.", error);
        }
    }

    if (!prefetchedBookPages.has(lightData.slug)) {
        prefetchedBookPages.add(lightData.slug);
        const prefetch = document.createElement("link");
        prefetch.rel = "prefetch";
        prefetch.as = "document";
        prefetch.href = `/book/${encodeURIComponent(lightData.slug)}`;
        document.head.appendChild(prefetch);
    }
    return lightData;
}

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
    const aType = (article.type || "").toUpperCase();
    const category = normalizeBookKey(article.category);
    const isBookRecord = aType === "BOOK" || aType === "FREE" || aType === "PREMIUM" ||
        article.isBook === true || category === "book" || category === "books" || category === "premium book";
    const isExplicitChapter = article.isChapter === true || aType === "CHAPTER" ||
        category === "chapter" || (article.chapterIndex !== undefined && article.chapterIndex !== null);
    if (isBookRecord && !isExplicitChapter) return false;

    // Check chapters array on targetBook doc if present
    if (Array.isArray(targetBook.chapters)) {
        const inArray = targetBook.chapters.some(ch => {
            if (!ch) return false;
            if (typeof ch === "string") return ch === article.id;
            if (typeof ch === "object" && (ch.id || ch.articleId || ch.chapterId)) {
                return (ch.id || ch.articleId || ch.chapterId) === article.id;
            }
            return false;
        });
        if (inArray) return true;
    }

    const bId = (targetBook.id || "").toString().trim();
    const aBookId = (article.bookId || article.parentBookId || "").toString().trim();
    if (bId && aBookId && bId === aBookId) return true;

    const bTitle = normalizeBookKey(targetBook.title);
    const bName = normalizeBookKey(targetBook.bookName);
    const articleBookNames = [article.bookName, article.playlistName].map(normalizeBookKey).filter(Boolean);

    if (articleBookNames.some(name => (bName && name === bName) || (bTitle && name === bTitle))) return true;

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
    const idMap = new Map(allArticles.map(a => [a.id, a]));
    const seen = new Set();

    // Check if bookDoc itself has embedded chapters array
    if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
        chapters = bookDoc.chapters.map((ch, idx) => {
            const chapterId = typeof ch === "string"
                ? ch
                : (ch?.id || ch?.articleId || ch?.chapterId ||
                    (String(ch?.title || "").trim() ? `${bookDoc.id || "book"}-chapter-${idx + 1}` : ""));
            if (!chapterId || seen.has(chapterId)) return null;
            const found = idMap.get(chapterId);
            const foundType = (found?.type || "").toUpperCase();
            const foundIsChapter = found?.isChapter === true || foundType === "CHAPTER" ||
                normalizeBookKey(found?.category) === "chapter" ||
                (found?.chapterIndex !== undefined && found?.chapterIndex !== null);
            if (found && (foundType === "BOOK" || foundType === "FREE" || foundType === "PREMIUM" || found.isBook === true) && !foundIsChapter) return null;
            if (!found && !(typeof ch === "object" && ch && String(ch.title || "").trim())) return null;
            seen.add(chapterId);
            const embeddedOrder = typeof ch === "object" && ch.order !== undefined && ch.order !== null && !isNaN(ch.order)
                ? Number(ch.order)
                : idx + 1;
            return {
                ...(typeof ch === "object" ? ch : {}),
                ...(found || {}),
                id: chapterId,
                order: embeddedOrder
            };
        }).filter(Boolean);
    }

    // An explicit embedded chapter list is authoritative; unrelated legacy
    // articles sharing a book name must not inflate the list or its count.
    if (!Array.isArray(bookDoc.chapters) || bookDoc.chapters.length === 0) {
        const related = allArticles.filter(art => isArticleInBook(art, bookDoc));
        const explicitlyMarked = related.filter(art =>
            art.isChapter === true ||
            (art.type || "").toUpperCase() === "CHAPTER" ||
            normalizeBookKey(art.category) === "chapter" ||
            (art.chapterIndex !== undefined && art.chapterIndex !== null)
        );
        const matched = explicitlyMarked.length > 0 ? explicitlyMarked : related;
        for (const m of matched) {
            if (m?.id && !seen.has(m.id)) {
                seen.add(m.id);
                chapters.push(m);
            }
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
    if (!bookDoc || !Array.isArray(allArticles)) return 0;
    return filterAndSortChapters(bookDoc, allArticles).length;
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
                    ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && (normalizeBookKey(a.bookName) === norm || normalizeBookKey(a.title) === norm)
                );
            }
        }

        const hasEmbeddedChapterList = Array.isArray(bookDoc?.chapters) && bookDoc.chapters.length > 0;
        const relationshipQuery = hasEmbeddedChapterList
            ? Promise.resolve([])
            : Promise.allSettled(["bookId", "parentBookId"].map(async fieldPath => {
                const apiKey = getFirebaseApiKey();
                const runQueryRes = await fetchWithRetry(
                    `${FIRESTORE_REST_BASE}:runQuery?key=${encodeURIComponent(apiKey)}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            structuredQuery: {
                                select: { fields: CHAPTER_LIST_FIELDS.map(fieldPath => ({ fieldPath })) },
                                from: [{ collectionId: "articles" }],
                                where: {
                                    fieldFilter: {
                                        field: { fieldPath },
                                        op: "EQUAL",
                                        value: { stringValue: bookDoc?.id || bookId }
                                    }
                                }
                            }
                        }),
                        signal: controller.signal
                    },
                    2,
                    250
                );
                if (!runQueryRes || !runQueryRes.ok) {
                    throw new Error(`Chapter query by ${fieldPath} failed (${runQueryRes?.status || "no response"}).`);
                }
                return runQueryRes.json();
            }));

        // Fetch or complete the book document while the chapter query runs.
        if (!bookDoc || !Array.isArray(bookDoc.chapters) || bookDoc.chapters.length === 0) {
            try {
                const apiKey = getFirebaseApiKey();
                // 1. Try books collection first
                let bookRes = await fetchWithRetry(
                    `${FIRESTORE_REST_BASE}/books/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${["title", "author", "date", "slug", "bookSlug", "imageUrl", "thumbnailUrl", "ogImage", "introduction", "intro", "excerpt", "price", "isPremium", "chapters"].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`,
                    { signal: controller.signal },
                    2,
                    250
                );
                // 2. Fallback to articles collection
                if (!bookRes || !bookRes.ok) {
                    bookRes = await fetchWithRetry(
                        `${FIRESTORE_REST_BASE}/articles/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${["title", "author", "date", "slug", "bookSlug", "imageUrl", "thumbnailUrl", "ogImage", "introduction", "intro", "excerpt", "price", "isPremium", "chapters"].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`,
                        { signal: controller.signal },
                        2,
                        250
                    );
                }
                if (bookRes && bookRes.ok) {
                    const bookJson = await bookRes.json();
                    const directDoc = parseFirestoreRestDoc(bookJson, bookId);
                    bookDoc = { ...(bookDoc || {}), ...directDoc, isBook: true, type: "BOOK" };
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

        // Merge projected chapter-list results only when no explicit list exists.
        const queryResults = await relationshipQuery;
        if (!Array.isArray(bookDoc.chapters) || bookDoc.chapters.length === 0) {
            queryResults.forEach((result, queryIndex) => {
                if (result.status !== "fulfilled" || !Array.isArray(result.value)) {
                    if (result.status === "rejected") {
                        console.warn(`[BookData] Chapter relationship query ${queryIndex + 1} failed.`, result.reason);
                    }
                    return;
                }
                result.value.forEach(item => {
                    if (!item.document) return;
                    const parsed = parseFirestoreRestDoc(item.document);
                    if (parsed?.id) {
                        poolMap.set(parsed.id, parsed);
                        if (!pool.some(p => p.id === parsed.id)) pool.push(parsed);
                    }
                });
            });
        }

        // Fetch any missing chapter documents specifically listed in bookDoc.chapters array
        if (Array.isArray(bookDoc.chapters) && bookDoc.chapters.length > 0) {
            const missingIds = bookDoc.chapters
                .map(ch => (typeof ch === "string" ? ch : (ch?.id || ch?.articleId || ch?.chapterId)))
                .filter(id => id && (!poolMap.has(id) || !poolMap.get(id).title));

            if (missingIds.length > 0) {
                try {
                    const apiKey = getFirebaseApiKey();
                    const fetchedDocs = await Promise.allSettled(
                        missingIds.map(id =>
                            fetchWithRetry(`${FIRESTORE_REST_BASE}/articles/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}&${CHAPTER_LIST_FIELDS.map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`, { signal: controller.signal }, 2, 250)
                                .then(r => r && r.ok ? r.json() : null)
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
                const chId = typeof ch === "string" ? ch : (ch?.id || ch?.articleId || ch?.chapterId);
                const found = chId ? poolMap.get(chId) : null;
                const foundType = (found?.type || "").toUpperCase();
                const foundIsChapter = found?.isChapter === true || foundType === "CHAPTER" ||
                    normalizeBookKey(found?.category) === "chapter" ||
                    (found?.chapterIndex !== undefined && found?.chapterIndex !== null);
                const isInvalidBookReference = found &&
                    (foundType === "BOOK" || foundType === "FREE" || foundType === "PREMIUM" || found.isBook === true) &&
                    !foundIsChapter;
                if (found && !isInvalidBookReference) {
                    seenIds.add(found.id);
                    chapters.push({
                        ...found,
                        order: typeof ch === "object" && ch.order !== undefined && ch.order !== null && !isNaN(ch.order)
                            ? Number(ch.order)
                            : (idx + 1)
                    });
                } else if (!isInvalidBookReference && typeof ch === "object" && ch) {
                    if (String(ch.title || "").trim()) {
                        if (chId) seenIds.add(chId);
                        chapters.push({
                            ...ch,
                            id: chId || ch.id || `${bookDoc.id}-chapter-${idx + 1}`,
                            order: ch.order !== undefined && ch.order !== null && !isNaN(ch.order) ? Number(ch.order) : (idx + 1)
                        });
                    }
                }
            });
        }

        // An embedded list is the book's canonical chapter order and membership.
        if (!Array.isArray(bookDoc.chapters) || bookDoc.chapters.length === 0) {
            const related = pool.filter(art => isArticleInBook(art, bookDoc));
            const explicitlyMarked = related.filter(art =>
                art.isChapter === true ||
                (art.type || "").toUpperCase() === "CHAPTER" ||
                normalizeBookKey(art.category) === "chapter" ||
                (art.chapterIndex !== undefined && art.chapterIndex !== null)
            );
            const matched = explicitlyMarked.length > 0 ? explicitlyMarked : related;
            matched.forEach(art => {
                const artType = (art?.type || "").toUpperCase();
                if (art && art.id && !seenIds.has(art.id) && artType !== "BOOK" && art.isBook !== true) {
                    seenIds.add(art.id);
                    chapters.push(art);
                }
            });
        }

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
