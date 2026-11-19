import { collection, db, firebaseConfig, getDocsFromCache } from "../firebase-config.js";
import { getArticleImageUrl } from "../schema-validator.js";
import { filterPublicCollections } from "./public-status.js";

const REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents`;
const IMAGE_FIELDS = ["imageUrl", "coverUrl", "coverImage", "image", "thumbnail", "thumbnailUrl", "ogImage"];
const MAX_ACTIVE_REQUESTS = 10;
const IMAGE_DB_NAME = "nuqtha-image-cache";
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE_NAME = "images";
const activeObjectUrls = new Map();
const imageSourcePromises = new Map();
const resolvedImageUrls = new Map();
const RESOLVED_URL_CACHE_PREFIX = "nuqtha:image-url:v1:";
const RESOLVED_URL_TTL = 30 * 60 * 1000;
const queue = [];
let activeRequests = 0;
let imageDatabasePromise;
let observer;
let mutationObserver;
let publicCollectionsPromise;
let publicCollectionsCache;

const listFields = [
    "title", "author", "authorName", "authorId", "authorPhoto",
    "category", "categoryId", "status", "type", "isBook", "isChapter",
    "isPremium", "bookType", "price", "priority", "placement", "order", "date",
    "publishDate", "createdAt", "updatedAt", "slug", "bookSlug", "bookId",
    "parentBookId", "bookName", "playlistName", "chapterIndex", "volume", "issue",
    "excerpt", "storedExcerpt", "hasCustomExcerpt", "transcription",
    "visible", "description", "introduction", "intro", "summary", "pages", "color", "tags",
    "chapters", "articleIds", "titleColor", "contentColor",
    "readTime", "accessType", "leadTitle", "featuredTitle", "apkUrl", "fontSize",
    "imageUrl", "coverUrl", "coverImage", "image", "thumbnail", "thumbnailUrl", "ogImage"
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

export function stripListHeavyFields(value) {
    if (Array.isArray(value)) return value.map(stripListHeavyFields);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== "content" && key !== "body")
        .map(([key, child]) => [key, stripListHeavyFields(child)]));
}

async function fetchCollection(collectionName, signal) {
    const mask = listFields.map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
    const documents = [];
    let pageToken = "";

    do {
        const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
        const response = await fetch(`${REST_BASE}/${encodeURIComponent(collectionName)}?pageSize=100&key=${encodeURIComponent(firebaseConfig.apiKey)}&${mask}${token}`, { signal });
        if (!response.ok) throw new Error(`Firestore list read failed (${response.status}) for ${collectionName}.`);
        const result = await response.json();

        for (const document of result.documents || []) {
            const id = document.name.split("/").pop();
            const data = stripListHeavyFields(decodeFields(document.fields || {}));
            documents.push({
                ...data,
                id,
                _imageCollection: collectionName,
                _imageDocId: id
            });
        }
        pageToken = result.nextPageToken || "";
    } while (pageToken);

    return documents;
}

async function fetchCollectionWithCache(collectionName, signal) {
    try {
        return await fetchCollection(collectionName, signal);
    } catch (error) {
        console.warn(`[NUQTHA Data] ${collectionName} list read failed; checking the local cache.`, error);
        try {
            const snapshot = await getDocsFromCache(collection(db, collectionName));
            return snapshot.docs.map(document => {
                const data = stripListHeavyFields(document.data());
                return {
                    ...data,
                    id: document.id,
                    _imageCollection: collectionName,
                    _imageDocId: document.id
                };
            });
        } catch (cacheError) {
            console.warn(`[NUQTHA Data] ${collectionName} is unavailable in the local cache.`, cacheError);
            throw error;
        }
    }
}

export async function fetchPublicCollections() {
    if (publicCollectionsCache) return publicCollectionsCache;
    if (publicCollectionsPromise) return publicCollectionsPromise;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    publicCollectionsPromise = Promise.all([
        fetchCollectionWithCache("articles", controller.signal),
        fetchCollectionWithCache("books", controller.signal)
    ]).then(([articles, books]) => {
        publicCollectionsCache = {
            ...filterPublicCollections(articles, books),
            hasFirestoreContent: articles.length > 0 || books.length > 0
        };
        return publicCollectionsCache;
    }).finally(() => {
        clearTimeout(timeout);
        publicCollectionsPromise = null;
    });
    return publicCollectionsPromise;
}

export async function fetchArticleSearchContent() {
    const mask = ["content", "body"].map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
    const results = new Map();
    let pageToken = "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        do {
            const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            const response = await fetch(`${REST_BASE}/articles?pageSize=100&key=${encodeURIComponent(firebaseConfig.apiKey)}&${mask}${token}`, { signal: controller.signal });
            if (!response.ok) throw new Error(`Firestore article search read failed (${response.status}).`);
            const result = await response.json();
            for (const document of result.documents || []) {
                const id = document.name.split("/").pop();
                const fields = decodeFields(document.fields || {});
                results.set(id, fields.content || fields.body || "");
            }
            pageToken = result.nextPageToken || "";
        } while (pageToken);

        return results;
    } finally {
        clearTimeout(timeout);
    }
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
        blob = await readCachedBlob(key);
    } catch (error) {
        console.warn("[NUQTHA Images] Could not read the IndexedDB image cache.", error);
    }
    if (!blob) {
        const response = await fetch(dataUrl);
        if (!response.ok) throw new Error("Could not decode the image data.");
        blob = await response.blob();
        try {
            await cacheBlob(key, blob);
        } catch (error) {
            console.warn("[NUQTHA Images] Could not persist an image in IndexedDB.", error);
        }
    }

    const url = URL.createObjectURL(blob);
    activeObjectUrls.set(key, url);
    return url;
}

function readResolvedImageUrl(cacheKey) {
    if (resolvedImageUrls.has(cacheKey)) return resolvedImageUrls.get(cacheKey);
    try {
        const cached = JSON.parse(sessionStorage.getItem(RESOLVED_URL_CACHE_PREFIX + cacheKey) || "null");
        if (cached?.url && Date.now() - Number(cached.savedAt) < RESOLVED_URL_TTL) {
            resolvedImageUrls.set(cacheKey, cached.url);
            return cached.url;
        }
    } catch (_) {}
    return "";
}

function writeResolvedImageUrl(cacheKey, url) {
    if (!url) return;
    resolvedImageUrls.set(cacheKey, url);
    try {
        sessionStorage.setItem(RESOLVED_URL_CACHE_PREFIX + cacheKey, JSON.stringify({ url, savedAt: Date.now() }));
    } catch (_) {}
}

function fetchImageFromDocument(collectionName, documentId) {
    if (!collectionName || !documentId) return "";
    const cacheKey = `${collectionName}:${documentId}`;
    const resolvedUrl = readResolvedImageUrl(cacheKey);
    if (resolvedUrl) return Promise.resolve(resolvedUrl);
    if (imageSourcePromises.has(cacheKey)) return imageSourcePromises.get(cacheKey);

    const imageRequest = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const mask = IMAGE_FIELDS.map(field => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
            const url = `${REST_BASE}/${encodeURIComponent(collectionName)}/${encodeURIComponent(documentId)}?key=${encodeURIComponent(firebaseConfig.apiKey)}&${mask}`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Firestore image read failed (${response.status}).`);
            const document = await response.json();
            const url = getArticleImageUrl(decodeFields(document.fields || {}), "");
            writeResolvedImageUrl(cacheKey, url);
            return url;
        } finally {
            clearTimeout(timeout);
        }
    })();

    imageSourcePromises.set(cacheKey, imageRequest);
    imageRequest.then(
        () => {
            if (imageSourcePromises.get(cacheKey) === imageRequest) {
                imageSourcePromises.delete(cacheKey);
            }
        },
        () => {
            if (imageSourcePromises.get(cacheKey) === imageRequest) imageSourcePromises.delete(cacheKey);
        }
    );
    return imageRequest;
}

async function fetchImageField(image) {
    try {
        const source = await fetchImageFromDocument(
            image.dataset.nuqthaImageCollection,
            image.dataset.nuqthaImageDoc
        );
        if (source) return source;
    } catch (error) {
        if (!image.dataset.nuqthaImageFallbackCollection || !image.dataset.nuqthaImageFallbackDoc) throw error;
        console.warn("[NUQTHA Images] Primary cover source failed; trying its fallback document.", error);
    }
    return fetchImageFromDocument(
        image.dataset.nuqthaImageFallbackCollection,
        image.dataset.nuqthaImageFallbackDoc
    );
}

function showImagePlaceholder(image) {
    const placeholder = image.parentElement?.querySelector("[data-nuqtha-image-placeholder]");
    if (!placeholder) return;
    placeholder.hidden = false;
    placeholder.classList.remove("hidden");
}

function hideImagePlaceholder(image) {
    const placeholder = image.parentElement?.querySelector("[data-nuqtha-image-placeholder]");
    if (!placeholder) return;
    placeholder.hidden = true;
    placeholder.classList.add("hidden");
}

function handleImageError(image) {
    showImagePlaceholder(image);
    if (image.dataset.nuqthaImageFallbackAttempted === "true" ||
        !image.dataset.nuqthaImageFallbackCollection || !image.dataset.nuqthaImageFallbackDoc) return;
    image.dataset.nuqthaImageFallbackAttempted = "true";
    fetchImageFromDocument(
        image.dataset.nuqthaImageFallbackCollection,
        image.dataset.nuqthaImageFallbackDoc
    ).then(source => {
        if (source && image.isConnected) image.src = source;
    }).catch(error => {
        console.warn("[NUQTHA Images] Could not load the fallback image.", error);
    });
}

function revealImage(image, source) {
    image.addEventListener("load", () => {
        image.classList.add("nuqtha-image-loaded");
        image.style.opacity = "1";
        hideImagePlaceholder(image);
    }, { once: true });
    image.addEventListener("error", () => handleImageError(image), { once: true });
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
    while (activeRequests < MAX_ACTIVE_REQUESTS && queue.length) {
        const image = queue.shift();
        if (!image?.isConnected) continue;
        activeRequests += 1;
        (async () => {
            try {
                const source = await fetchImageField(image);
                if (!source || !image.isConnected) {
                    if (image.isConnected) showImagePlaceholder(image);
                    return;
                }
                let resolvedSource = source;
                if (/^data:image\//i.test(source)) {
                    const key = `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`;
                    resolvedSource = await getObjectUrl(key, source);
                }
                if (image.isConnected) revealImage(image, resolvedSource);
            } catch (error) {
                console.warn("[NUQTHA Images] Could not load a card image.", error);
                if (image.isConnected) showImagePlaceholder(image);
            } finally {
                activeRequests -= 1;
                processNext();
            }
        })();
    }
}

function observeImage(image) {
    if (image.dataset.nuqthaImageObserved === "true") return;
    image.dataset.nuqthaImageObserved = "true";
    if (image.hasAttribute("src")) {
        image.loading = "eager";
        image.decoding = "async";
        const reveal = () => {
            image.classList.add("nuqtha-image-loaded");
            image.style.opacity = "1";
            hideImagePlaceholder(image);
        };
        if (image.complete && image.naturalWidth > 0) reveal();
        else {
            image.addEventListener("load", reveal, { once: true });
            image.addEventListener("error", () => handleImageError(image), { once: true });
        }
        return;
    }
    image.loading = "eager";
    image.decoding = "async";
    enqueueImage(image);
}

function scanImages(node) {
    if (!(node instanceof Element)) return;
    if (node.matches("img[data-nuqtha-image-doc]")) observeImage(node);
    node.querySelectorAll("img[data-nuqtha-image-doc]").forEach(observeImage);
}

export function installLazyFirestoreImages() {
    if (observer || typeof window === "undefined") return;
    observer = {
        observe() {},
        unobserve() {}
    };

    const start = () => {
        scanImages(document.body);
        if ("MutationObserver" in window) {
            mutationObserver = new MutationObserver(records => {
                records.forEach(record => record.addedNodes.forEach(scanImages));
                const attachedKeys = new Set(Array.from(document.querySelectorAll("img[data-nuqtha-image-doc]"), image =>
                    `${image.dataset.nuqthaImageCollection}:${image.dataset.nuqthaImageDoc}:${image.dataset.nuqthaImageUpdated || ""}`
                ));
                for (const [key, url] of activeObjectUrls) {
                    if (!attachedKeys.has(key)) {
                        URL.revokeObjectURL(url);
                        activeObjectUrls.delete(key);
                    }
                }
            });
            if (document.body) mutationObserver.observe(document.body, { childList: true, subtree: true });
        }
    };
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
}

const warmedImageUrls = new Set();

export function warmImageUrls(items) {
    if (!(typeof window !== "undefined") || !Array.isArray(items)) return;
    const seen = new Set();
    let warmedCount = 0;
    for (const item of items) {
        for (const field of IMAGE_FIELDS) {
            const source = typeof item?.[field] === "string" ? item[field].trim() : "";
            if (!/^https?:\/\//i.test(source) || seen.has(source) || warmedImageUrls.has(source)) continue;
            seen.add(source);
            warmedImageUrls.add(source);
            warmedCount += 1;

            if (warmedCount <= 8) {
                const existingPreload = Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'))
                    .some(link => link.href === source);
                if (existingPreload) continue;
                const preload = document.createElement("link");
                preload.rel = "preload";
                preload.as = "image";
                preload.href = source;
                preload.fetchPriority = "high";
                document.head.appendChild(preload);
            }

            const image = new Image();
            image.decoding = "async";
            image.loading = "eager";
            image.fetchPriority = warmedCount <= 4 ? "high" : "low";
            image.src = source;
            if (typeof image.decode === "function") image.decode().catch(() => {});
        }
    }
}

export function getDeferredImageAttributes(item) {
    if (!item?._imageCollection || !item?._imageDocId) return "";
    const directUrl = getArticleImageUrl(item, "");
    if (/^https?:\/\//i.test(directUrl) || /^\/[^/]/.test(directUrl)) return "";
    const updatedAt = String(item.updatedAt || item.createdAt || "");
    const escape = value => String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    const fallbackAttributes = item._imageFallbackCollection && item._imageFallbackDocId
        ? `data-nuqtha-image-fallback-collection="${escape(item._imageFallbackCollection)}" data-nuqtha-image-fallback-doc="${escape(item._imageFallbackDocId)}"`
        : "";
    return `data-nuqtha-image-doc="${escape(item._imageDocId)}" data-nuqtha-image-collection="${escape(item._imageCollection)}" data-nuqtha-image-updated="${escape(updatedAt)}" ${fallbackAttributes}`;
}
