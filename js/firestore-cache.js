/**
 * NUQTHA — Shared Firestore Cache, Request Deduplication, Priority Queue & 429 Backoff
 * Coordinates memory, sessionStorage, and localStorage TTL caches across Home and Reader,
 * deduplicates concurrent Firestore reads, prioritizes foreground article loads over background
 * list/image fetches, and enforces exponential backoff with a bounded retry limit on HTTP 429.
 */

export const ARTICLES_LIST_CACHE_KEY = "nuqtha_cached_articles_v15";
export const PUBLIC_COLLECTIONS_CACHE_KEY = "nuqtha_public_collections_v1";
export const SLUG_ID_MAP_CACHE_KEY = "nuqtha_slug_id_map_v1";
export const ARTICLE_DOC_CACHE_PREFIX = "nuqtha_article_doc_v1_";
export const IMAGE_URL_CACHE_PREFIX = "nuqtha_resolved_img_v1_";
export const CATEGORY_CACHE_KEY = "nuqtha:categories:v1";
export const AUTHORS_CACHE_KEY = "nuqtha_cached_authors";

export const LIST_CACHE_TTL_MS = 10 * 60 * 1000;
export const DOC_CACHE_TTL_MS = 30 * 60 * 1000;
export const SLUG_MAP_TTL_MS = 60 * 60 * 1000;
export const CATEGORIES_CACHE_TTL_MS = 10 * 60 * 1000;
export const AUTHORS_CACHE_TTL_MS = 15 * 60 * 1000;
export const IMAGE_URL_CACHE_TTL_MS = 30 * 60 * 1000;

export const PRIORITY_FOREGROUND = 0;
export const PRIORITY_NORMAL = 1;
export const PRIORITY_BACKGROUND = 2;

const BG_COOLDOWN_KEY = "nuqtha_fs_bg_cooldown_until_v1";
const NORMAL_COOLDOWN_KEY = "nuqtha_fs_normal_cooldown_until_v1";
const FG_COOLDOWN_KEY = "nuqtha_fs_fg_cooldown_until_v1";
const MAX_CACHED_ARTICLE_DOCS = 15;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_CONCURRENT_BACKGROUND = 2;

const sharedState = (typeof globalThis !== "undefined" ? globalThis : {});
const memoryTtlCache = sharedState.__NUQTHA_TTL_MEMORY__ || new Map();
const inflightRequests = sharedState.__NUQTHA_INFLIGHT_MAP__ || new Map();
if (sharedState && typeof sharedState === "object") {
    sharedState.__NUQTHA_TTL_MEMORY__ = memoryTtlCache;
    sharedState.__NUQTHA_INFLIGHT_MAP__ = inflightRequests;
}

const requestQueue = [];
let activeTotalCount = 0;
let activeBackgroundCount = 0;
let bgCooldownUntilMem = 0;
let normalCooldownUntilMem = 0;
let fgCooldownUntilMem = 0;

function getStorageSafe(name) {
    try {
        if (typeof globalThis === "undefined") return null;
        const store = globalThis[name];
        if (!store || typeof store.getItem !== "function" || typeof store.setItem !== "function") {
            return null;
        }
        return store;
    } catch (_) {
        return null;
    }
}

function normalizeLookupText(value) {
    return String(value || "")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase();
}

function cleanSlugForLookup(raw) {
    let s = String(raw || "").trim();
    try {
        s = decodeURIComponent(s);
    } catch (_) {}
    s = s.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
    for (let i = 0; i < 3; i++) {
        s = s.replace(/^(?:book|story|article)[\/\\]+/gi, "").replace(/^\/+|\/+$/g, "");
    }
    return normalizeLookupText(s);
}

function pruneOldArticleDocs(storage) {
    if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return;
    try {
        const docEntries = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (!k || !k.startsWith(ARTICLE_DOC_CACHE_PREFIX)) continue;
            let savedAt = 0;
            try {
                const parsed = JSON.parse(storage.getItem(k) || "null");
                savedAt = Number(parsed?.savedAt) || 0;
            } catch (_) {}
            docEntries.push({ key: k, savedAt });
        }
        if (docEntries.length <= MAX_CACHED_ARTICLE_DOCS) return;
        docEntries.sort((a, b) => a.savedAt - b.savedAt);
        const removeCount = docEntries.length - MAX_CACHED_ARTICLE_DOCS;
        for (let i = 0; i < removeCount; i++) {
            storage.removeItem(docEntries[i].key);
        }
    } catch (_) {}
}

function pruneOldImageUrls(storage) {
    if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return;
    try {
        const keys = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k && k.startsWith(IMAGE_URL_CACHE_PREFIX)) keys.push(k);
        }
        if (keys.length <= 60) return;
        for (let i = 0; i < keys.length - 40; i++) {
            storage.removeItem(keys[i]);
        }
    } catch (_) {}
}

function trySetStorageItem(storage, key, serialized) {
    if (!storage) return false;
    try {
        storage.setItem(key, serialized);
        return true;
    } catch (_) {
        try {
            pruneOldArticleDocs(storage);
            pruneOldImageUrls(storage);
            if (typeof window !== "undefined" && typeof window.clearVolatileStorage === "function") {
                window.clearVolatileStorage(storage);
            }
            storage.setItem(key, serialized);
            return true;
        } catch (_) {
            return false;
        }
    }
}

export function readTtlCache(key, ttlMs = LIST_CACHE_TTL_MS, { allowExpired = false, validate = null } = {}) {
    if (!key) return null;
    const now = Date.now();

    const inspectEntry = (entry) => {
        if (!entry || typeof entry !== "object") return null;
        let data = entry;
        let savedAt = 0;
        if (Object.prototype.hasOwnProperty.call(entry, "data") && typeof entry.savedAt === "number") {
            data = entry.data;
            savedAt = entry.savedAt;
        } else if (typeof entry.savedAt === "number") {
            savedAt = entry.savedAt;
        }
        if (typeof validate === "function" && !validate(data)) return null;
        const expired = savedAt > 0 ? (now - savedAt > ttlMs) : false;
        if (expired && !allowExpired) return null;
        return { data, savedAt, expired };
    };

    const memHit = inspectEntry(memoryTtlCache.get(key));
    if (memHit) return memHit;

    for (const storeName of ["sessionStorage", "localStorage"]) {
        const store = getStorageSafe(storeName);
        if (!store) continue;
        try {
            const raw = store.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            let savedAt = Number(parsed?.savedAt) || 0;
            if (!savedAt) {
                const metaRaw = store.getItem(`${key}:savedAt`);
                savedAt = Number(metaRaw) || 0;
            }
            const entry = parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "data") && typeof parsed.savedAt === "number"
                ? parsed
                : { savedAt: savedAt || now, data: parsed };
            const hit = inspectEntry(entry);
            if (hit) {
                memoryTtlCache.set(key, { savedAt: hit.savedAt, data: hit.data });
                if (storeName === "localStorage") {
                    const sessionStore = getStorageSafe("sessionStorage");
                    trySetStorageItem(sessionStore, key, raw);
                    if (hit.savedAt) trySetStorageItem(sessionStore, `${key}:savedAt`, String(hit.savedAt));
                }
                return hit;
            }
        } catch (_) {}
    }

    return null;
}

export function writeTtlCache(key, data, {
    maxBytes = 900 * 1024,
    storages = ["sessionStorage", "localStorage"],
    barePayload = false
} = {}) {
    if (!key) return false;
    const savedAt = Date.now();
    memoryTtlCache.set(key, { savedAt, data });

    let serialized = "";
    try {
        serialized = JSON.stringify(barePayload ? data : { savedAt, data });
    } catch (_) {
        return false;
    }

    if (serialized.length * 2 > maxBytes) {
        return false;
    }

    let wroteAny = false;
    for (const storeName of storages) {
        const store = getStorageSafe(storeName);
        if (!store) continue;
        if (trySetStorageItem(store, key, serialized)) {
            if (barePayload) {
                trySetStorageItem(store, `${key}:savedAt`, String(savedAt));
            }
            wroteAny = true;
        }
    }
    return wroteAny;
}

const INLINE_CACHE_LIMIT_BYTES = 185 * 1024;
const CACHE_IMAGE_FIELDS = [
    "imageUrl", "coverUrl", "coverImage", "cover", "coverPhoto", "featuredImage",
    "image", "photo", "banner", "media", "thumbnail", "thumbnailUrl", "thumbUrl",
    "thumb", "ogImage", "imageBase64", "coverBase64", "base64"
];

function extractCacheImageUrl(val, depth = 0) {
    if (!val || depth > 2) return "";
    if (typeof val === "string") return val;
    if (Array.isArray(val)) {
        for (const entry of val) {
            const found = extractCacheImageUrl(entry, depth + 1);
            if (found) return found;
        }
        return "";
    }
    if (typeof val === "object") {
        for (const k of ["url", "imageUrl", "coverUrl", "coverImage", "cover", "src", "downloadURL", "downloadUrl", "secure_url", "thumbnailUrl", "thumbnail", "thumbUrl", "thumb", "path", "href", "imageBase64", "coverBase64", "base64"]) {
            if (val[k]) {
                const found = extractCacheImageUrl(val[k], depth + 1);
                if (found) return found;
            }
        }
    }
    return "";
}

export function compactListItemForCache(item, maxInlineChars = INLINE_CACHE_LIMIT_BYTES) {
    if (!item || typeof item !== "object") return item;
    const copy = { ...item };
    delete copy.content;
    delete copy.body;
    delete copy.transcription;
    for (const textField of ["excerpt", "storedExcerpt", "description", "introduction", "intro", "summary"]) {
        if (typeof copy[textField] === "string" && copy[textField].length > 220) {
            copy[textField] = copy[textField].slice(0, 220);
        }
    }
    let strippedInlineImage = false;
    for (const imgField of CACHE_IMAGE_FIELDS) {
        const urlStr = extractCacheImageUrl(copy[imgField]);
        if (urlStr && /^data:/i.test(urlStr) && urlStr.length > maxInlineChars) {
            delete copy[imgField];
            strippedInlineImage = true;
        }
    }
    if (strippedInlineImage) {
        copy._hasDeferredImage = true;
        copy._hasAnyImageField = true;
        if (!copy._imageDocId && copy.id) copy._imageDocId = copy.id;
        if (!copy._imageCollection) {
            copy._imageCollection = (String(copy.type || "").toUpperCase() === "BOOK" || copy.isBook === true) ? "books" : "articles";
        }
    }
    return copy;
}

export function readArticlesListCache({ allowExpired = false, validate = null } = {}) {
    const keys = [ARTICLES_LIST_CACHE_KEY, "nuqtha_cached_articles_v12", "nuqtha_cached_articles_v11"];
    for (const key of keys) {
        const hit = readTtlCache(key, LIST_CACHE_TTL_MS, {
            allowExpired,
            validate: (items) => Array.isArray(items) && items.length > 0 && (!validate || validate(items))
        });
        if (hit) return hit;
    }
    return null;
}

export function writeArticlesListCache(articles) {
    if (!Array.isArray(articles) || articles.length === 0) return false;
    indexArticleSlugs(articles);
    const wroteFull = writeTtlCache(ARTICLES_LIST_CACHE_KEY, articles, {
        maxBytes: 900 * 1024,
        barePayload: true
    });
    if (wroteFull) return true;
    const compacted = articles.map(item => compactListItemForCache(item, INLINE_CACHE_LIMIT_BYTES));
    if (writeTtlCache(ARTICLES_LIST_CACHE_KEY, compacted, {
        maxBytes: 900 * 1024,
        barePayload: true
    })) {
        return true;
    }
    const metadataOnly = articles.map(item => compactListItemForCache(item, 2048));
    return writeTtlCache(ARTICLES_LIST_CACHE_KEY, metadataOnly, {
        maxBytes: 900 * 1024,
        barePayload: true
    });
}

export function indexArticleSlugs(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const existing = readTtlCache(SLUG_ID_MAP_CACHE_KEY, SLUG_MAP_TTL_MS, { allowExpired: true })?.data || {};
    const next = (existing && typeof existing === "object") ? { ...existing } : {};
    let changed = false;

    for (const item of items) {
        if (!item || !item.id) continue;
        const id = String(item.id).trim();
        const col = item._imageCollection || ((String(item.type || "").toUpperCase() === "BOOK" || item.isBook === true) ? "books" : "articles");
        const entry = {
            id,
            col,
            updatedAt: item.updatedAt || item.createdAt || ""
        };
        const candidates = [
            item.slug,
            item.bookSlug,
            item.id
        ].filter(Boolean);
        for (const cand of candidates) {
            const cleaned = cleanSlugForLookup(cand);
            if (!cleaned) continue;
            if (!next[cleaned] || next[cleaned].id !== id || next[cleaned].col !== col) {
                next[cleaned] = entry;
                changed = true;
            }
        }
    }

    if (changed) {
        writeTtlCache(SLUG_ID_MAP_CACHE_KEY, next, { maxBytes: 120 * 1024 });
    }
}

export function lookupSlugMapping(identifier) {
    if (!identifier) return null;
    const mapEntry = readTtlCache(SLUG_ID_MAP_CACHE_KEY, SLUG_MAP_TTL_MS, { allowExpired: true });
    const map = mapEntry?.data;
    if (!map || typeof map !== "object") return null;

    const candidates = [
        cleanSlugForLookup(identifier),
        normalizeLookupText(identifier)
    ].filter(Boolean);
    for (const c of candidates) {
        if (map[c] && map[c].id) return map[c];
    }
    return null;
}

function stripOversizedDataFields(docObj) {
    if (!docObj || typeof docObj !== "object") return docObj;
    const copy = { ...docObj };
    let hadStripped = false;
    for (const field of CACHE_IMAGE_FIELDS) {
        const urlStr = extractCacheImageUrl(copy[field]);
        if (urlStr && /^data:image\//i.test(urlStr) && urlStr.length > INLINE_CACHE_LIMIT_BYTES) {
            delete copy[field];
            hadStripped = true;
        }
    }
    if (hadStripped) {
        copy._hasDeferredImage = true;
        copy._hasAnyImageField = true;
        if (!copy._imageDocId && copy.id) copy._imageDocId = copy.id;
        if (!copy._imageCollection) copy._imageCollection = copy.isBook || copy.type === "BOOK" ? "books" : "articles";
    }
    return copy;
}

export function saveCachedArticleDoc(docObj) {
    if (!docObj || !docObj.id) return false;
    indexArticleSlugs([docObj]);
    const sanitized = stripOversizedDataFields(docObj);
    const key = `${ARTICLE_DOC_CACHE_PREFIX}${String(docObj.id).trim()}`;
    const result = writeTtlCache(key, sanitized, { maxBytes: 450 * 1024 });
    for (const storeName of ["sessionStorage", "localStorage"]) {
        pruneOldArticleDocs(getStorageSafe(storeName));
    }
    return result;
}

export function getCachedArticleDoc(identifier, { allowExpired = false } = {}) {
    if (!identifier) return null;
    const rawId = String(identifier).trim();
    const mapped = lookupSlugMapping(rawId);
    const ids = [rawId, mapped?.id].filter(Boolean);
    for (const id of ids) {
        const hit = readTtlCache(`${ARTICLE_DOC_CACHE_PREFIX}${id}`, DOC_CACHE_TTL_MS, { allowExpired });
        if (hit && hit.data) return hit.data;
    }
    return null;
}

export function getResolvedImageUrlCache(collectionName, docId) {
    if (!collectionName || !docId) return "";
    const hit = readTtlCache(`${IMAGE_URL_CACHE_PREFIX}${collectionName}_${docId}`, IMAGE_URL_CACHE_TTL_MS);
    return (typeof hit?.data === "string") ? hit.data : "";
}

export function saveResolvedImageUrlCache(collectionName, docId, sourceUrl) {
    if (!collectionName || !docId || typeof sourceUrl !== "string" || !sourceUrl) return false;
    if (/^data:/i.test(sourceUrl) && sourceUrl.length > INLINE_CACHE_LIMIT_BYTES) return false;
    return writeTtlCache(`${IMAGE_URL_CACHE_PREFIX}${collectionName}_${docId}`, sourceUrl, { maxBytes: 220 * 1024 });
}

function readTimestamp(key, memVal) {
    let until = Number(memVal) || 0;
    for (const storeName of ["sessionStorage", "localStorage"]) {
        const store = getStorageSafe(storeName);
        if (!store) continue;
        try {
            const val = Number(store.getItem(key) || "0");
            if (val > until) until = val;
        } catch (_) {}
    }
    return until;
}

function writeTimestamp(key, value) {
    for (const storeName of ["sessionStorage", "localStorage"]) {
        const store = getStorageSafe(storeName);
        if (!store) continue;
        try {
            if (value > 0) store.setItem(key, String(value));
            else store.removeItem(key);
        } catch (_) {}
    }
}

export function markFirestoreRateLimited(durationMs = 30000, { scope = "background" } = {}) {
    const safeDuration = Math.max(2000, Math.min(120000, Number(durationMs) || 30000));
    const until = Date.now() + safeDuration;
    if (scope === "foreground" || scope === "all") {
        fgCooldownUntilMem = Math.max(fgCooldownUntilMem, until);
        writeTimestamp(FG_COOLDOWN_KEY, fgCooldownUntilMem);
    }
    if (scope === "normal" || scope === "all") {
        normalCooldownUntilMem = Math.max(normalCooldownUntilMem, until);
        writeTimestamp(NORMAL_COOLDOWN_KEY, normalCooldownUntilMem);
    }
    bgCooldownUntilMem = Math.max(bgCooldownUntilMem, until);
    writeTimestamp(BG_COOLDOWN_KEY, bgCooldownUntilMem);
    return until;
}

export function clearFirestoreRateLimit({ scope = "all" } = {}) {
    if (scope === "foreground" || scope === "all") {
        fgCooldownUntilMem = 0;
        writeTimestamp(FG_COOLDOWN_KEY, 0);
    }
    if (scope === "normal" || scope === "all") {
        normalCooldownUntilMem = 0;
        writeTimestamp(NORMAL_COOLDOWN_KEY, 0);
    }
    if (scope === "background" || scope === "all") {
        bgCooldownUntilMem = 0;
        writeTimestamp(BG_COOLDOWN_KEY, 0);
    }
}

export function getRateLimitRemainingMs({ scope = "background" } = {}) {
    const now = Date.now();
    if (scope === "foreground") {
        const fgUntil = readTimestamp(FG_COOLDOWN_KEY, fgCooldownUntilMem);
        fgCooldownUntilMem = fgUntil;
        return fgUntil > now ? fgUntil - now : 0;
    }
    if (scope === "normal") {
        const normalUntil = readTimestamp(NORMAL_COOLDOWN_KEY, normalCooldownUntilMem);
        normalCooldownUntilMem = normalUntil;
        return normalUntil > now ? normalUntil - now : 0;
    }
    const bgUntil = readTimestamp(BG_COOLDOWN_KEY, bgCooldownUntilMem);
    bgCooldownUntilMem = bgUntil;
    return bgUntil > now ? bgUntil - now : 0;
}

export function checkIsRateLimited({ scope = "background" } = {}) {
    return getRateLimitRemainingMs({ scope }) > 0;
}

export function dedupeInFlight(key, factory) {
    if (!key) return Promise.resolve().then(factory);
    const existing = inflightRequests.get(key);
    if (existing) return existing;

    const promise = Promise.resolve().then(factory);
    inflightRequests.set(key, promise);
    promise.then(
        () => {
            if (inflightRequests.get(key) === promise) inflightRequests.delete(key);
        },
        () => {
            if (inflightRequests.get(key) === promise) inflightRequests.delete(key);
        }
    );
    return promise;
}

function hasPendingForeground() {
    return requestQueue.some(item => item.priority === PRIORITY_FOREGROUND);
}

function pumpQueue() {
    while (activeTotalCount < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
        // Pick highest priority (lowest numeric priority value)
        let nextIndex = 0;
        for (let i = 1; i < requestQueue.length; i++) {
            if (requestQueue[i].priority < requestQueue[nextIndex].priority) {
                nextIndex = i;
            }
        }
        const candidate = requestQueue[nextIndex];
        if (candidate.priority >= PRIORITY_BACKGROUND) {
            if (hasPendingForeground() || activeBackgroundCount >= MAX_CONCURRENT_BACKGROUND) {
                break;
            }
        }
        requestQueue.splice(nextIndex, 1);

        if (candidate.signal?.aborted) {
            const abortErr = new Error("Aborted");
            abortErr.name = "AbortError";
            candidate.reject(abortErr);
            continue;
        }

        activeTotalCount += 1;
        if (candidate.priority >= PRIORITY_BACKGROUND) activeBackgroundCount += 1;

        Promise.resolve()
            .then(candidate.taskFn)
            .then(candidate.resolve, candidate.reject)
            .finally(() => {
                activeTotalCount = Math.max(0, activeTotalCount - 1);
                if (candidate.priority >= PRIORITY_BACKGROUND) {
                    activeBackgroundCount = Math.max(0, activeBackgroundCount - 1);
                }
                pumpQueue();
            });
    }
}

export function enqueueFirestoreTask(taskFn, { priority = PRIORITY_NORMAL, signal } = {}) {
    if (signal?.aborted) {
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        return Promise.reject(abortErr);
    }
    return new Promise((resolve, reject) => {
        requestQueue.push({
            taskFn,
            priority,
            signal,
            resolve,
            reject
        });
        pumpQueue();
    });
}

function waitAbortable(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
            return;
        }
        const timer = setTimeout(() => {
            if (signal && onAbort) signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
        };
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
}

function compute429DelayMs(response, attempt, baseBackoffMs) {
    try {
        const header = response?.headers?.get?.("Retry-After");
        if (header) {
            const secs = Number(header);
            if (Number.isFinite(secs) && secs > 0) {
                return Math.max(400, Math.min(4000, secs * 1000));
            }
        }
    } catch (_) {}
    const jitter = Math.floor(Math.random() * 180);
    return Math.min(4000, baseBackoffMs * Math.pow(2, attempt) + jitter);
}

/**
 * Bounded, priority-queued fetch wrapper with in-flight deduplication and exponential backoff.
 * - Foreground requests (`PRIORITY_FOREGROUND`) jump ahead of background tasks and retry 429s with
 *   exponential backoff up to `max429Retries` (default 2).
 * - Background requests (`PRIORITY_BACKGROUND`) skip/halt immediately when Firestore is in 429 cooldown
 *   so they never starve foreground article loading.
 */
export async function queuedFirestoreFetch(url, options = {}, {
    priority = PRIORITY_NORMAL,
    dedupeKey = "",
    max429Retries = priority === PRIORITY_FOREGROUND ? 2 : 0,
    max5xxRetries = 2,
    baseBackoffMs = 650,
    bypassRateLimit = false
} = {}) {
    const scope = priority === PRIORITY_FOREGROUND
        ? "foreground"
        : (priority === PRIORITY_NORMAL ? "normal" : "background");
    const resolvedDedupeKey = dedupeKey || "";

    const runFetch = () => enqueueFirestoreTask(async () => {
        const totalMaxAttempts = Math.max(1, Math.max(max429Retries, max5xxRetries) + 1);
        let retries429Used = 0;
        let retries5xxUsed = 0;

        for (let attempt = 0; attempt < totalMaxAttempts; attempt++) {
            if (attempt === 0 && !bypassRateLimit && checkIsRateLimited({ scope })) {
                return new Response(JSON.stringify({ error: { code: 429, message: "Firestore rate-limit cooldown active." } }), {
                    status: 429,
                    statusText: "Too Many Requests",
                    headers: { "Content-Type": "application/json" }
                });
            }

            try {
                const response = await fetch(url, options);
                if (response && response.status === 429) {
                    markFirestoreRateLimited(30000, { scope: "background" });
                    if (retries429Used < max429Retries) {
                        const delay = compute429DelayMs(response, retries429Used, baseBackoffMs);
                        retries429Used += 1;
                        await waitAbortable(delay, options?.signal);
                        continue;
                    }
                    if (scope === "foreground" || scope === "normal") {
                        markFirestoreRateLimited(15000, { scope });
                    }
                    return response;
                }

                if (response && !response.ok && response.status >= 500 && retries5xxUsed < max5xxRetries) {
                    const delay = 350 * Math.pow(2, retries5xxUsed) + Math.floor(Math.random() * 100);
                    retries5xxUsed += 1;
                    await waitAbortable(delay, options?.signal);
                    continue;
                }

                return response;
            } catch (err) {
                if (err?.name === "AbortError" || retries5xxUsed >= max5xxRetries) {
                    throw err;
                }
                const delay = 350 * Math.pow(2, retries5xxUsed) + Math.floor(Math.random() * 100);
                retries5xxUsed += 1;
                await waitAbortable(delay, options?.signal);
            }
        }
    }, { priority, signal: options?.signal });

    return resolvedDedupeKey ? dedupeInFlight(resolvedDedupeKey, runFetch) : runFetch();
}
