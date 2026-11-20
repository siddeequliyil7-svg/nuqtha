import { collection, db, getDocs } from "../firebase-config.js";
import { transliterateMalayalam } from "../schema-validator.js";

const CATEGORY_CACHE_KEY = "nuqtha:categories:v1";
const CATEGORY_CACHE_TTL = 5 * 60 * 1000;
const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STANDARD_CATEGORY_NAMES = {
    history: "History",
    study: "Study",
    story: "Stories",
    general: "General"
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
    const category = String(value || "").trim().toUpperCase();
    if (category === "HISTORY" || category.includes("HIST") || category.includes("ചരിത്ര")) return "history";
    if (category === "STUDY" || category.includes("STUD") || category.includes("പഠന")) return "study";
    if (category === "STORY" || category.includes("STOR") || category.includes("കഥ")) return "story";
    if (category === "GENERAL") return "general";
    return "";
}

export function getArticleCategoryId(article) {
    const categoryIds = [article?.categoryId, article?.categorySlug]
        .map(value => String(value || "").trim())
        .filter(Boolean);
    const normalizedId = categoryIds.map(normalizeStandardCategory).find(Boolean);
    if (normalizedId) return normalizedId;
    const category = String(article?.category || "").trim();
    const normalizedCategory = normalizeStandardCategory(category);
    if (normalizedCategory) return normalizedCategory;
    const validCategoryId = categoryIds.find(value => CATEGORY_ID_PATTERN.test(value.toLowerCase()));
    if (validCategoryId) return validCategoryId.toLowerCase();
    return slugifyCategory(category || categoryIds[0]) || "general";
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

export function mergeCategoryOptions(categories = [], contentRecords = [], defaultCategories = []) {
    const merged = new Map();
    const add = category => {
        const slug = String(category?.slug || category?.id || "").trim().toLowerCase();
        const name = String(category?.name || "").trim();
        if (!CATEGORY_ID_PATTERN.test(slug) || !name) return;
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

    if (merged.size === 0 || (merged.size === 1 && merged.has("general"))) {
        defaultCategories.forEach(add);
    }
    return sortCategories([...merged.values()]);
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
