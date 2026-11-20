/**
 * NUQTHA — Shared Book Data Helper (js/book-data.js)
 * Single source of truth for querying book chapters, matching book entities,
 * and counting articles across Admin, Home feed, and Reader mode.
 */

import { fetchWithRetry, firebaseConfig, getFirebaseApiKey } from "../firebase-config.js";
import { getArticleImageUrl } from "../schema-validator.js";
import { isPremiumBook } from "./book-notice.js";
import { isPubliclyPublished } from "./public-status.js";

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`;
const CHAPTER_LIST_FIELDS = [
    "title", "author", "date", "order", "priority", "createdAt", "isChapter",
    "bookId", "parentBookId", "bookName", "bookTitle", "playlistName", "bookSlug", "book", "type",
    "category", "status", "imageUrl", "coverUrl", "coverImage", "cover", "image", "thumbnail",
    "thumbnailUrl", "ogImage", "excerpt", "transcription"
];
const prefetchedBookPages = new Set();

export function getBookPageLightData(book, chapterCount = 0) {
    if (!book || typeof book !== "object") return null;
    const cover = getArticleImageUrl(book, "");
    if (/^data:/i.test(cover)) return null;

    let slug = String(book.slug || book.bookSlug || book.id || "").trim();
    try { slug = decodeURIComponent(slug); } catch (_) {}
    if (!slug) return null;
    return {
        slug,
        title: typeof book.title === "string" ? book.title : "",
        author: typeof book.author === "string" ? book.author : "",
        date: typeof book.date === "string" ? book.date : "",
        status: book.status,
        type: typeof book.type === "string" ? book.type : "",
        bookType: typeof book.bookType === "string" ? book.bookType : "",
        category: typeof book.category === "string" ? book.category : "",
        isPremium: isPremiumBook(book),
        price: Number.isFinite(Number(book.price)) ? Number(book.price) : null,
        coverUrl: cover,
        _imageCollection: book._imageCollection || "",
        _imageDocId: book._imageDocId || "",
        _imageFallbackCollection: book._imageFallbackCollection || "",
        _imageFallbackDocId: book._imageFallbackDocId || "",
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
        sessionStorage.setItem(`nuqtha_cache_book_${lightData.slug}_v5`, serialized);
        return lightData;
    } catch (error) {
        console.warn("[BookData] Could not save the lightweight book cache.", error);
        return null;
    }
}

export function saveBookChapterListCache(slug, chapters) {
    if (!slug || !Array.isArray(chapters)) return false;
    try {
        const safeChapters = chapters.filter(chapter =>
            chapter && typeof chapter === "object" && chapter.id && isPubliclyPublished(chapter)
        ).map(chapter => {
            const imageUrl = getArticleImageUrl(chapter, "");
            const image = /^data:/i.test(imageUrl) ? "" : imageUrl;
            return {
                id: String(chapter.id),
                title: typeof chapter.title === "string" ? chapter.title : "",
                author: typeof chapter.author === "string" ? chapter.author : "",
                status: chapter.status,
                order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : null,
                imageUrl: image
            };
        });
        const serialized = JSON.stringify(safeChapters);
        if (new Blob([serialized]).size >= 50 * 1024) return false;
        const cleanSlug = decodeURIComponent(String(slug));
        sessionStorage.setItem(`nuqtha_cache_book_chapters_${cleanSlug}_v3`, serialized);
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
        const stored = sessionStorage.getItem(`nuqtha_cache_book_chapters_${cleanSlug}_v3`);
        const chapters = stored ? JSON.parse(stored) : [];
        return Array.isArray(chapters) ? chapters.filter(chapter =>
            chapter && typeof chapter.id === "string" && isPubliclyPublished(chapter)
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

export function areSameBookByTitle(left, right) {
    const leftTitle = normalizeBookKey(left?.title || left?.bookName);
    const rightTitle = normalizeBookKey(right?.title || right?.bookName);
    if (!leftTitle || leftTitle !== rightTitle) return false;

    for (const field of ["author", "volume", "issue"]) {
        const leftValue = normalizeBookKey(left?.[field]);
        const rightValue = normalizeBookKey(right?.[field]);
        if (leftValue && rightValue && leftValue !== rightValue) return false;
    }
    return true;
}

function isBookRecord(item) {
    const type = String(item?.type || "").toUpperCase();
    const category = normalizeBookKey(item?.category);
    const isChapter = item?.isChapter === true || type === "CHAPTER" ||
        category === "chapter" || (item?.chapterIndex !== undefined && item?.chapterIndex !== null);
    return !isChapter && (
        type === "BOOK" || type === "FREE" || type === "PREMIUM" ||
        item?.isBook === true || category === "book" || category === "books" || category === "premium book" ||
        (Array.isArray(item?.chapters) && item.chapters.length > 0) ||
        (Array.isArray(item?.articleIds) && item.articleIds.length > 0)
    );
}

function getReferenceValues(value) {
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        return text ? [text, text.split("/").pop()] : [];
    }
    if (!value || typeof value !== "object") return [];
    return [
        value.id, value.docId, value.documentId, value.bookId, value.bookSlug, value.slug,
        value.bookTitle, value.bookName, value.title, value.name, value.path, value.reference, value.ref
    ].flatMap(getReferenceValues);
}

function getChapterReferenceId(value) {
    if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        return text ? text.split("/").pop() : "";
    }
    if (!value || typeof value !== "object") return "";
    return getChapterReferenceId(
        value.id || value.articleId || value.chapterId || value.docId ||
        value.documentId || value.reference || value.ref || value.path || value.name
    );
}

function getEmbeddedChapterReferences(book) {
    return [
        ...(Array.isArray(book?.chapters) ? book.chapters : []),
        ...(Array.isArray(book?.articleIds) ? book.articleIds : [])
    ];
}

/**
 * Returns true if an article belongs to the target book doc.
 * Supports:
 * - targetBook.chapters array of IDs or objects
 * - bookId, parentBookId, bookSlug, bookTitle, and book reference links
 */
export function isArticleInBook(article, targetBook) {
    if (!article || !targetBook) return false;
    if (article.id && targetBook.id && article.id === targetBook.id) return false;
    if (isBookRecord(article)) return false;

    const articleId = String(article.id || "").trim();
    if (articleId && getEmbeddedChapterReferences(targetBook).some(reference => getChapterReferenceId(reference) === articleId)) {
        return true;
    }

    const targetIds = new Set([
        targetBook.id, targetBook.bookId, targetBook.docId, targetBook.documentId
    ].flatMap(getReferenceValues));
    const targetKeys = new Set([
        targetBook.slug, targetBook.bookSlug, targetBook.title, targetBook.bookTitle, targetBook.bookName
    ].map(normalizeBookKey).filter(Boolean));
    const articleReferences = [
        article.bookId, article.parentBookId, article.bookSlug,
        article.bookTitle, article.bookName, article.playlistName, article.book
    ];

    return articleReferences.some(reference => getReferenceValues(reference).some(value =>
        targetIds.has(value) || targetKeys.has(normalizeBookKey(value))
    ));
}

export function getRelatedBooks(currentBook, books = [], limit = 4) {
    if (!currentBook || !Array.isArray(books) || limit <= 0) return [];

    const identityKeys = book => {
        const id = normalizeBookKey(book?.id);
        const slug = normalizeBookKey(book?.slug || book?.bookSlug);
        const title = normalizeBookKey(book?.title || book?.bookName);
        return [
            id && `id:${id}`,
            slug && `slug:${slug}`,
            title && `title:${title}`
        ].filter(Boolean);
    };

    const seenKeys = new Set(identityKeys(currentBook));
    const related = [];
    for (const book of books) {
        if (!book || !isBookRecord(book) || !isPubliclyPublished(book)) continue;
        const keys = identityKeys(book);
        if (keys.some(key => seenKeys.has(key))) continue;
        keys.forEach(key => seenKeys.add(key));
        related.push(book);
        if (related.length >= limit) break;
    }
    return related;
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
    const chapterReferences = getEmbeddedChapterReferences(bookDoc);

    if (chapterReferences.length > 0) {
        chapters = chapterReferences.map((ch, idx) => {
            const chapterId = getChapterReferenceId(ch) ||
                (typeof ch === "object" && ch && String(ch.title || "").trim()
                    ? `${bookDoc.id || "book"}-chapter-${idx + 1}`
                    : "");
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
    if (chapterReferences.length === 0) {
        const related = allArticles.filter(art => isArticleInBook(art, bookDoc));
        for (const m of related) {
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
 * @param {boolean} [options.skipBookFetch] - Avoid rereading a complete book document supplied in the pool
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

        const hasEmbeddedChapterList = getEmbeddedChapterReferences(bookDoc).length > 0;

        if (!bookDoc || (!options.skipBookFetch && !hasEmbeddedChapterList)) {
            try {
                const apiKey = getFirebaseApiKey();
                // 1. Try books collection first
                let bookRes = await fetchWithRetry(
                    `${FIRESTORE_REST_BASE}/books/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${["title", "author", "date", "status", "slug", "bookSlug", "bookName", "bookTitle", "book", "bookId", "parentBookId", "playlistName", "imageUrl", "coverUrl", "coverImage", "cover", "image", "thumbnail", "thumbnailUrl", "ogImage", "introduction", "intro", "excerpt", "price", "isPremium", "chapters", "articleIds"].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`,
                    { signal: controller.signal },
                    2,
                    250
                );
                // 2. Fallback to articles collection
                if (!bookRes || !bookRes.ok) {
                    bookRes = await fetchWithRetry(
                        `${FIRESTORE_REST_BASE}/articles/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${["title", "author", "date", "status", "slug", "bookSlug", "bookName", "bookTitle", "book", "bookId", "parentBookId", "playlistName", "imageUrl", "coverUrl", "coverImage", "cover", "image", "thumbnail", "thumbnailUrl", "ogImage", "introduction", "intro", "excerpt", "price", "isPremium", "chapters", "articleIds"].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&")}`,
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

        const chapterReferences = getEmbeddedChapterReferences(bookDoc);
        const relationshipQuery = chapterReferences.length > 0
            ? Promise.resolve([])
            : (async () => {
                const rawIds = [...new Set([bookDoc.id, bookDoc.bookId, bookId].flatMap(getReferenceValues).filter(Boolean))];
                const ids = [...new Set(rawIds.map(value => value.split("/").pop()).filter(Boolean))];
                const slugs = [...new Set([bookDoc.slug, bookDoc.bookSlug, bookId].flatMap(getReferenceValues).filter(Boolean))];
                const titles = [...new Set([bookDoc.title, bookDoc.bookTitle, bookDoc.bookName].flatMap(getReferenceValues).filter(Boolean))];
                const referenceValues = ids.flatMap(id => ["books", "articles"].map(collectionName => ({
                    referenceValue: `projects/${firebaseConfig.projectId}/databases/(default)/documents/${collectionName}/${id}`
                })));
                const stringValues = values => [...new Set(values)].map(stringValue => ({ stringValue }));
                const fieldQueries = [
                    ...([...ids, ...referenceValues].length ? [{
                        field: { fieldPath: "bookId" },
                        values: [...stringValues(rawIds), ...referenceValues]
                    }, {
                        field: { fieldPath: "parentBookId" },
                        values: [...stringValues(rawIds), ...referenceValues]
                    }] : []),
                    ...(slugs.length ? [{
                        field: { fieldPath: "bookSlug" },
                        values: stringValues(slugs)
                    }] : []),
                    ...(titles.length ? ["bookTitle", "bookName", "playlistName"].map(fieldPath => ({
                        field: { fieldPath },
                        values: stringValues(titles)
                    })) : []),
                    ...([...ids, ...slugs, ...titles].length ? [{
                        field: { fieldPath: "book" },
                        values: [...stringValues([...rawIds, ...slugs, ...titles]), ...referenceValues]
                    }] : [])
                ];
                const relationshipFilters = [];
                fieldQueries.forEach(query => {
                    const uniqueValues = new Map(query.values.map(value => [JSON.stringify(value), value]));
                    const valuesByType = [
                        Array.from(uniqueValues.values()).filter(value => "stringValue" in value),
                        Array.from(uniqueValues.values()).filter(value => "referenceValue" in value)
                    ];
                    valuesByType.forEach(values => {
                        if (!values.length) return;
                        relationshipFilters.push({
                            fieldFilter: {
                                field: query.field,
                                op: values.length === 1 ? "EQUAL" : "IN",
                                value: values.length === 1 ? values[0] : { arrayValue: { values } }
                            }
                        });
                    });
                });
                if (!relationshipFilters.length) return [];

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
                                    compositeFilter: {
                                        op: "AND",
                                        filters: [
                                            {
                                                compositeFilter: {
                                                    op: "OR",
                                                    filters: relationshipFilters
                                                }
                                            },
                                            {
                                                fieldFilter: {
                                                    field: { fieldPath: "status" },
                                                    op: "EQUAL",
                                                    value: { stringValue: "published" }
                                                }
                                            }
                                        ]
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
                    throw new Error(`Chapter relationship query failed (${runQueryRes?.status || "no response"}).`);
                }
                return runQueryRes.json();
            })().then(
                result => [{ status: "fulfilled", value: result }],
                reason => [{ status: "rejected", reason }]
            );

        // Build pool map from options pool
        const pool = Array.isArray(options.articlesPool) ? [...options.articlesPool] : [];
        const poolMap = new Map();
        pool.forEach(a => { if (a && a.id) poolMap.set(a.id, a); });

        // Merge related results only when the book does not define an explicit chapter list.
        const queryResults = await relationshipQuery;
        if (chapterReferences.length === 0) {
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

        // Fetch missing documents explicitly listed on the book document.
        if (chapterReferences.length > 0) {
            const missingIds = chapterReferences
                .map(getChapterReferenceId)
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

        // Assemble full chapter list preserving embedded order and all related articles.
        let chapters = [];
        const seenIds = new Set();

        if (chapterReferences.length > 0) {
            chapterReferences.forEach((ch, idx) => {
                const chId = getChapterReferenceId(ch);
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
        if (chapterReferences.length === 0) {
            const related = pool.filter(art => isArticleInBook(art, bookDoc));
            related.forEach(art => {
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
            data[k] = decodeFirestoreRestValue(v);
        }
    }
    return data;
}

function decodeFirestoreRestValue(value) {
    if (!value || typeof value !== "object") return value ?? null;
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("referenceValue" in value) return value.referenceValue;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreRestValue);
    if ("mapValue" in value) {
        return Object.fromEntries(
            Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decodeFirestoreRestValue(child)])
        );
    }
    return null;
}
