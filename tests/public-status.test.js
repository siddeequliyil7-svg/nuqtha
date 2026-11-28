import { filterPublicCollections, isPubliclyPublished } from "../js/public-status.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Public draft visibility", () => {
    it("keeps published records and legacy status-less records (visible !== false) visible, but hides drafts", () => {
        expect(isPubliclyPublished({ status: "published" })).to.equal(true);
        expect(isPubliclyPublished({ status: "PUBLISHED" })).to.equal(true);
        expect(isPubliclyPublished({})).to.equal(true);
        expect(isPubliclyPublished({ visible: true })).to.equal(true);
        expect(isPubliclyPublished({ visible: false })).to.equal(false);
        expect(isPubliclyPublished({ status: "draft" })).to.equal(false);
        expect(isPubliclyPublished({ status: "review" })).to.equal(false);
    });

    it("hides draft books, their duplicate records, chapters, and explicit draft articles while keeping legacy status-less articles visible", () => {
        const { articles, books } = filterPublicCollections([
            { id: "draft-book", title: "Work in Progress", type: "BOOK", status: "draft" },
            { id: "duplicate-book", title: "Also Draft", type: "BOOK", status: "published", slug: "also-draft" },
            { id: "draft-chapter", title: "Hidden Chapter", bookId: "draft-book", status: "published" },
            { id: "legacy-chapter", title: "Hidden Legacy Chapter", bookSlug: "also-draft", isChapter: true },
            { id: "published-article", title: "Live Article", status: "published" },
            { id: "legacy-article", title: "Legacy Article" },
            { id: "draft-article", title: "Draft Article", status: "draft" }
        ], [
            { id: "draft-book", title: "Work in Progress", status: "published" },
            { id: "also-draft", title: "Also Draft", slug: "also-draft", status: "draft" },
            { id: "published-book", title: "Live Book", status: "published" }
        ]);

        expect(articles.map(article => article.id)).to.deep.equal(["published-article", "legacy-article"]);
        expect(books.map(book => book.id)).to.deep.equal(["published-book"]);
    });
});
