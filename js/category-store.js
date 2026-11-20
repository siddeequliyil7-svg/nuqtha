import { collection, db, getDocs } from "../firebase-config.js";
import { transliterateMalayalam } from "../schema-validator.js";

const CATEGORY_CACHE_KEY = "nuqtha:categories:v1";
const CATEGORY_CACHE_TTL = 5 * 60 * 1000;
const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let categoriesPromise = null;

export function slugifyCategory(value) {
    return transliterateMalayalam(String(value || "").trim().toLowerCase())
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function getArticleCategoryId(article) {
    return String(article?.categoryId || "").trim() || slugifyCategory(article?.category || "");
}

function normalizeCategory(snapshot) {
    const data = snapshot.data();
    const slug = String(data.slug || snapshot.id).trim().toLowerCase();
    const name = String(data.name || "").trim();
    if (!name || !CATEGORY_ID_PATTERN.test(slug) || slug !== snapshot.id) return null;
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

function readCache() {
    try {
        const cached = JSON.parse(sessionStorage.getItem(CATEGORY_CACHE_KEY) || "null");
        if (cached && Array.isArray(cached.categories)) return cached;
    } catch (error) {
        console.warn("[Categories] Could not read the cached category list.", error);
    }
    return null;
}

function saveCache(categories) {
    try {
        sessionStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            categories
        }));
    } catch (error) {
        console.warn("[Categories] Could not cache the category list.", error);
    }
}

export async function getCategories({ forceRefresh = false } = {}) {
    const cached = readCache();
    if (!forceRefresh && cached && Date.now() - cached.savedAt < CATEGORY_CACHE_TTL) {
        return cached.categories;
    }
    if (categoriesPromise) return categoriesPromise;

    categoriesPromise = getDocs(collection(db, "categories"))
        .then(snapshot => {
            const categories = sortCategories(snapshot.docs.map(normalizeCategory).filter(Boolean));
            saveCache(categories);
            return categories;
        })
        .catch(error => {
            if (cached) {
                console.warn("[Categories] Firestore read failed; using the cached category list.", error);
                return cached.categories;
            }
            throw error;
        })
        .finally(() => {
            categoriesPromise = null;
        });
    return categoriesPromise;
}

export function cacheCategories(categories) {
    saveCache(sortCategories([...categories]));
}

export function getCachedCategories() {
    return readCache()?.categories || [];
}

export function getCachedCategoryName(value) {
    const slug = slugifyCategory(value);
    const cached = readCache();
    return cached?.categories?.find(category => category.slug === slug)?.name || "";
}

export function isValidCategoryId(value) {
    return CATEGORY_ID_PATTERN.test(String(value || ""));
}
