import { getBookArticleLinkFields, getBookChapters } from "../book-data.js";
import { filterAndSortChapters, isArticleInBook } from "../js/book-data.js";

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

    it("writes additive bookId and explicit order without dropping legacy fields", () => {
        expect(getBookArticleLinkFields({ id: "book-1", title: "Sample Book" }, "", 3)).to.deep.equal({
            bookName: "Sample Book",
            bookId: "book-1",
            priority: 3,
            order: 3
        });
    });
});
