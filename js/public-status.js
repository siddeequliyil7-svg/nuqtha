function normalizeExclusionText(value) {
    return String(value || "")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

const EXCLUDED_PUBLIC_IDS = new Set([
    "CT1yvXEEJIKiCFtpP5zW",
    "DQz4xGe5evx4dAzPT0pu",
    "dm6KW74DBcSQn3uf467X",
    "iMcQW3dyL1Es8LIL6CGg",
    "QLO71LUik9O7DTkQ7v3p",
    "imamumaarude-jeevitham",
    "imamumaarude-charithram",
    "badr-charitham"
]);

const EXCLUDED_PUBLIC_SLUGS = new Set([
    "columbus-history",
    "yathra",
    "srishtaavinte-drishtaantangalil-ninnu",
    "umarinte-thyaaga-jeevithavum-upadeshtaakkalum",
    "imamumaarude-jeevitham",
    "imamumaarude-charithram",
    "badr-charitham"
]);

const EXCLUDED_PUBLIC_TITLES = new Set([
    "കൊളംബസ്",
    "യാത്ര",
    "സൃഷ്ടാവിന്റെ ദൃഷ്ടാന്തങ്ങളിൽ നിന്ന് ഒരല്പം ഓർമ്മകളും",
    "ഉമറിന്റെ ത്യാഗ ജീവിതവും ഉപദേഷ്ടാക്കളും",
    "ഇമാമുമാരുടെ ജീവിതം",
    "ഇമാമുമാരുടെ ചരിത്രം",
    "ബദ്ർ ചരിത്രം"
].map(normalizeExclusionText));

export function isExcludedPublicRecord(record) {
    if (!record || typeof record !== "object") return false;
    const id = String(record.id || "").trim();
    if (id && EXCLUDED_PUBLIC_IDS.has(id)) return true;

    const cleanSlug = (value) => normalizeExclusionText(value)
        .replace(/^\/+|\/+$/g, "")
        .replace(/^(?:story|book)\//i, "");
    const recordSlug = cleanSlug(record.slug);
    if (recordSlug && EXCLUDED_PUBLIC_SLUGS.has(recordSlug)) return true;

    const recordTitle = normalizeExclusionText(record.title);
    if (recordTitle && EXCLUDED_PUBLIC_TITLES.has(recordTitle)) return true;

    if (isBookRecord(record)) {
        const bookSlug = cleanSlug(record.bookSlug);
        const bookTitle = normalizeExclusionText(record.bookTitle || record.bookName || record.name);
        if (bookSlug && EXCLUDED_PUBLIC_SLUGS.has(bookSlug)) return true;
        if (bookTitle && EXCLUDED_PUBLIC_TITLES.has(bookTitle)) return true;
    }

    return false;
}

export function isPubliclyPublished(record) {
    if (!record || typeof record !== "object") return false;
    if (isExcludedPublicRecord(record)) return false;
    if (record.status !== undefined && record.status !== null && String(record.status).trim() !== "") {
        return String(record.status).trim().toLowerCase() === "published";
    }
    return record.visible !== false;
}

function isBookRecord(record) {
    const type = String(record?.type || "").trim().toLowerCase();
    const category = String(record?.category || "").trim().toLowerCase();
    return record?.isBook === true ||
        ["book", "books", "free", "premium"].includes(type) ||
        ["book", "books", "premium book"].includes(category);
}

function getBookKeys(record) {
    return [record?.slug, record?.bookSlug, record?.title, record?.bookName]
        .map(value => String(value || "").trim().toLowerCase())
        .filter(Boolean);
}

function hasDraftBookParent(record, draftBookIds, draftBookKeys) {
    const parentIds = [record?.parentBookId, record?.bookId]
        .map(value => String(value || "").trim())
        .filter(Boolean);
    if (parentIds.some(id => draftBookIds.has(id))) return true;

    const type = String(record?.type || "").trim().toLowerCase();
    const category = String(record?.category || "").trim().toLowerCase();
    const isChapter = record?.isChapter === true ||
        type === "chapter" ||
        category === "chapter" ||
        (record?.chapterIndex !== undefined && record?.chapterIndex !== null);
    if (!isChapter) return false;
    return [record?.bookSlug, record?.bookName, record?.playlistName]
        .map(value => String(value || "").trim().toLowerCase())
        .some(key => key && draftBookKeys.has(key));
}

function matchesDraftBook(record, draftBookIds, draftBookKeys) {
    const id = String(record?.id || "").trim();
    return (id && draftBookIds.has(id)) ||
        getBookKeys(record).some(key => draftBookKeys.has(key));
}

export function filterPublicCollections(articles = [], books = []) {
    const articleRecords = Array.isArray(articles) ? articles : [];
    const bookRecords = Array.isArray(books) ? books : [];
    const draftBooks = [
        ...bookRecords,
        ...articleRecords.filter(isBookRecord)
    ].filter(record => !isPubliclyPublished(record));
    const draftBookIds = new Set(draftBooks.map(record => String(record.id || "").trim()).filter(Boolean));
    const draftBookKeys = new Set(draftBooks.flatMap(getBookKeys));

    return {
        articles: articleRecords.filter(record =>
            isPubliclyPublished(record) &&
            !isExcludedPublicRecord(record) &&
            !(isBookRecord(record) && matchesDraftBook(record, draftBookIds, draftBookKeys)) &&
            !hasDraftBookParent(record, draftBookIds, draftBookKeys)
        ),
        books: bookRecords.filter(record =>
            isPubliclyPublished(record) &&
            !isExcludedPublicRecord(record) &&
            !matchesDraftBook(record, draftBookIds, draftBookKeys) &&
            !hasDraftBookParent(record, draftBookIds, draftBookKeys)
        )
    };
}
