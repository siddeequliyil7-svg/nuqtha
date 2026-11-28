import { collection, db, getDocs } from "../firebase-config.js";
import { transliterateMalayalam } from "../schema-validator.js";
import {
    CATEGORIES_CACHE_TTL_MS,
    CATEGORY_CACHE_KEY as SHARED_CATEGORY_CACHE_KEY,
    PRIORITY_NORMAL,
    checkIsRateLimited,
    dedupeInFlight,
    enqueueFirestoreTask,
    markFirestoreRateLimited
} from "./firestore-cache.js";

const CATEGORY_CACHE_KEY = SHARED_CATEGORY_CACHE_KEY || "nuqtha:categories:v1";
const CATEGORY_CACHE_TTL = CATEGORIES_CACHE_TTL_MS || 10 * 60 * 1000;
const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STANDARD_CATEGORY_NAMES = {
    history: "History",
    study: "Study",
    story: "Stories",
    "islamic-scholars": "ISLAMIC SCHOLARS",
    "kerala-islamic-scholars": "KERALA ISLAMIC SCHOLARS"
};
let categoriesPromise = null;

export function slugifyCategory(value) {
    return transliterateMalayalam(String(value || "").trim().toLowerCase())
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeStandardCategory(value) {
    const raw = String(value || "").trim().toUpperCase();
    const slugTest = slugifyCategory(raw);
    if (slugTest === "history" || raw === "HISTORY" || raw.includes("HIST") || raw.includes("ചരിത്ര")) return "history";
    if (slugTest === "study" || raw === "STUDY" || raw.includes("STUD") || raw.includes("പഠന")) return "study";
    if (slugTest === "story" || slugTest === "stories" || raw === "STORY" || raw.includes("STOR") || raw.includes("കഥ")) return "story";
    if (slugTest === "kerala-islamic-scholars" || (slugTest.includes("kerala") && slugTest.includes("scholar"))) return "kerala-islamic-scholars";
    if (slugTest === "islamic-scholars" || (slugTest.includes("scholar") && !slugTest.includes("kerala"))) return "islamic-scholars";
    if (slugTest === "general" || raw === "GENERAL") return "history";
    return "";
}

export function getArticleCategoryId(article) {
    const categoryIds = [article?.categoryId, article?.categorySlug, article?.category]
        .map(value => String(value || "").trim())
        .filter(Boolean);
    const normalizedId = categoryIds.map(normalizeStandardCategory).find(Boolean);
    if (normalizedId) return normalizedId;
    const category = String(article?.category || "").trim();
    const normalizedCategory = normalizeStandardCategory(category);
    if (normalizedCategory) return normalizedCategory;
    const validCategoryId = categoryIds.find(value => CATEGORY_ID_PATTERN.test(slugifyCategory(value)));
    if (validCategoryId) return slugifyCategory(validCategoryId);
    return slugifyCategory(category || categoryIds[0]) || "history";
}

function normalizeCategory(snapshot) {
    const data = snapshot.data();
    const slug = String(data.slug || snapshot.id).trim().toLowerCase();
    const name = String(data.name || "").trim();
    if (!name || !CATEGORY_ID_PATTERN.test(slug) || slug !== snapshot.id || slug === "general") return null;
    return {
        id: snapshot.id,
        slug,
        name,
        order: Number.isFinite(Number(data.order)) ? Number(data.order) : 0,
        visible: data.visible !== false
    };
}

function sortCategories(categories) {
    return categories.sort((a, b) =>
        a.order - b.order || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
}

export function mergeCategoryOptions(categories = [], contentRecords = [], defaultCategories = []) {
    const merged = new Map();
    const add = category => {
        const slug = String(category?.slug || category?.id || "").trim().toLowerCase();
        const name = String(category?.name || "").trim();
        if (!CATEGORY_ID_PATTERN.test(slug) || !name || slug === "general") return;
        const existing = merged.get(slug);
        merged.set(slug, {
            id: slug,
            slug,
            name: existing?.name || name,
            order: Number.isFinite(Number(category.order)) ? Number(category.order) : (existing?.order || 0),
            visible: existing ? existing.visible && category.visible !== false : category.visible !== false
        });
    };

    categories.forEach(add);
    let contentOrder = categories.reduce((max, category) =>
        Math.max(max, Number(category?.order) || 0), 0
    ) + 10;
    contentRecords.forEach(record => {
        if (!record || typeof record !== "object") return;
        const type = String(record.type || "").trim().toUpperCase();
        if (record.isChapter === true || type === "CHAPTER" || record.chapterIndex != null) return;
        const rawName = [record.category, record.categorySlug, record.categoryId]
            .map(value => String(value || "").trim())
            .find(Boolean);
        if (!rawName || rawName.toLowerCase() === "chapter") return;
        const slug = getArticleCategoryId(record);
        add({
            slug,
            name: STANDARD_CATEGORY_NAMES[slug] || rawName,
            order: contentOrder,
            visible: true
        });
        contentOrder += 10;
    });

    if (merged.size === 0) {
        defaultCategories.forEach(add);
    }
    return sortCategories([...merged.values()]);
}

function readCache() {
    for (const storeName of ["sessionStorage", "localStorage"]) {
        try {
            const store = typeof globalThis !== "undefined" ? globalThis[storeName] : null;
            if (!store) continue;
            const raw = store.getItem(CATEGORY_CACHE_KEY);
            if (!raw) continue;
            const cached = JSON.parse(raw);
            if (cached && Array.isArray(cached.categories)) {
                cached.categories = cached.categories.filter(cat => String(cat?.slug || cat?.id || "").trim().toLowerCase() !== "general");
                if (storeName === "localStorage" && typeof globalThis.sessionStorage !== "undefined") {
                    try { globalThis.sessionStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify(cached)); } catch (_) {}
                }
                return cached;
            }
        } catch (error) {
            console.warn("[Categories] Could not read the cached category list.", error);
        }
    }
    return null;
}

function saveCache(categories) {
    const payload = JSON.stringify({
        savedAt: Date.now(),
        categories
    });
    for (const storeName of ["sessionStorage", "localStorage"]) {
        try {
            const store = typeof globalThis !== "undefined" ? globalThis[storeName] : null;
            if (store) store.setItem(CATEGORY_CACHE_KEY, payload);
        } catch (error) {
            console.warn("[Categories] Could not cache the category list.", error);
        }
    }
}

export async function getCategories({ forceRefresh = false } = {}) {
    const cached = readCache();
    if (!forceRefresh && cached && Date.now() - cached.savedAt < CATEGORY_CACHE_TTL) {
        return cached.categories;
    }
    if (checkIsRateLimited({ scope: "normal" })) {
        return cached?.categories || [];
    }
    if (!forceRefresh && categoriesPromise) return categoriesPromise;

    const run = dedupeInFlight("firestore:categories", () =>
        enqueueFirestoreTask(() => getDocs(collection(db, "categories")), { priority: PRIORITY_NORMAL })
    )
        .then(snapshot => {
            const categories = sortCategories(snapshot.docs.map(normalizeCategory).filter(Boolean));
            if (categories.length === 0 && cached?.categories?.length > 0) {
                return cached.categories;
            }
            if (categories.length > 0) {
                saveCache(categories);
            }
            return categories;
        })
        .catch(error => {
            const msg = String(error?.code || error?.message || "").toLowerCase();
            const isRateLimit = msg.includes("429") || msg.includes("resource-exhausted") || msg.includes("quota");
            if (isRateLimit) {
                markFirestoreRateLimited(30000, { scope: "normal" });
            }
            if (cached?.categories?.length > 0) {
                if (!isRateLimit) {
                    console.warn("[Categories] Firestore read failed; using the cached category list.", error);
                }
                return cached.categories;
            }
            if (isRateLimit) return [];
            throw error;
        });

    if (!forceRefresh) {
        categoriesPromise = run.finally(() => {
            if (categoriesPromise === run) categoriesPromise = null;
        });
        return categoriesPromise;
    }
    return run;
}

export function cacheCategories(categories) {
    saveCache(sortCategories([...categories]));
}

export function getCachedCategories() {
    return readCache()?.categories || [];
}

export function getCachedCategoryName(value) {
    const slug = slugifyCategory(value);
    if (slug === "general") return "";
    const cached = readCache();
    return cached?.categories?.find(category => category.slug === slug)?.name || "";
}

export function isValidCategoryId(value) {
    return CATEGORY_ID_PATTERN.test(String(value || ""));
}
