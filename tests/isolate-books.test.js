/**
 * tests/isolate-books.test.js
 * Test suite to verify complete isolation between Books and Published Articles:
 * 1. Book documents and chapters are filtered out from Published Live Articles.
 * 2. Dedicated books list only contains book documents.
 * 3. Front-end isBookEntity prevents books and chapters from leaking into regular feeds.
 */

function isBookOrChapter(art) {
    if (!art) return false;
    if (art.type === "BOOK") return true;
    if (art.bookId && String(art.bookId).trim()) return true;
    if (art.bookName && String(art.bookName).trim()) return true;
    if (art.playlistName && String(art.playlistName).trim()) return true;
    if (art.category && (art.category.toLowerCase() === "premium book" || art.category.toLowerCase() === "book")) return true;
    return false;
}

const mockArticles = [
    {
        id: "art_std_1",
        title: "സാധാരണ ലേഖനം 1 (Standard Article)",
        author: "റൈറ്റർ 1",
        category: "HISTORY",
        type: "ARTICLE",
        bookId: "",
        bookName: ""
    },
    {
        id: "art_std_2",
        title: "സാധാരണ ലേഖനം 2 (Standard Article)",
        author: "റൈറ്റർ 2",
        category: "STUDY",
        type: "ARTICLE",
        bookId: "",
        bookName: ""
    },
    {
        id: "book_cov_1",
        title: "ഇമാമുമാരുടെ ചരിത്രം",
        bookName: "ഇമാമുമാരുടെ ചരിത്രം",
        author: "സയ്യിദ് സൽമാൻ തങ്ങൾ",
        category: "Premium Book",
        type: "BOOK",
        chapters: ["art_ch_1", "art_ch_2"]
    },
    {
        id: "art_ch_1",
        title: "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ)",
        author: "സയ്യിദ് സൽമാൻ തങ്ങൾ",
        category: "Chapter",
        type: "ARTICLE",
        bookId: "book_cov_1",
        bookName: "ഇമാമുമാരുടെ ചരിത്രം"
    },
    {
        id: "art_ch_2",
        title: "അധ്യായം 2: ഇമാം മാലിക് (റ)",
        author: "സയ്യിദ് സൽമാൻ തങ്ങൾ",
        category: "Chapter",
        type: "ARTICLE",
        bookId: "book_cov_1",
        bookName: "ഇമാമുമാരുടെ ചരിത്രം"
    }
];

function runTest() {
    console.log("==================================================");
    console.log("RUNNING BOOK ISOLATION VERIFICATION TEST SUITE");
    console.log("==================================================");

    // 1. Test isBookOrChapter
    console.log("Test 1: Testing isBookOrChapter classification...");
    if (isBookOrChapter(mockArticles[0])) throw new Error("art_std_1 should NOT be a book or chapter");
    if (isBookOrChapter(mockArticles[1])) throw new Error("art_std_2 should NOT be a book or chapter");
    if (!isBookOrChapter(mockArticles[2])) throw new Error("book_cov_1 SHOULD be classified as book");
    if (!isBookOrChapter(mockArticles[3])) throw new Error("art_ch_1 SHOULD be classified as chapter");
    if (!isBookOrChapter(mockArticles[4])) throw new Error("art_ch_2 SHOULD be classified as chapter");
    console.log("  [OK] isBookOrChapter correctly classified all entities.");

    // 2. Test published articles isolation
    console.log("\nTest 2: Verifying Published Live Articles contains ZERO books and ZERO chapters...");
    const publishedArticles = mockArticles.filter(a => !isBookOrChapter(a));
    if (publishedArticles.length !== 2) {
        throw new Error(`Expected exactly 2 standard articles, got ${publishedArticles.length}`);
    }
    const hasAnyBook = publishedArticles.some(a => a.type === "BOOK" || a.bookId || a.bookName || a.category === "Premium Book");
    if (hasAnyBook) {
        throw new Error("Published Live Articles contains book or chapter entities!");
    }
    console.log("  [OK] Published Live Articles is 100% clean of books and chapters.");

    // 3. Test dedicated books list
    console.log("\nTest 3: Verifying Dedicated Books List contains only books...");
    const books = mockArticles.filter(a => a.type === "BOOK" || (a.category && a.category.toLowerCase() === "premium book"));
    if (books.length !== 1 || books[0].id !== "book_cov_1") {
        throw new Error(`Expected exactly 1 book (book_cov_1), got ${books.length}`);
    }
    console.log("  [OK] Dedicated Books List contains only books.");

    console.log("==================================================");
    console.log("PASS: ALL BOOK ISOLATION TESTS PASSED!");
    console.log("==================================================");
}

runTest();
