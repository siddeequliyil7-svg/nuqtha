import { getBookArticleLinkFields, getBookChapters, getBookChapterIds, mergeBookRecords } from "../book-data.js";
import {
    areSameBookByTitle,
    filterAndSortChapters,
    getBookChapters as fetchBookChapters,
    getBookPageLightData,
    getRelatedBooks,
    isArticleInBook,
    parseFirestoreRestDoc,
    readBookChapterListCache,
    saveBookChapterListCache
} from "../js/book-data.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Book chapter relationships", () => {
    const articles = [
        { id: "legacy-2", type: "ARTICLE", bookName: "Sample Book", priority: 2 },
        { id: "linked-id", type: "ARTICLE", bookId: "book-1", order: 1 },
        { id: "legacy-1", type: "ARTICLE", playlistName: "Sample Book", priority: 1 },
        { id: "not-linked", type: "ARTICLE", title: "Standalone" },
        { id: "book-1", type: "BOOK", title: "Sample Book" }
    ];

    it("matches bookId, bookName, and playlistName links in order", () => {
        const book = { id: "book-1", title: "Sample Book", bookName: "Sample Book" };
        expect(getBookChapters(book, articles).map(article => article.id)).to.deep.equal([
            "linked-id", "legacy-1", "legacy-2"
        ]);
    });

    it("supports ordered chapters arrays and empty books", () => {
        const book = { id: "book-2", title: "Another", chapters: [{ articleId: "legacy-2", order: 1 }, "legacy-1"] };
        expect(getBookChapters(book, articles).map(article => article.id)).to.deep.equal(["legacy-2", "legacy-1"]);
        expect(getBookChapters({ id: "empty", title: "Empty" }, articles)).to.deep.equal([]);
    });

    it("does not fuzzy-match similarly named books and follows the canonical chapter array order", () => {
        const book = { id: "book-1", title: "Sample Book", chapters: ["legacy-2", "legacy-1"] };
        const similarTitleArticle = { id: "unrelated", type: "ARTICLE", bookName: "Sample Book Companion" };
        const linkedChapters = articles.filter(article => ["legacy-2", "legacy-1"].includes(article.id));

        expect(isArticleInBook(similarTitleArticle, book)).to.equal(false);
        expect(filterAndSortChapters(book, [...linkedChapters, similarTitleArticle]).map(article => article.id))
            .to.deep.equal(["legacy-2", "legacy-1"]);
    });

    it("identifies chapter IDs listed by books even when chapter articles have no book link fields", () => {
        const books = [
            { id: "book-3", type: "BOOK", chapters: ["chapters/chapter-1", { articleId: "chapter-2" }] },
            { id: "regular-article", type: "ARTICLE", chapters: ["not-a-chapter"] }
        ];
        const chapterIds = getBookChapterIds(books);

        expect(chapterIds.has("chapter-1")).to.equal(true);
        expect(chapterIds.has("chapter-2")).to.equal(true);
        expect(chapterIds.has("not-a-chapter")).to.equal(false);
    });

    it("matches chapters through bookSlug, bookTitle, book references, and parent reference IDs", () => {
        const book = { id: "book-4", slug: "sample-book", title: "Sample Book" };
        const chapters = [
            { id: "by-slug", type: "ARTICLE", bookSlug: "sample-book" },
            { id: "by-title", type: "ARTICLE", bookTitle: "Sample Book" },
            { id: "by-reference", type: "ARTICLE", book: "projects/nuqtha/databases/(default)/documents/books/book-4" },
            { id: "by-parent-reference", type: "ARTICLE", parentBookId: "projects/nuqtha/databases/(default)/documents/books/book-4" }
        ];

        expect(chapters.every(chapter => isArticleInBook(chapter, book))).to.equal(true);
        expect(filterAndSortChapters(book, chapters).map(chapter => chapter.id)).to.have.members([
            "by-slug", "by-title", "by-reference", "by-parent-reference"
        ]);
    });

    it("uses articleIds and reference paths as explicit chapter membership", () => {
        const book = {
            id: "book-5",
            articleIds: ["projects/nuqtha/databases/(default)/documents/articles/chapter-5"]
        };
        const chapter = { id: "chapter-5", type: "ARTICLE" };

        expect(isArticleInBook(chapter, book)).to.equal(true);
        expect(filterAndSortChapters(book, [chapter]).map(item => item.id)).to.deep.equal(["chapter-5"]);
    });

    it("includes every linked article even when only some are explicitly marked as chapters", () => {
        const book = { id: "book-6", title: "Mixed Chapter Markers" };
        const chapters = [
            { id: "marked", type: "CHAPTER", bookId: "book-6", order: 1 },
            { id: "unmarked", type: "ARTICLE", bookId: "book-6", order: 2 }
        ];

        expect(filterAndSortChapters(book, chapters).map(chapter => chapter.id)).to.deep.equal(["marked", "unmarked"]);
    });

    it("includes books from the books collection without duplicating article-backed books", () => {
        const articleBook = { id: "shared-id", title: "Article Book", type: "BOOK" };
        const slugArticleBook = { id: "article-by-slug", slug: "same-book", type: "BOOK" };
        const collectionBook = { id: "book-2", title: "Collection Book" };
        const merged = mergeBookRecords([articleBook, slugArticleBook], [
            { ...articleBook, title: "Duplicate Book" },
            { id: "book-by-slug", slug: "same-book", title: "Duplicate by Slug" },
            collectionBook
        ]);

        expect(merged).to.have.length(3);
        expect(merged[0].title).to.equal("Article Book");
        expect(merged[1].id).to.equal("article-by-slug");
        expect(merged[2]).to.include({
            id: "book-2",
            type: "BOOK",
            isBook: true,
            _sourceCollection: "books"
        });
    });

    it("writes additive bookId and explicit order without dropping legacy fields", () => {
        expect(getBookArticleLinkFields({ id: "book-1", title: "Sample Book" }, "", 3)).to.deep.equal({
            bookName: "Sample Book",
            bookId: "book-1",
            priority: 3,
            order: 3
        });
    });

    it("uses a real cover alias instead of a placeholder when building light book data", () => {
        const coverUrl = "https://cdn.example.test/book-cover.webp";
        const lightData = getBookPageLightData({
            id: "book-1",
            imageUrl: "/cover-placeholder.svg",
            coverImage: coverUrl,
            category: "Premium Book",
            price: "49",
            isPremium: true,
            _imageCollection: "books",
            _imageDocId: "book-1"
        });

        expect(lightData.coverUrl).to.equal(coverUrl);
        expect(lightData.category).to.equal("Premium Book");
        expect(lightData.price).to.equal(49);
        expect(lightData.isPremium).to.equal(true);
        expect(lightData._imageCollection).to.equal("books");
        expect(lightData._imageDocId).to.equal("book-1");
    });

    it("preserves deferred chapter image sources in the fast book-page cache", () => {
        const slug = "chapter-image-cache-test";
        const cacheKey = `nuqtha_cache_book_chapters_${slug}_v4`;
        sessionStorage.removeItem(cacheKey);

        try {
            expect(saveBookChapterListCache(slug, [{
                id: "chapter-image-1",
                title: "Chapter",
                status: "published",
                _imageCollection: "articles",
                _imageDocId: "chapter-image-1",
                updatedAt: "2026-11-20T00:00:00Z"
            }])).to.equal(true);
            expect(readBookChapterListCache(slug)[0]).to.include({
                _imageCollection: "articles",
                _imageDocId: "chapter-image-1",
                updatedAt: "2026-11-20T00:00:00Z"
            });
        } finally {
            sessionStorage.removeItem(cacheKey);
        }
    });

    it("matches duplicate book records by title without merging different authors or volumes", () => {
        expect(areSameBookByTitle(
            { title: "Book Title", author: "Author", volume: 1 },
            { bookName: " book   title ", author: "Author", volume: "1" }
        )).to.equal(true);
        expect(areSameBookByTitle(
            { title: "Book Title", author: "Author A" },
            { title: "Book Title", author: "Author B" }
        )).to.equal(false);
        expect(areSameBookByTitle(
            { title: "Book Title", volume: 1 },
            { title: "Book Title", volume: 2 }
        )).to.equal(false);
    });

    it("decodes nested Firestore REST arrays, maps, and numeric values", () => {
        const document = parseFirestoreRestDoc({
            name: "projects/project/databases/(default)/documents/books/book-1",
            fields: {
                chapters: {
                    arrayValue: {
                        values: [{
                            mapValue: {
                                fields: {
                                    chapterId: { stringValue: "chapter-1" },
                                    order: { integerValue: "2" }
                                }
                            }
                        }]
                    }
                },
                price: { doubleValue: 4.5 }
            }
        });

        expect(document).to.include({ id: "book-1", price: 4.5 });
        expect(document.chapters).to.deep.equal([{ chapterId: "chapter-1", order: 2 }]);
    });

    it("skips the redundant book-document request when book metadata is supplied", async () => {
        const originalFetch = window.fetch;
        const requests = [];
        window.fetch = async (url, options) => {
            requests.push({ url: String(url), body: JSON.parse(options.body) });
            return { ok: true, status: 200, json: async () => [] };
        };

        try {
            const result = await fetchBookChapters("book-1", {
                articlesPool: [{ id: "book-1", title: "Book", type: "BOOK" }],
                skipBookFetch: true
            });
            expect(result.chapters).to.deep.equal([]);
            expect(requests).to.have.length(1);
            expect(requests[0].url).to.include(":runQuery");
            const relationshipFilters = requests[0].body.structuredQuery.where.compositeFilter.filters[0].compositeFilter.filters;
            const fieldPaths = relationshipFilters.map(filter => filter.fieldFilter.field.fieldPath);
            expect(fieldPaths).to.include.members(["bookId", "parentBookId", "bookTitle", "bookName", "playlistName", "book"]);
        } finally {
            window.fetch = originalFetch;
        }
    });

    it("keeps the book detail usable when Firestore denies the relationship query", async () => {
        const originalFetch = window.fetch;
        const originalWarn = console.warn;
        window.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
        console.warn = () => {};

        try {
            const result = await fetchBookChapters("book-403", {
                articlesPool: [{ id: "book-403", title: "Book", type: "BOOK" }],
                skipBookFetch: true
            });
            expect(result.chapters).to.deep.equal([]);
            expect(result.book.id).to.equal("book-403");
        } finally {
            window.fetch = originalFetch;
            console.warn = originalWarn;
        }
    });

    it("excludes the current book and deduplicates related book records by ID, slug, or title", () => {
        const currentBook = { id: "book-1", title: "Current Book", slug: "current-book", type: "BOOK" };
        const related = getRelatedBooks(currentBook, [
            currentBook,
            { id: "duplicate-id", title: "Same by slug", slug: "current-book", type: "BOOK", status: "published" },
            { id: "book-2", title: "Another Book", slug: "another-book", type: "FREE", status: "published" },
            { id: "book-2", title: "Another Edition", slug: "different-slug", type: "BOOK", status: "published" },
            { id: "duplicate-title", title: "Another Book", slug: "another-edition", type: "BOOK", status: "published" },
            { id: "book-3", title: "Draft Book", type: "BOOK", status: "draft" },
            { id: "book-4", title: "A Chapter", type: "CHAPTER", isChapter: true },
            { id: "book-5", title: "Chapter-like Book", type: "BOOK", isChapter: true }
        ]);

        expect(related.map(book => book.id)).to.deep.equal(["book-2"]);
    });
});
