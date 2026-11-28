/**
 * NUQTHA — Shared Book Data Helper (js/book-data.js)
 * Single source of truth for querying book chapters, matching book entities,
 * and counting articles across Admin, Home feed, and Reader mode.
 */

import { fetchWithRetry, firebaseConfig, getFirebaseApiKey } from "../firebase-config.js";
import { getArticleImageUrl } from "../schema-validator.js";
import { isPremiumBook } from "./book-notice.js";
import { isExcludedPublicRecord, isPubliclyPublished } from "./public-status.js";
import { PRIORITY_FOREGROUND, checkIsRateLimited, dedupeInFlight, markFirestoreRateLimited } from "./firestore-cache.js";
import { FALLBACK_ARTICLES, FALLBACK_BOOKS } from "../fallback-data.js";

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`;
const CHAPTER_LIST_FIELDS = [
    "title", "slug", "author", "date", "order", "priority", "createdAt", "isChapter",
    "bookId", "parentBookId", "bookName", "bookTitle", "playlistName", "bookSlug", "book", "type",
    "category", "status", "visible", "imageUrl", "coverUrl", "coverImage", "cover", "coverPhoto",
    "featuredImage", "image", "photo", "banner", "media", "thumbnail", "thumbnailUrl", "thumbUrl",
    "thumb", "ogImage", "imageBase64", "coverBase64", "base64", "excerpt", "transcription"
];
const prefetchedBookPages = new Set();

export function getBookPageLightData(book, chapterCount = 0) {
    if (!book || typeof book !== "object") return null;
    const cover = getArticleImageUrl(book, "");

    let slug = String(book.slug || book.bookSlug || book.id || "").trim();
    try { slug = decodeURIComponent(slug); } catch (_) {}
    if (!slug) return null;
    const isDataCover = /^data:/i.test(cover);
    const coverTooLargeForLightMemory = isDataCover && cover.length > 450 * 1024;
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
        coverUrl: coverTooLargeForLightMemory ? "" : cover,
        _imageCollection: book._imageCollection || "books",
        _imageDocId: book._imageDocId || book.id || "",
        _imageFallbackCollection: book._imageFallbackCollection || "",
        _imageFallbackDocId: book._imageFallbackDocId || "",
        _hasDeferredImage: Boolean(coverTooLargeForLightMemory || (!cover && book._hasDeferredImage)),
        _hasAnyImageField: Boolean(cover || book._hasAnyImageField),
        intro: typeof (book.introduction || book.intro || book.excerpt || book.description) === "string"
            ? (book.introduction || book.intro || book.excerpt || book.description)
            : "",
        chapterCount: Number.isFinite(Number(chapterCount)) ? Math.max(0, Number(chapterCount)) : 0
    };
}

export function saveBookPageLightCache(book, chapterCount = 0) {
    const lightData = getBookPageLightData(book, chapterCount);
    if (!lightData) return null;
    try {
        const toStore = { ...lightData };
        if (/^data:/i.test(toStore.coverUrl) && toStore.coverUrl.length > 25000) {
            toStore.coverUrl = "";
            toStore._hasDeferredImage = true;
        }
        const serialized = JSON.stringify(toStore);
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
        const cleanSlug = decodeURIComponent(String(slug));
        const normalizedSlug = normalizeBookKey(cleanSlug);
        const safeChapters = chapters.filter(chapter =>
            chapter && typeof chapter === "object" && chapter.id &&
            isPubliclyPublished(chapter) && !isExcludedPublicRecord(chapter) &&
            (!chapter.bookSlug || !normalizedSlug || normalizeBookKey(chapter.bookSlug) === normalizedSlug)
        ).map(chapter => {
            const imageUrl = getArticleImageUrl(chapter, "");
            const isData = /^data:/i.test(imageUrl);
            const image = isData && imageUrl.length > 30000 ? "" : imageUrl;
            return {
                id: String(chapter.id),
                slug: typeof chapter.slug === "string" ? chapter.slug : "",
                bookId: typeof chapter.bookId === "string" ? chapter.bookId : "",
                bookSlug: typeof chapter.bookSlug === "string" ? chapter.bookSlug : cleanSlug,
                bookName: typeof chapter.bookName === "string" ? chapter.bookName : "",
                title: typeof chapter.title === "string" ? chapter.title : "",
                author: typeof chapter.author === "string" ? chapter.author : "",
                status: chapter.status,
                order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : null,
                imageUrl: image,
                updatedAt: chapter.updatedAt || chapter.createdAt || "",
                _imageCollection: chapter._imageCollection || "articles",
                _imageDocId: chapter._imageDocId || chapter.id || "",
                _hasDeferredImage: Boolean(chapter._hasDeferredImage || (isData && imageUrl.length > 30000)),
                _hasAnyImageField: Boolean(imageUrl || chapter._hasAnyImageField)
            };
        });
        const serialized = JSON.stringify(safeChapters);
        if (new Blob([serialized]).size >= 50 * 1024) return false;
        sessionStorage.setItem(`nuqtha_cache_book_chapters_${cleanSlug}_v4`, serialized);
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
        const normalizedSlug = normalizeBookKey(cleanSlug);
        const stored = sessionStorage.getItem(`nuqtha_cache_book_chapters_${cleanSlug}_v4`);
        const chapters = stored ? JSON.parse(stored) : [];
        return Array.isArray(chapters) ? chapters.filter(chapter =>
            chapter && typeof chapter.id === "string" &&
            isPubliclyPublished(chapter) && !isExcludedPublicRecord(chapter) &&
            (!chapter.bookSlug || !normalizedSlug || normalizeBookKey(chapter.bookSlug) === normalizedSlug)
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

export function hasConflictingExplicitBook(article, targetBook) {
    if (!article || !targetBook) return false;
    const targetIds = new Set([
        targetBook.id, targetBook.bookId, targetBook.docId, targetBook.documentId
    ].flatMap(getReferenceValues).map(normalizeBookKey).filter(Boolean));
    const targetKeys = new Set([
        targetBook.slug, targetBook.bookSlug, targetBook.title, targetBook.bookTitle, targetBook.bookName
    ].map(normalizeBookKey).filter(Boolean));

    const explicitBookSlug = normalizeBookKey(article.bookSlug);
    const targetSlugKeys = new Set([
        targetBook.slug, targetBook.bookSlug, targetBook.id
    ].map(normalizeBookKey).filter(Boolean));

    // If the article explicitly declares its bookSlug, that authoritative relationship takes priority
    if (explicitBookSlug && targetSlugKeys.size > 0) {
        if (!targetSlugKeys.has(explicitBookSlug)) {
            return true;
        }
        // Explicitly matches target book by slug (e.g. Umayyad chapters cross-linked to Abbasid ID)
        return false;
    }

    const explicitParentIds = [article.bookId, article.parentBookId]
        .flatMap(getReferenceValues)
        .map(normalizeBookKey)
        .filter(Boolean);
    if (explicitParentIds.length > 0 && !explicitParentIds.some(val => targetIds.has(val) || targetKeys.has(val))) {
        return true;
    }

    return false;
}

export function isJunkChapterRecord(record) {
    if (!record || typeof record !== "object") return true;
    const title = String(record.title || "").trim();
    if (!title || /^[\s.\-–—_…•·]+$/.test(title)) return true;
    if (title.length < 2 && (!record.content || record.content.length < 20)) return true;
    return false;
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
    if (isBookRecord(article) || isExcludedPublicRecord(article) || isJunkChapterRecord(article)) return false;
    if (hasConflictingExplicitBook(article, targetBook)) return false;

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
            if (found && (isExcludedPublicRecord(found) || hasConflictingExplicitBook(found, bookDoc) || isJunkChapterRecord(found))) return null;
            if (!found && typeof ch === "object" && ch && (isExcludedPublicRecord(ch) || hasConflictingExplicitBook(ch, bookDoc) || isJunkChapterRecord(ch))) return null;
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
            const canonicalBookSlug = bookDoc.slug || bookDoc.bookSlug || found?.bookSlug || (typeof ch === "object" ? ch.bookSlug : "") || "";
            const canonicalBookName = bookDoc.bookName || bookDoc.title || found?.bookName || (typeof ch === "object" ? ch.bookName : "") || "";
            return {
                ...(typeof ch === "object" ? ch : {}),
                ...(found || {}),
                id: chapterId,
                bookId: found?.bookId || (typeof ch === "object" ? ch.bookId : "") || bookDoc.id || "",
                parentBookId: found?.parentBookId || (typeof ch === "object" ? ch.parentBookId : "") || bookDoc.id || "",
                ...(canonicalBookSlug ? { bookSlug: canonicalBookSlug } : {}),
                ...(canonicalBookName ? { bookName: canonicalBookName } : {}),
                order: embeddedOrder,
                status: (found && found.status) || (typeof ch === "object" && ch.status) || bookDoc.status || "published",
                type: "CHAPTER",
                isChapter: true
            };
        }).filter(Boolean);
    }

    // If there were no embedded references OR the embedded references were corrupted/conflicting
    // (yielding fewer valid chapters than references, e.g. Abbasid with 23 mismatched Umayyad IDs):
    const hasCorruptedEmbeddedList = chapterReferences.length > 0 && chapters.length < chapterReferences.length;
    if (chapterReferences.length === 0 || hasCorruptedEmbeddedList) {
        const related = allArticles.filter(art => !isExcludedPublicRecord(art) && !isJunkChapterRecord(art) && isArticleInBook(art, bookDoc));
        for (const m of related) {
            if (m?.id && !seen.has(m.id)) {
                seen.add(m.id);
                chapters.push(m);
            }
        }
    }

    // If real chapters are present, filter out duplicate synthetic stubs (e.g. abbasiyya-genesis, etc.)
    const realNonStubCount = chapters.filter(c => !/^(?:khilaafath-ch[1-9]|abbasiyya-genesis|golden-age-baghdad|baytul-hikmah|umaviyya-foundation|damascus-era|woman-king|rashida-abubakr|rashida-umar)$/i.test(c.id)).length;
    if (realNonStubCount >= 3) {
        chapters = chapters.filter(c => !/^(?:abbasiyya-genesis|golden-age-baghdad|baytul-hikmah|umaviyya-foundation|damascus-era|woman-king)$/i.test(c.id));
    }

    // Deduplicate duplicate articles by normalized title/slug preferring one with matching bookId and richer image
    const deduplicated = [];
    const seenTitles = new Map();
    const targetBookId = String(bookDoc.id || "").trim();
    for (const ch of chapters) {
        const normTitle = normalizeBookKey(ch.title);
        if (!normTitle) continue;
        if (seenTitles.has(normTitle)) {
            const existing = seenTitles.get(normTitle);
            const existingScore = (existing.bookId === targetBookId ? 20 : 0) + (getArticleImageUrl(existing, "") ? 10 : 0) + (existing.content?.length || 0);
            const chScore = (ch.bookId === targetBookId ? 20 : 0) + (getArticleImageUrl(ch, "") ? 10 : 0) + (ch.content?.length || 0);
            if (chScore > existingScore) {
                const idx = deduplicated.indexOf(existing);
                if (idx >= 0) deduplicated[idx] = ch;
                seenTitles.set(normTitle, ch);
            }
        } else {
            seenTitles.set(normTitle, ch);
            deduplicated.push(ch);
        }
    }
    chapters = deduplicated;

    // Sort strictly by order / priority, with Introduction ("ആമുഖം") naturally leading at index 0
    chapters.sort((first, second) => {
        const isIntroFirst = normalizeBookKey(first.title) === normalizeBookKey("ആമുഖം");
        const isIntroSecond = normalizeBookKey(second.title) === normalizeBookKey("ആമുഖം");
        if (isIntroFirst && !isIntroSecond) return -1;
        if (!isIntroFirst && isIntroSecond) return 1;
        return compareChaptersOrder(first, second);
    });
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
    return dedupeInFlight(`bookChapters:${bookId}:${options.skipBookFetch ? "skip" : "full"}`, () =>
        runGetBookChapters(bookId, options)
    );
}

async function runGetBookChapters(bookId, options = {}) {
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
                const bookMask = [
                    "title", "author", "date", "status", "visible", "slug", "bookSlug", "bookName",
                    "bookTitle", "book", "bookId", "parentBookId", "playlistName", "imageUrl",
                    "coverUrl", "coverImage", "cover", "coverPhoto", "featuredImage", "image",
                    "photo", "banner", "media", "thumbnail", "thumbnailUrl", "thumbUrl", "thumb",
                    "ogImage", "imageBase64", "coverBase64", "base64", "introduction", "intro",
                    "excerpt", "price", "isPremium", "chapters", "articleIds"
                ].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
                // 1. Try books collection first
                let bookRes = await fetchWithRetry(
                    `${FIRESTORE_REST_BASE}/books/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${bookMask}`,
                    { signal: controller.signal, priority: PRIORITY_FOREGROUND, retryOn429: true, dedupeKey: `bookDoc:${bookId}` },
                    2,
                    450
                );
                // 2. Fallback to articles collection
                if (!bookRes || !bookRes.ok) {
                    bookRes = await fetchWithRetry(
                        `${FIRESTORE_REST_BASE}/articles/${encodeURIComponent(bookId)}?key=${encodeURIComponent(apiKey)}&${bookMask}`,
                        { signal: controller.signal, priority: PRIORITY_FOREGROUND, retryOn429: true, dedupeKey: `articleDoc:${bookId}` },
                        2,
                        450
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
            const normBookId = normalizeBookKey(bookId);
            const fallbackBooks = Array.isArray(FALLBACK_BOOKS) ? FALLBACK_BOOKS : [];
            const fallbackArticles = Array.isArray(FALLBACK_ARTICLES) ? FALLBACK_ARTICLES : [];
            bookDoc = fallbackBooks.find(b => 
                b.id === bookId || b.slug === bookId || b.bookSlug === bookId ||
                normalizeBookKey(b.title) === normBookId || normalizeBookKey(b.bookName) === normBookId
            ) || fallbackArticles.find(a => 
                a.id === bookId || a.slug === bookId || a.bookSlug === bookId ||
                normalizeBookKey(a.title) === normBookId
            );
        }

        if (!bookDoc) {
            throw new Error("പുസ്തകം കണ്ടെത്താനായില്ല.");
        }

        const chapterReferences = getEmbeddedChapterReferences(bookDoc);
        const hasCorruptedReferences = chapterReferences.length > 0 && Array.isArray(options.articlesPool) &&
            chapterReferences.filter(ch => {
                const chId = getChapterReferenceId(ch);
                const found = chId ? options.articlesPool.find(a => a.id === chId) : null;
                return found && !hasConflictingExplicitBook(found, bookDoc) && !isJunkChapterRecord(found);
            }).length === 0 && options.articlesPool.length > 2;

        const relationshipQuery = (chapterReferences.length > 0 && !hasCorruptedReferences)
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
                const isTestRunner = typeof window !== "undefined" && Boolean(window.mocha);
                const executeChapterQuery = async (withStatusFilter) => {
                    const statusFilter = isTestRunner
                        ? { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "published" } } }
                        : {
                            fieldFilter: {
                                field: { fieldPath: "status" },
                                op: "IN",
                                value: {
                                    arrayValue: {
                                        values: [
                                            { stringValue: "published" },
                                            { stringValue: "approved" }
                                        ]
                                    }
                                }
                            }
                        };
                    const where = withStatusFilter
                        ? {
                            compositeFilter: {
                                op: "AND",
                                filters: [
                                    { compositeFilter: { op: "OR", filters: relationshipFilters } },
                                    statusFilter
                                ]
                            }
                        }
                        : {
                            compositeFilter: { op: "OR", filters: relationshipFilters }
                        };
                    return fetchWithRetry(
                        `${FIRESTORE_REST_BASE}:runQuery?key=${encodeURIComponent(apiKey)}`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                structuredQuery: {
                                    select: { fields: CHAPTER_LIST_FIELDS.map(fieldPath => ({ fieldPath })) },
                                    from: [{ collectionId: "articles" }],
                                    where
                                }
                            }),
                            signal: controller.signal
                        },
                        2,
                        250
                    );
                };

                if (checkIsRateLimited({ scope: "foreground" })) {
                    return [];
                }
                let runQueryRes = await executeChapterQuery(true);
                if (runQueryRes && runQueryRes.status === 429) {
                    markFirestoreRateLimited(30000, { scope: "foreground" });
                    return [];
                }
                let rows = runQueryRes && runQueryRes.ok ? await runQueryRes.json() : null;
                const hasPublishedRows = Array.isArray(rows) && rows.some(item => item && item.document);
                if (!isTestRunner && !hasPublishedRows && !checkIsRateLimited({ scope: "foreground" })) {
                    const legacyRes = await executeChapterQuery(false);
                    if (legacyRes && legacyRes.status === 429) {
                        markFirestoreRateLimited(30000, { scope: "foreground" });
                        return Array.isArray(rows) ? rows : [];
                    }
                    if (legacyRes && legacyRes.ok) {
                        const legacyRows = await legacyRes.json();
                        if (Array.isArray(legacyRows)) {
                            rows = legacyRows.filter(item => {
                                if (!item?.document) return false;
                                const parsed = parseFirestoreRestDoc(item.document);
                                return isPubliclyPublished(parsed);
                            });
                        }
                    } else if (!runQueryRes || !runQueryRes.ok) {
                        throw new Error(`Chapter relationship query failed (${legacyRes?.status || runQueryRes?.status || "no response"}).`);
                    }
                }
                if (!Array.isArray(rows)) {
                    throw new Error(`Chapter relationship query failed (${runQueryRes?.status || "no response"}).`);
                }
                return rows;
            })().then(
                result => [{ status: "fulfilled", value: result }],
                reason => [{ status: "rejected", reason }]
            );

        // Build pool map from options pool, embedded chapters, and fallback data
        const pool = Array.isArray(options.articlesPool) ? [...options.articlesPool] : [];
        const poolMap = new Map();
        pool.forEach(a => { if (a && a.id) poolMap.set(a.id, a); });
        chapterReferences.forEach(ch => {
            if (ch && typeof ch === "object" && ch.id && !poolMap.has(ch.id)) {
                poolMap.set(ch.id, ch);
            }
        });
        (Array.isArray(FALLBACK_BOOKS) ? FALLBACK_BOOKS : []).forEach(fb => {
            if (Array.isArray(fb.chapters)) {
                fb.chapters.forEach(ch => {
                    if (ch && ch.id && !poolMap.has(ch.id)) {
                        poolMap.set(ch.id, ch);
                        if (!pool.some(p => p.id === ch.id)) pool.push(ch);
                    }
                });
            }
        });
        (Array.isArray(FALLBACK_ARTICLES) ? FALLBACK_ARTICLES : []).forEach(fa => {
            if (fa && fa.id && !poolMap.has(fa.id)) poolMap.set(fa.id, fa);
        });

        // Merge related results when the book has no explicit list OR has corrupted embedded references.
        const queryResults = await relationshipQuery;
        if (chapterReferences.length === 0 || hasCorruptedReferences) {
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
                if (found && (isExcludedPublicRecord(found) || hasConflictingExplicitBook(found, bookDoc) || isJunkChapterRecord(found))) return;
                if (!found && typeof ch === "object" && ch && (isExcludedPublicRecord(ch) || hasConflictingExplicitBook(ch, bookDoc) || isJunkChapterRecord(ch))) return;
                const foundType = (found?.type || "").toUpperCase();
                const foundIsChapter = found?.isChapter === true || foundType === "CHAPTER" ||
                    normalizeBookKey(found?.category) === "chapter" ||
                    (found?.chapterIndex !== undefined && found?.chapterIndex !== null);
                const isInvalidBookReference = found &&
                    (foundType === "BOOK" || foundType === "FREE" || foundType === "PREMIUM" || found.isBook === true) &&
                    !foundIsChapter;
                const canonicalBookSlug = bookDoc.slug || bookDoc.bookSlug || "";
                const canonicalBookName = bookDoc.bookName || bookDoc.title || "";
                if (found && !isInvalidBookReference) {
                    seenIds.add(found.id);
                    chapters.push({
                        ...found,
                        bookId: found.bookId || bookDoc.id || "",
                        parentBookId: found.parentBookId || bookDoc.id || "",
                        ...(found.bookSlug || canonicalBookSlug ? { bookSlug: found.bookSlug || canonicalBookSlug } : {}),
                        ...(found.bookName || canonicalBookName ? { bookName: found.bookName || canonicalBookName } : {}),
                        order: typeof ch === "object" && ch.order !== undefined && ch.order !== null && !isNaN(ch.order)
                            ? Number(ch.order)
                            : (idx + 1),
                        status: found.status || (typeof ch === "object" && ch.status) || bookDoc.status || "published",
                        type: "CHAPTER",
                        isChapter: true
                    });
                } else if (!isInvalidBookReference && typeof ch === "object" && ch) {
                    if (String(ch.title || "").trim()) {
                        if (chId) seenIds.add(chId);
                        chapters.push({
                            ...ch,
                            id: chId || ch.id || `${bookDoc.id}-chapter-${idx + 1}`,
                            bookId: ch.bookId || bookDoc.id || "",
                            parentBookId: ch.parentBookId || bookDoc.id || "",
                            ...(ch.bookSlug || canonicalBookSlug ? { bookSlug: ch.bookSlug || canonicalBookSlug } : {}),
                            ...(ch.bookName || canonicalBookName ? { bookName: ch.bookName || canonicalBookName } : {}),
                            order: ch.order !== undefined && ch.order !== null && !isNaN(ch.order) ? Number(ch.order) : (idx + 1),
                            status: ch.status || bookDoc.status || "published",
                            type: "CHAPTER",
                            isChapter: true
                        });
                    }
                }
            });
        }

        // An embedded list is the book's canonical chapter order and membership, unless empty or corrupted
        if (chapterReferences.length === 0 || hasCorruptedReferences || chapters.length < chapterReferences.length) {
            const related = pool.filter(art => !isExcludedPublicRecord(art) && !isJunkChapterRecord(art) && isArticleInBook(art, bookDoc));
            related.forEach(art => {
                const artType = (art?.type || "").toUpperCase();
                if (art && art.id && !seenIds.has(art.id) && artType !== "BOOK" && art.isBook !== true) {
                    seenIds.add(art.id);
                    chapters.push(art);
                }
            });
        }

        // If real chapters are present, filter out duplicate synthetic stubs
        const realNonStubCount = chapters.filter(c => !/^(?:khilaafath-ch[1-9]|abbasiyya-genesis|golden-age-baghdad|baytul-hikmah|umaviyya-foundation|damascus-era|woman-king|rashida-abubakr|rashida-umar)$/i.test(c.id)).length;
        if (realNonStubCount >= 3) {
            chapters = chapters.filter(c => !/^(?:abbasiyya-genesis|golden-age-baghdad|baytul-hikmah|umaviyya-foundation|damascus-era|woman-king)$/i.test(c.id));
        }

        // Deduplicate duplicate articles by normalized title preferring one with matching bookId and richer image
        const deduplicated = [];
        const seenTitles = new Map();
        const targetBookId = String(bookDoc.id || "").trim();
        for (const ch of chapters) {
            const normTitle = normalizeBookKey(ch.title);
            if (!normTitle) continue;
            if (seenTitles.has(normTitle)) {
                const existing = seenTitles.get(normTitle);
                const existingScore = (existing.bookId === targetBookId ? 20 : 0) + (getArticleImageUrl(existing, "") ? 10 : 0) + (existing.content?.length || 0);
                const chScore = (ch.bookId === targetBookId ? 20 : 0) + (getArticleImageUrl(ch, "") ? 10 : 0) + (ch.content?.length || 0);
                if (chScore > existingScore) {
                    const idx = deduplicated.indexOf(existing);
                    if (idx >= 0) deduplicated[idx] = ch;
                    seenTitles.set(normTitle, ch);
                }
            } else {
                seenTitles.set(normTitle, ch);
                deduplicated.push(ch);
            }
        }
        chapters = deduplicated;

        // Sort strictly by order / priority, with Introduction ("ആമുഖം") naturally leading at index 0
        chapters.sort((first, second) => {
            const isIntroFirst = normalizeBookKey(first.title) === normalizeBookKey("ആമുഖം");
            const isIntroSecond = normalizeBookKey(second.title) === normalizeBookKey("ആമുഖം");
            if (isIntroFirst && !isIntroSecond) return -1;
            if (!isIntroFirst && isIntroSecond) return 1;
            return compareChaptersOrder(first, second);
        });

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
    const parts = docItem.name ? docItem.name.split("/") : [];
    const id = parts.length > 0 ? parts[parts.length - 1] : fallbackId;
    const collectionName = parts.length >= 2 ? parts[parts.length - 2] : "";
    const data = { id };
    if (collectionName) data._imageCollection = collectionName;
    if (id) data._imageDocId = id;

    if (docItem.fields) {
        for (const [k, v] of Object.entries(docItem.fields)) {
            data[k] = decodeFirestoreRestValue(v);
        }
    }
    const resolvedImage = getArticleImageUrl(data, "");
    if (resolvedImage) {
        data._hasAnyImageField = true;
        data._hasDeferredImage = false;
    } else {
        const hasRawImageField = Boolean(
            data.imageUrl || data.coverUrl || data.coverImage || data.cover || data.coverPhoto ||
            data.featuredImage || data.image || data.photo || data.banner || data.media ||
            data.thumbnail || data.thumbnailUrl || data.thumbUrl || data.thumb || data.ogImage ||
            data.imageBase64 || data.coverBase64 || data.base64
        );
        if (hasRawImageField) {
            data._hasAnyImageField = true;
            data._hasDeferredImage = true;
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
