import { getArticleCategoryId } from "../js/category-store.js";

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

    it("preserves custom IDs and defaults uncategorized records to general", () => {
        expect(getArticleCategoryId({ categoryId: "special-edition" })).to.equal("special-edition");
        expect(getArticleCategoryId({})).to.equal("general");
    });
});
