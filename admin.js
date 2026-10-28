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
let pendingInlineBase64 = "";

const ADMIN_PASSWORD = "admin768";
const AUTH_STORAGE_KEY = "nuqtha_admin_authenticated";
let isDashboardInitialized = false;

function initAdminDashboard() {
    if (isDashboardInitialized) return;
    isDashboardInitialized = true;

    const safeInit = (fnName, fn) => {
        try {
            fn();
        } catch (err) {
            console.error(`[Admin Dashboard] Error initializing ${fnName}:`, err);
        }
    };

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
    if (["create", "book", "layout", "published"].includes(hash)) {
        switchAdminTab(hash);
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
    if (excerptInput) excerptInput.value = art.excerpt || "";
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
function initFormattingToolbar() {
    const contentTextarea = document.getElementById("art-content");
    const toolBoldBtn = document.getElementById("tool-bold-btn");
    const toolHighlightBtn = document.getElementById("tool-highlight-btn");
    const toolRemoveHighlightBtn = document.getElementById("tool-remove-highlight-btn");
    const toolHighlightCardBtn = document.getElementById("tool-highlight-card-btn");
    const toolH2Btn = document.getElementById("tool-h2-btn");
    const toolH3Btn = document.getElementById("tool-h3-btn");
    const toolInlineImgBtn = document.getElementById("tool-inline-img-btn");
    const inlineImgFileInput = document.getElementById("inline-img-file-input");

    const imgOptionsModal = document.getElementById("img-options-modal");
    const cancelImgModalBtn = document.getElementById("cancel-img-modal-btn");
    const confirmInsertImgBtn = document.getElementById("confirm-insert-img-btn");
    const imgModalCaption = document.getElementById("img-modal-caption");

    if (!contentTextarea) return;

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
                // If already highlighted within selection
                if (selected.startsWith("==") && selected.endsWith("==") && selected.length >= 4) {
                    const unwrapped = selected.substring(2, selected.length - 2);
                    contentTextarea.value = text.substring(0, start) + unwrapped + text.substring(end);
                    contentTextarea.focus();
                    contentTextarea.setSelectionRange(start, start + unwrapped.length);
                    return;
                }

                // If cursor is right inside ==...==
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
                    alert("മാറ്റാൻ ഹൈലൈറ്റുകളൊന്നും കണ്ടെത്തിയില്ല.");
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

            // Strict file validation
            if (!file.type.startsWith("image/")) {
                alert("ദയവായി ഒരു സാധുവായ ചിത്രം (JPG, PNG, WebP) തിരഞ്ഞെടുക്കുക.");
                inlineImgFileInput.value = "";
                return;
            }
            if (file.size > 12 * 1024 * 1024) {
                alert("ചിത്രത്തിന്റെ വലിപ്പം 12MB-യിൽ കുറവായിരിക്കണം.");
                inlineImgFileInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onerror = function() {
                alert("ചിത്രം വായിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.");
            };
            reader.onload = function (event) {
                const img = new Image();
                img.onerror = function() {
                    alert("ചിത്രം ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.");
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
                    pendingInlineBase64 = canvas.toDataURL("image/jpeg", 0.78);
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
            pendingInlineBase64 = "";
            imgOptionsModal.classList.add("hidden");
        });
    }

    if (confirmInsertImgBtn && imgOptionsModal) {
        confirmInsertImgBtn.addEventListener("click", () => {
            if (!pendingInlineBase64) return;
            const selectedSizeEl = document.querySelector('input[name="img-size-option"]:checked');
            const size = selectedSizeEl ? selectedSizeEl.value : "medium";
            const caption = imgModalCaption ? (imgModalCaption.value.trim() || "ചിത്രം") : "ചിത്രം";

            const insertTag = `\n\n![${caption}|${size}](${pendingInlineBase64})\n\n`;

            const start = contentTextarea.selectionStart;
            const text = contentTextarea.value;
            contentTextarea.value = text.substring(0, start) + insertTag + text.substring(start);

            pendingInlineBase64 = "";
            imgOptionsModal.classList.add("hidden");
            contentTextarea.focus();
        });
    }
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
        radio.addEventListener("change", (e) => {
            const val = e.target.value;
            const labels = {
                small: "Small (ചെറുത് - 15px)",
                medium: "Medium (സാധാരണ - 18px)",
                large: "Large (വലുത് - 21px)",
                xlarge: "Extra Large (കൂടുതൽ - 24px)"
            };
            if (fontSizeLabel) fontSizeLabel.textContent = labels[val] || val;
            if (previewContent) {
                const sizes = { small: "0.85rem", medium: "0.95rem", large: "1.1rem", xlarge: "1.25rem" };
                previewContent.style.fontSize = sizes[val] || "0.95rem";
            }
        });
    });
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
            alert("ദയവായി ഒരു സാധുവായ ഇമേജ് ഫയൽ (JPG, PNG, WebP) തിരഞ്ഞെടുക്കുക.");
            fileInput.value = "";
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            alert("ചിത്രത്തിന്റെ വലിപ്പം 12MB-യിൽ കുറവായിരിക്കണം.");
            fileInput.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onerror = function() {
            alert("ചിത്രം വായിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും തിരഞ്ഞെടുക്കുക.");
        };
        reader.onload = function (event) {
            const img = new Image();
            img.onerror = function() {
                alert("ചിത്രം ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.");
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
let activeBookName = "";
let activeBookAuthor = "";
let activeBookCoverDoc = null;
let activeBookChapters = [];
let bmSelectedArticleImageBase64 = "";
let bmPresentationFileBase64 = "";
let bmPresentationFileName = "";
let dragSrcChapterIndex = null;

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

function initBookManagerSuite() {
    initBookCoverUploader();
    initBookSwitcherAndStep1();
    initChapterWriter();
    initChapterReordering();
    initBookAttachExistingArticles();
    initBookPresentationUpload();
}

/* ═══════════ 1. BOOK COVER UPLOADER (STEP 1) ═══════════ */
function initBookCoverUploader() {
    const fileInput = document.getElementById("book-cover-input");
    const placeholder = document.getElementById("book-upload-placeholder");
    const previewContainer = document.getElementById("book-image-preview-container");
    const previewImg = document.getElementById("book-image-preview");
    const removeBtn = document.getElementById("remove-book-img-btn");
    const dropzone = document.getElementById("book-cover-dropzone") || (fileInput ? fileInput.parentElement : null);

    if (!fileInput) return;

    function handleCoverFile(file) {
        if (!file || !file.type.startsWith("image/")) {
            alert("ദയവായി ഒരു സാധുവായ ചിത്രം (JPG, PNG, WebP) തിരഞ്ഞെടുക്കുക.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxDim = 1000;
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
                selectedBookCoverBase64 = canvas.toDataURL("image/jpeg", 0.85);
                if (previewImg) previewImg.src = selectedBookCoverBase64;
                if (placeholder) placeholder.classList.add("hidden");
                if (previewContainer) previewContainer.classList.remove("hidden");
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleCoverFile(file);
    });

    if (dropzone) {
        dropzone.addEventListener("click", (e) => {
            if (e.target !== fileInput && !e.target.closest("#remove-book-img-btn")) {
                fileInput.click();
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
            const dt = e.dataTransfer;
            const file = dt && dt.files && dt.files[0];
            if (file) handleCoverFile(file);
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedBookCoverBase64 = "";
            fileInput.value = "";
            if (previewImg) previewImg.src = "";
            if (previewContainer) previewContainer.classList.add("hidden");
            if (placeholder) placeholder.classList.remove("hidden");
        });
    }
}

/* ═══════════ 2. BOOK SWITCHER & STEP 1 SAVING ═══════════ */
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
            showGlobalStatus("✨ പുതിയ പുസ്തകം തയ്യാറാക്കുക: കവറും വിവരങ്ങളും നൽകി സേവ് ചെയ്യുക.", "info");
        });
    }

    if (publishBtn) {
        publishBtn.addEventListener("click", async (e) => {
            if (e) e.preventDefault();

            const name = document.getElementById("book-meta-name")?.value.trim() || "";
            const volume = document.getElementById("book-meta-volume")?.value.trim() || "";
            const issue = document.getElementById("book-meta-issue")?.value.trim() || "";
            const dateVal = document.getElementById("book-meta-date")?.value.trim() || new Date().toLocaleDateString("en-GB");
            const leadTitle = document.getElementById("book-meta-lead-title")?.value.trim() || "";
            const author = document.getElementById("book-meta-author")?.value.trim() || "- എഡിറ്റോറിയൽ";
            const featuredTitle = document.getElementById("book-meta-featured-title")?.value.trim() || "";
            const tag = document.getElementById("book-meta-tag")?.value.trim() || "Premium Book";
            const desc = document.getElementById("book-meta-desc")?.value.trim() || "";

            // Streamlined validation for single-author books:
            // Require ONLY: Book Title, Cover Image (3:4), and Publication Tag
            if (!name) {
                alert("ദയവായി പുസ്തകത്തിന്റെ പേര് (Book / Edition Title) നൽകുക.");
                document.getElementById("book-meta-name")?.focus();
                return;
            }
            if (!tag) {
                alert("ദയവായി പതിപ്പ് ടാഗ് (Publication Tag) നൽകുക.");
                document.getElementById("book-meta-tag")?.focus();
                return;
            }

            // Check if existing
            const existing = currentArticlesList.find(a => a.type === "BOOK" && (
                normalizeStringClean(a.bookName) === normalizeStringClean(name) ||
                normalizeStringClean(a.title) === normalizeStringClean(name)
            ));

            const coverImage = selectedBookCoverBase64 || (existing ? existing.imageUrl : "") || "";

            publishBtn.disabled = true;
            publishBtn.innerHTML = `<span class="inline-block animate-spin mr-2">⏳</span><span>സേവ് ചെയ്യുന്നു...</span>`;

            try {
                const payload = {
                    title: name,
                    bookName: name,
                    volume: volume,
                    issue: issue,
                    leadTitle: leadTitle,
                    featuredTitle: featuredTitle,
                    author: author,
                    category: tag,
                    imageUrl: coverImage,
                    excerpt: desc || "Book Collection",
                    content: desc || "This is a curated book collection.",
                    type: "BOOK",
                    placement: "AUTO",
                    priority: 1,
                    date: dateVal,
                    updatedAt: serverTimestamp()
                };

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

                updateActiveBookOverview(currentArticlesList);
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
                publishBtn.disabled = false;
                publishBtn.innerHTML = `<span>സേവ് ചെയ്ത് അധ്യായങ്ങൾ ചേർക്കലിലേക്ക് കടക്കുക (Save & Continue to Step 2)</span><svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
            }
        });
    }
}

function resetBookManagerForm() {
    activeBookName = "";
    activeBookAuthor = "";
    activeBookCoverDoc = null;
    activeBookChapters = [];

    const activeSelect = document.getElementById("bm-active-book-select");
    if (activeSelect) activeSelect.value = "";

    const nameInput = document.getElementById("book-meta-name");
    const authorInput = document.getElementById("book-meta-author");
    const tagInput = document.getElementById("book-meta-tag");
    const descInput = document.getElementById("book-meta-desc");
    const removeBtn = document.getElementById("remove-book-img-btn");

    if (nameInput) nameInput.value = "";
    if (authorInput) authorInput.value = "";
    if (tagInput) tagInput.value = "Premium Book";
    if (descInput) descInput.value = "";
    const volInput = document.getElementById("book-meta-volume");
    const issInput = document.getElementById("book-meta-issue");
    const dateInput = document.getElementById("book-meta-date");
    const leadInput = document.getElementById("book-meta-lead-title");
    const featInput = document.getElementById("book-meta-featured-title");
    if (volInput) volInput.value = "";
    if (issInput) issInput.value = "";
    if (dateInput) dateInput.value = "";
    if (leadInput) leadInput.value = "";
    if (featInput) featInput.value = "";
    if (removeBtn) removeBtn.click();

    const wrapper = document.getElementById("bm-step2-3-wrapper");
    if (wrapper) wrapper.classList.add("hidden");

    nameInput?.focus();
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
    const descInput = document.getElementById("book-meta-desc");
    const previewImg = document.getElementById("book-image-preview");
    const previewContainer = document.getElementById("book-image-preview-container");
    const placeholder = document.getElementById("book-upload-placeholder");

    if (nameInput) nameInput.value = activeBookName;
    if (authorInput) authorInput.value = activeBookAuthor;
    if (tagInput) tagInput.value = bookCover?.category || "Premium Book";
    if (descInput) descInput.value = bookCover?.excerpt || bookCover?.content || "";
    const volInput = document.getElementById("book-meta-volume");
    const issInput = document.getElementById("book-meta-issue");
    const dateInput = document.getElementById("book-meta-date");
    const leadInput = document.getElementById("book-meta-lead-title");
    const featInput = document.getElementById("book-meta-featured-title");
    if (volInput) volInput.value = bookCover?.volume || "";
    if (issInput) issInput.value = bookCover?.issue || "";
    if (dateInput) dateInput.value = bookCover?.date || "";
    if (leadInput) leadInput.value = bookCover?.leadTitle || "";
    if (featInput) featInput.value = bookCover?.featuredTitle || "";

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
}

function loadAndRenderBookChapters() {
    if (!activeBookName) {
        activeBookChapters = [];
        renderBookChaptersReorderList([]);
        return;
    }

    const bName = normalizeStringClean(activeBookName);
    const bTitle = normalizeStringClean(activeBookCoverDoc?.title || activeBookName);
    const bId = (activeBookCoverDoc?.id || "").trim();

    activeBookChapters = currentArticlesList.filter(a => matchesBookExact(a, bName, bTitle, bId));

    // Sort strictly by priority
    activeBookChapters.sort((a, b) => {
        if (a.priority !== b.priority) return (a.priority || 1) - (b.priority || 1);
        return parseTimestampMillis(b.createdAt) - parseTimestampMillis(a.createdAt);
    });

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
                alert("ദയവായി ഒരു സാധുവായ ചിത്രം തിരഞ്ഞെടുക്കുക.");
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const maxDim = 1000;
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
                    bmSelectedArticleImageBase64 = canvas.toDataURL("image/jpeg", 0.85);
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

    if (publishBtn) {
        publishBtn.addEventListener("click", async () => {
            if (!activeBookName) {
                alert("ദയവായി ആദ്യം ഘട്ടം 1-ൽ ഒരു പുസ്തകം തിരഞ്ഞെടുക്കുക അല്ലെങ്കിൽ സേവ് ചെയ്യുക.");
                return;
            }

            const title = document.getElementById("bm-art-title")?.value.trim();
            const content = document.getElementById("bm-art-content")?.value.trim();
            const transcription = document.getElementById("bm-art-transcription")?.value.trim() || "";

            if (!title || title.length < 2) {
                alert("ദയവായി അധ്യായത്തിന്റെ തലക്കെട്ട് (Title) നൽകുക.");
                document.getElementById("bm-art-title")?.focus();
                return;
            }
            if (!content || content.length < 5) {
                alert("ദയവായി അധ്യായത്തിന്റെ പൂർണ്ണ ഉള്ളടക്കം (Content) നൽകുക.");
                document.getElementById("bm-art-content")?.focus();
                return;
            }

            publishBtn.disabled = true;
            publishBtn.innerHTML = "അധ്യായം ചേർക്കുന്നു...";

            try {
                // Next sequential priority number
                const nextPriority = activeBookChapters.length + 1;
                const bookTag = document.getElementById("book-meta-tag")?.value.trim() || "Chapter";

                const raw = {
                    title,
                    author: activeBookAuthor || "NUQTHA AUTHOR",
                    category: bookTag,
                    transcription,
                    priority: nextPriority,
                    content,
                    imageUrl: bmSelectedArticleImageBase64,
                    bookName: activeBookName,
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

                const newArt = { id: docRef.id, ...sanitized };
                currentArticlesList.unshift(newArt);

                showGlobalStatus(`✨ അധ്യായം '${title}' (#${nextPriority}) വിജയകരമായി ചേർത്തു!`, "success");

                // Reset chapter form
                document.getElementById("bm-art-title").value = "";
                document.getElementById("bm-art-content").value = "";
                document.getElementById("bm-art-transcription").value = "";
                if (removeBtn) removeBtn.click();

                // Refresh chapters list
                loadAndRenderBookChapters();

            } catch (err) {
                console.error("Add chapter error:", err);
                showGlobalStatus("അധ്യായം ചേർക്കാൻ കഴിഞ്ഞില്ല: " + err.message, "error");
            } finally {
                publishBtn.disabled = false;
                publishBtn.innerHTML = `<span>ഈ അധ്യായം പുസ്തകത്തിലേക്ക് ചേർക്കുക (Add Chapter to Book)</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>`;
            }
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

    listEl.innerHTML = chapters.map((art, idx) => {
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
            <div class="flex items-center gap-1 flex-shrink-0">
                <button type="button" class="btn-move-up w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition" data-index="${idx}" title="Move Up" ${idx === 0 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▲</button>
                <button type="button" class="btn-move-down w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition" data-index="${idx}" title="Move Down" ${idx === chapters.length - 1 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▼</button>
                <button type="button" class="btn-detach-chapter w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-bold transition ml-1" data-id="${art.id}" data-title="${art.title.replace(/"/g, '&quot;')}" title="Remove from this book">✕</button>
            </div>
        </div>
        `;
    }).join("");

    // Bind Drag & Drop Listeners
    const items = listEl.querySelectorAll(".chapter-reorder-item");
    items.forEach(item => {
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

    // Bind Detach Button
    listEl.querySelectorAll(".btn-detach-chapter").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const title = btn.dataset.title;
            if (!confirm(`'${title}' ഈ പുസ്തകത്തിൽ നിന്ന് മാറ്റണോ (Remove from book)?`)) return;

            try {
                await updateDoc(doc(db, "articles", id), {
                    bookName: "",
                    updatedAt: serverTimestamp()
                });
                const found = currentArticlesList.find(a => a.id === id);
                if (found) found.bookName = "";

                activeBookChapters = activeBookChapters.filter(a => a.id !== id);
                renderBookChaptersReorderList(activeBookChapters);
                saveAndApplyChapterOrder(false);
                showGlobalStatus(`'${title}' പുസ്തകത്തിൽ നിന്ന് മാറ്റി.`, "info");
            } catch (err) {
                console.error("Detach chapter error:", err);
                showGlobalStatus("മാറ്റാൻ കഴിഞ്ഞില്ല.", "error");
            }
        });
    });
}

async function saveAndApplyChapterOrder(showToast = true) {
    if (!activeBookChapters || activeBookChapters.length === 0) return;

    try {
        for (let i = 0; i < activeBookChapters.length; i++) {
            const art = activeBookChapters[i];
            const newPriority = i + 1;
            if (art.priority !== newPriority) {
                art.priority = newPriority;
                await updateDoc(doc(db, "articles", art.id), {
                    priority: newPriority,
                    updatedAt: serverTimestamp()
                });
                const globalItem = currentArticlesList.find(a => a.id === art.id);
                if (globalItem) globalItem.priority = newPriority;
            }
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
        attachBtn.addEventListener("click", async () => {
            if (!activeBookName) {
                alert("ദയവായി ആദ്യം ഒരു പുസ്തകം തിരഞ്ഞെടുക്കുക.");
                return;
            }

            const checked = Array.from(document.querySelectorAll(".bm-article-chk:checked"));
            if (checked.length === 0) {
                alert("ദയവായി പുസ്തകത്തിലേക്ക് ചേർക്കാൻ ലേഖനങ്ങൾ തിരഞ്ഞെടുക്കുക.");
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
                            author: activeBookAuthor || "NUQTHA AUTHOR",
                            priority: startPriority,
                            updatedAt: serverTimestamp()
                        });
                        const item = currentArticlesList.find(a => a.id === id);
                        if (item) {
                            item.bookName = activeBookName;
                            item.author = activeBookAuthor || item.author;
                            item.priority = startPriority;
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
        });
    }
}

function renderBookManagerCompactArticles(articles, activeBookParam) {
    const listEl = document.getElementById("bm-compact-articles-list");
    if (!listEl) return;

    const listToRender = (articles && articles.length > 0) ? articles : (currentArticlesList || []);
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
        return;
    }

    listEl.innerHTML = filtered.map(art => {
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
    const placeholder = document.getElementById("bm-presentation-placeholder");
    const fileInfo = document.getElementById("bm-presentation-file-info");
    const fileNameEl = document.getElementById("bm-presentation-file-name");
    const removeBtn = document.getElementById("bm-remove-presentation-btn");
    const saveBtn = document.getElementById("bm-save-presentation-btn");
    const linkInput = document.getElementById("bm-presentation-link");

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            bmPresentationFileName = file.name;
            const reader = new FileReader();
            reader.onload = (event) => {
                bmPresentationFileBase64 = event.target.result;
                if (fileNameEl) fileNameEl.textContent = file.name;
                if (placeholder) placeholder.classList.add("hidden");
                if (fileInfo) fileInfo.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            bmPresentationFileBase64 = "";
            bmPresentationFileName = "";
            if (fileInput) fileInput.value = "";
            if (fileInfo) fileInfo.classList.add("hidden");
            if (placeholder) placeholder.classList.remove("hidden");
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            const externalLink = linkInput ? linkInput.value.trim() : "";
            if (!activeBookName) {
                alert("ദയവായി ആദ്യം ഒരു പുസ്തകം തിരഞ്ഞെടുക്കുക.");
                return;
            }
            if (!bmPresentationFileBase64 && !externalLink) {
                alert("ദയവായി ഒരു PDF ഫയൽ അപ്‌ലോഡ് ചെയ്യുക അല്ലെങ്കിൽ ലിങ്ക് നൽകുക.");
                return;
            }

            saveBtn.disabled = true;
            saveBtn.innerHTML = "സേവ് ചെയ്യുന്നു...";

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
                saveBtn.disabled = false;
                saveBtn.innerHTML = "Save Presentation to Book";
            }
        });
    }
}

/* ═══════════ 7. ACTIVE BOOKS OVERVIEW & DROPDOWN POPULATION ═══════════ */
function updateActiveBookOverview(articles) {
    const activeSelect = document.getElementById("bm-active-book-select");

    // Discover all book names
    const bookMap = {};
    articles.forEach(art => {
        if (art.type === "BOOK" && art.title) {
            const name = art.title.trim();
            if (!bookMap[name]) bookMap[name] = { cover: art, chapters: 0 };
        }
    });

    articles.forEach(art => {
        if (art.type !== "BOOK" && art.bookName && art.bookName.trim()) {
            const name = art.bookName.trim();
            if (!bookMap[name]) bookMap[name] = { cover: null, chapters: 0 };
            bookMap[name].chapters++;
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
        updateArticleCounters(items.length);
        renderAdminPublishedList(items);
        updateActiveBookOverview(items);
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
    if (countBadge) countBadge.textContent = count;
    if (tabBadge) tabBadge.textContent = count;
}

function renderAdminPublishedList(items) {
    const listContainer = document.getElementById("admin-articles-list");
    if (!listContainer) return;

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-12 px-4 bg-white/60 dark:bg-white/5 rounded-3xl border border-[#ebdccb] dark:border-white/10 space-y-3">
                <div class="w-12 h-12 mx-auto rounded-full bg-[#b4532c]/10 text-[#b4532c] flex items-center justify-center text-xl">📄</div>
                <h4 class="text-sm font-bold text-[#1e1b18] dark:text-[#f8fafc]">ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല</h4>
                <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">ആദ്യത്തെ ലേഖനം പ്രസിദ്ധീകരിക്കാൻ 'പുതിയ ലേഖനം' ടാബ് തുറക്കുക.</p>
                <button type="button" onclick="window.switchAdminTab('create')" class="px-4 py-2 bg-[#b4532c] text-white text-xs font-bold rounded-xl shadow-sm hover:bg-[#923e1b] transition">
                    + പുതിയ ലേഖനം എഴുതുക
                </button>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = items.map(data => {
        const titleCol = data.titleColor || "#1e1b18";
        const placementLabel = data.placement === 'HERO' ? '⭐ HERO' : data.placement === 'CAROUSEL' ? '🎠 CAROUSEL' : data.placement === 'FEED' ? '📰 FEED' : '⚡ AUTO';
        const priorityBadge = (data.priority !== undefined && data.priority !== null) ? `P${data.priority}` : '';
        const playlistBadge = data.playlistName ? `📚 ${data.playlistName}` : '';
        const isBook = data.type === 'BOOK';

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
                        ${isBook ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-english">📘 BOOK COVER</span>` : ''}
                        ${data.bookName ? `<span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-english">📖 ${data.bookName}</span>` : ''}
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

                ${playlistBadge ? `
                    <div class="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 px-2.5 py-1 rounded-lg">
                        <span>${playlistBadge}</span>
                    </div>
                ` : ''}

                <div class="flex items-center justify-between pt-2.5 border-t border-[#ebdccb]/60 dark:border-white/10">
                    <a href="${isBook ? `article.html?edition=${encodeURIComponent(data.bookName || data.title)}` : `article.html?id=${data.id}`}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-bold text-[#b4532c] hover:underline font-english">
                        <span>Live Preview</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.viewArticleComments('${data.id}', '${(data.title || '').replace(/'/g, "\\'")}')" title="ലേഖന അഭിപ്രായങ്ങളും ഇമെയിലുകളും കാണുക" class="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/20 border border-blue-200 px-3 py-1 rounded-xl transition font-english">
                            <span>💬 Comments</span>
                        </button>
                        ${isBook ? `
                            <button type="button" onclick="window.manageBookFromPublished('${(data.bookName || data.title).replace(/'/g, "\\'")}')" title="പുസ്തകം മാനേജ് ചെയ്യുക" class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100/70 hover:bg-amber-200 dark:bg-amber-500/20 border border-amber-300 px-3 py-1 rounded-xl transition font-english">
                                <span>📚 Manage</span>
                            </button>
                        ` : `
                            <button type="button" onclick="window.startEditArticle('${data.id}')" title="ലേഖനം എഡിറ്റ് ചെയ്യുക" class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100/70 hover:bg-amber-200 dark:bg-amber-500/20 border border-amber-300 px-3 py-1 rounded-xl transition font-english">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                <span>Edit</span>
                            </button>
                        `}
                        <button type="button" onclick="window.deleteArticle('${data.id}')" title="ലേഖനം ഒഴിവാക്കുക" class="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 border border-rose-200 px-3 py-1 rounded-xl transition font-english">
                            <span>✕ Delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/* ═══════════════════════════════════════════════════════════
   8. TAB 3 SEARCH & FILTER IN ARTICLES LIST
   ═══════════════════════════════════════════════════════════ */
function initPublishedSearchFilter() {
    const searchInput = document.getElementById("search-published-input");
    const categoryFilter = document.getElementById("filter-published-category");

    function applyFilter() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const cat = categoryFilter ? categoryFilter.value : "ALL";

        const filtered = currentArticlesList.filter(art => {
            if (art.bookName || art.type === "BOOK") return false;
            const matchesQuery = !query || 
                (art.title && art.title.toLowerCase().includes(query)) ||
                (art.author && art.author.toLowerCase().includes(query)) ||
                (art.playlistName && art.playlistName.toLowerCase().includes(query));

            const matchesCategory = cat === "ALL" || (art.category || "").toUpperCase() === cat;

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

    container.innerHTML = items.map(art => {
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
                            <option value="HERO" ${currentPlacement === 'HERO' ? 'selected' : ''}>⭐ Hero Featured</option>
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
            const name = document.getElementById("admin-author-name").value.trim();
            const role = document.getElementById("admin-author-role").value.trim() || "CONTRIBUTOR";
            const photoUrl = document.getElementById("admin-author-photo").value.trim() || authorPhotoBase64;
            const bio = document.getElementById("admin-author-bio").value.trim();
            const editSlug = document.getElementById("author-edit-slug").value.trim();

            if (!name) {
                alert("എഴുത്തുകാരന്റെ പേര് നൽകേണ്ടതുണ്ട്.");
                return;
            }

            const slug = editSlug || slugifyAuthor(name);
            const submitBtn = document.getElementById("admin-author-submit-btn");
            const toast = document.getElementById("admin-author-save-toast");

            submitBtn.disabled = true;
            submitBtn.classList.add("opacity-60");

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
                alert("പ്രൊഫൈൽ സേവ് ചെയ്യുമ്പോൾ തടസ്സം നേരിട്ടു: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove("opacity-60");
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

    // Combine managed authors with any unique authors found in published articles
    const articleAuthorsMap = {};
    currentArticlesList.forEach(art => {
        const aName = (art.author || "").trim();
        if (aName) {
            const s = slugifyAuthor(aName);
            if (!articleAuthorsMap[s]) articleAuthorsMap[s] = { name: aName, count: 0 };
            articleAuthorsMap[s].count++;
        }
    });

    const allKeys = new Set([...managedAuthorsList.map(a => a.id || a.slug), ...Object.keys(articleAuthorsMap)]);
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
        const managed = managedAuthorsList.find(a => (a.id || a.slug) === key);
        const artInfo = articleAuthorsMap[key];
        const name = (managed && managed.name) || (artInfo && artInfo.name) || key;
        const role = (managed && managed.role) || "Contributor";
        const photo = (managed && managed.photoUrl) || "";
        const bio = (managed && managed.bio) || "NUQTHA രചയിതാവ്";
        const articleCount = (artInfo && artInfo.count) || 0;
        const initial = name.trim().charAt(0).toUpperCase() || "A";

        return `
        <div class="p-4 rounded-2xl border border-[#ebdccb] bg-[#fbf7ee]/40 space-y-3 flex flex-col justify-between">
            <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#b4532c] to-[#d97706] text-white flex items-center justify-center font-bold text-base flex-shrink-0 overflow-hidden border border-white">
                    ${photo ? `<img src="${photo}" alt="${name}" class="w-full h-full object-cover" />` : initial}
                </div>
                <div class="min-w-0 flex-1">
                    <h4 class="text-xs sm:text-sm font-bold text-[#1e1b18] truncate font-['Anek_Malayalam']">
                        ${name}
                    </h4>
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
                    <button type="button" onclick="editAuthorProfile('${key}')" class="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold transition text-[10px]">
                        ✏️ Edit
                    </button>
                    <a href="/profile/author/${key}" target="_blank" class="px-2.5 py-1 rounded-lg bg-[#b4532c]/10 hover:bg-[#b4532c]/20 text-[#b4532c] font-bold transition text-[10px]">
                        👁️ View
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

window.editAuthorProfile = function(key) {
    const managed = managedAuthorsList.find(a => (a.id || a.slug) === key);
    let name = key;
    if (managed && managed.name) name = managed.name;
    else {
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
            photoPreview.textContent = name.charAt(0).toUpperCase() || "?";
        }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

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
        alert("അഭിപ്രായം ഒഴിവാക്കി.");
        window.viewArticleComments(articleId, document.getElementById("modal-article-title")?.textContent || "");
    } catch (err) {
        console.error("Delete comment error:", err);
        alert("ഡിലീറ്റ് ചെയ്യുന്നതിൽ പരാജയപ്പെട്ടു: " + err.message);
    }
};
