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

function scoreBookRichness(record) {
    if (!record || typeof record !== "object") return 0;
    let score = 0;
    const cover = String(
        record.imageUrl || record.coverUrl || record.coverImage || record.cover ||
        record.thumbnailUrl || record.thumbnail || record.thumbUrl || record.thumb || ""
    ).trim();
    if (cover && !cover.includes("placeholder.svg")) score += 40;
    if (Array.isArray(record.chapters) && record.chapters.length > 0) score += 25 + record.chapters.length * 4;
    if (Array.isArray(record.articleIds) && record.articleIds.length > 0) score += 20;
    if (String(record.content || record.introduction || record.intro || record.excerpt || "").trim().length > 20) score += 15;
    if (record._sourceCollection === "books") score += 10;
    if (record.id === "CCReELqC4iHBquoiwEPf") score -= 100;
    return score;
}

function mergeSingleBook(existing, incoming) {
    const existingWins = scoreBookRichness(existing) >= scoreBookRichness(incoming);
    const primary = existingWins ? existing : incoming;
    const secondary = existingWins ? incoming : existing;
    const pick = (...vals) => vals.find(v => typeof v === "string" ? Boolean(v.trim()) && !v.includes("placeholder.svg") : Boolean(v));
    return {
        ...secondary,
        ...primary,
        imageUrl: pick(primary.imageUrl, primary.coverUrl, primary.coverImage, primary.cover, secondary.imageUrl, secondary.coverUrl, secondary.coverImage, secondary.cover) || "",
        coverUrl: pick(primary.coverUrl, primary.imageUrl, secondary.coverUrl, secondary.imageUrl) || "",
        coverImage: pick(primary.coverImage, primary.imageUrl, secondary.coverImage, secondary.imageUrl) || "",
        thumbnailUrl: pick(primary.thumbnailUrl, primary.thumbnail, secondary.thumbnailUrl, secondary.thumbnail, primary.imageUrl, secondary.imageUrl) || "",
        chapters: Array.isArray(primary.chapters) && primary.chapters.length > 0
            ? primary.chapters
            : (Array.isArray(secondary.chapters) ? secondary.chapters : []),
        type: "BOOK",
        isBook: true
    };
}

export function mergeBookRecords(articleRecords, bookRecords) {
    const items = Array.isArray(articleRecords) ? [...articleRecords] : [];
    if (!Array.isArray(bookRecords)) return items;

    bookRecords.forEach(book => {
        if (!book) return;
        const normalizedBookName = normalizeBookName(book.title || book.bookName);
        const dupIndex = items.findIndex(item => {
            const type = String(item?.type || "").toUpperCase();
            const isBook = type === "BOOK" || type === "FREE" || type === "PREMIUM" || item?.isBook === true;
            if (!isBook) return false;
            return item.id === book.id ||
                (book.slug && item.slug && item.slug === book.slug) ||
                (normalizedBookName && normalizeBookName(item.title || item.bookName) === normalizedBookName);
        });
        if (dupIndex === -1) {
            items.push({
                ...book,
                type: "BOOK",
                isBook: true,
                _sourceCollection: "books"
            });
        } else {
            items[dupIndex] = mergeSingleBook(items[dupIndex], {
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

function hasConflictingExplicitBook(article, book) {
    if (!article || !book) return false;
    const targetIds = new Set([book.id, book.bookId, book.docId, book.documentId].map(v => String(v || "").trim()).filter(Boolean));
    const targetNames = new Set([book.slug, book.bookSlug, book.title, book.bookName].map(normalizeBookName).filter(Boolean));
    const explicitBookSlug = normalizeBookName(article.bookSlug);
    const targetSlugs = [book.slug, book.bookSlug, book.id].map(normalizeBookName).filter(Boolean);

    // If the article explicitly specifies a bookSlug, that takes precedence
    if (explicitBookSlug && targetSlugs.length > 0) {
        if (!targetSlugs.includes(explicitBookSlug)) {
            return true;
        }
        // Explicitly matches this target book by slug (e.g. Umayyad chapters cross-linked to Abbasid ID)
        return false;
    }

    const explicitIds = [article.bookId, article.parentBookId]
        .map(v => chapterReferenceId(v) || normalizeBookName(v))
        .filter(Boolean);
    if (explicitIds.length > 0 && !explicitIds.some(id => targetIds.has(id) || targetNames.has(normalizeBookName(id)))) {
        return true;
    }
    return false;
}

function isJunkChapterDoc(article) {
    if (!article || typeof article !== "object") return true;
    const title = String(article.title || "").trim();
    if (!title || /^[\s.\-–—_…•·]+$/.test(title)) return true;
    if (title.length < 2 && (!article.content || article.content.length < 20)) return true;
    return false;
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
        if (!article || !article.id || article.id === book.id || article.type === "BOOK" || isJunkChapterDoc(article)) return false;
        if (hasConflictingExplicitBook(article, book)) return false;
        if (chapterOrders.has(article.id)) return true;

        const linkedBookId = String(article.bookId || article.parentBookId || "").trim();
        if (bookId && linkedBookId === bookId) return true;

        const explicitBookSlug = normalizeBookName(article.bookSlug);
        const targetSlugs = [book.slug, book.bookSlug].map(normalizeBookName).filter(Boolean);
        if (explicitBookSlug && targetSlugs.includes(explicitBookSlug)) return true;

        const linkedNames = [article.bookName, article.playlistName].map(normalizeBookName).filter(Boolean);
        return names.some(bookName => linkedNames.some(linkedName => linkedName === bookName));
    });

    // Deduplicate duplicate articles with same title/slug preferring explicit bookId or richer content/image
    const deduplicated = [];
    const seenTitles = new Map();
    for (const ch of chapters) {
        const normTitle = normalizeBookName(ch.title);
        if (!normTitle) continue;
        if (seenTitles.has(normTitle)) {
            const existing = seenTitles.get(normTitle);
            const existingScore = (existing.bookId === bookId ? 20 : 0) + (existing.imageUrl ? 10 : 0) + (existing.content?.length || 0);
            const chScore = (ch.bookId === bookId ? 20 : 0) + (ch.imageUrl ? 10 : 0) + (ch.content?.length || 0);
            if (chScore > existingScore) {
                const idx = deduplicated.indexOf(existing);
                if (idx >= 0) deduplicated[idx] = ch;
                seenTitles.set(normTitle, ch);
            }
        } else {
            seenTitles.set(normTitle, ch);
            deduplicated.push(ch);
        }
    }

    return deduplicated.sort((first, second) => {
        // Introduction ("ആമുഖം") naturally sorts first
        const isIntroFirst = normalizeBookName(first.title) === normalizeBookName("ആമുഖം");
        const isIntroSecond = normalizeBookName(second.title) === normalizeBookName("ആമുഖം");
        if (isIntroFirst && !isIntroSecond) return -1;
        if (!isIntroFirst && isIntroSecond) return 1;

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
