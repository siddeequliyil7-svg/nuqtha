function normalizeBookName(value) {
    return String(value || "")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function chapterReferenceId(reference) {
    if (typeof reference === "string") return reference.split("/").pop();
    if (!reference || typeof reference !== "object") return "";
    return String(reference.articleId || reference.id || reference.docId || reference.reference || "").split("/").pop();
}

export function mergeBookRecords(articleRecords, bookRecords) {
    const items = Array.isArray(articleRecords) ? [...articleRecords] : [];
    if (!Array.isArray(bookRecords)) return items;

    bookRecords.forEach(book => {
        if (!book) return;
        const duplicate = items.some(item => {
            const type = String(item?.type || "").toUpperCase();
            const isBook = type === "BOOK" || type === "FREE" || type === "PREMIUM" || item?.isBook === true;
            return isBook && (item.id === book.id || (book.slug && item.slug === book.slug));
        });
        if (!duplicate) {
            items.push({
                ...book,
                type: "BOOK",
                isBook: true,
                _sourceCollection: "books"
            });
        }
    });

    return items;
}

export function getBookChapterIds(books) {
    const chapterIds = new Set();
    if (!Array.isArray(books)) return chapterIds;

    books.forEach(book => {
        if (!book) return;
        const type = String(book.type || "").toUpperCase();
        if (type !== "BOOK" && type !== "FREE" && type !== "PREMIUM" && book.isBook !== true) return;

        const references = [
            ...(Array.isArray(book.chapters) ? book.chapters : []),
            ...(Array.isArray(book.articleIds) ? book.articleIds : [])
        ];
        references.forEach(reference => {
            const id = chapterReferenceId(reference);
            if (id && id !== book.id) chapterIds.add(id);
        });
    });

    return chapterIds;
}

function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getBookChapters(book, articles = []) {
    if (!book || !Array.isArray(articles)) return [];

    const bookId = String(book.id || book.bookId || "").trim();
    const names = [book.bookName, book.title].map(normalizeBookName).filter(Boolean);
    const chapterOrders = new Map();
    const references = [
        ...(Array.isArray(book.chapters) ? book.chapters : []),
        ...(Array.isArray(book.articleIds) ? book.articleIds : [])
    ];

    for (const [index, reference] of references.entries()) {
        const id = chapterReferenceId(reference);
        if (id) {
            const order = Number(reference && typeof reference === "object" ? reference.order : NaN);
            chapterOrders.set(id, Number.isFinite(order) ? order : index + 1);
        }
    }

    const chapters = articles.filter(article => {
        if (!article || !article.id || article.id === book.id || article.type === "BOOK") return false;
        if (chapterOrders.has(article.id)) return true;

        const linkedBookId = String(article.bookId || article.parentBookId || "").trim();
        if (bookId && linkedBookId === bookId) return true;

        const linkedNames = [article.bookName, article.playlistName].map(normalizeBookName).filter(Boolean);
        return names.some(bookName => linkedNames.some(linkedName =>
            linkedName === bookName || (bookName.length >= 3 && linkedName.includes(bookName)) || (linkedName.length >= 3 && bookName.includes(linkedName))
        ));
    });

    return chapters.sort((first, second) => {
        const firstOrder = Number(first.order ?? chapterOrders.get(first.id) ?? first.priority ?? Number.MAX_SAFE_INTEGER);
        const secondOrder = Number(second.order ?? chapterOrders.get(second.id) ?? second.priority ?? Number.MAX_SAFE_INTEGER);
        if (firstOrder !== secondOrder) return firstOrder - secondOrder;
        return timestampMillis(second.createdAt) - timestampMillis(first.createdAt);
    });
}

export function getBookArticleLinkFields(book, fallbackName, order) {
    const chapterOrder = Number(order) || 1;
    const fields = {
        bookName: String(book?.bookName || book?.title || fallbackName || "").trim(),
        priority: chapterOrder,
        order: chapterOrder
    };
    const bookId = String(book?.id || book?.bookId || "").trim();
    if (bookId) fields.bookId = bookId;
    return fields;
}

export function decodeFirestoreValue(value) {
    if (!value || typeof value !== "object") return value;
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("referenceValue" in value) return value.referenceValue;
    if ("bytesValue" in value) return value.bytesValue;
    if ("geoPointValue" in value) return value.geoPointValue;
    if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if ("mapValue" in value) {
        return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, fieldValue]) => [key, decodeFirestoreValue(fieldValue)]));
    }
    return value;
}

export function decodeFirestoreFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}
