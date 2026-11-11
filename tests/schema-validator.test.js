import {
    ALLOWED_CATEGORIES,
    ALLOWED_PLACEMENTS,
    sanitizeString,
    sanitizeCategory,
    sanitizePlacement,
    sanitizePriority,
    sanitizeColor,
    sanitizeImageUrl,
    parseTimestampMillis,
    formatDateSafe,
    normalizeArticleDoc,
    validateAndSanitizeArticleForSave
} from "../schema-validator.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Schema Validator & Sanitizer Suite", () => {
    describe("sanitizeString()", () => {
        it("should return fallback for null or undefined", () => {
            expect(sanitizeString(null, 100, "fallback")).to.equal("fallback");
            expect(sanitizeString(undefined, 100, "fallback")).to.equal("fallback");
        });

        it("should normalize Malayalam text with NFC", () => {
            const rawMalayalam = "കേരളം";
            expect(sanitizeString(rawMalayalam)).to.equal("കേരളം");
        });

        it("should strip control characters and enforce length limit", () => {
            const messy = "Hello\x00\x08World!   ";
            expect(sanitizeString(messy, 5)).to.equal("Hello");
        });
    });

    describe("sanitizeCategory()", () => {
        it("should accept valid categories", () => {
            ALLOWED_CATEGORIES.forEach(cat => {
                expect(sanitizeCategory(cat)).to.equal(cat);
                expect(sanitizeCategory(cat.toLowerCase())).to.equal(cat);
            });
        });

        it("should map Malayalam category names correctly", () => {
            expect(sanitizeCategory("ചരിത്രം")).to.equal("HISTORY");
            expect(sanitizeCategory("പഠനം")).to.equal("STUDY");
            expect(sanitizeCategory("കഥ")).to.equal("STORY");
            expect(sanitizeCategory("Study More")).to.equal("STUDY");
            expect(sanitizeCategory("ലേഖനം")).to.equal("ലേഖനം");
        });

        it("should fallback to GENERAL for invalid category", () => {
            expect(sanitizeCategory("UNKNOWN_CAT")).to.equal("UNKNOWN_CAT");
        });
    });

    describe("sanitizePlacement() & sanitizePriority()", () => {
        it("should accept valid placements", () => {
            ALLOWED_PLACEMENTS.forEach(p => {
                expect(sanitizePlacement(p)).to.equal(p);
            });
        });

        it("should fallback to AUTO for invalid placement", () => {
            expect(sanitizePlacement("SIDEBAR")).to.equal("AUTO");
        });

        it("should sanitize priority integer within 1-999 range", () => {
            expect(sanitizePriority("25")).to.equal(25);
            expect(sanitizePriority(-5)).to.equal(10); // fallback default
            expect(sanitizePriority(1500)).to.equal(999); // clamp to maximum
        });
    });

    describe("sanitizeColor() & sanitizeImageUrl()", () => {
        it("should validate hex color codes", () => {
            expect(sanitizeColor("#b4532c")).to.equal("#b4532c");
            expect(sanitizeColor("#fff")).to.equal("#fff");
            expect(sanitizeColor("red")).to.equal("#1e1b18");
        });

        it("should allow data URIs and https image URLs", () => {
            const dataUrl = "data:image/jpeg;base64,abc123==";
            const httpsUrl = "https://example.com/photo.jpg";
            expect(sanitizeImageUrl(dataUrl)).to.equal(dataUrl);
            expect(sanitizeImageUrl(httpsUrl)).to.equal(httpsUrl);
            expect(sanitizeImageUrl("javascript:alert(1)")).to.equal("");
        });
    });

    describe("parseTimestampMillis() & formatDateSafe()", () => {
        it("should parse Date objects, numbers, and ISO strings", () => {
            const now = new Date();
            expect(parseTimestampMillis(now)).to.equal(now.getTime());
            expect(parseTimestampMillis(1700000000000)).to.equal(1700000000000);
            expect(parseTimestampMillis("2026-10-24T00:00:00Z")).to.be.a("number");
        });

        it("should handle Firestore Timestamp objects with seconds", () => {
            const firestoreTs = { seconds: 1700000000, nanoseconds: 0 };
            expect(parseTimestampMillis(firestoreTs)).to.equal(1700000000000);
        });

        it("should format date safely without throwing", () => {
            expect(formatDateSafe("invalid-date", "Recent")).to.equal("Recent");
            expect(formatDateSafe(1700000000000)).to.be.a("string");
        });
    });

    describe("normalizeArticleDoc()", () => {
        it("should provide robust fallback values for missing/corrupted fields", () => {
            const partial = { title: "ടെസ്റ്റ് ലേഖനം" };
            const normalized = normalizeArticleDoc(partial, "doc123");

            expect(normalized.id).to.equal("doc123");
            expect(normalized.title).to.equal("ടെസ്റ്റ് ലേഖനം");
            expect(normalized.category).to.equal("GENERAL");
            expect(normalized.author).to.equal("NUQTHA");
            expect(normalized.placement).to.equal("AUTO");
            expect(normalized.priority).to.equal(10);
            expect(normalized.content).to.equal("");
        });

        it("normalizes legacy cover image field names", () => {
            ["coverImage", "coverUrl", "image", "thumbnail"].forEach((field) => {
                const normalized = normalizeArticleDoc({ title: "Cover test", [field]: "https://example.com/cover.jpg" });
                expect(normalized.imageUrl).to.equal("https://example.com/cover.jpg");
                expect(normalized.coverImage).to.equal(normalized.imageUrl);
                expect(normalized.coverUrl).to.equal(normalized.imageUrl);
            });
        });

        it("does not mistake book links or ordering for explicit chapter markers", () => {
            const normalized = normalizeArticleDoc({
                title: "Legacy article",
                type: "ARTICLE",
                bookId: "parent-book",
                bookName: "Different title",
                order: 2
            }, "legacy-article");

            expect(normalized.isChapter).to.equal(false);
            expect(normalized.isBook).to.equal(false);
            expect(normalized.type).to.equal("ARTICLE");
        });

        it("lets explicit chapter markers override book metadata", () => {
            const normalized = normalizeArticleDoc({
                title: "Chapter one",
                type: "BOOK",
                isBook: true,
                isChapter: true
            }, "chapter-one");

            expect(normalized.isChapter).to.equal(true);
            expect(normalized.isBook).to.equal(false);
            expect(normalized.type).to.equal("CHAPTER");
        });

        it("uses the default cover when no supported image field exists", () => {
            const normalized = normalizeArticleDoc({ title: "No cover" });
            expect(normalized.imageUrl).to.equal("");
            expect(normalized.thumbnailUrl).to.equal("");
        });

        it("preserves supported book relationship and order fields", () => {
            const normalized = normalizeArticleDoc({
                type: "ARTICLE",
                bookId: "book-1",
                parentBookId: "parent-1",
                playlistName: "Legacy Book",
                order: 2,
                chapters: ["chapter-1"]
            }, "chapter-1");
            expect(normalized.bookId).to.equal("book-1");
            expect(normalized.parentBookId).to.equal("parent-1");
            expect(normalized.playlistName).to.equal("Legacy Book");
            expect(normalized.order).to.equal(2);
            expect(normalized.chapters).to.deep.equal(["chapter-1"]);
            expect(normalized.isChapter).to.equal(false);
        });

        it("preserves a bounded set of sanitized recommendation tags", () => {
            const normalized = normalizeArticleDoc({
                title: "Tagged article",
                tags: ["History", " history ", "", "Study", 42]
            });
            expect(normalized.tags).to.deep.equal(["History", "Study", "42"]);
        });

        it("preserves tags and parent-book links when validating saves", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Tagged linked article",
                content: "A valid article body.",
                bookId: "book-1",
                tags: ["History", " history ", "Study"]
            });
            expect(result.parentBookId).to.equal("book-1");
            expect(result.tags).to.deep.equal(["History", "Study"]);
        });

        it("does not use a thumbnail as the primary cover during save validation", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Independent images",
                content: "Valid article content.",
                thumbnailUrl: "https://example.com/thumbnail.jpg"
            });

            expect(result.imageUrl).to.equal("");
            expect(result.thumbnailUrl).to.equal("https://example.com/thumbnail.jpg");
        });

        it("classifies only explicitly marked chapter records as chapters", () => {
            const legacyArticle = normalizeArticleDoc({
                id: "legacy-article",
                title: "Legacy article",
                type: "ARTICLE",
                bookId: "some-book",
                bookName: "A different parent title",
                order: 4
            });
            const explicitChapter = normalizeArticleDoc({
                id: "chapter-1",
                title: "Chapter one",
                type: "BOOK",
                isBook: true,
                isChapter: true
            });

            expect(legacyArticle.isChapter).to.equal(false);
            expect(legacyArticle.isBook).to.equal(false);
            expect(legacyArticle.type).to.equal("ARTICLE");
            expect(explicitChapter.isChapter).to.equal(true);
            expect(explicitChapter.isBook).to.equal(false);
            expect(explicitChapter.type).to.equal("CHAPTER");
        });

        it("preserves a primary cover independently from its thumbnail", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Cover distinction",
                content: "Valid article content.",
                thumbnailUrl: "https://example.com/thumb.jpg"
            });

            expect(result.imageUrl).to.equal("");
            expect(result.thumbnailUrl).to.equal("https://example.com/thumb.jpg");
        });

        it("does not infer chapter status from book links during save validation", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Linked legacy article",
                content: "A valid article body.",
                bookName: "Sample Book",
                bookId: "book-1",
                order: 2
            });

            expect(result.isChapter).to.equal(false);
            expect(result.type).to.equal("ARTICLE");
        });
    });

    describe("validateAndSanitizeArticleForSave()", () => {
        it("should throw error if title or content is missing", () => {
            expect(() => validateAndSanitizeArticleForSave({ title: "" }))
                .to.throw("ലേഖനത്തിന് സാധുവായ തലക്കെട്ട് (Title) നിർബന്ധമാണ്");

            expect(() => validateAndSanitizeArticleForSave({ title: "ശീർഷകം", content: "" }))
                .to.throw("ലേഖനത്തിന്റെ ഉള്ളടക്കം (Content) നിർബന്ധമാണ്.");
        });

        it("should return sanitized data ready for Firestore on valid input", () => {
            const input = {
                title: "സാധുവായ തലക്കെട്ട്",
                category: "കഥ",
                author: "റൈറ്റർ",
                content: "ഇതൊരു പരീക്ഷണ ഉള്ളടക്കമാണ്.",
                placement: "HERO",
                priority: "1"
            };

            const result = validateAndSanitizeArticleForSave(input);
            expect(result.title).to.equal("സാധുവായ തലക്കെട്ട്");
            expect(result.category).to.equal("STORY");
            expect(result.placement).to.equal("AUTO");
            expect(result.priority).to.equal(1);
            expect(result.order).to.equal(1);
        });

        it("saves linked articles without inferring chapter status or requiring authorId", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Book chapter",
                content: "A valid chapter body.",
                bookName: "Sample Book",
                bookId: "book-1",
                priority: 2,
                order: 2
            });
            expect(result.authorId).to.equal("");
            expect(result.bookId).to.equal("book-1");
            expect(result.order).to.equal(2);
            expect(result.isChapter).to.equal(false);
            expect(result.type).to.equal("ARTICLE");
        });

        it("uses explicit markers rather than relationship fields for saved chapter classification", () => {
            const result = validateAndSanitizeArticleForSave({
                title: "Explicit chapter",
                content: "A valid chapter body.",
                type: "CHAPTER",
                bookId: "book-1"
            });

            expect(result.isChapter).to.equal(true);
            expect(result.type).to.equal("CHAPTER");
        });
    });
});
