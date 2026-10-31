import { safeInit } from "./js/ui-safe.js";
import { getBookChapters, filterAndSortChapters, isArticleInBook, countBookChapters } from "./js/book-data.js";

export function isMainBook(art) {
    if (!art) return false;
    // Strictly exclude any document that has a bookId referencing a book (these are chapters)
    if (art.bookId && String(art.bookId).trim() && String(art.bookId).trim() !== String(art.id)) {
        return false;
    }
    // Strictly exclude chapters or sub-items
    if (art.type === "CHAPTER" || art.isChapter === true) {
        return false;
    }
    // An article with bookId, bookName, or chapter order is a chapter/sub-item
    if (art.type === "ARTICLE" && (art.bookId || art.bookName || art.order !== undefined || art.chapterIndex !== undefined)) {
        return false;
    }
    // Main books created via Step 1 have type === "BOOK"
    if (art.type === "BOOK") {
        return true;
    }
    // Legacy support: category is premium book/book, has chapters array, and no parent book
    if (Array.isArray(art.chapters) && !art.bookId && art.category && (art.category.toLowerCase() === "premium book" || art.category.toLowerCase() === "book")) {
        return true;
    }
    return false;
}
window.isMainBook = isMainBook;

export function isBookOrChapter(art) {
    if (!art) return false;
    if (art.type === "BOOK") return true;
    if (art.bookId && String(art.bookId).trim()) return true;
    if (art.bookName && String(art.bookName).trim()) return true;
    if (art.playlistName && String(art.playlistName).trim()) return true;
    if (art.category && (art.category.toLowerCase() === "premium book" || art.category.toLowerCase() === "book")) return true;
    return false;
}
window.isBookOrChapter = isBookOrChapter;

"use strict";
/**
 * NUQTHA — Admin Dashboard Logic (admin.js)
 * 4-Folder Tab Architecture, Special Playlist Series Curation & Firestore Realtime Sync
 * With Strict Data Validation & Schema Sanitization
 */
import { db, collection, getDocs, getDoc, addDoc, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from "./firebase-config.js";
import {
    validateAndSanitizeArticleForSave,
    normalizeArticleDoc,
    sanitizePlacement,
    sanitizePriority,
    sanitizeString,
    parseTimestampMillis,
    ALLOWED_CATEGORIES
} from "./schema-validator.js";

let editingArticleId = null; // null = create mode, string = edit mode
let currentArticlesList = [];
let activeTab = "create";
let selectedBase64Image = "";
let selectedBookCoverBase64 = "";
let bmSelectedArticleImageBase64 = "";
let bmPresentationFileBase64 = "";
let bmPresentationFileName = "";
let activeBookName = "";
let activeBookAuthor = "";
let activeBookCoverDoc = null;
let activeBookChapters = [];
let dragSrcChapterIndex = null;
let pendingInlineBase64 = "";
let compactArticlesDisplayLimit = 20;

const ADMIN_PASSWORD = "admin768";
const AUTH_STORAGE_KEY = "nuqtha_admin_authenticated";
let isDashboardInitialized = false;

function initAdminDashboard() {
    if (isDashboardInitialized) return;
    isDashboardInitialized = true;

    // safeInit imported from ./js/ui-safe.js

    safeInit("initTabNavigation", initTabNavigation);
    safeInit("initArticleForm", initArticleForm);
    safeInit("initFormattingToolbar", initFormattingToolbar);
    safeInit("initColorCustomizer", initColorCustomizer);
    safeInit("initImageUpload", initImageUpload);
    safeInit("initPlaylistPresets", initPlaylistPresets);
    safeInit("initLayoutManagerControls", initLayoutManagerControls);
    safeInit("initPublishedSearchFilter", initPublishedSearchFilter);
    safeInit("initBookManagerSuite", initBookManagerSuite);
    safeInit("listenToFirestoreArticles", listenToFirestoreArticles);
    safeInit("initAuthorManager", initAuthorManager);
}

function initPlaylistPresets() {
    const playlistInput = document.getElementById("art-playlist-name");
    document.querySelectorAll(".playlist-preset-chip").forEach(chip => {
        if (!chip) return;
        chip.addEventListener("click", () => {
            const seriesName = chip.dataset.name || chip.textContent.replace("+", "").trim();
            if (playlistInput) {
                playlistInput.value = seriesName;
                playlistInput.focus();
            }
        });
    });
}

function initAdminSecurity() {
    const authBarrier = document.getElementById("admin-auth-barrier");
    const mainWrapper = document.getElementById("admin-main-wrapper");
    const loginForm = document.getElementById("admin-login-form");
    const passwordInput = document.getElementById("admin-password-input");
    const errorBox = document.getElementById("admin-login-error");
    const togglePwBtn = document.getElementById("toggle-pw-visibility");
    const logoutBtn = document.getElementById("admin-logout-btn");

    function unlock() {
        if (authBarrier) authBarrier.classList.add("hidden");
        if (mainWrapper) mainWrapper.classList.remove("hidden");
        initAdminDashboard();
    }

    function lock() {
        if (authBarrier) authBarrier.classList.remove("hidden");
        if (mainWrapper) mainWrapper.classList.add("hidden");
        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.focus();
        }
    }

    // Check existing session
    if (sessionStorage.getItem(AUTH_STORAGE_KEY) === "true") {
        unlock();
    } else {
        lock();
    }

    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const val = (passwordInput?.value || "").trim();
            if (val === ADMIN_PASSWORD) {
                sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
                if (errorBox) errorBox.classList.add("hidden");
                unlock();
            } else {
                if (errorBox) {
                    errorBox.textContent = "തെറ്റായ പാസ്‌വേഡ്! (Incorrect Password)";
                    errorBox.classList.remove("hidden");
                }
                if (passwordInput) {
                    passwordInput.classList.add("border-red-500", "ring-2", "ring-red-400");
                    passwordInput.select();
                    setTimeout(() => {
                        passwordInput.classList.remove("border-red-500", "ring-2", "ring-red-400");
                    }, 2500);
                }
            }
        });
    }

    if (togglePwBtn && passwordInput) {
        togglePwBtn.addEventListener("click", () => {
            const isPassword = passwordInput.type === "password";
            passwordInput.type = isPassword ? "text" : "password";
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
            window.location.reload();
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initAdminSecurity();
    });
} else {
    initAdminSecurity();
}

/* ═══════════════════════════════════════════════════════════
   1. 4-FOLDER TAB NAVIGATION LOGIC
   ═══════════════════════════════════════════════════════════ */
function initTabNavigation() {
    const tabButtons = document.querySelectorAll(".admin-tab-btn");
    
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabName = btn.dataset.tab;
            if (tabName) {
                switchAdminTab(tabName);
            }
        });
    });

    // Handle jump buttons between tabs (e.g. Next / Back buttons)
    document.querySelectorAll("[data-switch-tab]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetTab = btn.dataset.switchTab;
            if (targetTab) {
                switchAdminTab(targetTab);
            }
        });
    });

    // Check URL hash on load (e.g. #tab=published, #tab=layout, #tab=book)
    const hash = window.location.hash.replace("#tab=", "").trim();
    if (["create", "book", "layout", "published", "authors"].includes(hash)) {
        try {
            switchAdminTab(hash);
        } catch (err) {
            console.warn("[AdminTab] Deferred initial tab switch:", err);
        }
    }
}

export function switchAdminTab(tabName) {
    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    // Update tab panes
    document.querySelectorAll(".admin-tab-pane").forEach(pane => {
        pane.classList.toggle("active", pane.dataset.pane === tabName);
    });

    // Update window hash without scrolling
    history.replaceState(null, null, `#tab=${tabName}`);

    // If switching to book tab, refresh the active book overview and all articles
    if (tabName === "book") {
        initBookManagerSuite();
        updateActiveBookOverview(currentArticlesList);
        renderBookManagerCompactArticles(currentArticlesList, activeBookName);
    }

    // If switching to layout tab, refresh layout manager cards
    if (tabName === "authors") {
        renderAdminAuthorsTab();
    }

    if (tabName === "layout") {
        renderLayoutManagerList(currentArticlesList);
    }
}

// Expose switchAdminTab globally
window.switchAdminTab = switchAdminTab;

/* ═══════════════════════════════════════════════════════════
   2. CORE ARTICLE FORM & FIRESTORE SAVE / UPDATE
   ═══════════════════════════════════════════════════════════ */
function initArticleForm() {
    const form = document.getElementById("add-article-form");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const editNoticeBanner = document.getElementById("edit-notice-banner");

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", () => {
            exitEditMode();
        });
    }

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleFormSubmit();
        });
    }
}

async function handleFormSubmit() {
    const submitBtns = document.querySelectorAll(".submit-article-btn");
    setSubmitButtonsLoading(true);

    try {
        // Collect raw form fields
        const rawTitle = document.getElementById("art-title")?.value || "";
        const rawCategory = document.getElementById("art-category")?.value || "HISTORY";
        const rawAuthor = document.getElementById("art-author")?.value || "";
        const authorId = window.currentUser?.uid || localStorage.getItem("nuqtha_admin_uid") || "admin";
        const rawTranscription = document.getElementById("art-transcription")?.value || "";
        const rawExcerpt = document.getElementById("art-excerpt")?.value || "";
        const rawContent = document.getElementById("art-content")?.value || "";
        const rawTitleColor = document.getElementById("art-title-color")?.value || "#1e1b18";
        const rawContentColor = document.getElementById("art-content-color")?.value || "#2b2118";
        const rawFontSize = document.querySelector('input[name="art-font-size"]:checked')?.value || "medium";

        const rawPlacement = document.getElementById("art-placement")?.value || "AUTO";
        const rawPriority = document.getElementById("art-priority")?.value;
        const rawBookName = document.getElementById("art-playlist-name")?.value || "";
        const isBookCover = document.getElementById("art-is-book")?.checked || false;

        // STRICT SCHEMA VALIDATION & SANITIZATION
        const sanitized = validateAndSanitizeArticleForSave({
            title: rawTitle,
            category: rawCategory,
            author: rawAuthor,
            authorId,
            transcription: rawTranscription,
            imageUrl: selectedBase64Image || "",
            excerpt: rawExcerpt,
            content: rawContent,
            titleColor: rawTitleColor,
            contentColor: rawContentColor,
            fontSize: rawFontSize,
            placement: rawPlacement,
            priority: rawPriority,
            bookName: rawBookName,
            type: isBookCover ? "BOOK" : "ARTICLE",
            date: new Date().toLocaleDateString("en-GB")
        });

        if (editingArticleId) {
            // UPDATE EXISTING ARTICLE IN FIRESTORE
            const articleRef = doc(db, "articles", editingArticleId);
            const updatePayload = {
                title: sanitized.title,
                category: sanitized.category,
                author: sanitized.author,
                authorId: sanitized.authorId || authorId,
                transcription: sanitized.transcription || "",
                hasCustomExcerpt: sanitized.hasCustomExcerpt,
                storedExcerpt: sanitized.storedExcerpt,
                excerpt: sanitized.excerpt,
                content: sanitized.content,
                titleColor: sanitized.titleColor,
                contentColor: sanitized.contentColor,
                fontSize: sanitized.fontSize,
                placement: sanitized.placement,
                priority: sanitized.priority,
                bookName: sanitized.bookName,
                type: sanitized.type,
                updatedAt: serverTimestamp()
            };

            // Only update imageUrl if selected/changed or explicitly set
            if (selectedBase64Image !== undefined) {
                updatePayload.imageUrl = sanitized.imageUrl;
            }

            await updateDoc(articleRef, updatePayload);
            showGlobalStatus("ലേഖനം വിജയകരമായി എഡിറ്റ് ചെയ്ത് Firestore-ൽ അപ്‌ഡേറ്റ് ചെയ്തു! ✨", "success");
            exitEditMode();
            switchAdminTab("published");
        } else {
            // CREATE NEW ARTICLE IN FIRESTORE
            await addDoc(collection(db, "articles"), {
                ...sanitized,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            showGlobalStatus("ലേഖനം വിജയകരമായി പ്രസിദ്ധീകരിച്ചു! (Live on NUQTHA) 🎉", "success");
            resetFormFields();
            switchAdminTab("published");
        }
    } catch (err) {
        console.error("[NUQTHA ADMIN] Validation / Firestore save error:", err);
        showGlobalStatus(err.message || "ലേഖനം സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല. വിവരങ്ങൾ പരിശോധിക്കുക.", "error");
        // If validation failed on title or content, bring user back to create tab
        if (!document.getElementById("art-title")?.value.trim()) {
            switchAdminTab("create");
            document.getElementById("art-title")?.focus();
        } else if (!document.getElementById("art-content")?.value.trim()) {
            switchAdminTab("create");
            document.getElementById("art-content")?.focus();
        }
    } finally {
        setSubmitButtonsLoading(false);
    }
}

function setSubmitButtonsLoading(isLoading) {
    document.querySelectorAll(".submit-article-btn").forEach(btn => {
        btn.disabled = isLoading;
        if (isLoading) {
            btn.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span> <span>പ്രോസസ്സ് ചെയ്യുന്നു...</span>`;
        } else {
            const isEdit = Boolean(editingArticleId);
            btn.innerHTML = isEdit
                ? `<span>Save & Update Article/Book</span><svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
                : `<span>Publish to Firestore</span><svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        }
    });
}

function resetFormFields() {
    const form = document.getElementById("add-article-form");
    if (form) form.reset();

    // Reset Image
    selectedBase64Image = "";
    const fileInput = document.getElementById("art-file-input");
    const preview = document.getElementById("image-preview");
    const previewContainer = document.getElementById("image-preview-container");
    const placeholder = document.getElementById("upload-placeholder");
    if (fileInput) fileInput.value = "";
    if (preview) preview.src = "";
    if (previewContainer) previewContainer.classList.add("hidden");
    if (placeholder) placeholder.classList.remove("hidden");

    // Reset Colors & Font Size
    const resetColorsBtn = document.getElementById("reset-colors-btn");
    if (resetColorsBtn) resetColorsBtn.click();
    const defaultFSRadio = document.querySelector('input[name="art-font-size"][value="medium"]');
    if (defaultFSRadio) defaultFSRadio.checked = true;
    const fSizeLabel = document.getElementById("font-size-label");
    if (fSizeLabel) fSizeLabel.textContent = "Medium (Standard)";

    // Reset Tab 2 fields
    const placementEl = document.getElementById("art-placement");
    const priorityEl = document.getElementById("art-priority");
    const playlistEl = document.getElementById("art-playlist-name");
    const isBookEl = document.getElementById("art-is-book");
    if (placementEl) placementEl.value = "AUTO";
    if (priorityEl) priorityEl.value = "10";
    if (playlistEl) playlistEl.value = "";
    if (isBookEl) isBookEl.checked = false;
}

function exitEditMode() {
    editingArticleId = null;
    resetFormFields();

    const formHeading = document.getElementById("form-heading");
    const formSubheading = document.getElementById("form-subheading");
    const editNoticeBanner = document.getElementById("edit-notice-banner");

    if (formHeading) formHeading.textContent = "പുതിയ ലേഖനം ചേർക്കുക (New Article)";
    if (formSubheading) formSubheading.textContent = "ലേഖനത്തിന്റെ വിവരങ്ങൾ നൽകി Publish ചെയ്യുക";
    if (editNoticeBanner) editNoticeBanner.classList.add("hidden");

    setSubmitButtonsLoading(false);
}

// Global startEditArticle called from Tab 3 or anywhere
window.startEditArticle = function (id) {
    const art = currentArticlesList.find(a => a.id === id);
    if (!art) {
        showGlobalStatus("ലേഖനം കണ്ടെത്താനായില്ല!", "error");
        return;
    }

    editingArticleId = id;

    // Populate Tab 1: Editor Form
    const titleInput = document.getElementById("art-title");
    const catInput = document.getElementById("art-category");
    const authorInput = document.getElementById("art-author");
    const transcriptionInput = document.getElementById("art-transcription");
    const excerptInput = document.getElementById("art-excerpt");
    const contentInput = document.getElementById("art-content");

    if (titleInput) titleInput.value = art.title || "";
    if (catInput) catInput.value = (art.category || "HISTORY").toUpperCase();
    if (authorInput) authorInput.value = art.author || "";
    if (transcriptionInput) transcriptionInput.value = art.transcription || "";
    if (excerptInput) excerptInput.value = art.storedExcerpt || (art.hasCustomExcerpt ? art.excerpt : "") || art.excerpt || "";
    if (contentInput) contentInput.value = art.content || "";

    // Tab 2: Layout & Playlist
    const placementInput = document.getElementById("art-placement");
    const priorityInput = document.getElementById("art-priority");
    const playlistInput = document.getElementById("art-playlist-name");

    if (placementInput) placementInput.value = art.placement || "AUTO";
    if (priorityInput) priorityInput.value = (art.priority !== undefined && art.priority !== null) ? art.priority : 10;
    if (playlistInput) playlistInput.value = art.bookName || "";
    const isBookToggle = document.getElementById("art-is-book");
    if (isBookToggle) isBookToggle.checked = (art.type === "BOOK");

    // Colors
    const titleColorInput = document.getElementById("art-title-color");
    const contentColorInput = document.getElementById("art-content-color");
    const titleColorHex = document.getElementById("title-color-hex");
    const contentColorHex = document.getElementById("content-color-hex");
    const previewTitle = document.getElementById("preview-title");
    const previewBody = document.getElementById("preview-body");

    const tColor = art.titleColor || "#1e1b18";
    const cColor = art.contentColor || "#2b2118";

    if (titleColorInput) titleColorInput.value = tColor;
    if (titleColorHex) titleColorHex.textContent = tColor;
    if (previewTitle) previewTitle.style.color = tColor;

    if (contentColorInput) contentColorInput.value = cColor;
    if (contentColorHex) contentColorHex.textContent = cColor;
    if (previewBody) previewBody.style.color = cColor;

    // Font Size radio
    const fSize = art.fontSize || "medium";
    const fontSizeRadio = document.querySelector(`input[name="art-font-size"][value="${fSize}"]`);
    if (fontSizeRadio) fontSizeRadio.checked = true;
    const fSizeLabel = document.getElementById("font-size-label");
    if (fSizeLabel) {
        const labels = { small: "Small (ചെറുത്)", medium: "Medium (സാധാരണ)", large: "Large (വലുത്)", xlarge: "Extra Large (കൂടുതൽ)" };
        fSizeLabel.textContent = labels[fSize] || fSize;
    }

    // Cover Image preview
    const preview = document.getElementById("image-preview");
    const previewContainer = document.getElementById("image-preview-container");
    const placeholder = document.getElementById("upload-placeholder");

    if (art.imageUrl) {
        selectedBase64Image = art.imageUrl;
        if (preview) preview.src = art.imageUrl;
        if (previewContainer) previewContainer.classList.remove("hidden");
        if (placeholder) placeholder.classList.add("hidden");
    } else {
        selectedBase64Image = "";
        if (preview) preview.src = "";
        if (previewContainer) previewContainer.classList.add("hidden");
        if (placeholder) placeholder.classList.remove("hidden");
    }

    // UI Notice
    const formHeading = document.getElementById("form-heading");
    const formSubheading = document.getElementById("form-subheading");
    const editNoticeBanner = document.getElementById("edit-notice-banner");
    const editTitleDisplay = document.getElementById("edit-title-display");

    if (formHeading) formHeading.textContent = "ലേഖനം എഡിറ്റ് ചെയ്യുക (Edit Article)";
    if (formSubheading) formSubheading.textContent = "മാറ്റങ്ങൾ വരുത്തിയ ശേഷം 'Save & Update' ക്ലിക്ക് ചെയ്യുക";
    if (editNoticeBanner) editNoticeBanner.classList.remove("hidden");
    if (editTitleDisplay) editTitleDisplay.textContent = art.title || "Untitled";

    setSubmitButtonsLoading(false);

    // Switch to Tab 1 & scroll into view smoothly
    switchAdminTab("create");
    window.scrollTo({ top: 120, behavior: "smooth" });
};

// Global deleteArticle
window.deleteArticle = async function (id) {
    if (!confirm("ഈ ലേഖനം സ്ഥിരമായി നീക്കം ചെയ്യണമോ? (Are you sure you want to permanently delete this article?)")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "articles", id));
        showGlobalStatus("ലേഖനം വിജയകരമായി Firestore-ൽ നിന്ന് നീക്കം ചെയ്തു!", "success");
        if (editingArticleId === id) {
            exitEditMode();
        }
    } catch (e) {
        console.error("Firestore delete error:", e);
        showGlobalStatus("ലേഖനം നീക്കം ചെയ്യാൻ കഴിഞ്ഞില്ല: " + (e.message || "അനുമതി പരിശോധിക്കുക"), "error");
    }
};

/* ═══════════════════════════════════════════════════════════
   3. RICH FORMATTING TOOLBAR & MARKER HIGHLIGHT
   ═══════════════════════════════════════════════════════════ */
function bindRichTextEditorToolbar({
    contentTextarea,
    toolBoldBtn,
    toolHighlightBtn,
    toolRemoveHighlightBtn,
    toolHighlightCardBtn,
    toolH2Btn,
    toolH3Btn,
    toolInlineImgBtn,
    inlineImgFileInput,
    imgOptionsModal,
    cancelImgModalBtn,
    confirmInsertImgBtn,
    imgModalCaption,
    sizeRadioName
}) {
    if (!contentTextarea) return;

    let pendingLocalBase64 = "";

    function wrapSelectedText(prefix, suffix, defaultPlaceholder = "ഇവിടെ ടെക്സ്റ്റ് നൽകുക") {
        const start = contentTextarea.selectionStart;
        const end = contentTextarea.selectionEnd;
        const text = contentTextarea.value;
        const selected = text.substring(start, end) || defaultPlaceholder;
        const replacement = prefix + selected + suffix;
        contentTextarea.value = text.substring(0, start) + replacement + text.substring(end);
        contentTextarea.focus();
        contentTextarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }

    if (toolBoldBtn) toolBoldBtn.addEventListener("click", () => wrapSelectedText("**", "**"));
    if (toolH2Btn) toolH2Btn.addEventListener("click", () => wrapSelectedText("\n\n## ", "\n\n", "പ്രധാന ഉപതലക്കെട്ട് (H2)"));
    if (toolH3Btn) toolH3Btn.addEventListener("click", () => wrapSelectedText("\n\n### ", "\n\n", "ഉപതലക്കെട്ട് (H3)"));
    if (toolHighlightCardBtn) {
        toolHighlightCardBtn.addEventListener("click", () => {
            wrapSelectedText("\n\n:::highlight\n", "\n:::\n\n", "പ്രത്യേകം ശ്രദ്ധിക്കേണ്ട പ്രധാന വരികൾ അല്ലെങ്കിൽ ഉദ്ധരണി ഇവിടെ നൽകുക.");
        });
    }

    // Toggle or Apply Yellow Marker Highlight (==വാക്ക്==)
    if (toolHighlightBtn) {
        toolHighlightBtn.addEventListener("click", () => {
            const start = contentTextarea.selectionStart;
            const end = contentTextarea.selectionEnd;
            const text = contentTextarea.value;
            const selected = text.substring(start, end);

            if (selected) {
                if (selected.startsWith("==") && selected.endsWith("==") && selected.length >= 4) {
                    const unwrapped = selected.substring(2, selected.length - 2);
                    contentTextarea.value = text.substring(0, start) + unwrapped + text.substring(end);
                    contentTextarea.focus();
                    contentTextarea.setSelectionRange(start, start + unwrapped.length);
                    return;
                }
                const before2 = text.substring(Math.max(0, start - 2), start);
                const after2 = text.substring(end, end + 2);
                if (before2 === "==" && after2 === "==") {
                    contentTextarea.value = text.substring(0, start - 2) + selected + text.substring(end + 2);
                    contentTextarea.focus();
                    contentTextarea.setSelectionRange(start - 2, start - 2 + selected.length);
                    return;
                }
                wrapSelectedText("==", "==");
            } else {
                wrapSelectedText("==", "==", "ഹൈലൈറ്റ് വാക്ക്");
            }
        });
    }

    // Quick Remove Highlights
    if (toolRemoveHighlightBtn) {
        toolRemoveHighlightBtn.addEventListener("click", () => {
            const start = contentTextarea.selectionStart;
            const end = contentTextarea.selectionEnd;
            const text = contentTextarea.value;

            if (start !== end) {
                const selected = text.substring(start, end);
                const stripped = selected.replace(/==/g, "");
                contentTextarea.value = text.substring(0, start) + stripped + text.substring(end);
                contentTextarea.focus();
                contentTextarea.setSelectionRange(start, start + stripped.length);
            } else {
                if (text.includes("==")) {
                    if (confirm("ലേഖനത്തിലെ എല്ലാ ഹൈലൈറ്റുകളും (==) നീക്കം ചെയ്യണമോ?")) {
                        contentTextarea.value = text.replace(/==/g, "");
                        contentTextarea.focus();
                    }
                } else {
                    showGlobalStatus("മാറ്റാൻ ഹൈലൈറ്റുകളൊന്നും കണ്ടെത്തിയില്ല.", "error");
                }
            }
        });
    }

    // Inline Image Upload & Layout Selection Modal
    if (toolInlineImgBtn && inlineImgFileInput) {
        toolInlineImgBtn.addEventListener("click", () => inlineImgFileInput.click());

        inlineImgFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith("image/")) {
                showGlobalStatus("ദയവായി ഒരു സാധുവായ ചിത്രം (JPG, PNG, WebP) തിരഞ്ഞെടുക്കുക.", "error");
                inlineImgFileInput.value = "";
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                showGlobalStatus("ചിത്രത്തിന്റെ വലിപ്പം 12MB-യിൽ കുറവായിരിക്കണം.", "error");
                inlineImgFileInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onerror = function() {
                showGlobalStatus("ചിത്രം വായിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.", "error");
            };
            reader.onload = function (event) {
                const img = new Image();
                img.onerror = function() {
                    showGlobalStatus("ചിത്രം ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.", "error");
                };
                img.onload = function () {
                    const canvas = document.createElement("canvas");
                    const maxDim = 900;
                    let width = img.width;
                    let height = img.height;

                    if (width > height && width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);

                    pendingLocalBase64 = canvas.toDataURL("image/jpeg", 0.78);
                    if (imgModalCaption) imgModalCaption.value = "";
                    if (imgOptionsModal) {
                        imgOptionsModal.classList.remove("hidden");
                        imgOptionsModal.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }
                    inlineImgFileInput.value = "";
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (cancelImgModalBtn && imgOptionsModal) {
        cancelImgModalBtn.addEventListener("click", () => {
            pendingLocalBase64 = "";
            imgOptionsModal.classList.add("hidden");
        });
    }

    if (confirmInsertImgBtn && imgOptionsModal) {
        confirmInsertImgBtn.addEventListener("click", () => {
            if (!pendingLocalBase64) return;
            const selectedSizeEl = document.querySelector(`input[name="${sizeRadioName}"]:checked`);
            const size = selectedSizeEl ? selectedSizeEl.value : "medium";
            const caption = imgModalCaption ? (imgModalCaption.value.trim() || "ചിത്രം") : "ചിത്രം";

            const insertTag = `\n\n![${caption}|${size}](${pendingLocalBase64})\n\n`;

            const start = contentTextarea.selectionStart;
            const text = contentTextarea.value;
            contentTextarea.value = text.substring(0, start) + insertTag + text.substring(start);

            pendingLocalBase64 = "";
            imgOptionsModal.classList.add("hidden");
            contentTextarea.focus();
        });
    }
}

function initFormattingToolbar() {
    // 1. Article Editor Toolbar
    bindRichTextEditorToolbar({
        contentTextarea: document.getElementById("art-content"),
        toolBoldBtn: document.getElementById("tool-bold-btn"),
        toolHighlightBtn: document.getElementById("tool-highlight-btn"),
        toolRemoveHighlightBtn: document.getElementById("tool-remove-highlight-btn"),
        toolHighlightCardBtn: document.getElementById("tool-highlight-card-btn"),
        toolH2Btn: document.getElementById("tool-h2-btn"),
        toolH3Btn: document.getElementById("tool-h3-btn"),
        toolInlineImgBtn: document.getElementById("tool-inline-img-btn"),
        inlineImgFileInput: document.getElementById("inline-img-file-input"),
        imgOptionsModal: document.getElementById("img-options-modal"),
        cancelImgModalBtn: document.getElementById("cancel-img-modal-btn"),
        confirmInsertImgBtn: document.getElementById("confirm-insert-img-btn"),
        imgModalCaption: document.getElementById("img-modal-caption"),
        sizeRadioName: "img-size-option"
    });

    // 2. Book Chapter Editor Toolbar
    bindRichTextEditorToolbar({
        contentTextarea: document.getElementById("bm-art-content"),
        toolBoldBtn: document.getElementById("bm-tool-bold-btn"),
        toolHighlightBtn: document.getElementById("bm-tool-highlight-btn"),
        toolRemoveHighlightBtn: document.getElementById("bm-tool-remove-highlight-btn"),
        toolHighlightCardBtn: document.getElementById("bm-tool-highlight-card-btn"),
        toolH2Btn: document.getElementById("bm-tool-h2-btn"),
        toolH3Btn: document.getElementById("bm-tool-h3-btn"),
        toolInlineImgBtn: document.getElementById("bm-tool-inline-img-btn"),
        inlineImgFileInput: document.getElementById("bm-inline-img-file-input"),
        imgOptionsModal: document.getElementById("bm-img-options-modal"),
        cancelImgModalBtn: document.getElementById("bm-cancel-img-modal-btn"),
        confirmInsertImgBtn: document.getElementById("bm-confirm-insert-img-btn"),
        imgModalCaption: document.getElementById("bm-img-modal-caption"),
        sizeRadioName: "bm-img-size-option"
    });
}

/* ═══════════════════════════════════════════════════════════
   4. COLOR CUSTOMIZER LOGIC
   ═══════════════════════════════════════════════════════════ */
function initColorCustomizer() {
    const titleColorInput = document.getElementById("art-title-color");
    const contentColorInput = document.getElementById("art-content-color");
    const titleColorHex = document.getElementById("title-color-hex");
    const contentColorHex = document.getElementById("content-color-hex");
    const previewTitle = document.getElementById("preview-title");
    const previewBody = document.getElementById("preview-body");
    const resetColorsBtn = document.getElementById("reset-colors-btn");

    if (titleColorInput && titleColorHex && previewTitle) {
        titleColorInput.addEventListener("input", (e) => {
            const val = e.target.value;
            titleColorHex.textContent = val;
            previewTitle.style.color = val;
        });
    }

    if (contentColorInput && contentColorHex && previewBody) {
        contentColorInput.addEventListener("input", (e) => {
            const val = e.target.value;
            contentColorHex.textContent = val;
            previewBody.style.color = val;
        });
    }

    if (resetColorsBtn) {
        resetColorsBtn.addEventListener("click", () => {
            if (titleColorInput) titleColorInput.value = "#1e1b18";
            if (titleColorHex) titleColorHex.textContent = "#1e1b18";
            if (previewTitle) previewTitle.style.color = "#1e1b18";

            if (contentColorInput) contentColorInput.value = "#2b2118";
            if (contentColorHex) contentColorHex.textContent = "#2b2118";
            if (previewBody) previewBody.style.color = "#2b2118";
        });
    }

    // Font size selector change listener & live preview
    const fontSizeRadios = document.querySelectorAll('input[name="art-font-size"]');
    const fontSizeLabel = document.getElementById("font-size-label");
    const previewContent = document.getElementById("preview-body");

    fontSizeRadios.forEach(radio => {
        if (!radio) return;
        radio.addEventListener("change", (e) => {
            const val = e.target.value;
            const labels = {
                small: "Small (ചെറുത് - 14px)",
                medium: "Medium (സാധാരണ - 16px)",
                large: "Large (വലുത് - 18px)",
                xlarge: "Extra Large (കൂടുതൽ - 21px)"
            };
            if (fontSizeLabel) fontSizeLabel.textContent = labels[val] || val;
            if (previewContent) {
                const sizes = { small: "14px", medium: "16px", large: "18px", xlarge: "21px" };
                previewContent.style.fontSize = sizes[val] || "16px";
            }
        });
    });

    // Chapter Color Customizer
    const bmTitleColorInput = document.getElementById("bm-art-title-color");
    const bmContentColorInput = document.getElementById("bm-art-content-color");
    const bmTitleColorHex = document.getElementById("bm-title-color-hex");
    const bmContentColorHex = document.getElementById("bm-content-color-hex");
    const bmResetColorsBtn = document.getElementById("bm-reset-colors-btn");
    const bmFontSizeRadios = document.querySelectorAll('input[name="bm-art-font-size"]');
    const bmFontSizeLabel = document.getElementById("bm-font-size-label");

    if (bmTitleColorInput) {
        bmTitleColorInput.addEventListener("input", (e) => {
            const val = e.target.value;
            if (bmTitleColorHex) bmTitleColorHex.textContent = val;
        });
    }
    if (bmContentColorInput) {
        bmContentColorInput.addEventListener("input", (e) => {
            const val = e.target.value;
            if (bmContentColorHex) bmContentColorHex.textContent = val;
        });
    }
    if (bmResetColorsBtn) {
        bmResetColorsBtn.addEventListener("click", () => {
            if (bmTitleColorInput) bmTitleColorInput.value = "#1e1b18";
            if (bmTitleColorHex) bmTitleColorHex.textContent = "#1e1b18";
            if (bmContentColorInput) bmContentColorInput.value = "#2b2118";
            if (bmContentColorHex) bmContentColorHex.textContent = "#2b2118";
            const defaultBmFSRadio = document.querySelector('input[name="bm-art-font-size"][value="medium"]');
            if (defaultBmFSRadio) defaultBmFSRadio.checked = true;
            if (bmFontSizeLabel) bmFontSizeLabel.textContent = "Medium (Standard)";
        });
    }
    if (bmFontSizeRadios) {
        bmFontSizeRadios.forEach(radio => {
            radio.addEventListener("change", (e) => {
                const val = e.target.value;
                const labels = {
                    small: "Small (ചെറുത് - 15px)",
                    medium: "Medium (സാധാരണ - 18px)",
                    large: "Large (വലുത് - 21px)",
                    xlarge: "Extra Large (കൂടുതൽ - 24px)"
                };
                if (bmFontSizeLabel) bmFontSizeLabel.textContent = labels[val] || val;
            });
        });
    }
}

/* ═══════════════════════════════════════════════════════════
   5. COVER IMAGE UPLOAD & COMPRESSION
   ═══════════════════════════════════════════════════════════ */
function initImageUpload() {
    const fileInput = document.getElementById("art-file-input");
    const uploadPlaceholder = document.getElementById("upload-placeholder");
    const imagePreviewContainer = document.getElementById("image-preview-container");
    const imagePreview = document.getElementById("image-preview");
    const removeImgBtn = document.getElementById("remove-img-btn");

    if (!fileInput) return;

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Strict file validation
        if (!file.type.startsWith("image/")) {
            showGlobalStatus("ദയവായി ഒരു സാധുവായ ഇമേജ് ഫയൽ (JPG, PNG, WebP) തിരഞ്ഞെടുക്കുക.", "error");
            fileInput.value = "";
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            showGlobalStatus("ചിത്രത്തിന്റെ വലിപ്പം 12MB-യിൽ കുറവായിരിക്കണം.", "error");
            fileInput.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onerror = function() {
            showGlobalStatus("ചിത്രം വായിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും തിരഞ്ഞെടുക്കുക.", "error");
        };
        reader.onload = function (event) {
            const img = new Image();
            img.onerror = function() {
                showGlobalStatus("ചിത്രം ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.", "error");
            };
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const maxDim = 900;
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                // High-efficiency JPEG compression to protect Firestore 1MB limits
                selectedBase64Image = canvas.toDataURL("image/jpeg", 0.78);
                if (imagePreview) imagePreview.src = selectedBase64Image;
                if (uploadPlaceholder) uploadPlaceholder.classList.add("hidden");
                if (imagePreviewContainer) imagePreviewContainer.classList.remove("hidden");
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    if (removeImgBtn) {
        removeImgBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedBase64Image = "";
            fileInput.value = "";
            if (imagePreview) imagePreview.src = "";
            if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
            if (uploadPlaceholder) uploadPlaceholder.classList.remove("hidden");
        });
    }
}

/* ═══════════════════════════════════════════════════════════
   6B. SINGLE-AUTHOR BOOK MANAGER SUITE (STEP-BY-STEP WORKFLOW & REORDERING)
   ═══════════════════════════════════════════════════════════ */

function normalizeStringClean(s) {
    return (s || "")
        .toString()
        .normalize('NFC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function matchesBookExact(art, bName, bTitle, bId) {
    if (!art) return false;
    if (bId && art.id === bId) return false;
    if (art.type === "BOOK") return false;

    const artBook = normalizeStringClean(art.bookName || art.playlistName);
    const artBookId = (art.bookId || "").trim();

    if (bId && artBookId && bId === artBookId) return true;
    if (bName && artBook && bName === artBook) return true;
    if (bTitle && artBook && bTitle === artBook) return true;
    if (bName && artBook && bName.length >= 3 && (artBook.includes(bName) || bName.includes(artBook))) return true;
    if (bTitle && artBook && bTitle.length >= 3 && (artBook.includes(bTitle) || bTitle.includes(artBook))) return true;

    return false;
}

let isBookManagerSuiteInitialized = false;

function generateDefaultBookCover(title, category = "Book") {
    const escapedTitle = (title || "NUQTHA BOOK").replace(/[<>&"]/g, "");
    const escapedCat = (category || "PREMIUM BOOK").replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
                <stop offset="50%" style="stop-color:#172554;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
            </linearGradient>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
            </pattern>
        </defs>
        <rect width="600" height="800" fill="url(#grad)"/>
        <rect width="600" height="800" fill="url(#grid)"/>
        <rect x="25" y="25" width="550" height="750" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" rx="12"/>
        <text x="300" y="160" font-family="sans-serif" font-size="16" font-weight="bold" fill="#93c5fd" letter-spacing="4" text-anchor="middle">${escapedCat.toUpperCase()}</text>
        <line x1="260" y1="180" x2="340" y2="180" stroke="#60a5fa" stroke-width="2"/>
        <text x="300" y="380" font-family="'Noto Serif Malayalam', serif, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle" width="500">${escapedTitle}</text>
        <circle cx="300" cy="520" r="30" fill="rgba(255,255,255,0.1)"/>
        <text x="300" y="528" font-family="sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">📖</text>
        <text x="300" y="720" font-family="sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" letter-spacing="3" text-anchor="middle">NUQTHA PUBLICATIONS</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function initBookManagerSuite() {
    if (isBookManagerSuiteInitialized) return;
    isBookManagerSuiteInitialized = true;
    initBookCoverUploader();
    initBookSwitcherAndStep1();
    initChapterWriter();
    initChapterReordering();
    initBookAttachExistingArticles();
    initBookPresentationUpload();
}

/* ═══════════ 1. BOOK COVER UPLOADER (STEP 1) ═══════════ */
function initBookCoverUploader() {
    const fileInput = document.getElementById("book-cover-input") || document.querySelector('input[name="book-cover-input"]');
    const placeholder = document.getElementById("book-upload-placeholder");
    const previewContainer = document.getElementById("book-image-preview-container");
    const previewImg = document.getElementById("book-image-preview");
    const removeBtn = document.getElementById("remove-book-img-btn");
    const dropzone = document.getElementById("book-cover-dropzone");

    function showCoverError(msg) {
        const errEl = document.getElementById("book-cover-error");
        if (errEl) {
            errEl.textContent = msg;
            errEl.classList.remove("hidden");
        }
    }

    function clearCoverError() {
        const errEl = document.getElementById("book-cover-error");
        if (errEl) {
            errEl.textContent = "";
            errEl.classList.add("hidden");
        }
    }

    function handleCoverFile(file) {
        clearCoverError();
        if (!file) return;

        // Instant visual feedback with ObjectURL
        try {
            const objectUrl = URL.createObjectURL(file);
            if (previewImg) previewImg.src = objectUrl;
            if (placeholder) placeholder.classList.add("hidden");
            if (previewContainer) previewContainer.classList.remove("hidden");
        } catch (e) {
            console.warn("ObjectURL fallback:", e);
        }

        const reader = new FileReader();
        reader.onerror = (err) => {
            console.error("FileReader error:", err);
            showCoverError("ചിത്രം വായിക്കുന്നതിൽ തടസ്സം നേരിട്ടു.");
        };

        reader.onload = (event) => {
            const rawBase64 = event.target.result;
            selectedBookCoverBase64 = rawBase64;

            const img = new Image();
            img.onerror = () => {
                clearCoverError();
            };
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    const maxDim = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressed = canvas.toDataURL("image/jpeg", 0.82);
                    if (compressed && compressed.length > 100) {
                        selectedBookCoverBase64 = compressed;
                        if (previewImg) previewImg.src = compressed;
                    }
                } catch (cErr) {
                    console.warn("Canvas compression fallback:", cErr);
                }
                clearCoverError();
            };
            img.src = rawBase64;
        };
        reader.readAsDataURL(file);
    }

    window.handleCoverFileSelected = handleCoverFile;

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleCoverFile(file);
        });
    }

    if (dropzone) {
        dropzone.addEventListener("click", (e) => {
            if (e.target !== fileInput && !e.target.closest("#remove-book-img-btn")) {
                if (fileInput) fileInput.click();
            }
        });
        ["dragenter", "dragover"].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("border-blue-600", "bg-blue-100/60");
            });
        });
        ["dragleave", "drop"].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("border-blue-600", "bg-blue-100/60");
            });
        });
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("border-blue-600", "bg-blue-100/60");
            const dt = e.dataTransfer;
            const file = dt && dt.files && dt.files[0];
            if (file) handleCoverFile(file);
        });
    }

    function handleRemoveBookCover(e) {
        if (e) e.stopPropagation();
        selectedBookCoverBase64 = "";
        if (fileInput) fileInput.value = "";
        if (previewImg) previewImg.src = "";
        if (previewContainer) previewContainer.classList.add("hidden");
        if (placeholder) placeholder.classList.remove("hidden");
        clearCoverError();
    }

    window.handleRemoveBookCover = handleRemoveBookCover;
    if (removeBtn) {
        removeBtn.addEventListener("click", handleRemoveBookCover);
    }
}

/* ═══════════ 2. BOOK SWITCHER & STEP 1 SAVING ═══════════ */
async function handleSaveBookStep1(e) {
    if (e && e.preventDefault) e.preventDefault();

    // Clear previous inline errors
    const titleErrEl = document.getElementById("book-title-error");
    const coverErrEl = document.getElementById("book-cover-error");
    const introErrEl = document.getElementById("book-intro-error");
    if (titleErrEl) { titleErrEl.textContent = ""; titleErrEl.classList.add("hidden"); }
    if (coverErrEl) { coverErrEl.textContent = ""; coverErrEl.classList.add("hidden"); }
    if (introErrEl) { introErrEl.textContent = ""; introErrEl.classList.add("hidden"); }

    const nameInput = document.getElementById("book-meta-name") || document.querySelector('[name="book-meta-name"]') || document.querySelector('[data-book-title-input]');
    const name = (nameInput?.value || "").trim();

    const authorInput = document.getElementById("book-meta-author");
    const author = (authorInput?.value || "").trim() || "Single Author";

    const tagInput = document.getElementById("book-meta-tag") || document.querySelector('[name="book-meta-tag"]');
    const tag = (tagInput?.value || "").trim() || "Premium Book";

    const dateVal = document.getElementById("book-meta-date")?.value.trim() || new Date().toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });

    const introInput = document.getElementById("book-meta-intro") || document.getElementById("book-meta-desc");
    const intro = (introInput?.value || "").trim();

    let hasError = false;
    if (!name) {
        if (titleErrEl) {
            titleErrEl.textContent = "ദയവായി പുസ്തകത്തിന്റെ പേര് (Book Title) നൽകുക.";
            titleErrEl.classList.remove("hidden");
        }
        nameInput?.classList.add("border-rose-500", "focus:border-rose-600");
        nameInput?.focus();
        hasError = true;
    } else {
        nameInput?.classList.remove("border-rose-500", "focus:border-rose-600");
    }

    if (!intro) {
        if (introErrEl) {
            introErrEl.textContent = "ദയവായി പുസ്തകത്തിന്റെ ആമുഖം (Book Introduction) നൽകുക.";
            introErrEl.classList.remove("hidden");
        }
        introInput?.classList.add("border-rose-500", "focus:border-rose-600");
        if (!hasError) introInput?.focus();
        hasError = true;
    } else {
        introInput?.classList.remove("border-rose-500", "focus:border-rose-600");
    }

    if (hasError) return;

    // Check if existing in Firestore
    const existing = currentArticlesList.find(a => a.type === "BOOK" && (
        normalizeStringClean(a.bookName) === normalizeStringClean(name) ||
        normalizeStringClean(a.title) === normalizeStringClean(name)
    ));

    // Provide default SVG cover if no image was uploaded
    let coverImage = selectedBookCoverBase64 || (existing ? existing.imageUrl : "") || "";
    if (!coverImage) {
        coverImage = generateDefaultBookCover(name, tag);
    }

    const publishBtn = document.getElementById("publish-book-cover-btn");
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `<span class="inline-block animate-spin mr-2">⏳</span><span>സേവ് ചെയ്യുന്നു...</span>`;
    }

    try {
        const payload = {
            title: name,
            bookName: name,
            author: author,
            category: tag,
            imageUrl: coverImage,
            introduction: intro,
            excerpt: intro,
            content: intro,
            type: "BOOK",
            placement: "AUTO",
            priority: 1,
            date: dateVal,
            updatedAt: serverTimestamp()
        };

        // Clean out legacy magazine fields if updating existing book
        if (existing) {
            payload.leadTitle = "";
            payload.featuredTitle = "";
            payload.volume = "";
            payload.issue = "";
        }

        let savedDocId = "";
        if (existing) {
            await updateDoc(doc(db, "articles", existing.id), payload);
            savedDocId = existing.id;
            Object.assign(existing, payload);
            showGlobalStatus(`✨ പുസ്തകം '${name}' വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!`, "success");
        } else {
            const docRef = await addDoc(collection(db, "articles"), {
                ...payload,
                createdAt: serverTimestamp()
            });
            savedDocId = docRef.id;
            currentArticlesList.unshift({ id: savedDocId, ...payload });
            showGlobalStatus(`📚 പുതിയ പുസ്തകം '${name}' വിജയകരമായി പ്രസിദ്ധീകരിച്ചു!`, "success");
        }

        // Update author & name on active book session
        activeBookName = name;
        activeBookAuthor = author;

        const allBooks = currentArticlesList.filter(a => isMainBook(a));
        updateBooksCounter(allBooks.length);
        updateActiveBookOverview(currentArticlesList);
        renderAdminBooksTab(currentArticlesList);
        selectActiveBook(name);

        // Instantly reveal and scroll smoothly to Step 2
        const step2Wrapper = document.getElementById("bm-step2-3-wrapper");
        if (step2Wrapper) {
            step2Wrapper.classList.remove("hidden");
            setTimeout(() => {
                step2Wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
        }

    } catch (err) {
        console.error("Save book error:", err);
        showGlobalStatus("പുസ്തകം സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
    } finally {
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.innerHTML = `<span>സേവ് ചെയ്ത് അധ്യായങ്ങൾ ചേർക്കലിലേക്ക് കടക്കുക (Save & Continue to Step 2)</span><svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
        }
    }
}

window.handleSaveBookStep1 = handleSaveBookStep1;

function initBookSwitcherAndStep1() {
    const activeSelect = document.getElementById("bm-active-book-select");
    const newBookBtn = document.getElementById("bm-new-book-btn");
    const publishBtn = document.getElementById("publish-book-cover-btn");

    if (activeSelect) {
        activeSelect.addEventListener("change", () => {
            const val = activeSelect.value.trim();
            selectActiveBook(val);
        });
    }

    if (newBookBtn) {
        newBookBtn.addEventListener("click", () => {
            resetBookManagerForm();
            showGlobalStatus("✨ പുതിയ പുസ്തകം തയ്യാറാക്കുക: വിവരങ്ങൾ നൽകി സേവ് ചെയ്യുക.", "info");
        });
    }

    // Attach real-time input listener to clear error border/message on typing
    const nameInputEl = document.getElementById("book-meta-name") || document.querySelector('[name="book-meta-name"]') || document.querySelector('[data-book-title-input]');
    if (nameInputEl) {
        nameInputEl.addEventListener("input", () => {
            const titleErrEl = document.getElementById("book-title-error");
            if (titleErrEl) {
                titleErrEl.textContent = "";
                titleErrEl.classList.add("hidden");
            }
            nameInputEl.classList.remove("border-rose-500", "focus:border-rose-600");
        });
    }

    const introInputEl = document.getElementById("book-meta-intro") || document.getElementById("book-meta-desc");
    if (introInputEl) {
        introInputEl.addEventListener("input", () => {
            const introErrEl = document.getElementById("book-intro-error");
            if (introErrEl) {
                introErrEl.textContent = "";
                introErrEl.classList.add("hidden");
            }
            introInputEl.classList.remove("border-rose-500", "focus:border-rose-600");
        });
    }

    if (publishBtn) {
        publishBtn.addEventListener("click", handleSaveBookStep1);
    }
}

function resetBookManagerForm() {
    activeBookName = "";
    activeBookAuthor = "";
    activeBookCoverDoc = null;
    activeBookChapters = [];
    selectedBookCoverBase64 = "";

    const titleErrEl = document.getElementById("book-title-error");
    const coverErrEl = document.getElementById("book-cover-error");
    const introErrEl = document.getElementById("book-intro-error");
    if (titleErrEl) { titleErrEl.textContent = ""; titleErrEl.classList.add("hidden"); }
    if (coverErrEl) { coverErrEl.textContent = ""; coverErrEl.classList.add("hidden"); }
    if (introErrEl) { introErrEl.textContent = ""; introErrEl.classList.add("hidden"); }

    const activeSelect = document.getElementById("bm-active-book-select");
    if (activeSelect) activeSelect.value = "";

    const nameInput = document.getElementById("book-meta-name");
    nameInput?.classList.remove("border-rose-500", "focus:border-rose-600");
    const authorInput = document.getElementById("book-meta-author");
    const tagInput = document.getElementById("book-meta-tag");
    const introInput = document.getElementById("book-meta-intro") || document.getElementById("book-meta-desc");
    introInput?.classList.remove("border-rose-500", "focus:border-rose-600");
    const dateInput = document.getElementById("book-meta-date");
    const removeBtn = document.getElementById("remove-book-img-btn");

    if (nameInput) nameInput.value = "";
    if (authorInput) authorInput.value = "";
    if (tagInput) tagInput.value = "Premium Book";
    if (introInput) introInput.value = "";
    if (dateInput) dateInput.value = "";
    if (removeBtn) removeBtn.click();

    const wrapper = document.getElementById("bm-step2-3-wrapper");
    if (wrapper) wrapper.classList.add("hidden");

    nameInput?.focus();
    renderAdminBooksTab(currentArticlesList);
}

function selectActiveBook(bookName) {
    const wrapper = document.getElementById("bm-step2-3-wrapper");
    if (!bookName) {
        if (wrapper) wrapper.classList.add("hidden");
        activeBookName = "";
        activeBookAuthor = "";
        activeBookCoverDoc = null;
        activeBookChapters = [];
        return;
    }

    const cleanTarget = normalizeStringClean(bookName);
    const bookCover = currentArticlesList.find(a => a.type === "BOOK" && (
        normalizeStringClean(a.bookName) === cleanTarget ||
        normalizeStringClean(a.title) === cleanTarget
    ));

    activeBookName = bookCover ? (bookCover.bookName || bookCover.title) : bookName;
    activeBookAuthor = bookCover ? (bookCover.author || "") : "";
    activeBookCoverDoc = bookCover || null;

    // Populate Step 1 fields
    const nameInput = document.getElementById("book-meta-name");
    const authorInput = document.getElementById("book-meta-author");
    const tagInput = document.getElementById("book-meta-tag");
    const introInput = document.getElementById("book-meta-intro") || document.getElementById("book-meta-desc");
    const dateInput = document.getElementById("book-meta-date");
    const previewImg = document.getElementById("book-image-preview");
    const previewContainer = document.getElementById("book-image-preview-container");
    const placeholder = document.getElementById("book-upload-placeholder");

    if (nameInput) nameInput.value = activeBookName;
    if (authorInput) authorInput.value = activeBookAuthor;
    if (tagInput) tagInput.value = bookCover?.category || "Premium Book";
    if (introInput) introInput.value = bookCover?.introduction || bookCover?.excerpt || bookCover?.content || "";
    if (dateInput) dateInput.value = bookCover?.date || "";

    if (bookCover?.imageUrl && previewImg && previewContainer && placeholder) {
        previewImg.src = bookCover.imageUrl;
        previewContainer.classList.remove("hidden");
        placeholder.classList.add("hidden");
        selectedBookCoverBase64 = bookCover.imageUrl;
    }

    // Activate Step 2 & 3
    if (wrapper) wrapper.classList.remove("hidden");

    const titleBadge = document.getElementById("bm-active-book-title-badge");
    const authorBadge = document.getElementById("bm-active-book-author-badge");
    if (titleBadge) titleBadge.textContent = activeBookName;
    if (authorBadge) authorBadge.textContent = activeBookAuthor || "Single Author";

    // Synchronize select dropdown
    const activeSelect = document.getElementById("bm-active-book-select");
    if (activeSelect && activeSelect.value !== activeBookName) {
        activeSelect.value = activeBookName;
    }

    // Filter chapters for this book
    loadAndRenderBookChapters();
    renderBookManagerCompactArticles(currentArticlesList, activeBookName);
    renderAdminBooksTab(currentArticlesList);
}

async function loadAndRenderBookChapters() {
    if (!activeBookName && !activeBookCoverDoc) {
        activeBookChapters = [];
        renderBookChaptersReorderList([]);
        return;
    }

    const bookTarget = activeBookCoverDoc || {
        id: activeBookCoverDoc?.id || "",
        title: activeBookName,
        bookName: activeBookName
    };

    activeBookChapters = filterAndSortChapters(bookTarget, currentArticlesList);
    
    // If not found in current local list or 0 chapters, fetch asynchronously from Firestore
    if (activeBookChapters.length === 0 && (bookTarget.id || activeBookName)) {
        try {
            const listEl = document.getElementById("book-chapters-reorder-list");
            if (listEl) {
                listEl.innerHTML = '<p class="text-xs text-center py-6 text-indigo-600 animate-pulse font-bold">അധ്യായങ്ങൾ ലോഡ് ചെയ്യുന്നു...</p>';
            }
            const targetId = bookTarget.id || (currentArticlesList.find(a => 
                a.type === "BOOK" && (normalizeStringClean(a.bookName) === normalizeStringClean(activeBookName) || normalizeStringClean(a.title) === normalizeStringClean(activeBookName))
            )?.id) || activeBookName;

            const fetched = await getBookChapters(targetId, {
                articlesPool: currentArticlesList,
                timeoutMs: 6000
            });
            const chaptersArr = Array.isArray(fetched) ? fetched : (fetched?.chapters || []);
            if (chaptersArr && chaptersArr.length > 0) {
                activeBookChapters = chaptersArr;
            }
        } catch (fErr) {
            console.warn("[Admin] Live chapters fetch fallback:", fErr);
        }
    }

    renderBookChaptersReorderList(activeBookChapters);
}

/* ═══════════ 3. STEP 2: CHAPTER WRITER (SINGLE AUTHOR - NO AUTHOR INPUT) ═══════════ */
function initChapterWriter() {
    const fileInput = document.getElementById("bm-art-image-input");
    const placeholder = document.getElementById("bm-art-image-placeholder");
    const previewContainer = document.getElementById("bm-art-image-preview-container");
    const previewImg = document.getElementById("bm-art-image-preview");
    const removeBtn = document.getElementById("bm-remove-art-img-btn");
    const publishBtn = document.getElementById("bm-publish-article-btn");
    const dropzone = document.getElementById("bm-art-image-dropzone") || (fileInput ? fileInput.parentElement : null);

    if (fileInput) {
        function handleChapterImg(file) {
            if (!file || !file.type.startsWith("image/")) {
                showGlobalStatus("ദയവായി ഒരു സാധുവായ ചിത്രം തിരഞ്ഞെടുക്കുക.", "error");
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const maxDim = 800;
                    let width = img.width;
                    let height = img.height;
                    if (width > height && width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);
                    bmSelectedArticleImageBase64 = canvas.toDataURL("image/jpeg", 0.75);
                    if (previewImg) previewImg.src = bmSelectedArticleImageBase64;
                    if (placeholder) placeholder.classList.add("hidden");
                    if (previewContainer) previewContainer.classList.remove("hidden");
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }

        fileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleChapterImg(file);
        });

        if (dropzone) {
            dropzone.addEventListener("click", (e) => {
                if (e.target !== fileInput && !e.target.closest("#bm-remove-art-img-btn")) {
                    fileInput.click();
                }
            });
            ["dragenter", "dragover"].forEach(evt => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add("border-emerald-600", "bg-emerald-100/40");
                });
            });
            ["dragleave", "drop"].forEach(evt => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove("border-emerald-600", "bg-emerald-100/40");
                });
            });
            dropzone.addEventListener("drop", (e) => {
                const dt = e.dataTransfer;
                const file = dt && dt.files && dt.files[0];
                if (file) handleChapterImg(file);
            });
        }
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            bmSelectedArticleImageBase64 = "";
            if (fileInput) fileInput.value = "";
            if (previewImg) previewImg.src = "";
            if (previewContainer) previewContainer.classList.add("hidden");
            if (placeholder) placeholder.classList.remove("hidden");
        });
    }

    let isSavingChapter = false;
    let editingChapterId = null;

    function showChapterInlineMsg(text, type = "error") {
        const msgEl = document.getElementById("bm-chapter-msg");
        if (!msgEl) return;
        msgEl.textContent = text;
        msgEl.classList.remove("hidden");
        if (type === "error") {
            msgEl.className = "p-3 rounded-xl text-xs font-bold text-center mb-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        } else {
            msgEl.className = "p-3 rounded-xl text-xs font-bold text-center mb-3 bg-emerald-50 text-emerald-800 border border-emerald-200 block";
        }
    }

    function clearChapterInlineMsg() {
        const msgEl = document.getElementById("bm-chapter-msg");
        if (msgEl) {
            msgEl.textContent = "";
            msgEl.className = "hidden p-3 rounded-xl text-xs font-bold text-center mb-3";
        }
    }

    function resetChapterEditMode() {
        editingChapterId = null;
        const cancelBtn = document.getElementById("bm-cancel-edit-chapter-btn");
        const publishBtn = document.getElementById("bm-publish-article-btn");
        if (cancelBtn) cancelBtn.classList.add("hidden");
        if (publishBtn) {
            publishBtn.innerHTML = '<span>ഈ അധ്യായം പുസ്തകത്തിലേക്ക് ചേർക്കുക (Add Chapter to Book)</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>';
        }
        const excerptInput = document.getElementById("bm-art-excerpt");
        if (excerptInput) excerptInput.value = "";
        const resetColorsBtn = document.getElementById("bm-reset-colors-btn");
        if (resetColorsBtn) resetColorsBtn.click();
    }

    function startEditChapter(id) {
        const art = (activeBookChapters && activeBookChapters.find(c => c.id === id)) ||
                    (currentArticlesList && currentArticlesList.find(a => a.id === id));
        if (!art) {
            showChapterInlineMsg("അധ്യായം കണ്ടെത്താനായില്ല.", "error");
            return;
        }
        editingChapterId = id;

        const titleInput = document.getElementById("bm-art-title");
        const contentInput = document.getElementById("bm-art-content");
        const transcriptionInput = document.getElementById("bm-art-transcription");
        const excerptInput = document.getElementById("bm-art-excerpt");
        const previewImg = document.getElementById("bm-art-image-preview");
        const previewContainer = document.getElementById("bm-art-image-preview-container");
        const placeholder = document.getElementById("bm-art-image-placeholder");
        const cancelBtn = document.getElementById("bm-cancel-edit-chapter-btn");
        const publishBtn = document.getElementById("bm-publish-article-btn");

        if (titleInput) titleInput.value = art.title || "";
        if (contentInput) contentInput.value = art.content || "";
        if (transcriptionInput) transcriptionInput.value = art.transcription || "";
        if (excerptInput) excerptInput.value = art.storedExcerpt || (art.hasCustomExcerpt ? art.excerpt : "") || art.excerpt || "";

        // Populate chapter colors & font size
        const titleColorInput = document.getElementById("bm-art-title-color");
        const contentColorInput = document.getElementById("bm-art-content-color");
        const titleColorHex = document.getElementById("bm-title-color-hex");
        const contentColorHex = document.getElementById("bm-content-color-hex");
        const tColor = art.titleColor || "#1e1b18";
        const cColor = art.contentColor || "#2b2118";
        if (titleColorInput) titleColorInput.value = tColor;
        if (titleColorHex) titleColorHex.textContent = tColor;
        if (contentColorInput) contentColorInput.value = cColor;
        if (contentColorHex) contentColorHex.textContent = cColor;

        const fSize = art.fontSize || "medium";
        const fSizeRadio = document.querySelector(`input[name="bm-art-font-size"][value="${fSize}"]`);
        if (fSizeRadio) fSizeRadio.checked = true;
        const fSizeLabel = document.getElementById("bm-font-size-label");
        if (fSizeLabel) {
            const labels = { small: "Small (ചെറുത്)", medium: "Medium (സാധാരണ)", large: "Large (വലുത്)", xlarge: "Extra Large (കൂടുതൽ)" };
            fSizeLabel.textContent = labels[fSize] || fSize;
        }

        if (art.imageUrl && previewImg && previewContainer && placeholder) {
            previewImg.src = art.imageUrl;
            previewContainer.classList.remove("hidden");
            placeholder.classList.add("hidden");
            bmSelectedArticleImageBase64 = art.imageUrl;
        } else if (previewContainer && placeholder) {
            previewContainer.classList.add("hidden");
            placeholder.classList.remove("hidden");
            bmSelectedArticleImageBase64 = "";
        }

        if (cancelBtn) cancelBtn.classList.remove("hidden");
        if (publishBtn) {
            publishBtn.innerHTML = '<span>അധ്യായം അപ്‌ഡേറ്റ് ചെയ്യുക (Update Chapter)</span><svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        }

        showChapterInlineMsg(`✏️ അധ്യായം '${art.title || ''}' എഡിറ്റ് മോഡിലാണ്. മാറ്റങ്ങൾ വരുത്തിയ ശേഷം 'Update Chapter' അമർത്തുക.`, "info");

        const step2El = document.getElementById("bm-step2-wrapper") || document.getElementById("bm-art-title");
        if (step2El) {
            step2El.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (titleInput) {
            setTimeout(() => titleInput.focus(), 200);
        }
    }
    window.startEditChapter = startEditChapter;

    async function handleAddChapterToBook(e) {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (isSavingChapter) {
            console.log("[ChapterWriter] Already processing save, skipping duplicate trigger");
            return;
        }

        clearChapterInlineMsg();

        // 1. Strict Step 1 requirement: Must have active bookId
        let targetBookDoc = activeBookCoverDoc;
        if (!targetBookDoc || !targetBookDoc.id) {
            const rawTargetName = (activeBookName || document.getElementById("bm-active-book-select")?.value || document.getElementById("book-meta-name")?.value || "").trim();
            if (rawTargetName && Array.isArray(currentArticlesList)) {
                const cleanTarget = normalizeStringClean(rawTargetName);
                targetBookDoc = currentArticlesList.find(a => a.type === "BOOK" && (
                    normalizeStringClean(a.bookName) === cleanTarget ||
                    normalizeStringClean(a.title) === cleanTarget
                )) || null;
                if (targetBookDoc) {
                    activeBookCoverDoc = targetBookDoc;
                    activeBookName = targetBookDoc.bookName || targetBookDoc.title;
                    activeBookAuthor = targetBookDoc.author || activeBookAuthor;
                }
            }
        }

        const activeBookId = targetBookDoc?.id || "";
        if (!activeBookId) {
            showChapterInlineMsg("ആദ്യം ഘട്ടം 1 സേവ് ചെയ്യുക", "error");
            console.error("[ChapterWriter] Active bookId missing from Step 1. Cannot add chapter without a saved book.");
            const step1El = document.getElementById("bm-step1-section");
            if (step1El) step1El.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        // 2. Read inputs with .trim()
        const titleInput = document.getElementById("bm-art-title");
        const contentInput = document.getElementById("bm-art-content");
        const transcriptionInput = document.getElementById("bm-art-transcription");
        const excerptInput = document.getElementById("bm-art-excerpt");

        const title = (titleInput?.value || "").trim();
        const content = (contentInput?.value || "").trim();
        const transcription = (transcriptionInput?.value || "").trim();
        const excerpt = (excerptInput?.value || "").trim();
        const imageUrl = (bmSelectedArticleImageBase64 || "").trim();
        const titleColor = document.getElementById("bm-art-title-color")?.value || "#1e1b18";
        const contentColor = document.getElementById("bm-art-content-color")?.value || "#2b2118";
        const fontSize = document.querySelector('input[name="bm-art-font-size"]:checked')?.value || "medium";

        // Validate title
        if (!title || title.length < 2) {
            showChapterInlineMsg("ദയവായി അധ്യായത്തിന്റെ തലക്കെട്ട് (Chapter Title) നൽകുക (കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ).", "error");
            console.error("[ChapterWriter] Chapter title validation failed: empty or too short");
            if (titleInput) {
                titleInput.focus();
                titleInput.classList.add("border-rose-500", "ring-2", "ring-rose-200");
                titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }

        // Validate content
        if (!content || content.length < 5) {
            showChapterInlineMsg("ദയവായി അധ്യായത്തിന്റെ പൂർണ്ണ ഉള്ളടക്കം (Chapter Content) നൽകുക (കുറഞ്ഞത് 5 അക്ഷരങ്ങൾ).", "error");
            console.error("[ChapterWriter] Chapter content validation failed: empty or too short");
            if (contentInput) {
                contentInput.focus();
                contentInput.classList.add("border-rose-500", "ring-2", "ring-rose-200");
                contentInput.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }

        // 3. Disable button while saving
        isSavingChapter = true;
        const btn = document.getElementById("bm-publish-article-btn");
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="inline-flex items-center gap-2 font-bold"><svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>സേവ് ചെയ്യുന്നു...</span></span>';
        }

        try {
            // Sequential order number
            const nextOrder = (activeBookChapters && activeBookChapters.length > 0)
                ? Math.max(...activeBookChapters.map(c => Number(c.order !== undefined ? c.order : (c.priority || 0))), 0) + 1
                : 1;

            // Define author and authorId robustly
            const author = (targetBookDoc.author || activeBookAuthor || "NUQTHA AUTHOR").trim();
            const authorId = window.currentUser?.uid || localStorage.getItem("nuqtha_admin_uid") || targetBookDoc?.authorId || "admin";
            const bookTag = document.getElementById("book-meta-tag")?.value?.trim() || targetBookDoc.category || "Chapter";

            if (editingChapterId) {
                // Update existing chapter preserving current order
                const existingChapter = (activeBookChapters && activeBookChapters.find(c => c.id === editingChapterId)) ||
                                        (currentArticlesList && currentArticlesList.find(a => a.id === editingChapterId));
                const chapterOrder = existingChapter ? (existingChapter.order !== undefined ? existingChapter.order : (existingChapter.priority || 1)) : nextOrder;

                const raw = {
                    title,
                    author,
                    authorId,
                    category: bookTag,
                    transcription,
                    excerpt,
                    titleColor,
                    contentColor,
                    fontSize,
                    order: chapterOrder,
                    priority: chapterOrder,
                    content,
                    imageUrl,
                    bookId: activeBookId,
                    bookName: targetBookDoc.bookName || targetBookDoc.title || activeBookName,
                    status: "published",
                    type: "ARTICLE",
                    placement: "AUTO",
                    date: new Date().toLocaleDateString("en-GB")
                };

                const sanitized = validateAndSanitizeArticleForSave(raw);
                await updateDoc(doc(db, "articles", editingChapterId), {
                    ...sanitized,
                    updatedAt: serverTimestamp()
                });

                const updatedArt = { id: editingChapterId, ...sanitized };
                const cIndex = currentArticlesList.findIndex(a => a.id === editingChapterId);
                if (cIndex !== -1) currentArticlesList[cIndex] = updatedArt;

                activeBookChapters = filterAndSortChapters(targetBookDoc, currentArticlesList);
                renderBookChaptersReorderList(activeBookChapters);
                updateActiveBookOverview(currentArticlesList);
                renderBookManagerCompactArticles(currentArticlesList, activeBookName);

                showChapterInlineMsg(`✨ അധ്യായം '${title}' വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!`, "success");
                showGlobalStatus(`✨ അധ്യായം '${title}' വിജയകരമായി അപ്‌ഡേറ്റ് ചെയ്തു!`, "success");
            } else {
                // Save new chapter as article in Firestore with bookId, order, status published, author from book
                const raw = {
                    title,
                    author,
                    authorId,
                    category: bookTag,
                    transcription,
                    excerpt,
                    titleColor,
                    contentColor,
                    fontSize,
                    order: nextOrder,
                    priority: nextOrder,
                    content,
                    imageUrl,
                    bookId: activeBookId,
                    bookName: targetBookDoc.bookName || targetBookDoc.title || activeBookName,
                    status: "published",
                    type: "ARTICLE",
                    placement: "AUTO",
                    date: new Date().toLocaleDateString("en-GB")
                };

                const sanitized = validateAndSanitizeArticleForSave(raw);

                const docRef = await addDoc(collection(db, "articles"), {
                    ...sanitized,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                console.log("[ChapterWriter] Chapter saved to Firestore with ID:", docRef.id);

                const newArt = { id: docRef.id, ...sanitized };
                currentArticlesList.unshift(newArt);

                // Update book document's chapters array in Firestore
                const existingChapters = Array.isArray(targetBookDoc.chapters) ? [...targetBookDoc.chapters] : [];
                const chIdList = existingChapters.map(c => (typeof c === "string" ? c : c?.id));
                if (!chIdList.includes(docRef.id)) {
                    existingChapters.push(docRef.id);
                    targetBookDoc.chapters = existingChapters;
                    await updateDoc(doc(db, "articles", targetBookDoc.id), {
                        chapters: existingChapters,
                        updatedAt: serverTimestamp()
                    });
                    console.log("[ChapterWriter] Appended chapter ID to book doc chapters array:", targetBookDoc.id);
                }

                // Immediately update in-memory chapters and render Step 3
                activeBookChapters = filterAndSortChapters(targetBookDoc, currentArticlesList);
                renderBookChaptersReorderList(activeBookChapters);
                updateActiveBookOverview(currentArticlesList);
                renderBookManagerCompactArticles(currentArticlesList, activeBookName);

                showChapterInlineMsg(`✨ അധ്യായം '${title}' (#${nextOrder}) വിജയകരമായി ചേർത്തു!`, "success");
                showGlobalStatus(`✨ അധ്യായം '${title}' (#${nextOrder}) വിജയകരമായി ചേർത്തു! ഘട്ടം 3-ലേക്ക് നീങ്ങി.`, "success");
            }

            // Clear inputs
            if (titleInput) {
                titleInput.value = "";
                titleInput.classList.remove("border-rose-500", "ring-2", "ring-rose-200");
            }
            if (contentInput) {
                contentInput.value = "";
                contentInput.classList.remove("border-rose-500", "ring-2", "ring-rose-200");
            }
            if (transcriptionInput) transcriptionInput.value = "";
            if (excerptInput) excerptInput.value = "";
            const bmResetColorsBtn = document.getElementById("bm-reset-colors-btn");
            if (bmResetColorsBtn) bmResetColorsBtn.click();

            if (removeBtn) removeBtn.click();
            resetChapterEditMode();

            // Smoothly scroll down to Step 3 so user immediately sees their chapter in the Reading Sequence
            const step3El = document.getElementById("bm-step3-section") || document.getElementById("book-chapters-reorder-list")?.closest("div.bg-white");
            if (step3El) {
                setTimeout(() => {
                    step3El.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
            }
        } catch (err) {
            console.error("[ChapterWriter] Add chapter error:", err);
            showChapterInlineMsg("അധ്യായം ചേർക്കാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
            showGlobalStatus("അധ്യായം ചേർക്കാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
        } finally {
            isSavingChapter = false;
            if (btn) {
                btn.disabled = false;
                if (!editingChapterId) {
                    btn.innerHTML = '<span>ഈ അധ്യായം പുസ്തകത്തിലേക്ക് ചേർക്കുക (Add Chapter to Book)</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>';
                }
            }
        }
    }

    window.handleAddChapterToBook = handleAddChapterToBook;

    if (publishBtn) {
        publishBtn.addEventListener("click", handleAddChapterToBook);
    }

    const cancelEditBtn = document.getElementById("bm-cancel-edit-chapter-btn");
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", () => {
            resetChapterEditMode();
            const titleInput = document.getElementById("bm-art-title");
            const contentInput = document.getElementById("bm-art-content");
            const transcriptionInput = document.getElementById("bm-art-transcription");
            if (titleInput) titleInput.value = "";
            if (contentInput) contentInput.value = "";
            if (transcriptionInput) transcriptionInput.value = "";
            const bmExcerptInput = document.getElementById("bm-art-excerpt");
            if (bmExcerptInput) bmExcerptInput.value = "";
            const bmResetColorsBtn = document.getElementById("bm-reset-colors-btn");
            if (bmResetColorsBtn) bmResetColorsBtn.click();
            if (removeBtn) removeBtn.click();
            clearChapterInlineMsg();
            showChapterInlineMsg("എഡിറ്റിംഗ് റദ്ദാക്കി.", "success");
        });
    }

        // Attach input listeners to clear validation errors when user types
    const chapterTitleInputEl = document.getElementById("bm-art-title");
    if (chapterTitleInputEl) {
        chapterTitleInputEl.addEventListener("input", () => {
            chapterTitleInputEl.classList.remove("border-rose-500", "ring-2", "ring-rose-200");
        });
    }

    const chapterContentInputEl = document.getElementById("bm-art-content");
    if (chapterContentInputEl) {
        chapterContentInputEl.addEventListener("input", () => {
            chapterContentInputEl.classList.remove("border-rose-500", "ring-2", "ring-rose-200");
        });
    }
}

/* ═══════════ 4. STEP 3: DRAG & DROP CHAPTER REORDERING ═══════════ */
function initChapterReordering() {
    const saveOrderBtn = document.getElementById("bm-save-order-btn");
    if (saveOrderBtn) {
        saveOrderBtn.addEventListener("click", () => {
            saveAndApplyChapterOrder(true);
        });
    }
}

function renderBookChaptersReorderList(chapters) {
    const listEl = document.getElementById("book-chapters-reorder-list");
    const countEl = document.getElementById("bm-chapters-count");
    if (countEl) countEl.textContent = chapters.length;
    if (!listEl) return;

    if (chapters.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-8 px-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-1.5">
                <span class="text-2xl">📖</span>
                <p class="text-xs font-bold text-slate-600 font-['Noto_Sans_Malayalam']">
                    ഈ പുസ്തകത്തിൽ അധ്യായങ്ങളൊന്നും നിലവിൽ ചേർത്തിട്ടില്ല.
                </p>
                <p class="text-[11px] text-slate-400">
                    മുകളിലെ ഫോമിൽ നിന്ന് പുതിയ അധ്യായം എഴുതി ചേർക്കുക അല്ലെങ്കിൽ താഴെയുള്ള ലേഖനങ്ങൾ അറ്റാച്ച് ചെയ്യുക.
                </p>
            </div>
        `;
        return;
    }

    const safeChapters = Array.isArray(chapters) ? chapters : [];
    listEl.innerHTML = safeChapters.map((art, idx) => {
        return `
        <div class="chapter-reorder-item flex items-center justify-between p-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-2xl gap-3 transition cursor-grab shadow-2xs select-none" draggable="true" data-index="${idx}" data-id="${art.id}">
            <div class="flex items-center gap-3 min-w-0">
                <span class="text-slate-400 hover:text-slate-600 font-bold text-lg px-1 cursor-grab" title="Drag to reorder">⠿</span>
                <span class="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center flex-shrink-0 font-english">
                    #${idx + 1}
                </span>
                ${art.imageUrl ? `
                    <img src="${art.imageUrl}" alt="Thumb" class="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-200">
                ` : `
                    <span class="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center text-sm flex-shrink-0 border border-amber-200/60">📄</span>
                `}
                <div class="min-w-0">
                    <h5 class="text-xs font-bold text-[#1e1b18] truncate font-['Anek_Malayalam']">${art.title}</h5>
                    <p class="text-[10px] text-slate-400 font-english truncate">
                        ${art.author || activeBookAuthor || 'NUQTHA'} • ${art.date || 'Recent'}
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
                <button type="button" class="btn-move-up w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition" data-index="${idx}" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▲</button>
                <button type="button" class="btn-move-down w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition" data-index="${idx}" title="Move Down" ${idx === chapters.length - 1 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▼</button>
                <button type="button" class="btn-edit-chapter px-2.5 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center text-xs font-bold transition gap-1 cursor-pointer" data-id="${art.id}" title="ഈ അധ്യായം എഡിറ്റ് ചെയ്യുക (Edit Chapter)">
                    <span>✏️</span><span class="text-[11px] font-english hidden sm:inline">Edit</span>
                </button>
                <button type="button" class="btn-detach-chapter w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold transition ml-0.5 cursor-pointer" data-id="${art.id}" data-title="${(art.title || '').replace(/"/g, '&quot;')}" title="Remove from this book">✕</button>
            </div>
        </div>
        `;
    }).join("");

    // Bind Drag & Drop Listeners
    const items = listEl.querySelectorAll(".chapter-reorder-item");
    items.forEach(item => {
        if (!item) return;
        item.addEventListener("dragstart", (e) => {
            dragSrcChapterIndex = parseInt(item.dataset.index, 10);
            item.style.opacity = "0.4";
            e.dataTransfer.effectAllowed = "move";
        });

        item.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            item.classList.add("border-indigo-500", "bg-indigo-50/30");
        });

        item.addEventListener("dragleave", () => {
            item.classList.remove("border-indigo-500", "bg-indigo-50/30");
        });

        item.addEventListener("drop", (e) => {
            e.preventDefault();
            item.classList.remove("border-indigo-500", "bg-indigo-50/30");
            const targetIndex = parseInt(item.dataset.index, 10);
            if (dragSrcChapterIndex !== null && dragSrcChapterIndex !== targetIndex) {
                // Move item in array
                const moved = activeBookChapters.splice(dragSrcChapterIndex, 1)[0];
                activeBookChapters.splice(targetIndex, 0, moved);
                renderBookChaptersReorderList(activeBookChapters);
                saveAndApplyChapterOrder(false);
            }
        });

        item.addEventListener("dragend", () => {
            item.style.opacity = "1";
            dragSrcChapterIndex = null;
            items.forEach(el => el.classList.remove("border-indigo-500", "bg-indigo-50/30"));
        });
    });

    // Bind Up & Down Buttons
    listEl.querySelectorAll(".btn-move-up").forEach(btn => {
        if (!btn) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (idx > 0) {
                const temp = activeBookChapters[idx];
                activeBookChapters[idx] = activeBookChapters[idx - 1];
                activeBookChapters[idx - 1] = temp;
                renderBookChaptersReorderList(activeBookChapters);
                saveAndApplyChapterOrder(false);
            }
        });
    });

    listEl.querySelectorAll(".btn-move-down").forEach(btn => {
        if (!btn) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index, 10);
            if (idx < activeBookChapters.length - 1) {
                const temp = activeBookChapters[idx];
                activeBookChapters[idx] = activeBookChapters[idx + 1];
                activeBookChapters[idx + 1] = temp;
                renderBookChaptersReorderList(activeBookChapters);
                saveAndApplyChapterOrder(false);
            }
        });
    });

    // Bind Edit Chapter Button
    listEl.querySelectorAll(".btn-edit-chapter").forEach(btn => {
        if (!btn) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (id && typeof window.startEditChapter === "function") {
                window.startEditChapter(id);
            }
        });
    });

    // Bind Detach Button
    listEl.querySelectorAll(".btn-detach-chapter").forEach(btn => {
        if (!btn) return;
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const title = btn.dataset.title;
            if (!confirm(`'${title}' ഈ പുസ്തകത്തിൽ നിന്ന് മാറ്റണോ (Remove from book)?`)) return;

            try {
                // 1. Clear bookId & bookName on chapter article in Firestore
                await updateDoc(doc(db, "articles", id), {
                    bookName: "",
                    bookId: "",
                    updatedAt: serverTimestamp()
                });

                // 2. Remove chapter ID from active book doc chapters array in Firestore
                if (activeBookCoverDoc && activeBookCoverDoc.id) {
                    const existingChs = Array.isArray(activeBookCoverDoc.chapters) ? [...activeBookCoverDoc.chapters] : [];
                    const updatedChs = existingChs.filter(ch => (typeof ch === "string" ? ch : ch?.id) !== id);
                    activeBookCoverDoc.chapters = updatedChs;
                    await updateDoc(doc(db, "articles", activeBookCoverDoc.id), {
                        chapters: updatedChs,
                        updatedAt: serverTimestamp()
                    });
                }

                // 3. Update local state
                const found = currentArticlesList.find(a => a.id === id);
                if (found) {
                    found.bookName = "";
                    found.bookId = "";
                }

                activeBookChapters = activeBookChapters.filter(a => a.id !== id);
                renderBookChaptersReorderList(activeBookChapters);
                saveAndApplyChapterOrder(false);
                updateActiveBookOverview(currentArticlesList);
                renderBookManagerCompactArticles(currentArticlesList, activeBookName);
                showChapterInlineMsg(`'${title}' പുസ്തകത്തിൽ നിന്ന് മാറ്റി.`, "success");
                showGlobalStatus(`'${title}' പുസ്തകത്തിൽ നിന്ന് മാറ്റി.`, "info");
            } catch (err) {
                console.error("[ChapterWriter] Detach chapter error:", err);
                showChapterInlineMsg("മാറ്റാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
                showGlobalStatus("മാറ്റാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
            }
        });
    });
}

async function saveAndApplyChapterOrder(showToast = true) {
    if (!activeBookChapters || activeBookChapters.length === 0) return;

    try {
        const chapterIds = [];
        for (let i = 0; i < activeBookChapters.length; i++) {
            const art = activeBookChapters[i];
            const newPriority = i + 1;
            chapterIds.push(art.id);
            if (art.priority !== newPriority || art.order !== newPriority) {
                art.priority = newPriority;
                art.order = newPriority;
                const updatePayload = {
                    priority: newPriority,
                    order: newPriority,
                    updatedAt: serverTimestamp()
                };
                if (activeBookCoverDoc?.id && !art.bookId) {
                    updatePayload.bookId = activeBookCoverDoc.id;
                    art.bookId = activeBookCoverDoc.id;
                }
                await updateDoc(doc(db, "articles", art.id), updatePayload);
                const globalItem = currentArticlesList.find(a => a.id === art.id);
                if (globalItem) {
                    globalItem.priority = newPriority;
                    globalItem.order = newPriority;
                    if (updatePayload.bookId) globalItem.bookId = updatePayload.bookId;
                }
            }
        }

        // Also update book doc with ordered chapters array
        if (activeBookCoverDoc && activeBookCoverDoc.id) {
            activeBookCoverDoc.chapters = chapterIds;
            await updateDoc(doc(db, "articles", activeBookCoverDoc.id), {
                chapters: chapterIds,
                updatedAt: serverTimestamp()
            });
        }

        if (showToast) {
            showGlobalStatus("💾 വായനാ ക്രമം വിജയകരമായി സേവ് ചെയ്തു!", "success");
        }
    } catch (err) {
        console.error("Save chapter order error:", err);
        showGlobalStatus("ക്രമം സേവ് ചെയ്യുന്നതിൽ തടസ്സം നേരിട്ടു.", "error");
    }
}

/* ═══════════ 5. ATTACH EXISTING ARTICLES COLLAPSIBLE ═══════════ */
function initBookAttachExistingArticles() {
    const searchInput = document.getElementById("bm-articles-search");
    const attachBtn = document.getElementById("bm-attach-selected-btn");

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            renderBookManagerCompactArticles(currentArticlesList, activeBookName);
        });
    }

        if (attachBtn) {
        const executeAttach = async () => {
            if (!activeBookName) {
                showGlobalStatus("ദയവായി ആദ്യം ഒരു പുസ്തകം തിരഞ്ഞെടുക്കുക.", "error");
                return;
            }

            const checked = Array.from(document.querySelectorAll(".bm-article-chk:checked"));
            if (checked.length === 0) {
                showGlobalStatus("ദയവായി പുസ്തകത്തിലേക്ക് ചേർക്കാൻ ലേഖനങ്ങൾ തിരഞ്ഞെടുക്കുക.", "error");
                return;
            }

            attachBtn.disabled = true;
            attachBtn.innerHTML = "അറ്റാച്ച് ചെയ്യുന്നു...";

            try {
                let startPriority = activeBookChapters.length;
                for (const chk of checked) {
                    const id = chk.dataset.id;
                    if (id) {
                        startPriority++;
                        await updateDoc(doc(db, "articles", id), {
                            bookName: activeBookName,
                            bookId: activeBookCoverDoc?.id || "",
                            author: activeBookAuthor || "NUQTHA AUTHOR",
                            priority: startPriority,
                            order: startPriority,
                            updatedAt: serverTimestamp()
                        });
                        const item = currentArticlesList.find(a => a.id === id);
                        if (item) {
                            item.bookName = activeBookName;
                            item.author = activeBookAuthor || item.author;
                            item.priority = startPriority;
                            item.order = startPriority;
                            item.bookId = activeBookCoverDoc?.id || "";
                        }
                    }
                }

                showGlobalStatus(`✨ ${checked.length} ലേഖനങ്ങൾ '${activeBookName}' ലേക്ക് അറ്റാച്ച് ചെയ്തു!`, "success");
                loadAndRenderBookChapters();
                renderBookManagerCompactArticles(currentArticlesList, activeBookName);
            } catch (err) {
                console.error("Attach articles error:", err);
                showGlobalStatus("ലേഖനങ്ങൾ അറ്റാച്ച് ചെയ്യാൻ കഴിഞ്ഞില്ല.", "error");
            } finally {
                attachBtn.disabled = false;
                attachBtn.innerHTML = "തിരഞ്ഞെടുത്തവ പുസ്തകത്തിലേക്ക് അറ്റാച്ച് ചെയ്യുക";
            }
        };

        attachBtn.addEventListener("click", executeAttach);
        attachBtn.addEventListener("execute-attach", executeAttach);
    }
}

function renderBookManagerCompactArticles(articles, activeBookParam) {
    const listEl = document.getElementById("bm-compact-articles-list");
    const loadMoreBtn = document.getElementById("bm-load-more-articles-btn");
    if (!listEl) return;

    const listToRender = Array.isArray(articles) ? articles : (Array.isArray(currentArticlesList) ? currentArticlesList : []);
    const activeBook = activeBookParam || activeBookName || "";
    const searchTerm = (document.getElementById("bm-articles-search")?.value || "").toLowerCase().trim();

    // Show only standalone articles (not covers)
    let filtered = listToRender.filter(a => a.type !== "BOOK");
    if (searchTerm) {
        filtered = filtered.filter(a => 
            (a.title || "").toLowerCase().includes(searchTerm) ||
            (a.author || "").toLowerCase().includes(searchTerm) ||
            (a.category || "").toLowerCase().includes(searchTerm) ||
            (a.bookName || "").toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        listEl.innerHTML = `<p class="text-xs text-center py-4 text-slate-400">ലേഖനങ്ങളൊന്നും കണ്ടെത്താനായില്ല.</p>`;
        if (loadMoreBtn) loadMoreBtn.classList.add("hidden");
        return;
    }

    const totalCount = filtered.length;
    const paginated = filtered.slice(0, compactArticlesDisplayLimit);

    if (loadMoreBtn) {
        if (totalCount > compactArticlesDisplayLimit) {
            loadMoreBtn.classList.remove("hidden");
            loadMoreBtn.textContent = `കൂടുതൽ കാണിക്കുക (Showing ${paginated.length} of ${totalCount})`;
        } else {
            loadMoreBtn.classList.add("hidden");
        }
    }

    listEl.innerHTML = paginated.map(art => {
        const isBelong = Boolean(activeBook && normalizeStringClean(art.bookName) === normalizeStringClean(activeBook));
        const hasOtherBook = Boolean(art.bookName && art.bookName.trim() && !isBelong);

        let badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">Unassigned</span>`;
        if (isBelong) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">In this Book</span>`;
        } else if (hasOtherBook) {
            badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">${art.bookName}</span>`;
        }

        return `
            <label class="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-200/60 hover:border-amber-300 transition cursor-pointer gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
                    <input type="checkbox" class="bm-article-chk rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer" data-id="${art.id}" ${isBelong ? "checked" : ""}>
                    ${art.imageUrl ? `<img src="${art.imageUrl}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0">` : `<span class="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-xs flex-shrink-0">📄</span>`}
                    <div class="min-w-0">
                        <h5 class="text-xs font-bold text-[#1e1b18] truncate font-['Anek_Malayalam']">${art.title}</h5>
                        <p class="text-[10px] text-slate-400">${art.author || "NUQTHA"} • ${art.date || "Recent"}</p>
                    </div>
                </div>
                <div class="flex-shrink-0">
                    ${badgeHtml}
                </div>
            </label>
        `;
    }).join("");
}

/* ═══════════ 6. PRESENTATION UPLOAD ═══════════ */
function initBookPresentationUpload() {
    const fileInput = document.getElementById("bm-presentation-file-input");
    const dropzone = document.getElementById("bm-presentation-dropzone");
    const placeholder = document.getElementById("bm-presentation-placeholder");
    const progressEl = document.getElementById("bm-presentation-progress");
    const fileInfo = document.getElementById("bm-presentation-file-info");
    const fileNameEl = document.getElementById("bm-presentation-file-name");
    const removeBtn = document.getElementById("bm-remove-presentation-btn");
    const saveBtn = document.getElementById("bm-save-presentation-btn");
    const linkInput = document.getElementById("bm-presentation-link");

    function validateAndProcessPdfFile(file) {
        if (!file) return;

        // Size limit: 25MB
        if (file.size > 25 * 1024 * 1024) {
            showGlobalStatus("ഫയൽ വലിപ്പം 25MB-ൽ താഴെയായിരിക്കണം.", "error");
            return;
        }

        const validExts = [".pdf", ".ppt", ".pptx", ".key"];
        const lowerName = file.name.toLowerCase();
        const hasValidExt = validExts.some(ext => lowerName.endsWith(ext));
        if (!hasValidExt && !file.type.includes("pdf") && !file.type.includes("presentation")) {
            showGlobalStatus("സാധുവായ PDF അല്ലെങ്കിൽ Presentation ഫയൽ തിരഞ്ഞെടുക്കുക (.pdf, .ppt, .pptx).", "error");
            return;
        }

        bmPresentationFileName = file.name;
        if (placeholder) placeholder.classList.add("hidden");
        if (progressEl) progressEl.classList.remove("hidden");

        const reader = new FileReader();
        reader.onerror = () => {
            showGlobalStatus("ഫയൽ വായിക്കുന്നതിൽ തടസ്സം നേരിട്ടു.", "error");
            if (progressEl) progressEl.classList.add("hidden");
            if (placeholder) placeholder.classList.remove("hidden");
        };
        reader.onload = (event) => {
            bmPresentationFileBase64 = event.target.result;
            if (progressEl) progressEl.classList.add("hidden");
            if (fileNameEl) fileNameEl.textContent = file.name;
            if (fileInfo) fileInfo.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
    }

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) validateAndProcessPdfFile(file);
        });
    }

    if (dropzone) {
        dropzone.addEventListener("click", (e) => {
            if (e.target !== fileInput && !e.target.closest("button")) {
                if (fileInput) fileInput.click();
            }
        });
        ["dragenter", "dragover"].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("border-indigo-600", "bg-indigo-100/50");
            });
        });
        ["dragleave", "drop"].forEach(evt => {
            dropzone.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("border-indigo-600", "bg-indigo-100/50");
            });
        });
        dropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const file = dt && dt.files && dt.files[0];
            if (file) validateAndProcessPdfFile(file);
        });
    }

    function handleRemovePresentation() {
        bmPresentationFileBase64 = "";
        bmPresentationFileName = "";
        if (fileInput) fileInput.value = "";
        if (fileInfo) fileInfo.classList.add("hidden");
        if (progressEl) progressEl.classList.add("hidden");
        if (placeholder) placeholder.classList.remove("hidden");
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", handleRemovePresentation);
        removeBtn.addEventListener("execute-remove", handleRemovePresentation);
    }

    async function handleSavePresentation() {
        const externalLink = linkInput ? linkInput.value.trim() : "";
        if (!activeBookName) {
            showGlobalStatus("ദയവായി ആദ്യം ഒരു പുസ്തകം തിരഞ്ഞെടുക്കുക.", "error");
            return;
        }
        if (!bmPresentationFileBase64 && !externalLink) {
            showGlobalStatus("ദയവായി ഒരു PDF ഫയൽ അപ്‌ലോഡ് ചെയ്യുക അല്ലെങ്കിൽ ലിങ്ക് നൽകുക.", "error");
            return;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = "സേവ് ചെയ്യുന്നു...";
        }

        try {
            const existingBook = currentArticlesList.find(a => a.type === "BOOK" && (
                normalizeStringClean(a.bookName) === normalizeStringClean(activeBookName) ||
                normalizeStringClean(a.title) === normalizeStringClean(activeBookName)
            ));
            const payload = {
                presentationUrl: externalLink || bmPresentationFileBase64,
                presentationName: bmPresentationFileName || "Book Presentation",
                updatedAt: serverTimestamp()
            };

            if (existingBook) {
                await updateDoc(doc(db, "articles", existingBook.id), payload);
            }

            showGlobalStatus(`പ്രസന്റേഷൻ '${activeBookName}' ലേക്ക് വിജയകരമായി സേവ് ചെയ്തു! 📑`, "success");
        } catch (err) {
            console.error("Presentation save error:", err);
            showGlobalStatus("പ്രസന്റേഷൻ സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല.", "error");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = "Save Presentation to Book";
            }
        }
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", handleSavePresentation);
        saveBtn.addEventListener("execute-save", handleSavePresentation);
    }
}


/* ═══════════ 7. ACTIVE BOOKS OVERVIEW, DEDICATED BOOKS TAB & DROPDOWN ═══════════ */
function updateActiveBookOverview(articles) {
    const activeSelect = document.getElementById("bm-active-book-select");

    // Discover all book names
    const bookMap = {};
    const pool = (articles && articles.length > 0) ? articles : (currentArticlesList || []);
    
    pool.forEach(art => {
        if (isMainBook(art) && (art.bookName || art.title)) {
            const name = (art.bookName || art.title).trim();
            if (!bookMap[name]) bookMap[name] = { cover: art, chapters: 0 };
        }
    });

    pool.forEach(art => {
        if (!isMainBook(art) && (art.bookName || art.bookId)) {
            const name = (art.bookName || "").trim();
            if (name && bookMap[name]) {
                bookMap[name].chapters++;
            }
        }
    });

    const bookNames = Object.keys(bookMap);

    if (activeSelect) {
        const cur = activeSelect.value;
        activeSelect.innerHTML = '<option value="">-- പുസ്തകം തിരഞ്ഞെടുക്കുക (Select Book to Manage) --</option>' + 
            bookNames.map(name => `<option value="${name}">📚 ${name} (${bookMap[name].chapters} chapters)</option>`).join("");
        if (cur && bookNames.includes(cur)) {
            activeSelect.value = cur;
        } else if (activeBookName && bookNames.includes(activeBookName)) {
            activeSelect.value = activeBookName;
        }
    }
}

function updateBooksCounter(count) {
    const tabBadge = document.getElementById("tab-book-badge");
    const bmBadge = document.getElementById("bm-books-count-badge");
    const totalEl = document.getElementById("bm-total-books-counter");
    if (tabBadge) tabBadge.textContent = String(count);
    if (bmBadge) bmBadge.textContent = `${count} Books`;
    if (totalEl) totalEl.textContent = `${count} Books`;
}

function renderAdminBooksTab(articles) {
    const gridEl = document.getElementById("bm-published-books-grid");
    const totalCounterEl = document.getElementById("bm-total-books-counter");
    const badgeEl = document.getElementById("bm-books-count-badge");
    const tabBadgeEl = document.getElementById("tab-book-badge");

    const pool = (articles && articles.length > 0) ? articles : (currentArticlesList || []);
    const rawBooks = pool.filter(a => isMainBook(a));

    const books = [];
    const seenIds = new Set();
    for (const b of rawBooks) {
        const key = b.id || b.bookName || b.title;
        if (!seenIds.has(key)) {
            seenIds.add(key);
            books.push(b);
        }
    }

    if (totalCounterEl) totalCounterEl.textContent = `${books.length} Books`;
    if (badgeEl) badgeEl.textContent = `${books.length} Books`;
    if (tabBadgeEl) tabBadgeEl.textContent = String(books.length);

    if (!gridEl) return;

    if (books.length === 0) {
        gridEl.innerHTML = `
            <div class="col-span-full text-center py-12 px-4 bg-amber-50/40 rounded-2xl border-2 border-dashed border-amber-200 space-y-2">
                <span class="text-3xl">📚</span>
                <p class="text-xs font-bold text-amber-900">പുസ്തകങ്ങൾ ഒന്നും നിലവിൽ ചേർത്തിട്ടില്ല</p>
                <p class="text-[11px] text-amber-700">പുതിയ പുസ്തകം ചേർക്കാൻ മുകളിലെ '+ പുതിയ പുസ്തകം നിർമ്മിക്കുക' ക്ലിക്ക് ചെയ്യുക.</p>
            </div>
        `;
        return;
    }

    gridEl.innerHTML = books.map(book => {
        const bookTitle = book.bookName || book.title || "Untitled Book";
        const chapterCount = countBookChapters(book, pool);
        const isActive = activeBookCoverDoc && (activeBookCoverDoc.id === book.id || activeBookName === bookTitle);

        return `
            <div class="p-4 bg-white rounded-2xl border-2 ${isActive ? 'border-amber-500 bg-amber-50/20 ring-2 ring-amber-200' : 'border-[#ebdccb] hover:border-amber-300'} transition shadow-xs flex flex-col justify-between gap-3">
                <div class="flex items-start gap-3">
                    <div class="w-16 h-22 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-amber-600 to-amber-900 border border-amber-200 shadow-xs flex items-center justify-center text-white">
                        ${book.imageUrl ? `<img src="${book.imageUrl}" alt="${bookTitle}" class="w-full h-full object-cover">` : `<span class="text-2xl">📚</span>`}
                    </div>
                    <div class="flex-1 min-w-0 space-y-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[9px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md font-english">
                                ${book.category || 'Premium Book'}
                            </span>
                            <span class="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-english">
                                📖 ${chapterCount} Chapters
                            </span>
                            ${isActive ? `<span class="text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-english">● ACTIVE</span>` : ''}
                        </div>
                        <h4 class="text-sm font-extrabold text-[#1e1b18] truncate leading-tight">${bookTitle}</h4>
                        <p class="text-[11px] font-bold text-[#8c7a6b] truncate">✍️ ${book.author || 'Single Author'}</p>
                        ${book.date ? `<p class="text-[10px] text-slate-400 font-english">📅 ${book.date}</p>` : ''}
                    </div>
                </div>

                <div class="flex items-center justify-between pt-2.5 border-t border-[#f0e6d6] gap-2 flex-wrap">
                    <a href="article.html?id=${book.id}&edition=${encodeURIComponent(bookTitle)}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline font-english">
                        <span>👁️ Live</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>

                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="window.manageBookById('${book.id}')" title="അധ്യായങ്ങൾ മാനേജ് ചെയ്യുക & പുനഃക്രമീകരിക്കുക" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs font-english cursor-pointer">
                            <span>📖 Chapters</span>
                        </button>
                        <button type="button" onclick="window.editBookMetadataById('${book.id}')" title="പുസ്തക വിവരങ്ങൾ എഡിറ്റ് ചെയ്യുക" class="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1 font-english cursor-pointer">
                            <span>✏️ Edit</span>
                        </button>
                        <button type="button" onclick="window.deleteBookById('${book.id}', '${bookTitle.replace(/'/g, "\\'")}')" title="ഈ പുസ്തകം ഒഴിവാക്കുക" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition font-english cursor-pointer">
                            <span>✕</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}
window.renderAdminBooksTab = renderAdminBooksTab;

window.manageBookById = function(bookId) {
    const book = currentArticlesList.find(a => a.id === bookId);
    if (!book) return;
    const name = book.bookName || book.title;
    selectActiveBook(name);
    renderAdminBooksTab(currentArticlesList);
    const step3 = document.getElementById("bm-step3-section") || document.getElementById("bm-step2-3-wrapper");
    if (step3) {
        step3.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    showGlobalStatus(`📖 '${name}' തുറന്നു. അധ്യായങ്ങൾ താഴെ ക്രമീകരിക്കാം.`, "info");
};

window.editBookMetadataById = function(bookId) {
    const book = currentArticlesList.find(a => a.id === bookId);
    if (!book) return;
    const name = book.bookName || book.title;
    selectActiveBook(name);
    renderAdminBooksTab(currentArticlesList);
    const step1 = document.getElementById("bm-step1-section");
    if (step1) {
        step1.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const nameInput = document.getElementById("book-meta-name");
    if (nameInput) {
        nameInput.focus();
        nameInput.classList.add("ring-2", "ring-blue-300");
        setTimeout(() => nameInput.classList.remove("ring-2", "ring-blue-300"), 1500);
    }
    showGlobalStatus(`✏️ '${name}' വിവരങ്ങൾ എഡിറ്റ് ചെയ്യുക.`, "info");
};

window.deleteBookById = async function(bookId, bookTitle) {
    if (!bookId) return;
    const cleanTitle = bookTitle || "ഈ പുസ്തകം";
    if (!confirm(`'${cleanTitle}' എന്ന പുസ്തകം പൂർണ്ണമായി നീക്കം ചെയ്യണോ (Delete Book)?`)) return;

    try {
        await deleteDoc(doc(db, "articles", bookId));

        // Unlink chapters belonging to this book
        const linkedChapters = currentArticlesList.filter(a => a.bookId === bookId || (cleanTitle && a.bookName === cleanTitle));
        for (const ch of linkedChapters) {
            try {
                await updateDoc(doc(db, "articles", ch.id), {
                    bookId: "",
                    bookName: "",
                    updatedAt: serverTimestamp()
                });
                ch.bookId = "";
                ch.bookName = "";
            } catch (chErr) {
                console.warn("[BookManager] Unlink error:", ch.id, chErr);
            }
        }

        currentArticlesList = currentArticlesList.filter(a => a.id !== bookId);

        if (activeBookCoverDoc?.id === bookId || activeBookName === cleanTitle) {
            resetBookManagerForm();
        }

        const allBooks = currentArticlesList.filter(a => isMainBook(a));
        updateBooksCounter(allBooks.length);
        updateActiveBookOverview(currentArticlesList);
        renderAdminBooksTab(currentArticlesList);
        renderBookManagerCompactArticles(currentArticlesList, activeBookName);

        showGlobalStatus(`📚 '${cleanTitle}' വിജയകരമായി നീക്കം ചെയ്തു.`, "success");
    } catch (err) {
        console.error("[BookManager] Delete book error:", err);
        showGlobalStatus("പുസ്തകം നീക്കം ചെയ്യാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
    }
};

window.setPlaylistInput = function(name) {
    selectActiveBook(name);
};

window.manageBookFromPublished = function(bookName) {
    switchAdminTab("book");
    selectActiveBook(bookName);
};

/* ═══════════════════════════════════════════════════════════
   7. LIVE FIRESTORE SYNC & PUBLISHED ARTICLES LIST (TAB 4)
   ═══════════════════════════════════════════════════════════ */
function listenToFirestoreArticles() {
    const listContainer = document.getElementById("admin-articles-list");
    const colRef = collection(db, "articles");
    let restReadPromise = null;

    function processArticlesData(rawItems) {
        if (!Array.isArray(rawItems)) return;

        const items = rawItems.map(d => normalizeArticleDoc(d, d?.id));

        items.sort((a, b) => {
            const getMillis = (item) => {
                return parseTimestampMillis(item.createdAt) ||
                       parseTimestampMillis(item.updatedAt) ||
                       parseTimestampMillis(item.date) || 0;
            };
            return getMillis(b) - getMillis(a);
        });

        if (items.length === 0 && currentArticlesList.length > 0) return;

        currentArticlesList = items;

        const standardArticles = items.filter(a => !isBookOrChapter(a));
        const allBooks = items.filter(a => isMainBook(a));

        updateArticleCounters(standardArticles.length);
        updateBooksCounter(allBooks.length);

        renderAdminPublishedList(standardArticles);
        updateActiveBookOverview(items);
        renderAdminBooksTab(items);
        renderBookManagerCompactArticles(items, activeBookName);
        renderLayoutManagerList(items);
    }

    function decodeFirestoreValue(value) {
        if (!value || typeof value !== "object") return value;
        if ("nullValue" in value) return null;
        if ("stringValue" in value) return value.stringValue;
        if ("integerValue" in value) return Number(value.integerValue);
        if ("doubleValue" in value) return Number(value.doubleValue);
        if ("booleanValue" in value) return value.booleanValue;
        if ("timestampValue" in value) return value.timestampValue;
        if ("referenceValue" in value) return value.referenceValue;
        if ("bytesValue" in value) return value.bytesValue;
        if ("geoPointValue" in value) return value.geoPointValue;
        if ("arrayValue" in value) {
            return (value.arrayValue.values || []).map(decodeFirestoreValue);
        }
        if ("mapValue" in value) {
            return Object.fromEntries(
                Object.entries(value.mapValue.fields || {})
                    .map(([key, fieldValue]) => [key, decodeFirestoreValue(fieldValue)])
            );
        }
        return value;
    }

    function decodeFirestoreFields(fields) {
        return Object.fromEntries(
            Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
        );
    }

    function reportLoadError(error) {
        console.error("[NUQTHA ADMIN] Unable to load articles from Firestore:", error);
        if (currentArticlesList.length === 0 && listContainer) {
            listContainer.innerHTML = '<p class="text-xs text-rose-500 font-semibold p-4 text-center">ലേഖനങ്ങൾ Firestore-ൽ നിന്ന് ലോഡ് ചെയ്യാനായില്ല. നെറ്റ്‌വർക്ക്, Firebase project ID, Firestore Rules എന്നിവ പരിശോധിക്കുക.</p>';
        }
    }

    try {
        onSnapshot(colRef, (snapshot) => {
            const items = snapshot.docs.map(doc => normalizeArticleDoc(doc.data(), doc.id));
            if (items.length > 0) processArticlesData(items);
        }, (err) => {
            console.warn("[NUQTHA ADMIN] Realtime listener failed; trying a one-time Firestore read:", err);
            getDocs(colRef).then(snapshot => {
                if (snapshot.empty) return;
                const items = snapshot.docs.map(doc => normalizeArticleDoc(doc.data(), doc.id));
                processArticlesData(items);
            }).catch(fallbackErr => {
                console.warn("[NUQTHA ADMIN] One-time Firestore read failed:", fallbackErr);
            });
        });
    } catch (error) {
        console.error("[NUQTHA ADMIN] Could not start Firestore listener:", error);
    }

    getDocs(colRef).then(snapshot => {
        if (!snapshot.empty) {
            const items = snapshot.docs.map(doc => normalizeArticleDoc(doc.data(), doc.id));
            processArticlesData(items);
        }
    }).catch(error => {
        console.warn("[NUQTHA ADMIN] Initial Firestore read failed; REST fallback will be used:", error);
    });

    async function fetchAdminViaRest() {
        if (restReadPromise) return restReadPromise;

        restReadPromise = (async () => {
            try {
                const { apiKey, projectId } = db.app.options;
                if (!apiKey || !projectId) {
                    throw new Error("Firebase project ID or API key is missing.");
                }

                const documents = [];
                let nextPageToken = "";
                do {
                    const params = new URLSearchParams({ pageSize: "300", key: apiKey });
                    if (nextPageToken) params.set("pageToken", nextPageToken);
                    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/articles?${params}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Firestore REST request failed (${response.status}): ${await response.text()}`);
                    }

                    const page = await response.json();
                    documents.push(...(page.documents || []));
                    nextPageToken = page.nextPageToken || "";
                } while (nextPageToken);

                const restArticles = documents.map(document => {
                    const id = document.name?.split("/").pop();
                    if (!id) throw new Error("Firestore returned an article without a document ID.");
                    const fields = decodeFirestoreFields(document.fields || {});
                    return normalizeArticleDoc({
                        ...fields,
                        createdAt: fields.createdAt || document.createTime,
                        updatedAt: fields.updatedAt || document.updateTime
                    }, id);
                });

                if (restArticles.length > 0 || currentArticlesList.length === 0) {
                    processArticlesData(restArticles);
                }
            } catch (error) {
                reportLoadError(error);
            } finally {
                restReadPromise = null;
            }
        })();

        return restReadPromise;
    }

    fetchAdminViaRest();
}

function updateArticleCounters(count) {
    const countBadge = document.getElementById("article-count");
    const tabBadge = document.getElementById("tab-published-badge");
    if (countBadge) countBadge.textContent = String(count);
    if (tabBadge) tabBadge.textContent = String(count);
}

function renderAdminPublishedList(items) {
    const listContainer = document.getElementById("admin-articles-list");
    if (!listContainer) return;

    // Strictly filter out any books and book chapters
    const articles = (items || []).filter(a => !isBookOrChapter(a));

    if (articles.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-12 px-4 bg-white/60 dark:bg-white/5 rounded-3xl border border-[#ebdccb] dark:border-white/10 space-y-3">
                <div class="w-12 h-12 mx-auto rounded-full bg-[#b4532c]/10 text-[#b4532c] flex items-center justify-center text-xl">📄</div>
                <h4 class="text-sm font-bold text-[#1e1b18] dark:text-[#f8fafc]">ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല</h4>
                <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">ആദ്യത്തെ ലേഖനം പ്രസിദ്ധീകരിക്കാൻ 'പുതിയ ലേഖനം' ടാബ് തുറക്കുക. (പുസ്തകങ്ങൾ കാണാൻ 'Books' ടാബ് സന്ദർശിക്കുക).</p>
                <button type="button" onclick="window.switchAdminTab('create')" class="px-4 py-2 bg-[#b4532c] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-[#923e1b] transition cursor-pointer">
                    + പുതിയ ലേഖനം എഴുതുക
                </button>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = safeArticles.map(data => {
        const titleCol = data.titleColor || "#1e1b18";
        const placementLabel = data.placement === 'CAROUSEL' ? '🎠 CAROUSEL' : data.placement === 'FEED' ? '📰 FEED' : '⚡ AUTO';
        const priorityBadge = (data.priority !== undefined && data.priority !== null) ? `P${data.priority}` : '';

        return `
            <div class="p-4 bg-white/90 dark:bg-[#12141d]/90 rounded-2xl border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c]/60 dark:hover:border-white/20 transition shadow-sm space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-black text-[#b4532c] dark:text-[#f87171] uppercase font-english bg-[#b4532c]/10 px-2 py-0.5 rounded-md">
                            ${data.category || 'General'}
                        </span>
                        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#fbf7ee] dark:bg-white/10 border border-[#ebdccb] dark:border-white/10 text-[#4a3c33] dark:text-[#cbd5e1] font-english">
                            ${placementLabel}
                        </span>
                        ${priorityBadge ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-400/30 text-amber-800 dark:text-amber-300 font-mono">${priorityBadge}</span>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 font-english">${data.date || ''}</span>
                </div>

                <div class="flex items-center gap-3">
                    ${data.imageUrl ? `
                        <div class="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 border border-[#ebdccb]">
                            <img src="${data.imageUrl}" alt="Cover" class="w-full h-full object-cover">
                        </div>
                    ` : ''}
                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-extrabold line-clamp-2 leading-snug" style="color: ${titleCol};">${data.title}</h4>
                        <p class="text-[11px] font-bold text-[#1e1b18] dark:text-white mt-1"><span class="text-[#1e1b18] dark:text-white font-bold">${data.author || 'NUQTHA'}</span> ${data.transcription ? `<span class="text-[#8c7a6b] dark:text-[#94a3b8] font-semibold ml-2">(📝 കേട്ടെഴുത്ത്: ${data.transcription})</span>` : ''}</p>
                    </div>
                </div>

                <div class="flex items-center justify-between pt-2.5 border-t border-[#ebdccb]/60 dark:border-white/10">
                    <a href="article.html?id=${data.id}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-bold text-[#b4532c] hover:underline font-english">
                        <span>Live Preview</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.viewArticleComments('${data.id}', '${(data.title || '').replace(/'/g, "\\'")}')" title="ലേഖന അഭിപ്രായങ്ങളും ഇമെയിലുകളും കാണുക" class="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/20 border border-blue-200 px-3 py-1 rounded-xl transition font-english cursor-pointer">
                            <span>💬 Comments</span>
                        </button>
                        <button type="button" data-action="edit-article" data-id="${data.id}" onclick="window.startEditArticle('${data.id}')" title="ലേഖനം എഡിറ്റ് ചെയ്യുക" class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100/70 hover:bg-amber-200 dark:bg-amber-500/20 border border-amber-300 px-3 py-1 rounded-xl transition font-english cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            <span>Edit</span>
                        </button>
                        <button type="button" data-action="delete-article" data-id="${data.id}" onclick="window.deleteArticle('${data.id}')" title="ലേഖനം ഒഴിവാക്കുക" class="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 border border-rose-200 px-3 py-1 rounded-xl transition font-english cursor-pointer">
                            <span>✕ Delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/* ═══════════════════════════════════════════════════════════
   8. TAB 4 SEARCH & FILTER IN ARTICLES LIST
   ═══════════════════════════════════════════════════════════ */
function initPublishedSearchFilter() {
    const searchInput = document.getElementById("search-published-input");
    const categoryFilter = document.getElementById("filter-published-category");

    function applyFilter() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const cat = categoryFilter ? categoryFilter.value : "ALL";

        const standardArticles = currentArticlesList.filter(art => !isBookOrChapter(art));

        const filtered = standardArticles.filter(art => {
            const matchesQuery = !query || 
                (art.title && art.title.toLowerCase().includes(query)) ||
                (art.author && art.author.toLowerCase().includes(query)) ||
                (art.transcription && art.transcription.toLowerCase().includes(query));

            const matchesCategory = cat === "ALL" || (art.category && art.category.toUpperCase() === cat);

            return matchesQuery && matchesCategory;
        });

        renderAdminPublishedList(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", applyFilter);
    if (categoryFilter) categoryFilter.addEventListener("change", applyFilter);
}


/* ═══════════════════════════════════════════════════════════
   9. GLOBAL NOTIFICATION SYSTEM
   ═══════════════════════════════════════════════════════════ */
function showGlobalStatus(message, type = "success") {
    const container = document.getElementById("admin-global-status");
    if (!container) return;

    const isSuccess = type === "success";
    const isInfo = type === "info";

    const bgClass = isSuccess 
        ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-200" 
        : isInfo
        ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/80 dark:border-amber-700 dark:text-amber-200"
        : "bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/80 dark:border-rose-700 dark:text-rose-200";

    const icon = isSuccess ? "✅" : isInfo ? "💡" : "⚠️";

    container.innerHTML = `
        <div class="p-3.5 rounded-2xl border ${bgClass} text-xs font-bold flex items-center justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div class="flex items-center gap-2">
                <span>${icon}</span>
                <span>${message}</span>
            </div>
            <button type="button" onclick="this.parentElement.remove()" class="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
    `;
    container.classList.remove("hidden");

    setTimeout(() => {
        if (container.firstElementChild) {
            container.classList.add("hidden");
            container.innerHTML = "";
        }
    }, 6000);
}

/* ═══════════════════════════════════════════════════════════
   10. TAB 3: DEDICATED LAYOUT MANAGER LOGIC
   ═══════════════════════════════════════════════════════════ */
function initLayoutManagerControls() {
    const searchInput = document.getElementById("search-layout-input");
    const placementFilter = document.getElementById("filter-layout-placement");

    function applyLayoutFilter() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const filterVal = placementFilter ? placementFilter.value : "ALL";

        const filtered = currentArticlesList.filter(art => {
            if (art.bookName || art.type === "BOOK") return false;
            const matchesQuery = !query ||
                (art.title && art.title.toLowerCase().includes(query)) ||
                (art.author && art.author.toLowerCase().includes(query));

            const artPlacement = (art.placement || "AUTO").toUpperCase();
            const matchesPlacement = filterVal === "ALL" || artPlacement === filterVal;

            return matchesQuery && matchesPlacement;
        });

        renderLayoutManagerList(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", applyLayoutFilter);
    if (placementFilter) placementFilter.addEventListener("change", applyLayoutFilter);
}

export function renderLayoutManagerList(items) {
    const safeItems = Array.isArray(items) ? items : (Array.isArray(currentArticlesList) ? currentArticlesList : []);
    const container = document.getElementById("layout-manager-list");
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 px-4 bg-[#fbf7ee]/40 rounded-2xl border border-[#ebdccb] space-y-2">
                <span class="text-2xl">🔍</span>
                <p class="text-xs font-bold text-[#8c7a6b]">ലേഖനങ്ങൾ ഒന്നും കണ്ടെത്തിയില്ല</p>
            </div>
        `;
        return;
    }

    container.innerHTML = safeItems.map(art => {
        const currentPlacement = art.placement || "AUTO";
        const currentPriority = (art.priority !== undefined && art.priority !== null) ? art.priority : 10;
        const currentPlaylist = art.playlistName || "";

        return `
            <div class="p-4 sm:p-5 bg-white rounded-2xl border border-[#ebdccb] hover:border-amber-400 transition shadow-sm space-y-3" id="layout-card-${art.id}">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-[10px] font-black uppercase font-english bg-[#b4532c]/10 text-[#b4532c] px-2.5 py-0.5 rounded-md">
                            ${art.category || 'General'}
                        </span>
                        <span class="text-[10px] text-[#8c7a6b] font-english">${art.date || ''}</span>
                        ${art.bookName ? `<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">📚 ${art.bookName}</span>` : ''}
                        ${art.type === 'BOOK' ? `<span class="text-[10px] font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-md">📘 COVER</span>` : ''}
                    </div>
                    <span class="text-[10px] font-mono text-slate-400">ID: ${art.id.substring(0, 8)}…</span>
                </div>

                <div class="flex items-center gap-3">
                    ${art.imageUrl ? `
                        <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 border border-[#ebdccb]">
                            <img src="${art.imageUrl}" alt="" class="w-full h-full object-cover">
                        </div>
                    ` : ''}
                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-extrabold text-[#1e1b18] truncate leading-tight">${art.title}</h4>
                        <p class="text-[11px] font-bold text-[#1e1b18] dark:text-white mt-0.5">${art.author || 'Author'}</p>
                    </div>
                </div>

                <!-- Interactive Layout Adjuster Row -->
                <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-[#f0e6d6] items-center">
                    <div class="sm:col-span-5">
                        <label class="block text-[10px] font-bold uppercase text-[#4a3c33] font-english mb-1">സ്ഥാനം (Placement)</label>
                        <select id="placement-select-${art.id}" class="w-full text-xs font-bold p-2.5 rounded-xl border border-[#ebdccb] focus:outline-none focus:border-[#b4532c] bg-[#fbf7ee]/40 text-[#1e1b18]">
                            <option value="AUTO" ${currentPlacement === 'AUTO' ? 'selected' : ''}>⚡ Automatic</option>
                            <option value="CAROUSEL" ${currentPlacement === 'CAROUSEL' ? 'selected' : ''}>🎠 Carousel</option>
                            <option value="FEED" ${currentPlacement === 'FEED' ? 'selected' : ''}>📰 Feed</option>
                        </select>
                    </div>

                    <div class="sm:col-span-4">
                        <label class="block text-[10px] font-bold uppercase text-[#4a3c33] font-english mb-1">മുൻഗണന (Priority)</label>
                        <input type="number" id="priority-input-${art.id}" min="1" max="999" value="${currentPriority}" class="w-full text-xs font-bold p-2.5 rounded-xl border border-[#ebdccb] focus:outline-none focus:border-[#b4532c] bg-[#fbf7ee]/40 text-[#b4532c]">
                    </div>

                    <div class="sm:col-span-3 pt-4 sm:pt-4">
                        <button type="button" onclick="window.saveArticleLayoutQuick('${art.id}')" id="save-layout-btn-${art.id}" class="w-full px-3 py-2.5 bg-[#b4532c] hover:bg-[#923e1b] text-white text-xs font-bold rounded-xl transition shadow-sm font-english flex items-center justify-center gap-1.5">
                            <span>Save</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Quick Save Layout for a specific article
window.saveArticleLayoutQuick = async function(articleId) {
    const placementSelect = document.getElementById(`placement-select-${articleId}`);
    const priorityInput = document.getElementById(`priority-input-${articleId}`);
    const saveBtn = document.getElementById(`save-layout-btn-${articleId}`);

    if (!placementSelect || !priorityInput) return;

    const newPlacement = sanitizePlacement(placementSelect.value);
    const newPriority = sanitizePriority(priorityInput.value, 10);

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span>⏳</span>`;
    }

    try {
        const articleRef = doc(db, "articles", articleId);
        await updateDoc(articleRef, {
            placement: newPlacement,
            priority: newPriority,
            updatedAt: serverTimestamp()
        });

        showGlobalStatus(`ലേഔട്ട് വിജയകരമായി മാറ്റി! (${newPlacement}, Priority: ${newPriority})`, "success");
    } catch (err) {
        console.error("Error saving quick layout:", err);
        showGlobalStatus("ലേഔട്ട് അപ്‌ഡേറ്റ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span>Save</span><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        }
    }
};


/* ═══════════════════════════════════════════════════════════
   AUTHORS PROFILE MANAGER LOGIC
   ═══════════════════════════════════════════════════════════ */
let managedAuthorsList = [];
let authorPhotoBase64 = "";

function slugifyAuthor(name) {
    return (name || '').trim().toLowerCase().replace(/[^a-z0-9\u0D00-\u0D7F]+/g, '-');
}

export const PRIMARY_AUTHORS = [
    {
        name: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        role: "CHIEF EDITOR · മുഖ്യ പത്രാധിപർ",
        slug: slugifyAuthor("സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ"),
        bio: "NUQTHA മുഖ്യ പത്രാധിപർ, ചരിത്ര-സാഹിത്യ ഗവേഷകൻ",
        photoUrl: ""
    },
    {
        name: "സുലൈമാൻ ഫൈസി കിഴിശ്ശേരി",
        role: "AUTHOR · എഴുത്തുകാരൻ",
        slug: slugifyAuthor("സുലൈമാൻ ഫൈസി കിഴിശ്ശേരി"),
        bio: "ഇസ്ലാമിക ചരിത്ര പണ്ഡിതൻ, പ്രഭാഷകൻ, NUQTHA കോളമിസ്റ്റ്",
        photoUrl: ""
    }
];

function initAuthorManager() {
    const authorForm = document.getElementById("admin-author-form");
    const photoFileInput = document.getElementById("admin-author-photo-file");
    const photoUrlInput = document.getElementById("admin-author-photo");
    const photoPreview = document.getElementById("admin-author-photo-preview");
    const newAuthorBtn = document.getElementById("admin-author-new-btn");

    if (photoFileInput) {
        photoFileInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                authorPhotoBase64 = evt.target.result;
                if (photoUrlInput) photoUrlInput.value = authorPhotoBase64;
                if (photoPreview) {
                    photoPreview.innerHTML = `<img src="${authorPhotoBase64}" class="w-full h-full object-cover rounded-2xl" />`;
                }
            };
            reader.readAsDataURL(file);
        });
    }

    if (photoUrlInput) {
        photoUrlInput.addEventListener("input", (e) => {
            const val = e.target.value.trim();
            if (val && photoPreview) {
                photoPreview.innerHTML = `<img src="${val}" class="w-full h-full object-cover rounded-2xl" onerror="this.onerror=null;this.parentElement.textContent='?'" />`;
            }
        });
    }

    if (newAuthorBtn) {
        newAuthorBtn.addEventListener("click", () => {
            resetAuthorForm();
        });
    }

    if (authorForm) {
        authorForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const nameEl = document.getElementById("admin-author-name");
            const roleEl = document.getElementById("admin-author-role");
            const photoEl = document.getElementById("admin-author-photo");
            const bioEl = document.getElementById("admin-author-bio");
            const editSlugEl = document.getElementById("author-edit-slug");

            const name = nameEl ? nameEl.value.trim() : "";
            const role = (roleEl ? roleEl.value.trim() : "") || "CONTRIBUTOR";
            const photoUrl = (photoEl ? photoEl.value.trim() : "") || authorPhotoBase64;
            const bio = bioEl ? bioEl.value.trim() : "";
            const editSlug = editSlugEl ? editSlugEl.value.trim() : "";

            if (!name) {
                showGlobalStatus("എഴുത്തുകാരന്റെ പേര് നൽകേണ്ടതുണ്ട്.", "error");
                return;
            }

            const slug = editSlug || slugifyAuthor(name);
            const submitBtn = document.getElementById("admin-author-submit-btn");
            const toast = document.getElementById("admin-author-save-toast");

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.classList.add("opacity-60");
            }

            const payload = {
                name,
                role,
                photoUrl,
                bio,
                slug,
                updatedAt: serverTimestamp()
            };

            try {
                await setDoc(doc(db, "authors", slug), payload);
                if (toast) {
                    toast.classList.remove("hidden");
                    setTimeout(() => toast.classList.add("hidden"), 3000);
                }
                resetAuthorForm();
            } catch (err) {
                console.error("[admin.js] Author save error:", err);
                showGlobalStatus("പ്രൊഫൈൽ സേവ് ചെയ്യുമ്പോൾ തടസ്സം നേരിട്ടു: " + err.message, "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove("opacity-60");
                }
            }
        });
    }

    listenToFirestoreAuthors();
}

function resetAuthorForm() {
    const editSlug = document.getElementById("author-edit-slug");
    const nameInput = document.getElementById("admin-author-name");
    const roleInput = document.getElementById("admin-author-role");
    const photoInput = document.getElementById("admin-author-photo");
    const bioInput = document.getElementById("admin-author-bio");
    const photoPreview = document.getElementById("admin-author-photo-preview");
    const heading = document.getElementById("author-form-heading");
    const newBtn = document.getElementById("admin-author-new-btn");

    if (editSlug) editSlug.value = "";
    if (nameInput) nameInput.value = "";
    if (roleInput) roleInput.value = "";
    if (photoInput) photoInput.value = "";
    if (bioInput) bioInput.value = "";
    if (photoPreview) photoPreview.textContent = "?";
    if (heading) heading.textContent = "എഴുത്തുകാരന്റെ പ്രൊഫൈൽ മാനേജർ (Author Profile Manager)";
    if (newBtn) newBtn.classList.add("hidden");
    authorPhotoBase64 = "";
}

function listenToFirestoreAuthors() {
    try {
        const authorsCol = collection(db, "authors");
        onSnapshot(authorsCol, (snapshot) => {
            const list = [];
            snapshot.forEach(docSnap => {
                list.push({ id: docSnap.id, ...docSnap.data() });
            });
            managedAuthorsList = list;
            renderAdminAuthorsTab();
        }, (err) => {
            console.warn("[admin.js] Authors listener warning:", err);
        });
    } catch (e) {
        console.warn("[admin.js] Authors listener init failed:", e);
    }
}

function renderAdminAuthorsTab() {
    const grid = document.getElementById("admin-authors-grid");
    const badge = document.getElementById("admin-authors-count");
    const tabBadge = document.getElementById("tab-authors-badge");

    if (!grid) return;

    // Combine primary authors + managed authors + unique authors found in published articles
    const articleAuthorsMap = {};
    currentArticlesList.forEach(art => {
        const aName = (art.author || "").trim();
        if (aName) {
            const s = slugifyAuthor(aName);
            if (!articleAuthorsMap[s]) articleAuthorsMap[s] = { name: aName, count: 0 };
            articleAuthorsMap[s].count++;
        }
    });

    const safeManaged = Array.isArray(managedAuthorsList) ? managedAuthorsList : [];
    const safePrimary = Array.isArray(PRIMARY_AUTHORS) ? PRIMARY_AUTHORS : [];

    // Ensure PRIMARY_AUTHORS are always included
    const allKeys = new Set([
        ...safePrimary.map(a => a.slug),
        ...safeManaged.map(a => a.id || a.slug),
        ...Object.keys(articleAuthorsMap)
    ]);
    const count = allKeys.size;
    if (badge) badge.textContent = count;
    if (tabBadge) tabBadge.textContent = count;

    if (count === 0) {
        grid.innerHTML = `
        <div class="col-span-full py-8 text-center text-xs text-[#8c7a6b]">
            എഴുത്തുകാരെ ചേർത്തിട്ടില്ല. മുകളിലെ ഫോമിലൂടെ ചേർക്കാം.
        </div>
        `;
        return;
    }

    grid.innerHTML = Array.from(allKeys).map(key => {
        const managed = managedAuthorsList.find(a => (a.id || a.slug) === key) ||
                        PRIMARY_AUTHORS.find(a => a.slug === key);
        const artInfo = articleAuthorsMap[key];
        const name = (managed && managed.name) || (artInfo && artInfo.name) || key;
        const role = (managed && managed.role) || "Contributor";
        const photo = (managed && managed.photoUrl) || "";
        const bio = (managed && managed.bio) || "NUQTHA രചയിതാവ്";
        const articleCount = (artInfo && artInfo.count) || 0;
        const initial = name.trim().charAt(0).toUpperCase() || "A";
        const isPrimary = PRIMARY_AUTHORS.some(p => p.slug === key);

        return `
        <div class="p-4 rounded-2xl border ${isPrimary ? 'border-[#b4532c]/50 bg-[#fffbf7]' : 'border-[#ebdccb] bg-[#fbf7ee]/40'} space-y-3 flex flex-col justify-between shadow-xs hover:border-[#b4532c] transition">
            <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#b4532c] to-[#d97706] text-white flex items-center justify-center font-bold text-base flex-shrink-0 overflow-hidden border border-white shadow-xs">
                    ${photo ? `<img src="${photo}" alt="${name}" class="w-full h-full object-cover" />` : initial}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <h4 class="text-xs sm:text-sm font-bold text-[#1e1b18] truncate font-['Anek_Malayalam']">
                            ${name}
                        </h4>
                        ${isPrimary ? `<span class="text-[9px] font-black uppercase text-[#b4532c] bg-[#b4532c]/10 px-1.5 py-0.2 rounded font-english">PRIMARY</span>` : ''}
                    </div>
                    <p class="text-[10px] text-[#b4532c] font-black uppercase font-english">
                        ${role}
                    </p>
                    <p class="text-[11px] text-[#7a6758] line-clamp-2 mt-1">
                        ${bio}
                    </p>
                </div>
            </div>

            <div class="pt-2 border-t border-[#ebdccb]/60 flex items-center justify-between text-[11px] font-english">
                <span class="font-bold text-[#1e1b18]">
                    📚 ${articleCount} Articles
                </span>
                <div class="flex items-center gap-1.5">
                    <button type="button" onclick="editAuthorProfile('${key}')" class="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold transition text-[10px] cursor-pointer">
                        ✏️ Edit
                    </button>
                    <a href="author.html?id=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}" target="_blank" class="px-2.5 py-1 rounded-lg bg-[#b4532c]/10 hover:bg-[#b4532c]/20 text-[#b4532c] font-bold transition text-[10px]">
                        👁️ View
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

window.editAuthorProfile = function(key) {
    const managed = managedAuthorsList.find(a => (a.id || a.slug) === key) ||
                    PRIMARY_AUTHORS.find(a => a.slug === key);
    let name = (managed && managed.name) || key;
    if (!managed || !managed.name) {
        currentArticlesList.forEach(art => {
            if (slugifyAuthor(art.author) === key) name = art.author;
        });
    }

    const editSlug = document.getElementById("author-edit-slug");
    const nameInput = document.getElementById("admin-author-name");
    const roleInput = document.getElementById("admin-author-role");
    const photoInput = document.getElementById("admin-author-photo");
    const bioInput = document.getElementById("admin-author-bio");
    const photoPreview = document.getElementById("admin-author-photo-preview");
    const heading = document.getElementById("author-form-heading");
    const newBtn = document.getElementById("admin-author-new-btn");

    if (editSlug) editSlug.value = key;
    if (nameInput) nameInput.value = name;
    if (roleInput) roleInput.value = (managed && managed.role) || "";
    if (photoInput) photoInput.value = (managed && managed.photoUrl) || "";
    if (bioInput) bioInput.value = (managed && managed.bio) || "";
    if (heading) heading.textContent = `എഡിറ്റ് ചെയ്യുന്നു: ${name}`;
    if (newBtn) newBtn.classList.remove("hidden");

    if (photoPreview) {
        if (managed && managed.photoUrl) {
            photoPreview.innerHTML = `<img src="${managed.photoUrl}" class="w-full h-full object-cover rounded-2xl" />`;
        } else {
            photoPreview.textContent = name.trim().charAt(0).toUpperCase() || "?";
        }
    }

    const authorForm = document.getElementById("admin-author-form");
    if (authorForm) {
        authorForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.resetAuthorForm = resetAuthorForm;

window.renderAdminAuthorsTab = renderAdminAuthorsTab;


window.setBmSeriesTag = function(tag) {
    const el = document.getElementById("bm-art-category");
    if (el) el.value = tag;
};

/* ═══════════════════════════════════════════════════════════
   ADMIN COMMENTS MODAL & VISIBILITY CONTROLLER
   ═══════════════════════════════════════════════════════════ */
window.viewArticleComments = async function(articleId, articleTitle) {
    const modal = document.getElementById("admin-comments-modal");
    const titleEl = document.getElementById("modal-article-title");
    const countEl = document.getElementById("modal-comments-count");
    const bodyEl = document.getElementById("modal-comments-body");
    if (!modal || !bodyEl) return;

    modal.classList.remove("hidden");
    if (titleEl) titleEl.textContent = articleTitle || "Article";
    if (countEl) countEl.textContent = "...";
    bodyEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">അഭിപ്രായങ്ങൾ ലോഡ് ചെയ്യുന്നു...</p>`;

    try {
        const commentsCol = collection(db, "articles", articleId, "comments");
        const q = query(commentsCol, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const comments = [];
        snap.forEach(d => comments.push({ id: d.id, ...d.data() }));

        if (countEl) countEl.textContent = comments.length;

        if (comments.length === 0) {
            bodyEl.innerHTML = `
                <div class="text-center py-10 text-xs text-[#8c7a6b] space-y-1">
                    <p class="font-bold text-sm">അഭിപ്രായങ്ങളൊന്നും ഇല്ല</p>
                    <p>ഈ ലേഖനത്തിൽ ഇതുവരെ അഭിപ്രായങ്ങൾ രേഖപ്പെടുത്തിയിട്ടില്ല.</p>
                </div>
            `;
            return;
        }

        bodyEl.innerHTML = comments.map(c => {
            const cleanName = (c.name || "വായനക്കാരൻ").replace(/<[^>]*>?/gm, '');
            const cleanEmail = (c.email || "ലോഗിൻ ചെയ്യാത്ത ഇമെയിൽ").replace(/<[^>]*>?/gm, '');
            const cleanComment = (c.comment || "").replace(/<[^>]*>?/gm, '');
            const initial = cleanName.charAt(0).toUpperCase() || "W";
            let dateStr = "ഇപ്പോൾ";
            if (c.createdAt) {
                try {
                    const ms = typeof c.createdAt === "number" ? c.createdAt : (c.createdAt.toMillis ? c.createdAt.toMillis() : Date.parse(c.createdAt));
                    if (ms) dateStr = new Date(ms).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
                } catch {}
            }

            return `
                <div class="p-3.5 rounded-2xl bg-[#fbf7ee]/60 border border-[#ebdccb] space-y-2">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2.5 min-w-0">
                            ${c.avatar ? `
                                <img src="${c.avatar}" class="w-8 h-8 rounded-full object-cover border border-[#ebdccb] flex-shrink-0" alt="Avatar">
                            ` : `
                                <div class="w-8 h-8 rounded-full bg-[#b4532c] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                                    ${initial}
                                </div>
                            `}
                            <div class="min-w-0">
                                <h5 class="text-xs font-bold text-[#1e1b18] truncate">${cleanName}</h5>
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-mono font-semibold truncate max-w-xs">
                                        📧 ${cleanEmail}
                                    </span>
                                    <span class="text-[10px] text-slate-400 font-english">${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" onclick="window.deleteAdminComment('${articleId}', '${c.id}')" title="അഭിപ്രായം ഡിലീറ്റ് ചെയ്യുക" class="text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs px-2.5 py-1 rounded-lg border border-rose-200 transition font-bold font-english cursor-pointer flex-shrink-0">
                            Delete
                        </button>
                    </div>
                    <p class="text-xs text-[#4a3c33] pl-10 leading-relaxed font-sans">${cleanComment}</p>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Load comments error:", err);
        bodyEl.innerHTML = `<p class="text-xs text-rose-600 text-center py-6">അഭിപ്രായങ്ങൾ ലോഡ് ചെയ്യുന്നതിൽ തടസ്സം നേരിട്ടു.</p>`;
    }
};

window.closeCommentsModal = function() {
    const modal = document.getElementById("admin-comments-modal");
    if (modal) modal.classList.add("hidden");
};

window.deleteAdminComment = async function(articleId, commentId) {
    if (!confirm("ഈ അഭിപ്രായം ശാശ്വതമായി ഒഴിവാക്കണോ?")) return;
    try {
        await deleteDoc(doc(db, "articles", articleId, "comments", commentId));
        showGlobalStatus("അഭിപ്രായം ഒഴിവാക്കി.", "error");
        window.viewArticleComments(articleId, document.getElementById("modal-article-title")?.textContent || "");
    } catch (err) {
        console.error("Delete comment error:", err);
        showGlobalStatus("ഡിലീറ്റ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു: " + err.message, "error");
    }
};

/* ═══════════ GLOBAL DELEGATED ACTION DISPATCHER (STABLE EVENT CONTAINER) ═══════════ */
document.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    switch (action) {
        case "toggle-collapsible": {
            e.preventDefault();
            const targetId = actionEl.dataset.target;
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            const isExpanded = actionEl.getAttribute("aria-expanded") === "true";
            actionEl.setAttribute("aria-expanded", String(!isExpanded));
            targetEl.classList.toggle("hidden", isExpanded);
            const icon = actionEl.querySelector(".collapsible-icon");
            if (icon) icon.innerHTML = isExpanded ? "&darr;" : "&uarr;";

            // If opening attach collapsible, lazy-render first 20 articles
            if (!isExpanded && targetId === "bm-attach-collapsible-body") {
                compactArticlesDisplayLimit = 20;
                renderBookManagerCompactArticles(currentArticlesList, activeBookName);
            }
            break;
        }
        case "load-more-articles": {
            e.preventDefault();
            compactArticlesDisplayLimit += 20;
            renderBookManagerCompactArticles(currentArticlesList, activeBookName);
            break;
        }
        case "attach-selected-articles": {
            e.preventDefault();
            const btn = document.getElementById("bm-attach-selected-btn");
            if (btn && btn.click) btn.dispatchEvent(new CustomEvent("execute-attach"));
            break;
        }
        case "add-chapter-to-book": {
            e.preventDefault();
            if (typeof window.handleAddChapterToBook === "function") {
                window.handleAddChapterToBook(e);
            }
            break;
        }
        case "upload-book-cover": {
            const fileInput = document.getElementById("book-cover-input");
            if (fileInput && e.target !== fileInput && !e.target.closest("[data-action='remove-book-cover']")) {
                fileInput.click();
            }
            break;
        }
        case "remove-book-cover": {
            e.stopPropagation();
            if (typeof window.handleRemoveBookCover === "function") {
                window.handleRemoveBookCover(e);
            }
            break;
        }
        case "replace-presentation": {
            e.stopPropagation();
            const pInput = document.getElementById("bm-presentation-file-input");
            if (pInput) pInput.click();
            break;
        }
        case "remove-presentation": {
            e.stopPropagation();
            const removeBtn = document.getElementById("bm-remove-presentation-btn");
            if (removeBtn && removeBtn.click) removeBtn.dispatchEvent(new CustomEvent("execute-remove"));
            break;
        }
        case "save-presentation": {
            e.preventDefault();
            const saveBtn = document.getElementById("bm-save-presentation-btn");
            if (saveBtn && saveBtn.click) saveBtn.dispatchEvent(new CustomEvent("execute-save"));
            break;
        }
        case "edit-article": {
            e.preventDefault();
            const id = actionEl.dataset.id;
            if (id && typeof window.startEditArticle === "function") {
                window.startEditArticle(id);
            }
            break;
        }
        case "manage-book": {
            e.preventDefault();
            const id = actionEl.dataset.id;
            if (id && typeof window.manageBookById === "function") {
                window.manageBookById(id);
            }
            break;
        }
        case "edit-book-meta": {
            e.preventDefault();
            const id = actionEl.dataset.id;
            if (id && typeof window.editBookMetadataById === "function") {
                window.editBookMetadataById(id);
            }
            break;
        }
        case "delete-book": {
            e.preventDefault();
            const id = actionEl.dataset.id;
            const title = actionEl.dataset.title;
            if (id && typeof window.deleteBookById === "function") {
                window.deleteBookById(id, title);
            }
            break;
        }
        case "delete-article": {
            e.preventDefault();
            const id = actionEl.dataset.id;
            if (id && typeof window.deleteArticle === "function") {
                window.deleteArticle(id);
            }
            break;
        }
    }
});
