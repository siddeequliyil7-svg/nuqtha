import { collection, db, firebaseConfig, getDocsFromCache } from "../firebase-config.js";
import { extractImageCandidateStrings, getArticleImageUrl } from "../schema-validator.js";
import { filterPublicCollections } from "./public-status.js";
import { FALLBACK_ARTICLE_ITEMS, FALLBACK_BOOKS } from "../fallback-data.js";
import {
    LIST_CACHE_TTL_MS,
    PRIORITY_BACKGROUND,
    PRIORITY_NORMAL,
    PUBLIC_COLLECTIONS_CACHE_KEY,
    checkIsRateLimited,
    compactListItemForCache,
    dedupeInFlight,
    enqueueFirestoreTask,
    getResolvedImageUrlCache,
    indexArticleSlugs,
    markFirestoreRateLimited,
    queuedFirestoreFetch,
    readArticlesListCache,
    readTtlCache,
    saveResolvedImageUrlCache,
    writeTtlCache
} from "./firestore-cache.js";

const REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`;
const IMAGE_FIELDS = [
    "imageUrl", "coverUrl", "coverImage", "cover", "coverPhoto", "featuredImage",
    "image", "photo", "banner", "media", "thumbnail", "thumbnailUrl", "thumbUrl",
    "thumb", "ogImage", "imageBase64", "coverBase64", "base64"
];
const INLINE_IMAGE_LIST_LIMIT = 185 * 1024;
const BOOK_INLINE_IMAGE_LIST_LIMIT = 950 * 1024;
const MAX_ACTIVE_REQUESTS = 4;
const IMAGE_RETRY_DELAYS_MS = [300, 900, 1800];
const IMAGE_DB_NAME = "nuqtha-image-cache";
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = "images";
const MAX_RESOLVED_DOC_SOURCES = 200;
const activeObjectUrls = new Map();
const imageSourcePromises = new Map();
const resolvedDocSources = new Map();
const queue = [];
let activeRequests = 0;
let imageDatabasePromise;
let observer;
let mutationObserver;
let publicCollectionsPromise;
let publicCollectionsCache;

const listFields = [
    "title", "author", "authorName", "authorId", "authorPhoto",
    "category", "categoryId", "categorySlug", "status", "type", "isBook", "isChapter",
    "isPremium", "bookType", "price", "priority", "placement", "order", "date",
    "publishDate", "createdAt", "updatedAt", "slug", "bookSlug", "bookId",
    "parentBookId", "bookName", "bookTitle", "book", "playlistName", "chapterIndex", "volume", "issue",
    "excerpt", "storedExcerpt", "hasCustomExcerpt", "transcription",
    "visible", "description", "introduction", "intro", "summary", "pages", "color", "tags",
    "chapters", "articleIds", "titleColor", "contentColor",
    "readTime", "accessType", "leadTitle", "featuredTitle", "apkUrl", "fontSize",
    ...IMAGE_FIELDS
];

function decodeValue(value) {
    if (!value || typeof value !== "object") return value;
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("referenceValue" in value) return value.referenceValue;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
    if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
    return value;
}

function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function isBookListRecord(rawDoc, collectionName = "") {
    if (collectionName === "books") return true;
    if (!rawDoc || typeof rawDoc !== "object") return false;
    const type = String(rawDoc.type || "").trim().toLowerCase();
    const category = String(rawDoc.category || "").trim().toLowerCase();
    const isChapter = rawDoc.isChapter === true || type === "chapter" || category === "chapter" ||
        (rawDoc.chapterIndex !== undefined && rawDoc.chapterIndex !== null);
    if (isChapter) return false;
    return rawDoc.isBook === true || type === "book" || type === "free" || type === "premium" ||
        category === "book" || category === "books" || category === "premium book";
}

function inspectDocImageState(rawDoc, inlineLimit = INLINE_IMAGE_LIST_LIMIT) {
    if (!rawDoc || typeof rawDoc !== "object") return { hasAnyImage: false, hasDeferredImage: false };
    let hasAnyImage = false;
    let hasDeferredImage = false;
    for (const key of IMAGE_FIELDS) {
        const candidates = extractImageCandidateStrings(rawDoc[key]);
        for (const cand of candidates) {
            const strVal = String(cand || "").trim();
            if (!strVal || isStaticImageFallback(strVal)) continue;
            hasAnyImage = true;
            if (/^data:/i.test(strVal) && strVal.length > inlineLimit) {
                hasDeferredImage = true;
            }
            break;
        }
    }
    return { hasAnyImage, hasDeferredImage };
}

export function stripListHeavyFields(value, inlineLimit = INLINE_IMAGE_LIST_LIMIT) {
    if (Array.isArray(value)) return value.map(item => stripListHeavyFields(item, inlineLimit));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key, child]) => {
            if (key === "content" || key === "body") return false;
            if (!IMAGE_FIELDS.includes(key)) return true;
            if (typeof child === "object" && child !== null) {
                const candidates = extractImageCandidateStrings(child)
                    .map(s => String(s || "").trim())
                    .filter(s => s && !isStaticImageFallback(s));
                return candidates.some(s => (/^data:/i.test(s) ? s.length <= inlineLimit : s.length <= 4096));
            }
            if (typeof child !== "string") return false;
            const trimmed = child.trim();
            if (!trimmed || isStaticImageFallback(trimmed)) return false;
            if (/^data:/i.test(trimmed)) return trimmed.length <= inlineLimit;
            return trimmed.length <= 4096;
        })
        .map(([key, child]) => [key, stripListHeavyFields(child, inlineLimit)]));
}

function buildNormalizedListRecord(rawDoc, id, collectionName) {
    const inlineLimit = isBookListRecord(rawDoc, collectionName)
        ? BOOK_INLINE_IMAGE_LIST_LIMIT
        : INLINE_IMAGE_LIST_LIMIT;
    const preResolvedImage = getArticleImageUrl(rawDoc, "");
    if (preResolvedImage && id && collectionName) {
        rememberResolvedDocSource(`${collectionName}:${id}`, preResolvedImage);
        saveResolvedImageUrlCache(collectionName, id, preResolvedImage);
    }
    const imageState = inspectDocImageState(rawDoc, inlineLimit);
    const data = stripListHeavyFields(rawDoc, inlineLimit);
    const resolvedStatus = data.status ? String(data.status).trim().toLowerCase() : (data.visible === false ? "draft" : "published");
    return {
        ...data,
        status: resolvedStatus,
        id,
        _imageCollection: collectionName,
        _imageDocId: id,
        _hasAnyImageField: imageState.hasAnyImage,
        _hasDeferredImage: imageState.hasDeferredImage
    };
}

async function runStructuredListQuery(collectionName, { publishedOnly = true, signal, isTestRunner = false } = {}) {
    const documents = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
        const statusWhere = publishedOnly
            ? (isTestRunner
                ? {
                    fieldFilter: {
                        field: { fieldPath: "status" },
                        op: "EQUAL",
                        value: { stringValue: "published" }
                    }
                }
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
                })
            : null;
        const structuredQuery = {
            from: [{ collectionId: collectionName }],
            select: { fields: listFields.map(fieldPath => ({ fieldPath })) },
            ...(statusWhere ? { where: statusWhere } : {}),
            limit: pageSize,
            offset
        };
        const response = await queuedFirestoreFetch(
            `${REST_BASE}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ structuredQuery }),
                signal
            },
            {
                priority: PRIORITY_NORMAL,
                dedupeKey: offset === 0 && !isTestRunner ? `firestore:runQuery:${collectionName}:${publishedOnly ? "pub" : "all"}` : "",
                max429Retries: 0,
                max5xxRetries: isTestRunner ? 0 : 1,
                baseBackoffMs: 700,
                bypassRateLimit: isTestRunner
            }
        );
        if (response.status === 429) {
            markFirestoreRateLimited(30000, { scope: "normal" });
            const err = new Error(`Firestore list read rate-limited (429) for ${collectionName}.`);
            err.isRateLimited = true;
            err.status = 429;
            throw err;
        }
        if (!response.ok) throw new Error(`Firestore list read failed (${response.status}) for ${collectionName}.`);
        const results = await response.json();
        const pageDocuments = (results || []).map(result => result.document).filter(Boolean);

        for (const document of pageDocuments) {
            const id = document.name.split("/").pop();
            const rawDoc = decodeFields(document.fields || {});
            documents.push(buildNormalizedListRecord(rawDoc, id, collectionName));
        }
        offset += pageDocuments.length;
        if (pageDocuments.length < pageSize) break;
    }

    return documents;
}

function isRateLimitError(error) {
    if (!error) return false;
    if (error.isRateLimited === true || error.status === 429 || error.code === 429) return true;
    const message = String(error.message || error);
    return /\b429\b|rate[- ]?limit|cooldown/i.test(message);
}

const SYNTHETIC_FALLBACK_ARTICLE_IDS = new Set([
    "history-article-2",
    "islamic-scholar-1", "islamic-scholar-2", "islamic-scholar-3", "islamic-scholar-4",
    "kerala-scholar-1", "kerala-scholar-2", "kerala-scholar-3", "kerala-scholar-4",
    "story-baghdad-wisdom", "story-cordoba-lantern", "story-compassion-medina",
    "history-andalus-libraries", "history-hudaybiyyah-diplomacy",
    "study-quran-reflection", "study-fiqh-methodology"
]);

function tagFallbackItems(items) {
    return (Array.isArray(items) ? items : []).map(item => (
        item && typeof item === "object" ? { ...item, _isFallback: true } : item
    ));
}

function isSyntheticFallbackArticleCollection(items) {
    if (!Array.isArray(items) || items.length === 0) return false;
    if (items.every(item => item?._isFallback === true)) return true;
    let syntheticMatches = 0;
    for (const item of items) {
        if (SYNTHETIC_FALLBACK_ARTICLE_IDS.has(String(item?.id || "").trim())) {
            syntheticMatches += 1;
        }
    }
    return syntheticMatches >= 4;
}

function isFallbackBookCollection(items) {
    if (!Array.isArray(items) || items.length === 0) return false;
    return items.every(item => item?._isFallback === true);
}

function readLocalCollectionFallback(collectionName) {
    const stale = readTtlCache(PUBLIC_COLLECTIONS_CACHE_KEY, LIST_CACHE_TTL_MS, {
        allowExpired: true,
        validate: val => val && ((Array.isArray(val.articles) && val.articles.length > 0) || (Array.isArray(val.books) && val.books.length > 0))
    })?.data;
    const cachedPool = readArticlesListCache({ allowExpired: true })?.data || [];

    if (collectionName === "articles") {
        if (Array.isArray(stale?.articles) && stale.articles.length > 0 && !isSyntheticFallbackArticleCollection(stale.articles)) {
            const filtered = filterPublicCollections(stale.articles, []).articles;
            if (filtered.length > 0) return filtered;
        }
        if (cachedPool.length > 0 && !isSyntheticFallbackArticleCollection(cachedPool)) {
            const cachedArticles = filterPublicCollections(cachedPool.filter(item => !isCachedBookCandidate(item)), []).articles;
            if (cachedArticles.length > 0) return cachedArticles;
        }
        return tagFallbackItems(FALLBACK_ARTICLE_ITEMS);
    }

    if (collectionName === "books") {
        if (Array.isArray(stale?.books) && stale.books.length > 0 && !isFallbackBookCollection(stale.books)) {
            const filteredBooks = filterPublicCollections([], stale.books).books;
            if (filteredBooks.length > 0) return filteredBooks;
        }
        if (cachedPool.length > 0) {
            const cachedBooks = filterPublicCollections([], cachedPool.filter(isCachedBookCandidate)).books;
            if (cachedBooks.length > 0 && !isFallbackBookCollection(cachedBooks)) return cachedBooks;
        }
        return tagFallbackItems(FALLBACK_BOOKS);
    }

    return [];
}

async function fetchCollection(collectionName, signal) {
    const isTestRunner = typeof window !== "undefined" && Boolean(window.mocha);
    if (!isTestRunner && checkIsRateLimited({ scope: "normal" })) {
        const err = new Error(`Firestore list read skipped during 429 cooldown for ${collectionName}.`);
        err.isRateLimited = true;
        err.status = 429;
        throw err;
    }

    const publishedDocs = await runStructuredListQuery(collectionName, {
        publishedOnly: true,
        signal,
        isTestRunner
    });

    if (isTestRunner) {
        return publishedDocs;
    }

    // Legacy Firestore docs created before explicit status fields may lack status == "published".
    // When few or zero docs are returned (common with legacy articles/books), recover unfiltered records
    // and let filterPublicCollections safely exclude explicit drafts/reviews/hidden entries.
    if ((publishedDocs.length === 0 || (collectionName === "books" && publishedDocs.length < 3)) &&
        !checkIsRateLimited({ scope: "normal" })) {
        try {
            const legacyDocs = await runStructuredListQuery(collectionName, {
                publishedOnly: false,
                signal,
                isTestRunner: false
            });
            const mergedById = new Map(publishedDocs.map(doc => [doc.id, doc]));
            legacyDocs.forEach(doc => {
                if (doc?.id && !mergedById.has(doc.id)) {
                    mergedById.set(doc.id, doc);
                }
            });
            return Array.from(mergedById.values());
        } catch (legacyErr) {
            if (publishedDocs.length > 0) return publishedDocs;
            throw legacyErr;
        }
    }

    return publishedDocs;
}

async function fetchCollectionWithCache(collectionName, signal) {
    const isTestRunner = typeof window !== "undefined" && Boolean(window.mocha);
    const load = async () => {
        try {
            return await fetchCollection(collectionName, signal);
        } catch (error) {
            const rateLimited = isRateLimitError(error) || checkIsRateLimited({ scope: "normal" });
            if (!rateLimited) {
                console.warn(`[NUQTHA Data] ${collectionName} list read failed; checking the local cache.`, error);
            }
            try {
                const snapshot = await getDocsFromCache(collection(db, collectionName));
                if (snapshot && snapshot.docs && snapshot.docs.length > 0) {
                    return snapshot.docs.map(document => buildNormalizedListRecord(document.data(), document.id, collectionName));
                }
            } catch (cacheError) {
                if (!rateLimited) {
                    console.warn(`[NUQTHA Data] ${collectionName} is unavailable in the local cache.`, cacheError);
                }
            }
            if (rateLimited && !isTestRunner) {
                const fallback = readLocalCollectionFallback(collectionName);
                if (fallback.length > 0) {
                    return fallback;
                }
            }
            throw error;
        }
    };
    return isTestRunner ? load() : dedupeInFlight(`firestore:collection:${collectionName}`, load);
}

function isCachedBookCandidate(item) {
    if (!item || typeof item !== "object") return false;
    const type = String(item.type || "").trim().toUpperCase();
    const category = String(item.category || "").trim().toLowerCase();
    if (item.isChapter === true || type === "CHAPTER" || category === "chapter") return false;
    return type === "BOOK" || item.isBook === true || category === "books" || category === "book" || category === "premium book";
}

function persistPublicCollectionsCache(payload) {
    if (!payload) return false;
    const wroteFull = writeTtlCache(PUBLIC_COLLECTIONS_CACHE_KEY, payload, { maxBytes: 900 * 1024 });
    if (wroteFull) return true;
    const compacted = {
        ...payload,
        articles: (payload.articles || []).map(item => compactListItemForCache(item)),
        books: (payload.books || []).map(item => compactListItemForCache(item))
    };
    if (writeTtlCache(PUBLIC_COLLECTIONS_CACHE_KEY, compacted, { maxBytes: 900 * 1024 })) {
        return true;
    }
    const metadataOnly = {
        ...payload,
        articles: (payload.articles || []).map(item => compactListItemForCache(item, 2048)),
        books: (payload.books || []).map(item => compactListItemForCache(item, 2048))
    };
    return writeTtlCache(PUBLIC_COLLECTIONS_CACHE_KEY, metadataOnly, { maxBytes: 900 * 1024 });
}

export async function fetchPublicCollections(options = {}) {
    const forceRefresh = Boolean(options?.forceRefresh);
    const isTestRunner = typeof window !== "undefined" && Boolean(window.mocha);
    if (!forceRefresh && publicCollectionsCache &&
        ((publicCollectionsCache.articles?.length > 0 && publicCollectionsCache.books?.length > 0 &&
          publicCollectionsCache.articlesLive !== false && publicCollectionsCache.booksLive !== false &&
          !isSyntheticFallbackArticleCollection(publicCollectionsCache.articles)) ||
            checkIsRateLimited({ scope: "normal" }))) {
        return publicCollectionsCache;
    }
    if (!forceRefresh && !isTestRunner) {
        const isLimited = checkIsRateLimited({ scope: "normal" });
        const persisted = readTtlCache(PUBLIC_COLLECTIONS_CACHE_KEY, LIST_CACHE_TTL_MS, {
            validate: val => {
                if (!val) return false;
                const hasArticles = Array.isArray(val.articles) && val.articles.length > 0;
                const hasBooks = Array.isArray(val.books) && val.books.length > 0;
                if (isLimited) return hasArticles || hasBooks;
                return hasArticles && hasBooks && val.articlesLive !== false && val.booksLive !== false &&
                    !isSyntheticFallbackArticleCollection(val.articles);
            }
        });
        if (persisted?.data) {
            const filteredCached = filterPublicCollections(persisted.data.articles, persisted.data.books);
            publicCollectionsCache = {
                ...persisted.data,
                articles: filteredCached.articles,
                books: filteredCached.books
            };
            return publicCollectionsCache;
        }
    }
    if (!forceRefresh && publicCollectionsPromise) return publicCollectionsPromise;

    const dedupeKey = forceRefresh ? "firestore:publicCollections:force" : "firestore:publicCollections";
    const run = dedupeInFlight(dedupeKey, async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const [articlesResult, booksResult] = await Promise.allSettled([
                fetchCollectionWithCache("articles", controller.signal),
                fetchCollectionWithCache("books", controller.signal)
            ]);

            let articles = articlesResult.status === "fulfilled" ? articlesResult.value : [];
            let books = booksResult.status === "fulfilled" ? booksResult.value : [];
            const articlesLiveSuccess = articlesResult.status === "fulfilled" && articles.length > 0 && !isSyntheticFallbackArticleCollection(articles);
            const booksLiveSuccess = booksResult.status === "fulfilled" && books.length > 0 && !isFallbackBookCollection(books);

            if (articlesResult.status === "rejected" && !isRateLimitError(articlesResult.reason) && !checkIsRateLimited({ scope: "normal" })) {
                console.warn("[NUQTHA Data] Articles are unavailable; continuing with the remaining public data.", articlesResult.reason);
            }
            if (booksResult.status === "rejected" && !isRateLimitError(booksResult.reason) && !checkIsRateLimited({ scope: "normal" })) {
                console.warn("[NUQTHA Data] Books are unavailable; continuing with the remaining public data.", booksResult.reason);
            }

            if (!isTestRunner && (!articlesLiveSuccess || !booksLiveSuccess)) {
                if (!articlesLiveSuccess && articles.length === 0) {
                    articles = readLocalCollectionFallback("articles");
                }
                if (!booksLiveSuccess && books.length === 0) {
                    books = readLocalCollectionFallback("books");
                }
            }
            let articlesFromFallback = false;
            let booksFromFallback = false;
            if (!isTestRunner) {
                if (articles.length === 0) {
                    articles = tagFallbackItems(FALLBACK_ARTICLE_ITEMS);
                    articlesFromFallback = true;
                } else if (isSyntheticFallbackArticleCollection(articles)) {
                    articles = tagFallbackItems(articles);
                    articlesFromFallback = true;
                }
                if (books.length === 0) {
                    books = tagFallbackItems(FALLBACK_BOOKS);
                    booksFromFallback = true;
                } else if (isFallbackBookCollection(books)) {
                    books = tagFallbackItems(books);
                    booksFromFallback = true;
                }
            }

            const hasPersistableArticles = articles.length > 0 && !articlesFromFallback && !isSyntheticFallbackArticleCollection(articles);
            const hasPersistableBooks = books.length > 0 && !booksFromFallback && !isFallbackBookCollection(books);
            const hasPersistableContent = hasPersistableArticles || hasPersistableBooks;

            const filteredCollections = filterPublicCollections(articles, books);
            const payload = {
                ...filteredCollections,
                hasFirestoreContent: articles.length > 0 || books.length > 0,
                articlesLive: articlesLiveSuccess,
                booksLive: booksLiveSuccess,
                articlesFromFallback,
                booksFromFallback
            };
            if (payload.hasFirestoreContent) {
                publicCollectionsCache = payload;
                if (!isTestRunner) {
                    if (hasPersistableContent) {
                        persistPublicCollectionsCache({
                            ...payload,
                            articles: hasPersistableArticles ? payload.articles : [],
                            books: hasPersistableBooks ? payload.books : []
                        });
                    }
                    indexArticleSlugs([...payload.articles, ...payload.books]);
                }
            }
            return payload;
        } finally {
            clearTimeout(timeout);
        }
    });

    if (!forceRefresh) {
        publicCollectionsPromise = run.finally(() => {
            if (publicCollectionsPromise === run) publicCollectionsPromise = null;
        });
        return publicCollectionsPromise;
    }
    return run;
}

export async function fetchArticleSearchContent() {
    if (checkIsRateLimited({ scope: "background" })) {
        return new Map();
    }
    return dedupeInFlight("articleSearchContent", async () => {
        const results = new Map();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        let offset = 0;
        const pageSize = 1000;

        try {
            while (true) {
                const response = await enqueueFirestoreTask(
                    () => fetch(`${REST_BASE}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            structuredQuery: {
                                from: [{ collectionId: "articles" }],
                                select: { fields: ["content", "body"].map(fieldPath => ({ fieldPath })) },
                                where: {
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
                                },
                                limit: pageSize,
                                offset
                            }
                        }),
                        signal: controller.signal
                    }),
                    { priority: PRIORITY_BACKGROUND, signal: controller.signal }
                );
                if (response.status === 429) {
                    markFirestoreRateLimited(30000, { scope: "background" });
                    break;
                }
                if (!response.ok) throw new Error(`Firestore article search read failed (${response.status}).`);
                const pageDocuments = (await response.json() || []).map(result => result.document).filter(Boolean);
                for (const document of pageDocuments) {
                    const id = document.name.split("/").pop();
                    const fields = decodeFields(document.fields || {});
                    results.set(id, fields.content || fields.body || "");
                }
                offset += pageDocuments.length;
                if (pageDocuments.length < pageSize) break;
            }

            return results;
        } finally {
            clearTimeout(timeout);
        }
    });
}

function openImageDatabase() {
    if (imageDatabasePromise) return imageDatabasePromise;
    imageDatabasePromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("IndexedDB is unavailable."));
            return;
        }
        const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) {
                database.createObjectStore(IMAGE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open the image cache."));
    });
    return imageDatabasePromise;
}

async function readCachedBlob(key) {
    const database = await openImageDatabase();
    return new Promise((resolve, reject) => {
        const request = database.transaction(IMAGE_STORE_NAME, "readonly")
            .objectStore(IMAGE_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Could not read the image cache."));
    });
}

async function cacheBlob(key, blob) {
    const database = await openImageDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(IMAGE_STORE_NAME, "readwrite");
        transaction.objectStore(IMAGE_STORE_NAME).put(blob, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not write the image cache."));
        transaction.onabort = () => reject(transaction.error || new Error("Image cache write was aborted."));
    });
}

async function getObjectUrl(key, dataUrl) {
    const existing = activeObjectUrls.get(key);
    if (existing) return existing;

    let blob = null;
    try {
        const cached = await readCachedBlob(key);
        if (cached && cached.size > 0 && (!cached.type || /^image\//i.test(cached.type))) {
            blob = cached;
        }
    } catch (error) {
        console.warn("[NUQTHA Images] Could not read the IndexedDB image cache.", error);
    }
    if (!blob) {
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error("Could not decode the image data.");
        blob = await response.blob();
        if (!blob || blob.size === 0) throw new Error("Decoded image blob is empty.");
        try {
            await cacheBlob(key, blob);
        } catch (error) {
            console.warn("[NUQTHA Images] Could not persist an image in IndexedDB.", error);
        }
    }

    try {
        const url = URL.createObjectURL(blob);
        activeObjectUrls.set(key, url);
        return url;
    } catch (_) {
        return dataUrl;
    }
}

function rememberResolvedDocSource(cacheKey, source) {
    if (!cacheKey || !source) return;
    if (resolvedDocSources.size >= MAX_RESOLVED_DOC_SOURCES) {
        const oldestKey = resolvedDocSources.keys().next().value;
        if (oldestKey !== undefined) resolvedDocSources.delete(oldestKey);
    }
    resolvedDocSources.set(cacheKey, source);
}

function fetchImageFromDocument(collectionName, documentId) {
    if (!collectionName || !documentId) return "";
    const cacheKey = `${collectionName}:${documentId}`;
    if (resolvedDocSources.has(cacheKey)) {
        return Promise.resolve(resolvedDocSources.get(cacheKey));
    }
    const persistedImage = getResolvedImageUrlCache(collectionName, documentId);
    if (persistedImage) {
        rememberResolvedDocSource(cacheKey, persistedImage);
        return Promise.resolve(persistedImage);
    }
    if (imageSourcePromises.has(cacheKey)) return imageSourcePromises.get(cacheKey);

    if (checkIsRateLimited({ scope: "background" })) {
        const err = new Error("Firestore image read skipped during 429 cooldown.");
        err.isRateLimited = true;
        return Promise.reject(err);
    }

    const imageRequest = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const mask = IMAGE_FIELDS.map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
            const url = `${REST_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}&${mask}`;
            const response = await enqueueFirestoreTask(
                () => fetch(url, { signal: controller.signal }),
                { priority: PRIORITY_BACKGROUND, signal: controller.signal }
            );
            if (response.status === 429) {
                markFirestoreRateLimited(30000, { scope: "background" });
                const err = new Error("Firestore image read rate-limited (429).");
                err.isRateLimited = true;
                throw err;
            }
            if (!response.ok) throw new Error(`Firestore image read failed (${response.status}).`);
            const document = await response.json();
            const resolved = getArticleImageUrl(decodeFields(document.fields || {}), "");
            if (resolved) {
                rememberResolvedDocSource(cacheKey, resolved);
                saveResolvedImageUrlCache(collectionName, documentId, resolved);
            }
            return resolved;
        } finally {
            clearTimeout(timeout);
        }
    })();

    imageSourcePromises.set(cacheKey, imageRequest);
    imageRequest.then(
        () => {
            if (imageSourcePromises.get(cacheKey) === imageRequest) imageSourcePromises.delete(cacheKey);
        },
        () => {
            if (imageSourcePromises.get(cacheKey) === imageRequest) imageSourcePromises.delete(cacheKey);
        }
    );
    return imageRequest;
}

function getFallbackDocumentRefs(image) {
    const refs = [];
    const seen = new Set();
    const primary = `${image?.dataset?.nuqthaImageCollection || ""}:${image?.dataset?.nuqthaImageDoc || ""}`;
    if (primary !== ":") seen.add(primary);

    const pushRef = (col, docId) => {
        if (!col || !docId) return;
        const key = `${col}:${docId}`;
        if (seen.has(key)) return;
        seen.add(key);
        refs.push({ collectionName: col, documentId: docId });
    };

    pushRef(image?.dataset?.nuqthaImageFallbackCollection, image?.dataset?.nuqthaImageFallbackDoc);
    const list = String(image?.dataset?.nuqthaImageFallbacks || "").split(",");
    for (const pair of list) {
        const idx = pair.indexOf(":");
        if (idx > 0) pushRef(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return refs;
}

async function fetchImageField(image) {
    const fallbackRefs = getFallbackDocumentRefs(image);
    let lastError = null;

    if (checkIsRateLimited({ scope: "background" })) {
        const primaryKey = `${image?.dataset?.nuqthaImageCollection}:${image?.dataset?.nuqthaImageDoc}`;
        const cachedPrimary = resolvedDocSources.get(primaryKey) || getResolvedImageUrlCache(image?.dataset?.nuqthaImageCollection, image?.dataset?.nuqthaImageDoc);
        if (cachedPrimary) return cachedPrimary;

        for (const ref of fallbackRefs) {
            const fallbackKey = `${ref.collectionName}:${ref.documentId}`;
            const cachedFallback = resolvedDocSources.get(fallbackKey) || getResolvedImageUrlCache(ref.collectionName, ref.documentId);
            if (cachedFallback) return cachedFallback;
        }

        const err = new Error("Firestore image read skipped during 429 cooldown.");
        err.isRateLimited = true;
        err.status = 429;
        throw err;
    }

    try {
        const source = await fetchImageFromDocument(
            image.dataset.nuqthaImageCollection,
            image.dataset.nuqthaImageDoc
        );
        if (source) return source;
    } catch (error) {
        lastError = error;
        if (error?.isRateLimited || checkIsRateLimited({ scope: "background" })) {
            for (const ref of fallbackRefs) {
                const fallbackKey = `${ref.collectionName}:${ref.documentId}`;
                const cached = resolvedDocSources.get(fallbackKey) || getResolvedImageUrlCache(ref.collectionName, ref.documentId);
                if (cached) return cached;
            }
            throw error;
        }
        if (!fallbackRefs.length) throw error;
        console.warn("[NUQTHA Images] Primary cover source failed; trying its fallback document.", error);
    }

    for (const ref of fallbackRefs) {
        if (checkIsRateLimited({ scope: "background" })) {
            const fallbackKey = `${ref.collectionName}:${ref.documentId}`;
            const cached = resolvedDocSources.get(fallbackKey) || getResolvedImageUrlCache(ref.collectionName, ref.documentId);
            if (cached) return cached;
            break;
        }
        try {
            const fallbackSource = await fetchImageFromDocument(ref.collectionName, ref.documentId);
            if (fallbackSource) return fallbackSource;
        } catch (error) {
            lastError = error;
            if (error?.isRateLimited || checkIsRateLimited({ scope: "background" })) {
                break;
            }
        }
    }

    if (lastError) throw lastError;
    return "";
}

function showImagePlaceholder(image) {
    const placeholder = image.parentElement?.querySelector("[data-nuqtha-image-placeholder]");
    if (!placeholder) return;
    placeholder.hidden = false;
    placeholder.style.removeProperty("display");
    placeholder.classList.remove("hidden");
}

function hideImagePlaceholder(image) {
    const placeholder = image.parentElement?.querySelector("[data-nuqtha-image-placeholder]");
    if (!placeholder) return;
    placeholder.hidden = true;
    placeholder.style.display = "none";
    placeholder.classList.add("hidden");
}

function isStaticImageFallback(source) {
    return /(?:^|\/)(?:cover|article)-placeholder\.svg(?:[?#].*)?$/i.test(String(source || "").trim());
}

function isBookImageElement(image) {
    const entity = String(image?.dataset?.nuqthaEntity || "").trim().toLowerCase();
    if (entity === "book") return true;
    if (entity === "article") return false;
    return image?.dataset?.nuqthaImageCollection === "books";
}

function rememberImageSource(image, source) {
    if (!source || /^blob:/i.test(source) || isStaticImageFallback(source)) return;
    image.dataset.nuqthaImageSource = source;
}

function getKnownImageSource(image) {
    const source = image.dataset.nuqthaImageSource || image.getAttribute("src") || "";
    return /^blob:/i.test(source) || isStaticImageFallback(source) ? "" : source;
}

function scheduleImageRetry(image, retry) {
    const attempt = Number.parseInt(image.dataset.nuqthaImageRetryCount || "0", 10) || 0;
    if (attempt >= IMAGE_RETRY_DELAYS_MS.length) {
        image.dataset.nuqthaImageRetryExhausted = "true";
        return false;
    }

    image.dataset.nuqthaImageRetryCount = String(attempt + 1);
    window.setTimeout(() => {
        if (image.isConnected) retry();
    }, IMAGE_RETRY_DELAYS_MS[attempt]);
    return true;
}

function retryKnownImage(image, source) {
    return scheduleImageRetry(image, () => {
        image.removeAttribute("src");
        revealImage(image, source);
    });
}

function retryDeferredImage(image) {
    return scheduleImageRetry(image, () => {
        image.dataset.nuqthaImageQueued = "false";
        enqueueImage(image);
    });
}

function useStaticImageFallback(image) {
    if (!image?.isConnected || image.dataset.nuqthaStaticFallbackAttempted === "true") return;
    image.dataset.nuqthaStaticFallbackAttempted = "true";
    if (image.dataset.nuqthaHideOnFail === "true") {
        image.closest("#art-image-wrapper")?.classList.add("hidden");
        image.style.opacity = "0";
        image.hidden = true;
        return;
    }
    const isBook = isBookImageElement(image);
    const hasInlinePlaceholder = Boolean(image.parentElement?.querySelector("[data-nuqtha-image-placeholder]"));
    if (hasInlinePlaceholder && !isBook) {
        showImagePlaceholder(image);
        image.style.opacity = "0";
        image.hidden = true;
        return;
    }
    revealImage(image, isBook ? "/cover-placeholder.svg" : "/article-placeholder.svg");
}

function handleImageError(image) {
    if (!image?.isConnected || image.dataset.nuqthaStaticFallbackAttempted === "true") return;
    const hasInlinePlaceholder = Boolean(image.parentElement?.querySelector("[data-nuqtha-image-placeholder]"));
    showImagePlaceholder(image);
    const source = getKnownImageSource(image);
    const fallbackRefs = getFallbackDocumentRefs(image);
    if (image.dataset.nuqthaImageFallbackAttempted !== "true" && fallbackRefs.length > 0) {
        if (checkIsRateLimited({ scope: "background" })) {
            useStaticImageFallback(image);
            return;
        }
        image.dataset.nuqthaImageFallbackAttempted = "true";
        (async () => {
            for (const ref of fallbackRefs) {
                if (checkIsRateLimited({ scope: "background" })) {
                    useStaticImageFallback(image);
                    return;
                }
                try {
                    const fallbackSource = await fetchImageFromDocument(ref.collectionName, ref.documentId);
                    if (fallbackSource && image.isConnected) {
                        revealImage(image, fallbackSource);
                        return;
                    }
                } catch (error) {
                    if (error?.isRateLimited || checkIsRateLimited({ scope: "background" })) {
                        useStaticImageFallback(image);
                        return;
                    }
                    console.warn("[NUQTHA Images] Could not load the fallback image.", error);
                }
            }
            if (source) {
                if (!retryKnownImage(image, source)) {
                    if (image.dataset.nuqthaHideOnFail === "true") {
                        image.closest("#art-image-wrapper")?.classList.add("hidden");
                        image.hidden = true;
                    } else if (hasInlinePlaceholder) {
                        image.style.opacity = "0";
                        image.hidden = true;
                    }
                }
            } else if (!retryDeferredImage(image)) {
                if (!checkIsRateLimited({ scope: "background" })) {
                    console.warn("[NUQTHA Images] Could not resolve a cover URL after retries.");
                }
                if (image.dataset.nuqthaHideOnFail === "true") {
                    image.closest("#art-image-wrapper")?.classList.add("hidden");
                    image.hidden = true;
                } else if (hasInlinePlaceholder) {
                    image.style.opacity = "0";
                    image.hidden = true;
                }
            }
        })();
        return;
    }

    if (source) {
        if (!retryKnownImage(image, source)) {
            if (image.dataset.nuqthaHideOnFail === "true") {
                image.closest("#art-image-wrapper")?.classList.add("hidden");
                image.hidden = true;
            } else if (hasInlinePlaceholder) {
                image.style.opacity = "0";
                image.hidden = true;
            }
        }
        return;
    }
    if (image.dataset.nuqthaImageCollection && image.dataset.nuqthaImageDoc) {
        if (!retryDeferredImage(image)) {
            if (!checkIsRateLimited({ scope: "background" })) {
                console.warn("[NUQTHA Images] Could not resolve a cover URL after retries.");
            }
            if (image.dataset.nuqthaHideOnFail === "true") {
                image.closest("#art-image-wrapper")?.classList.add("hidden");
                image.hidden = true;
            } else if (hasInlinePlaceholder) {
                image.style.opacity = "0";
                image.hidden = true;
            }
        }
        return;
    }
    useStaticImageFallback(image);
}

function revealImage(image, source) {
    image.hidden = false;
    image.addEventListener("load", () => {
        image.dataset.nuqthaImageRetryCount = "0";
        delete image.dataset.nuqthaImageRetryExhausted;
        image.hidden = false;
        image.classList.add("nuqtha-image-loaded");
        image.style.opacity = "1";
        hideImagePlaceholder(image);
    }, { once: true });
    image.addEventListener("error", () => handleImageError(image), { once: true });
    rememberImageSource(image, source);
    image.src = source;
}

function enqueueImage(image) {
    if (!image?.isConnected || image.dataset.nuqthaImageQueued === "true") return;
    image.dataset.nuqthaImageQueued = "true";
    image.loading = "eager";
    observer?.unobserve(image);
    queue.push(image);
    processNext();
}

function isNearViewport(image) {
    const rect = image.getBoundingClientRect();
    const margin = 300;
    return rect.width > 0 && rect.height > 0 &&
        rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
}

function processNext() {
    if (checkIsRateLimited({ scope: "background" })) {
        while (queue.length) {
            const image = queue.shift();
            if (!image?.isConnected) continue;
            const primaryKey = `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}`;
            let cachedSource = resolvedDocSources.get(primaryKey) || getResolvedImageUrlCache(image.dataset.nuqthaImageCollection, image.dataset.nuqthaImageDoc);
            if (!cachedSource) {
                const fallbackRefs = getFallbackDocumentRefs(image);
                for (const ref of fallbackRefs) {
                    const fallbackKey = `${ref.collectionName}:${ref.documentId}`;
                    const cached = resolvedDocSources.get(fallbackKey) || getResolvedImageUrlCache(ref.collectionName, ref.documentId);
                    if (cached) {
                        cachedSource = cached;
                        break;
                    }
                }
            }
            if (cachedSource) {
                rememberImageSource(image, cachedSource);
                (async () => {
                    let resolvedSource = cachedSource;
                    if (/^data:image\//i.test(cachedSource)) {
                        const key = `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`;
                        resolvedSource = await getObjectUrl(key, cachedSource);
                    }
                    if (image.isConnected) revealImage(image, resolvedSource);
                })();
            } else {
                showImagePlaceholder(image);
                useStaticImageFallback(image);
            }
        }
        return;
    }

    while (activeRequests < MAX_ACTIVE_REQUESTS && queue.length) {
        const image = queue.shift();
        if (!image?.isConnected) continue;
        activeRequests += 1;
        (async () => {
            try {
                const source = await fetchImageField(image);
                if (!source || !image.isConnected) {
                    if (image.isConnected) {
                        showImagePlaceholder(image);
                        useStaticImageFallback(image);
                    }
                    return;
                }
                rememberImageSource(image, source);
                let resolvedSource = source;
                if (/^data:image\//i.test(source)) {
                    const key = `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`;
                    resolvedSource = await getObjectUrl(key, source);
                }
                if (image.isConnected) revealImage(image, resolvedSource);
            } catch (error) {
                if (image.isConnected) {
                    showImagePlaceholder(image);
                    if (error?.isRateLimited || checkIsRateLimited({ scope: "background" })) {
                        useStaticImageFallback(image);
                    } else if (!retryDeferredImage(image)) {
                        console.warn("[NUQTHA Images] Could not load a card image after retries.", error);
                    }
                }
            } finally {
                activeRequests -= 1;
                processNext();
            }
        })();
    }
}

function getImmediateCachedSourceForImage(image) {
    const col = image?.dataset?.nuqthaImageCollection;
    const docId = image?.dataset?.nuqthaImageDoc;
    if (col && docId) {
        const primaryKey = `${col}:${docId}`;
        const direct = resolvedDocSources.get(primaryKey) || getResolvedImageUrlCache(col, docId);
        if (direct) return direct;
    }
    const fallbackRefs = getFallbackDocumentRefs(image);
    for (const ref of fallbackRefs) {
        const key = `${ref.collectionName}:${ref.documentId}`;
        const cached = resolvedDocSources.get(key) || getResolvedImageUrlCache(ref.collectionName, ref.documentId);
        if (cached) return cached;
    }
    return "";
}

function observeImage(image) {
    const source = image.getAttribute("src") || "";
    const hasDeferredSource = Boolean(
        image.dataset.nuqthaImageCollection && image.dataset.nuqthaImageDoc
    );
    if (!source && !hasDeferredSource) return;
    if (image.dataset.nuqthaImageObserved === "true" &&
        image.dataset.nuqthaImageObservedSource === source) return;
    if (source && image.dataset.nuqthaImageObservedSource &&
        !isStaticImageFallback(source)) {
        image.dataset.nuqthaImageRetryCount = "0";
        delete image.dataset.nuqthaImageRetryExhausted;
        delete image.dataset.nuqthaStaticFallbackAttempted;
        delete image.dataset.nuqthaImageFallbackAttempted;
    }
    image.dataset.nuqthaImageObserved = "true";
    image.dataset.nuqthaImageObservedSource = source;
    if (source) {
        rememberImageSource(image, source);
        const reveal = () => {
            if (image.getAttribute("src") !== source) return;
            image.dataset.nuqthaImageRetryCount = "0";
            delete image.dataset.nuqthaImageRetryExhausted;
            image.classList.add("nuqtha-image-loaded");
            image.style.opacity = "1";
            hideImagePlaceholder(image);
        };
        if (image.complete) {
            if (image.naturalWidth > 0) reveal();
            else handleImageError(image);
        }
        else {
            image.addEventListener("load", reveal, { once: true });
            image.addEventListener("error", () => {
                if (image.getAttribute("src") === source) handleImageError(image);
            }, { once: true });
        }
        return;
    }

    const immediateCached = getImmediateCachedSourceForImage(image);
    if (immediateCached) {
        rememberImageSource(image, immediateCached);
        if (/^data:image\//i.test(immediateCached)) {
            const key = `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`;
            getObjectUrl(key, immediateCached)
                .then(resolved => { if (image.isConnected) revealImage(image, resolved); })
                .catch(() => { if (image.isConnected) revealImage(image, immediateCached); });
        } else {
            revealImage(image, immediateCached);
        }
        return;
    }
    enqueueImage(image);
}

export function scanImages(node) {
    if (!(node instanceof Element)) return;
    if (node.matches("img[data-nuqtha-cover], img[data-nuqtha-image-doc]")) observeImage(node);
    node.querySelectorAll("img[data-nuqtha-cover], img[data-nuqtha-image-doc]").forEach(observeImage);
}

export function waitForContainerImages(container, maxWaitMs = 1500, limit = 8) {
    if (!container || maxWaitMs <= 0) return Promise.resolve();
    const candidates = Array.from(container.querySelectorAll("img"))
        .filter(img => {
            if (!img || img.hidden) return false;
            const hiddenAncestor = img.closest(".hidden");
            if (hiddenAncestor && hiddenAncestor !== container && container.contains(hiddenAncestor)) return false;
            const hasSrc = Boolean(img.getAttribute("src"));
            const hasDeferred = Boolean(img.dataset?.nuqthaImageDoc && img.dataset?.nuqthaImageCollection);
            if (!hasSrc && !hasDeferred) return false;
            return !(hasSrc && img.complete && img.naturalWidth > 0);
        })
        .slice(0, limit);
    if (candidates.length === 0) return Promise.resolve();
    return Promise.race([
        Promise.all(candidates.map(img => new Promise(resolve => {
            if (img.getAttribute("src") && img.complete) {
                resolve();
                return;
            }
            const done = () => {
                img.removeEventListener("load", done);
                img.removeEventListener("error", done);
                resolve();
            };
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
        }))),
        new Promise(resolve => setTimeout(resolve, maxWaitMs))
    ]);
}

export function installLazyFirestoreImages() {
    if (observer || typeof window === "undefined") return;
    if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                enqueueImage(entry.target);
            });
        }, { rootMargin: "300px" });
    } else {
        observer = {
            observe(image) {
                queue.push(image);
                processNext();
            },
            unobserve() {}
        };
    }

    const start = () => {
        scanImages(document.body);
        if ("MutationObserver" in window) {
            mutationObserver = new MutationObserver(records => {
                records.forEach(record => {
                    if (record.type === "childList") {
                        record.addedNodes.forEach(scanImages);
                    } else if (record.type === "attributes" &&
                        record.attributeName === "src" &&
                        record.target instanceof HTMLImageElement) {
                        observeImage(record.target);
                    }
                });
                if (activeRequests === 0 && queue.length === 0) {
                    const attachedKeys = new Set(Array.from(document.querySelectorAll("img[data-nuqtha-image-doc]"), image =>
                        `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`
                    ));
                    for (const [key, url] of activeObjectUrls) {
                        if (!attachedKeys.has(key)) {
                            URL.revokeObjectURL(url);
                            activeObjectUrls.delete(key);
                        }
                    }
                }
            });
            if (document.body) {
                mutationObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["src"]
                });
            }
        }
    };
    window.addEventListener("pageshow", () => {
        if (!document.body) return;
        document.body.querySelectorAll("img[data-nuqtha-cover], img[data-nuqtha-image-doc]").forEach(image => {
            const src = image.getAttribute("src") || "";
            if (!src || (image.complete && image.naturalWidth === 0) || /^blob:/i.test(src)) {
                if (/^blob:/i.test(src) && image.dataset.nuqthaImageSource) {
                    image.removeAttribute("src");
                }
                delete image.dataset.nuqthaImageObserved;
                delete image.dataset.nuqthaImageObservedSource;
                delete image.dataset.nuqthaImageQueued;
            }
        });
        scanImages(document.body);
    });
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
}

export function getDeferredImageAttributes(item) {
    if (!item?._imageCollection || !item?._imageDocId) return "";
    const hasInlineUrl = Boolean(getArticleImageUrl(item, ""));
    if (!item._hasDeferredImage && (hasInlineUrl || item._hasAnyImageField === false)) return "";
    const updatedAt = String(item.updatedAt || item.createdAt || "");
    const escape = value => String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    const fallbackAttributes = item._imageFallbackCollection && item._imageFallbackDocId
        ? `data-nuqtha-image-fallback-collection="${escape(item._imageFallbackCollection)}" data-nuqtha-image-fallback-doc="${escape(item._imageFallbackDocId)}"`
        : "";
    const fallbackListAttribute = Array.isArray(item._imageFallbacks) && item._imageFallbacks.length > 0
        ? ` data-nuqtha-image-fallbacks="${escape(item._imageFallbacks.join(","))}"`
        : "";
    return `data-nuqtha-image-doc="${escape(item._imageDocId)}" data-nuqtha-image-collection="${escape(item._imageCollection)}" data-nuqtha-image-updated="${escape(updatedAt)}" ${fallbackAttributes}${fallbackListAttribute}`;
}
