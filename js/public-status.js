export function isPubliclyPublished(record) {
    if (!record || typeof record !== "object") return false;
    if (record.status === undefined || record.status === null) return true;
    return String(record.status).trim().toLowerCase() === "published";
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
            !(isBookRecord(record) && matchesDraftBook(record, draftBookIds, draftBookKeys)) &&
            !hasDraftBookParent(record, draftBookIds, draftBookKeys)
        ),
        books: bookRecords.filter(record =>
            isPubliclyPublished(record) &&
            !matchesDraftBook(record, draftBookIds, draftBookKeys) &&
            !hasDraftBookParent(record, draftBookIds, draftBookKeys)
        )
    };
}
