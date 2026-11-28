import { collection, db, doc, getDocs, serverTimestamp, writeBatch } from "./firebase-config.js";
import { deleteDoc, setDoc } from "./js/admin-write-guard.js";
import { runAction } from "./js/admin-actions.js";
import { FALLBACK_ARTICLE_ITEMS } from "./fallback-data.js";
import { readArticlesListCache } from "./js/firestore-cache.js";
import { cacheCategories, getArticleCategoryId, getCachedCategories, getCategories, isValidCategoryId, mergeCategoryOptions, slugifyCategory } from "./js/category-store.js";

const LEGACY_CATEGORIES = [
    { name: "History", slug: "history", order: 10 },
    { name: "Study", slug: "study", order: 20 },
    { name: "Stories", slug: "story", order: 30 }
];
const MAX_BATCH_WRITES = 400;

function isArticleCategoryRecord(data) {
    const type = String(data.type || "").trim().toUpperCase();
    const category = String(data.category || "").trim().toLowerCase();
    return data.isChapter !== true &&
        type !== "CHAPTER" &&
        category !== "chapter" &&
        data.chapterIndex == null &&
        type !== "BOOK" &&
        type !== "FREE" &&
        type !== "PREMIUM" &&
        data.isBook !== true &&
        !(Array.isArray(data.chapters) && data.chapters.length > 0) &&
        !["book", "books", "premium book"].includes(category);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function getFallbackCategoryArticles() {
    if (Array.isArray(window.safeArticles) && window.safeArticles.length > 0) {
        return window.safeArticles;
    }
    for (const storeName of ["sessionStorage", "localStorage"]) {
        try {
            const store = typeof globalThis !== "undefined" ? globalThis[storeName] : null;
            const raw = store?.getItem("nuqtha_cached_articles");
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (_) {}
    }
    const listCache = readArticlesListCache({ allowExpired: true });
    if (Array.isArray(listCache?.data) && listCache.data.length > 0) {
        return listCache.data;
    }
    return Array.isArray(FALLBACK_ARTICLE_ITEMS) ? FALLBACK_ARTICLE_ITEMS : [];
}

function notifyCategoryChange() {
    window.dispatchEvent(new CustomEvent("nuqtha:categories-updated"));
}

export async function initCategoryAdmin(root) {
    if (!root || root.dataset.categoriesInitialized === "true") return;
    root.dataset.categoriesInitialized = "true";
    root.innerHTML = `
        <section class="category-admin-panel">
            <header>
                <h2>Category Management</h2>
                <p>Create, reorder, hide, or remove categories. Category slugs stay fixed after creation.</p>
            </header>
            <form id="category-admin-form" class="category-admin-form" novalidate>
                <input type="hidden" name="editingSlug">
                <label>Name <input name="name" required maxlength="80" autocomplete="off"></label>
                <label>English slug <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="80" autocomplete="off" placeholder="kerala-islamic-scholars"></label>
                <label>Order <input name="order" type="number" step="1" value="0"></label>
                <label class="category-visible-option"><input name="visible" type="checkbox" checked> Visible</label>
                <div class="category-form-actions">
                    <button type="submit" class="category-primary-button">Save category</button>
                    <button type="button" id="category-cancel-edit" class="category-secondary-button hidden">Cancel edit</button>
                </div>
                <p id="category-form-status" role="status" aria-live="polite"></p>
            </form>
            <div class="category-migration">
                <div>
                    <h3>Legacy category migration</h3>
                    <p>Add missing categories, mark legacy content as published, and set categoryId on older articles. Existing category values are retained.</p>
                </div>
                <button type="button" id="category-migrate-btn" class="category-secondary-button">Run one-time migration</button>
                <p id="category-migration-status" role="status" aria-live="polite"></p>
            </div>
            <div id="category-admin-list" class="category-admin-list" aria-live="polite"></div>
        </section>
    `;

    const form = root.querySelector("#category-admin-form");
    const list = root.querySelector("#category-admin-list");
    const formStatus = root.querySelector("#category-form-status");
    const migrationStatus = root.querySelector("#category-migration-status");
    const nameInput = form.elements.namedItem("name");
    const slugInput = form.elements.namedItem("slug");
    const orderInput = form.elements.namedItem("order");
    const visibleInput = form.elements.namedItem("visible");
    const editingInput = form.elements.namedItem("editingSlug");
    const cancelEditButton = root.querySelector("#category-cancel-edit");
    const migrationButton = root.querySelector("#category-migrate-btn");

    function showFormMessage(message, isError = false) {
        formStatus.textContent = message;
        formStatus.classList.toggle("is-error", isError);
    }

    function renderList(categories, usageCounts) {
        if (categories.length === 0) {
            list.innerHTML = "<p>No categories yet. Add one above.</p>";
            return;
        }
        list.innerHTML = categories.map(category => {
            const count = usageCounts.get(category.slug) || 0;
            return `
                <article class="category-admin-row">
                    <div class="category-admin-details">
                        <strong>${escapeHtml(category.name)}</strong>
                        <span>${escapeHtml(category.slug)} · ${count} article${count === 1 ? "" : "s"} · ${category.visible ? "Visible" : "Hidden"}</span>
                    </div>
                    <div class="category-admin-actions">
                        <button type="button" data-category-edit="${escapeHtml(category.slug)}">Edit</button>
                        <button type="button" data-category-toggle="${escapeHtml(category.slug)}" data-visible="${category.visible ? "true" : "false"}">${category.visible ? "Hide" : "Show"}</button>
                        <button type="button" data-category-delete="${escapeHtml(category.slug)}">Delete</button>
                    </div>
                </article>
            `;
        }).join("");
    }

    async function refresh() {
        const [catResult, articleResult] = await Promise.allSettled([
            getCategories({ forceRefresh: true }),
            getDocs(collection(db, "articles"))
        ]);
        const cachedCats = getCachedCategories();
        const fallbackArticles = getFallbackCategoryArticles();
        let categories = catResult.status === "fulfilled" && Array.isArray(catResult.value) && catResult.value.length > 0
            ? catResult.value
            : cachedCats;
        const articleRecords = articleResult.status === "fulfilled" && articleResult.value?.docs?.length > 0
            ? articleResult.value.docs.map(snapshot => snapshot.data())
            : fallbackArticles;
        if (!Array.isArray(categories) || categories.length === 0) {
            categories = mergeCategoryOptions([], articleRecords, LEGACY_CATEGORIES);
        }
        const usageCounts = new Map();
        articleRecords.forEach(data => {
            if (!data || !isArticleCategoryRecord(data)) return;
            const id = getArticleCategoryId(data);
            if (id) usageCounts.set(id, (usageCounts.get(id) || 0) + 1);
        });
        renderList(categories, usageCounts);
        notifyCategoryChange();
        return { categories, usageCounts };
    }

    function resetForm() {
        form.reset();
        editingInput.value = "";
        orderInput.value = "0";
        visibleInput.checked = true;
        slugInput.readOnly = false;
        delete slugInput.dataset.touched;
        cancelEditButton.classList.add("hidden");
        form.querySelector('button[type="submit"]').textContent = "Save category";
    }

    nameInput.addEventListener("input", () => {
        if (!editingInput.value && !slugInput.dataset.touched) {
            slugInput.value = /[a-z0-9]/i.test(nameInput.value) ? slugifyCategory(nameInput.value) : "";
        }
    });
    slugInput.addEventListener("input", () => {
        if (!editingInput.value) slugInput.dataset.touched = "true";
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const slug = slugInput.value.trim().toLowerCase();
        const editingSlug = editingInput.value;
        if (!name || !isValidCategoryId(slug)) {
            showFormMessage("Enter a category name and a valid English slug.", true);
            const invalidInput = !name ? nameInput : slugInput;
            invalidInput.classList.add("border-rose-500");
            invalidInput.focus();
            invalidInput.addEventListener("input", () => invalidInput.classList.remove("border-rose-500"), { once: true });
            return;
        }
        if (!editingSlug && slug !== slugifyCategory(slug)) {
            showFormMessage("Slugs may contain lowercase English letters, numbers, and hyphens.", true);
            slugInput.classList.add("border-rose-500");
            slugInput.focus();
            slugInput.addEventListener("input", () => slugInput.classList.remove("border-rose-500"), { once: true });
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        showFormMessage("Saving category...");
        const result = await runAction(submitButton, async () => {
            const categories = await getCategories({ forceRefresh: true });
            if (categories.some(category => category.slug === slug && category.slug !== editingSlug)) {
                showFormMessage("That category slug already exists. Choose a unique slug.", true);
                slugInput.classList.add("border-rose-500");
                slugInput.focus();
                slugInput.addEventListener("input", () => slugInput.classList.remove("border-rose-500"), { once: true });
                return false;
            }
            const targetSlug = editingSlug || slug;
            await setDoc(doc(db, "categories", targetSlug), {
                name,
                slug: targetSlug,
                order: Number.parseInt(orderInput.value, 10) || 0,
                visible: visibleInput.checked,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            await refresh();
            resetForm();
            showFormMessage("Category saved.");
            return true;
        }, {
            event,
            form,
            loadingText: "Saving category...",
            successMsg: "Category saved.",
            successButtonText: "Saved",
            onTimeout() {
                showFormMessage("Category save is taking longer than usual and may still complete. Check before retrying.");
            }
        });
        if (result.error) {
            console.error("[Admin Categories] Could not save category.", result.error);
            showFormMessage("Could not save the category. Check your admin access and Firestore rules.", true);
        }
    });

    cancelEditButton.addEventListener("click", resetForm);
    list.addEventListener("click", async event => {
        const button = event.target.closest("button");
        if (!button) return;
        const slug = button.dataset.categoryEdit || button.dataset.categoryToggle || button.dataset.categoryDelete;
        if (!slug) return;
        button.disabled = true;
        try {
            const { categories, usageCounts } = await refresh();
            const category = categories.find(item => item.slug === slug);
            if (!category) return;

            if (button.dataset.categoryEdit) {
                editingInput.value = slug;
                nameInput.value = category.name;
                slugInput.value = slug;
                slugInput.readOnly = true;
                orderInput.value = String(category.order);
                visibleInput.checked = category.visible;
                cancelEditButton.classList.remove("hidden");
                form.querySelector('button[type="submit"]').textContent = "Update category";
                nameInput.focus();
            } else if (button.dataset.categoryToggle) {
                await setDoc(doc(db, "categories", slug), {
                    visible: button.dataset.visible !== "true",
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                await refresh();
            } else if (button.dataset.categoryDelete) {
                const count = usageCounts.get(slug) || 0;
                if (count > 0) {
                    migrationStatus.textContent = `${count} article${count === 1 ? "" : "s"} use this category. Hide it instead of deleting it.`;
                    return;
                }
                if (!window.confirm(`Delete the empty category "${category.name}"?`)) return;
                await deleteDoc(doc(db, "categories", slug));
                await refresh();
            }
        } catch (error) {
            console.error("[Admin Categories] Could not update category.", error);
            migrationStatus.textContent = "Could not update the category. Check your admin access and Firestore rules.";
            migrationStatus.classList.add("is-error");
        } finally {
            button.disabled = false;
        }
    });

    migrationButton.addEventListener("click", async () => {
        migrationButton.disabled = true;
        migrationStatus.classList.remove("is-error");
        migrationStatus.textContent = "Scanning legacy articles...";
        let committed = 0;
        try {
            const [categories, articles, books] = await Promise.all([
                getCategories({ forceRefresh: true }),
                getDocs(collection(db, "articles")),
                getDocs(collection(db, "books"))
            ]);
            const categoryById = new Map(categories.map(category => [category.slug, category]));
            const categoriesToCreate = new Map();
            const articleUpdates = [];
            const legacyNames = new Map(LEGACY_CATEGORIES.map(category => [category.slug, category.name]));
            let skippedArticles = 0;

            articles.docs.forEach(snapshot => {
                const data = snapshot.data();
                if (!isArticleCategoryRecord(data)) {
                    if (!data.status) {
                        articleUpdates.push({
                            ref: snapshot.ref,
                            update: {
                                status: data.visible === false ? "draft" : "published",
                                ...(data.visible === false ? {} : { publishedAt: serverTimestamp() })
                            }
                        });
                    }
                    return;
                }
                const rawCategoryId = String(data.categoryId || "").trim();
                const oldCategoryId = rawCategoryId.toLowerCase();
                const oldName = String(data.category || oldCategoryId).trim();
                const slug = isValidCategoryId(oldCategoryId) ? oldCategoryId : slugifyCategory(oldName);
                if (!isValidCategoryId(slug)) {
                    skippedArticles += 1;
                    return;
                }
                if (!legacyNames.has(slug)) legacyNames.set(slug, oldName);
                if (!categoryById.has(slug)) {
                    categoriesToCreate.set(slug, {
                        name: legacyNames.get(slug) || oldName || slug,
                        slug,
                        order: 100,
                        visible: true
                    });
                    categoryById.set(slug, { slug });
                }
                const update = {};
                if (rawCategoryId !== slug) update.categoryId = slug;
                if (!data.status) {
                    update.status = data.visible === false ? "draft" : "published";
                    if (data.visible !== false) update.publishedAt = serverTimestamp();
                }
                if (Object.keys(update).length) articleUpdates.push({ ref: snapshot.ref, update });
            });

            const legacyBooks = books.docs.filter(snapshot => !snapshot.data().status);

            LEGACY_CATEGORIES.forEach(category => {
                if (!categoryById.has(category.slug)) {
                    categoriesToCreate.set(category.slug, { ...category, visible: true });
                    categoryById.set(category.slug, { slug: category.slug });
                }
            });

            const writes = [
                ...[...categoriesToCreate].map(([slug, data]) => batch => batch.set(doc(db, "categories", slug), data, { merge: true })),
                ...articleUpdates.map(({ ref, update }) => batch => batch.update(ref, update)),
                ...legacyBooks.map(snapshot => batch => batch.update(snapshot.ref, {
                    status: snapshot.data().visible === false ? "draft" : "published",
                    ...(snapshot.data().visible === false ? {} : { publishedAt: serverTimestamp() })
                }))
            ];
            for (let index = 0; index < writes.length; index += MAX_BATCH_WRITES) {
                const batch = writeBatch(db);
                writes.slice(index, index + MAX_BATCH_WRITES).forEach(write => write(batch));
                const result = await runAction(migrationButton, () => batch.commit(), {
                    loadingText: "Saving...",
                    successMsg: "Category migration batch saved."
                });
                if (!result.ok) throw result.error || new Error("Category migration batch was not saved.");
                committed += Math.min(MAX_BATCH_WRITES, writes.length - index);
            }
            cacheCategories(await getCategories({ forceRefresh: true }));
            await refresh();
            migrationStatus.textContent = `Migration complete: created ${categoriesToCreate.size} categories, updated ${articleUpdates.length} articles, and migrated ${legacyBooks.length} legacy books (${committed} Firestore writes). Skipped ${skippedArticles} articles without a usable English category slug.`;
        } catch (error) {
            console.error("[Admin Categories] Legacy migration failed.", error);
            migrationStatus.textContent = `Migration failed after ${committed} Firestore writes. Check admin access, Firestore rules, and network, then retry.`;
            migrationStatus.classList.add("is-error");
        } finally {
            migrationButton.disabled = false;
        }
    });

    try {
        await refresh();
    } catch (error) {
        console.error("[Admin Categories] Could not load categories.", error);
        list.textContent = "Could not load categories. Check Firestore access and try again.";
    }
}
