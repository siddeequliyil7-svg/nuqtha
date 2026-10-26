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

const { describe, it } = window.mocha;
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
            expect(sanitizeCategory("ലേഖനം")).to.equal("GENERAL");
        });

        it("should fallback to GENERAL for invalid category", () => {
            expect(sanitizeCategory("UNKNOWN_CAT")).to.equal("GENERAL");
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
            expect(sanitizePriority(1500)).to.equal(10); // fallback default
        });
    });

    describe("sanitizeColor() & sanitizeImageUrl()", () => {
        it("should validate hex color codes", () => {
            expect(sanitizeColor("#b4532c")).to.equal("#b4532c");
            expect(sanitizeColor("#fff")).to.equal("#fff");
            expect(sanitizeColor("red")).to.equal("");
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
    });

    describe("validateAndSanitizeArticleForSave()", () => {
        it("should throw error if title or content is missing", () => {
            expect(() => validateAndSanitizeArticleForSave({ title: "" }))
                .to.throw("ലേഖനത്തിന്റെ ശീർഷകം (Title) നൽകേണ്ടതുണ്ട്.");

            expect(() => validateAndSanitizeArticleForSave({ title: "ശീർഷകം", content: "" }))
                .to.throw("ലേഖനത്തിന്റെ ഉള്ളടക്കം (Content) നൽകേണ്ടതുണ്ട്.");
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
            expect(result.placement).to.equal("HERO");
            expect(result.priority).to.equal(1);
            expect(result.updatedAt).to.exist;
        });
    });
});
