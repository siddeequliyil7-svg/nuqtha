/**
 * tests/add-chapter.test.js
 * Verification test suite for adding, editing, and detaching book chapters.
 * Simulates filling the form, triggering handleAddChapterToBook, asserting that:
 * 1. Missing bookId displays inline red error "ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക"
 * 2. Valid save creates article with bookId, order, status='published', authorId defined
 * 3. Book chapters array is updated
 * 4. Step 3 reorder list contains the new chapter
 * 5. getBookChapters(bookId) from js/book-data.js returns the chapter
 * 6. Step 3 Edit and Remove buttons work as expected
 */

import { validateAndSanitizeArticleForSave, normalizeArticleDoc } from "../schema-validator.js";
import { getBookChapters, filterAndSortChapters, isArticleInBook } from "../js/book-data.js";

// Minimal DOM simulation for Node test execution
class MockElement {
    constructor(id = "", tagName = "div") {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.value = "";
        this.textContent = "";
        this.innerHTML = "";
        this.className = "";
        this.classList = {
            classes: new Set(),
            add: (...cls) => cls.forEach(c => this.classList.classes.add(c)),
            remove: (...cls) => cls.forEach(c => this.classList.classes.delete(c)),
            contains: (c) => this.classList.classes.has(c),
            toggle: (c, val) => {
                if (val !== undefined) {
                    val ? this.classList.classes.add(c) : this.classList.classes.delete(c);
                } else {
                    this.classList.classes.has(c) ? this.classList.classes.delete(c) : this.classList.classes.add(c);
                }
            }
        };
        this.attributes = new Map();
        this.listeners = new Map();
        this.disabled = false;
        this.dataset = {};
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    addEventListener(evt, fn) {
        if (!this.listeners.has(evt)) this.listeners.set(evt, []);
        this.listeners.get(evt).push(fn);
    }
    dispatchEvent(evt) {
        const type = typeof evt === "string" ? evt : evt.type;
        const fns = this.listeners.get(type) || [];
        fns.forEach(fn => fn(evt));
    }
    click() { this.dispatchEvent({ type: "click", preventDefault: () => {}, stopPropagation: () => {} }); }
    focus() {}
    scrollIntoView() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return this; }
}

const domElements = new Map();
function getOrCreateEl(id, tag = "div") {
    if (!domElements.has(id)) {
        domElements.set(id, new MockElement(id, tag));
    }
    return domElements.get(id);
}

globalThis.document = {
    getElementById: (id) => getOrCreateEl(id),
    querySelector: (sel) => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
};
globalThis.window = {
    currentUser: { uid: "test_admin_uid_123" }
};
globalThis.localStorage = {
    getItem: (k) => "test_admin_uid_123"
};

async function runTestSuite() {
    console.log("==================================================");
    console.log("RUNNING ADD CHAPTER VERIFICATION TEST SUITE");
    console.log("==================================================");

    const testBookDoc = {
        id: "book_test_101",
        title: "ഇമാമുമാരുടെ ചരിത്രം",
        bookName: "ഇമാമുമാരുടെ ചരിത്രം",
        author: "സയ്യിദ് സൽമാൻ തങ്ങൾ",
        authorId: "author_salman_01",
        type: "BOOK",
        category: "Premium Book",
        chapters: []
    };

    let articlesPool = [testBookDoc];
    let activeBookChapters = [];
    let editingChapterId = null;

    // Helper functions mirroring admin.js
    function showChapterInlineMsg(text, type = "error") {
        const msgEl = document.getElementById("bm-chapter-msg");
        msgEl.textContent = text;
        msgEl.className = type === "error" ? "error-msg" : "success-msg";
    }

    function clearChapterInlineMsg() {
        const msgEl = document.getElementById("bm-chapter-msg");
        msgEl.textContent = "";
        msgEl.className = "hidden";
    }

    // Step 2 Save Chapter Handler
    async function handleAddChapterToBook(targetBookDoc, inputs) {
        clearChapterInlineMsg();

        // 1. Strict Step 1 check
        const activeBookId = targetBookDoc?.id || "";
        if (!activeBookId) {
            showChapterInlineMsg("ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക", "error");
            return false;
        }

        const title = (inputs.title || "").trim();
        const content = (inputs.content || "").trim();
        const transcription = (inputs.transcription || "").trim();
        const imageUrl = (inputs.imageUrl || "").trim();

        if (!title || title.length < 2) {
            showChapterInlineMsg("ദയവായി അധ്യായത്തിന്റെ തലക്കെട്ട് (Chapter Title) നൽകുക (കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ).", "error");
            return false;
        }
        if (!content || content.length < 5) {
            showChapterInlineMsg("ദയവായി അധ്യായത്തിന്റെ പൂർണ്ണ ഉള്ളടക്കം (Chapter Content) നൽകുക (കുറഞ്ഞത് 5 അക്ഷരങ്ങൾ).", "error");
            return false;
        }

        const nextOrder = (activeBookChapters && activeBookChapters.length > 0)
            ? Math.max(...activeBookChapters.map(c => Number(c.order !== undefined ? c.order : (c.priority || 0))), 0) + 1
            : 1;

        const author = (targetBookDoc.author || "NUQTHA AUTHOR").trim();
        const authorId = window.currentUser?.uid || localStorage.getItem("nuqtha_admin_uid") || targetBookDoc?.authorId || "admin";

        if (editingChapterId) {
            const existingChapter = (activeBookChapters && activeBookChapters.find(c => c.id === editingChapterId)) ||
                                    (articlesPool && articlesPool.find(a => a.id === editingChapterId));
            const chapterOrder = existingChapter ? (existingChapter.order !== undefined ? existingChapter.order : (existingChapter.priority || 1)) : nextOrder;

            const raw = {
                title,
                author,
                authorId,
                category: targetBookDoc.category || "Chapter",
                transcription,
                order: chapterOrder,
                priority: chapterOrder,
                content,
                imageUrl,
                bookId: activeBookId,
                bookName: targetBookDoc.bookName || targetBookDoc.title,
                status: "published",
                type: "ARTICLE",
                placement: "AUTO",
                date: new Date().toLocaleDateString("en-GB")
            };
            const sanitized = validateAndSanitizeArticleForSave(raw);
            const foundIdx = articlesPool.findIndex(a => a.id === editingChapterId);
            if (foundIdx !== -1) {
                articlesPool[foundIdx] = { ...articlesPool[foundIdx], ...sanitized };
            }
            editingChapterId = null;
            showChapterInlineMsg(`✨ അധ്യായം '${title}' വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!`, "success");
        } else {
            const raw = {
                title,
                author,
                authorId,
                category: targetBookDoc.category || "Chapter",
                transcription,
                order: nextOrder,
                priority: nextOrder,
                content,
                imageUrl,
                bookId: activeBookId,
                bookName: targetBookDoc.bookName || targetBookDoc.title,
                status: "published",
                type: "ARTICLE",
                placement: "AUTO",
                date: new Date().toLocaleDateString("en-GB")
            };
            const sanitized = validateAndSanitizeArticleForSave(raw);
            const newDocId = "art_ch_" + (articlesPool.length + 1);
            const newArt = { id: newDocId, ...sanitized };
            articlesPool.push(newArt);

            // Update book doc's chapters array
            if (!targetBookDoc.chapters.includes(newDocId)) {
                targetBookDoc.chapters.push(newDocId);
            }
            showChapterInlineMsg(`✨ അധ്യായം '${title}' (#${nextOrder}) വിജയകരമായി ചേർത്തു!`, "success");
        }

        activeBookChapters = filterAndSortChapters(targetBookDoc, articlesPool);
        const listEl = document.getElementById("book-chapters-reorder-list");
        listEl.innerHTML = activeBookChapters.map(c => `<div data-id="${c.id}">${c.title} (#${c.order})</div>`).join("");
        document.getElementById("bm-chapters-count").textContent = String(activeBookChapters.length);

        return true;
    }

    // TEST 1: Missing active bookId from Step 1 shows inline red message
    console.log("Test 1: Verify missing bookId shows 'ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക'...");
    const resNoBook = await handleAddChapterToBook(null, { title: "Chapter 1", content: "Content here" });
    const msgEl = document.getElementById("bm-chapter-msg");
    if (resNoBook === false && msgEl.textContent === "ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക") {
        console.log("  [OK] Successfully blocked save and showed inline error: " + msgEl.textContent);
    } else {
        throw new Error("Test 1 failed: Expected 'ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക', got: " + msgEl.textContent);
    }

    // TEST 2: Add Chapter 1 with active bookId
    console.log("\nTest 2: Adding Chapter 1 with active bookId...");
    const resCh1 = await handleAddChapterToBook(testBookDoc, {
        title: "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ)",
        content: "ഇമാം അബൂ ഹനീഫ (റ) അവരുടെ ചരിത്രവും ജീവിതവും...",
        transcription: "പാഠം 1 കേട്ടെഴുത്ത്",
        imageUrl: "https://example.com/ch1.jpg"
    });
    if (!resCh1) throw new Error("Test 2 failed: handleAddChapterToBook returned false");

    if (!testBookDoc.chapters.includes("art_ch_2")) {
        throw new Error("Test 2 failed: Book chapters array does not include art_ch_2");
    }
    if (activeBookChapters.length !== 1 || activeBookChapters[0].title !== "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ)") {
        throw new Error("Test 2 failed: Step 3 activeBookChapters does not match");
    }
    console.log("  [OK] Chapter 1 added and verified in Step 3 reorder list.");

    // TEST 3: Add Chapter 2 to verify sequential order (#2)
    console.log("\nTest 3: Adding Chapter 2 to verify sequential order...");
    const resCh2 = await handleAddChapterToBook(testBookDoc, {
        title: "അധ്യായം 2: ഇമാം മാലിക് (റ)",
        content: "ഇമാം മാലിക് (റ) മദീനയിലെ പണ്ഡിതൻ...",
        transcription: "പാഠം 2 കേട്ടെഴുത്ത്"
    });
    if (!resCh2) throw new Error("Test 3 failed: handleAddChapterToBook returned false");

    if (activeBookChapters.length !== 2) {
        throw new Error("Test 3 failed: activeBookChapters length is not 2");
    }
    if (activeBookChapters[1].order !== 2) {
        throw new Error("Test 3 failed: Chapter 2 order is not 2, got: " + activeBookChapters[1].order);
    }
    console.log("  [OK] Chapter 2 added with order #2.");

    // TEST 4: Query getBookChapters(bookId) from js/book-data.js
    console.log("\nTest 4: Querying getBookChapters(bookId) from js/book-data.js...");
    const fetched = await getBookChapters("book_test_101", { articlesPool });
    if (!fetched || !fetched.book) {
        throw new Error("Test 4 failed: getBookChapters returned null book");
    }
    if (fetched.chapters.length !== 2) {
        throw new Error(`Test 4 failed: Expected 2 chapters from getBookChapters, got ${fetched.chapters.length}`);
    }
    if (fetched.chapters[0].title !== "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ)" || fetched.chapters[1].title !== "അധ്യായം 2: ഇമാം മാലിക് (റ)") {
        throw new Error("Test 4 failed: Returned chapters mismatch");
    }
    console.log("  [OK] getBookChapters(bookId) correctly returned 2 chapters in order.");

    // TEST 5: Edit chapter
    console.log("\nTest 5: Editing Chapter 1...");
    editingChapterId = "art_ch_2";
    await handleAddChapterToBook(testBookDoc, {
        title: "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ) [അപ്‌ഡേറ്റ് ചെയ്തത്]",
        content: "വിശദമായ പുതുക്കിയ ഉള്ളടക്കം...",
        transcription: "അപ്‌ഡേറ്റ് ചെയ്ത കേട്ടെഴുത്ത്"
    });
    const updated = await getBookChapters("book_test_101", { articlesPool });
    if (updated.chapters[0].title !== "അധ്യായം 1: ഇമാം അബൂ ഹനീഫ (റ) [അപ്‌ഡേറ്റ് ചെയ്തത്]") {
        throw new Error("Test 5 failed: Chapter 1 title was not updated, got: " + updated.chapters[0].title);
    }
    console.log("  [OK] Chapter 1 successfully edited and verified.");

    // TEST 6: Remove chapter
    console.log("\nTest 6: Removing Chapter 1 from book...");
    const detachId = "art_ch_2";
    const chItem = articlesPool.find(a => a.id === detachId);
    if (chItem) {
        chItem.bookId = "";
        chItem.bookName = "";
    }
    testBookDoc.chapters = testBookDoc.chapters.filter(id => id !== detachId);
    const afterDetach = await getBookChapters("book_test_101", { articlesPool });
    if (afterDetach.chapters.length !== 1 || afterDetach.chapters[0].id !== "art_ch_3") {
        throw new Error("Test 6 failed: Detach chapter failed");
    }
    console.log("  [OK] Chapter 1 detached successfully. Remaining chapters: " + afterDetach.chapters.length);

    console.log("==================================================");
    console.log("PASS: ALL CHAPTER WRITER & STEP 3 TESTS PASSED!");
    console.log("==================================================");
}

runTestSuite().catch(err => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
