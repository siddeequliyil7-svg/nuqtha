import { getArticleCategoryId, mergeCategoryOptions } from "../js/category-store.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Article category IDs", () => {
    it("normalizes standard category names and legacy Malayalam labels to feed slugs", () => {
        expect(getArticleCategoryId({ category: "HISTORY" })).to.equal("history");
        expect(getArticleCategoryId({ categoryId: "STUDY" })).to.equal("study");
        expect(getArticleCategoryId({ category: "ചരിത്രം" })).to.equal("history");
        expect(getArticleCategoryId({ categoryId: "legacy-history", category: "History" })).to.equal("history");
        expect(getArticleCategoryId({ categorySlug: "special-edition" })).to.equal("special-edition");
        expect(getArticleCategoryId({ categoryId: "old category", categorySlug: "special-edition" })).to.equal("special-edition");
    });

    it("preserves custom IDs, maps general to history, and defaults uncategorized records to history", () => {
        expect(getArticleCategoryId({ categoryId: "special-edition" })).to.equal("special-edition");
        expect(getArticleCategoryId({ category: "GENERAL" })).to.equal("history");
        expect(getArticleCategoryId({})).to.equal("history");
    });

    it("merges Firestore categories with legacy article and book categories while excluding general", () => {
        const categories = mergeCategoryOptions(
            [{ slug: "history", name: "World History", order: 10, visible: true }],
            [
                { category: "Study" },
                { category: "islamic-thought", type: "BOOK", isBook: true },
                { category: "Chapter", type: "CHAPTER", isChapter: true }
            ],
            [
                { slug: "story", name: "Stories", order: 30 },
                { slug: "general", name: "General", order: 40 }
            ]
        );

        expect(categories.map(category => category.slug)).to.deep.equal([
            "history", "study", "islamic-thought"
        ]);
        expect(categories[0].name).to.equal("World History");
    });

    it("adds sensible defaults when no category data exists without general", () => {
        const categories = mergeCategoryOptions([], [], [
            { slug: "history", name: "History" },
            { slug: "general", name: "General" }
        ]);

        expect(categories.map(category => category.slug)).to.deep.equal(["history"]);
    });
});
