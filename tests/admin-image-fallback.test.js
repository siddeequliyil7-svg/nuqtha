import { getAdminImageFields, resolveAdminImageFallback } from "../js/admin-image-fallback.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Admin image upload fallbacks", () => {
    it("keeps Firestore image aliases synchronized", () => {
        const fields = getAdminImageFields("https://cdn.example/cover.webp", "https://cdn.example/thumb.webp");

        expect(fields).to.include({
            imageUrl: "https://cdn.example/cover.webp",
            coverUrl: "https://cdn.example/cover.webp",
            coverImage: "https://cdn.example/cover.webp",
            cover: "https://cdn.example/cover.webp",
            image: "https://cdn.example/cover.webp",
            thumbnailUrl: "https://cdn.example/thumb.webp",
            thumbnail: "https://cdn.example/thumb.webp",
            ogImage: "https://cdn.example/thumb.webp"
        });
    });

    it("normalizes saved relative image URLs before synchronizing aliases", () => {
        const fields = getAdminImageFields("  ./images/cover.webp  ");

        expect(fields.imageUrl).to.equal("/images/cover.webp");
        expect(fields.coverUrl).to.equal("/images/cover.webp");
        expect(fields.thumbnailUrl).to.equal("/images/cover.webp");
    });

    it("keeps a selected inline image only when the full document remains safely below Firestore's limit", () => {
        const selectedImage = `data:image/png;base64,${"A".repeat(80 * 1024)}`;
        const documentData = {
            title: "Book",
            ...getAdminImageFields(selectedImage)
        };

        expect(resolveAdminImageFallback(selectedImage, "", documentData)).to.equal(selectedImage);
        expect(resolveAdminImageFallback(
            selectedImage,
            "https://cdn.example/old-cover.webp",
            { ...documentData, content: "x".repeat(800 * 1024) }
        )).to.equal("https://cdn.example/old-cover.webp");
    });

    it("uses the local placeholder when neither the selected image nor existing cover is safe", () => {
        expect(resolveAdminImageFallback(
            "data:image/png;base64,AAAA",
            "blob:https://nuqtha.example/temporary-cover",
            { content: "x".repeat(900 * 1024) }
        )).to.equal("/cover-placeholder.svg");
    });

    it("stores large inline data covers once on imageUrl without 10x alias duplication", () => {
        const inlineCover = `data:image/webp;base64,${"B".repeat(140 * 1024)}`;
        const fields = getAdminImageFields(inlineCover);

        expect(fields.imageUrl).to.equal(inlineCover);
        expect(fields.coverImage).to.equal("");
        expect(fields.coverUrl).to.equal("");
        expect(fields.thumbnailUrl).to.equal("");
        expect(fields.ogImage).to.equal("");

        const multiChapterBook = {
            title: "ഉമവിയ്യ ഖിലാഫത്ത്",
            chapters: Array.from({ length: 26 }, (_, idx) => `chapter-${idx + 1}`),
            ...fields
        };
        expect(resolveAdminImageFallback(inlineCover, "", multiChapterBook)).to.equal(inlineCover);
    });

    it("ignores legacy 10x duplicate base64 aliases and placeholder strings when preserving an inline cover", () => {
        const inlineCover = `data:image/jpeg;base64,${"C".repeat(120 * 1024)}`;
        const legacyMultiAliasBook = {
            title: "ഖിലാഫത്തുർറാശിദ",
            imageUrl: inlineCover,
            coverImage: inlineCover,
            coverUrl: inlineCover,
            cover: inlineCover,
            image: inlineCover,
            thumbnailUrl: inlineCover,
            thumbnail: inlineCover,
            thumbUrl: inlineCover,
            thumb: inlineCover,
            ogImage: inlineCover
        };

        expect(resolveAdminImageFallback(inlineCover, "/cover-placeholder.svg", legacyMultiAliasBook))
            .to.equal(inlineCover);
    });

    it("keeps a distinct inline thumbnail on thumbnailUrl without duplicating cover aliases", () => {
        const inlineCover = `data:image/webp;base64,${"D".repeat(90 * 1024)}`;
        const inlineThumb = `data:image/webp;base64,${"E".repeat(45 * 1024)}`;
        const fields = getAdminImageFields(inlineCover, inlineThumb);

        expect(fields.imageUrl).to.equal(inlineCover);
        expect(fields.thumbnailUrl).to.equal(inlineThumb);
        expect(fields.coverImage).to.equal("");
        expect(fields.ogImage).to.equal("");
    });
});
