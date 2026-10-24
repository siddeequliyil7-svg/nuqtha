/**
 * NUQTHA — Admin Dashboard Logic (admin.js)
 * 3-Folder Tab Architecture, Special Playlist Series Curation & Firestore Realtime Sync
 */
import { db, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, onSnapshot } from "./firebase-config.js";

let editingArticleId = null; // null = create mode, string = edit mode
let currentArticlesList = [];
let activeTab = "create";
let selectedBase64Image = "";
let pendingInlineBase64 = "";

document.addEventListener("DOMContentLoaded", () => {
    initTabNavigation();
    initArticleForm();
    initFormattingToolbar();
    initColorCustomizer();
    initImageUpload();
    initPlaylistPresets();
    initLayoutManagerControls();
    initPublishedSearchFilter();
    listenToFirestoreArticles();
});

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

    // Check URL hash on load (e.g. #tab=published, #tab=layout, #tab=playlist)
    const hash = window.location.hash.replace("#tab=", "").trim();
    if (["create", "playlist", "layout", "published"].includes(hash)) {
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

    // If switching to playlist tab, refresh the active playlist overview
    if (tabName === "playlist") {
        updateActivePlaylistOverview(currentArticlesList);
    }

    // If switching to layout tab, refresh layout manager cards
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

    // Tab 1 Fields
    const title = document.getElementById("art-title")?.value.trim() || "";
    const category = document.getElementById("art-category")?.value || "HISTORY";
    const author = document.getElementById("art-author")?.value.trim() || "";
    const excerpt = document.getElementById("art-excerpt")?.value.trim() || "";
    const content = document.getElementById("art-content")?.value.trim() || "";
    const titleColor = document.getElementById("art-title-color")?.value || "#1e1b18";
    const contentColor = document.getElementById("art-content-color")?.value || "#2b2118";

    // Tab 2 Fields
    const placement = document.getElementById("art-placement")?.value || "AUTO";
    const priorityVal = parseInt(document.getElementById("art-priority")?.value, 10);
    const priority = isNaN(priorityVal) ? 10 : priorityVal;
    const playlistName = document.getElementById("art-playlist-name")?.value.trim() || "";

    if (!title || !content) {
        showGlobalStatus("ലേഖനത്തിന്റെ തലക്കെട്ടും ഉള്ളടക്കവും നിർബന്ധമാണ്!", "error");
        setSubmitButtonsLoading(false);
        switchAdminTab("create");
        document.getElementById("art-title")?.focus();
        return;
    }

    if (editingArticleId) {
        // UPDATE EXISTING ARTICLE
        try {
            const articleRef = doc(db, "articles", editingArticleId);
            const updateData = {
                title,
                category,
                author: author || "NUQTHA",
                excerpt: excerpt || content.substring(0, 160) + "…",
                content,
                titleColor,
                contentColor,
                placement,
                priority,
                playlistName,
                updatedAt: serverTimestamp()
            };

            if (selectedBase64Image) {
                updateData.imageUrl = selectedBase64Image;
            }

            await updateDoc(articleRef, updateData);
            showGlobalStatus("ലേഖനം വിജയകരമായി എഡിറ്റ് ചെയ്ത് Firestore-ൽ അപ്‌ഡേറ്റ് ചെയ്തു! ✨", "success");
            exitEditMode();
            switchAdminTab("published");
        } catch (err) {
            console.error("Firestore update error:", err);
            showGlobalStatus("എഡിറ്റ് സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല: " + (err.message || "Firebase Rules പരിശോധിക്കുക"), "error");
        } finally {
            setSubmitButtonsLoading(false);
        }
    } else {
        // CREATE NEW ARTICLE
        try {
            await addDoc(collection(db, "articles"), {
                title,
                category,
                author: author || "NUQTHA",
                imageUrl: selectedBase64Image || "",
                excerpt: excerpt || content.substring(0, 160) + "…",
                content,
                titleColor,
                contentColor,
                placement,
                priority,
                playlistName,
                date: new Date().toLocaleDateString("en-GB"),
                createdAt: serverTimestamp()
            });

            showGlobalStatus("ലേഖനം വിജയകരമായി പ്രസിദ്ധീകരിച്ചു! (Live on NUQTHA) 🎉", "success");
            resetFormFields();
            switchAdminTab("published");
        } catch (err) {
            console.error("Error publishing article to Firestore:", err);
            showGlobalStatus("ലേഖനം പ്രസിദ്ധീകരിക്കാൻ കഴിഞ്ഞില്ല: " + (err.message || err), "error");
        } finally {
            setSubmitButtonsLoading(false);
        }
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
                ? `<span>Save & Update Article</span><svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
                : `<span>Publish Article to Firestore</span><svg class="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
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

    // Reset Colors
    const resetColorsBtn = document.getElementById("reset-colors-btn");
    if (resetColorsBtn) resetColorsBtn.click();

    // Reset Tab 2 fields
    const placementEl = document.getElementById("art-placement");
    const priorityEl = document.getElementById("art-priority");
    const playlistEl = document.getElementById("art-playlist-name");
    if (placementEl) placementEl.value = "AUTO";
    if (priorityEl) priorityEl.value = "10";
    if (playlistEl) playlistEl.value = "";
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
    const excerptInput = document.getElementById("art-excerpt");
    const contentInput = document.getElementById("art-content");

    if (titleInput) titleInput.value = art.title || "";
    if (catInput) catInput.value = (art.category || "HISTORY").toUpperCase();
    if (authorInput) authorInput.value = art.author || "";
    if (excerptInput) excerptInput.value = art.excerpt || "";
    if (contentInput) contentInput.value = art.content || "";

    // Tab 2: Layout & Playlist
    const placementInput = document.getElementById("art-placement");
    const priorityInput = document.getElementById("art-priority");
    const playlistInput = document.getElementById("art-playlist-name");

    if (placementInput) placementInput.value = art.placement || "AUTO";
    if (priorityInput) priorityInput.value = (art.priority !== undefined && art.priority !== null) ? art.priority : 10;
    if (playlistInput) playlistInput.value = art.playlistName || "";

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

            const reader = new FileReader();
            reader.onload = function (event) {
                const img = new Image();
                img.onload = function () {
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

                    pendingInlineBase64 = canvas.toDataURL("image/jpeg", 0.8);
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

        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
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

                selectedBase64Image = canvas.toDataURL("image/jpeg", 0.8);
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
   6. PLAYLIST PRESETS & LIVE SERIES INSPECTOR (TAB 2)
   ═══════════════════════════════════════════════════════════ */
function initPlaylistPresets() {
    const playlistInput = document.getElementById("art-playlist-name");

    // Click on preset chip -> fill input
    document.querySelectorAll(".playlist-preset-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const seriesName = chip.dataset.name || chip.textContent.replace("+", "").trim();
            if (playlistInput) {
                playlistInput.value = seriesName;
                playlistInput.focus();
                showGlobalStatus(`പ്ലേലിസ്റ്റ് '${seriesName}' തിരഞ്ഞെടുത്തു!`, "info");
            }
        });
    });
}

function updateActivePlaylistOverview(articles) {
    const container = document.getElementById("active-playlists-overview");
    if (!container) return;

    // Group articles by playlist
    const playlistMap = {};
    articles.forEach(art => {
        const name = (art.playlistName || "").trim();
        if (name) {
            if (!playlistMap[name]) playlistMap[name] = [];
            playlistMap[name].push(art);
        }
    });

    const seriesNames = Object.keys(playlistMap);

    if (seriesNames.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 px-3 bg-white/60 dark:bg-white/5 rounded-2xl border border-amber-200/50 dark:border-white/10 text-xs text-[#8c7a6b] dark:text-[#94a3b8]">
                നിലവിൽ സജീവമായ പ്ലേലിസ്റ്റുകളൊന്നുമില്ല. മുകളിലെ ഇൻപുട്ടിൽ പേര് നൽകി ആദ്യ പരമ്പര ആരംഭിക്കാം!
            </div>
        `;
        return;
    }

    container.innerHTML = seriesNames.map(name => {
        const count = playlistMap[name].length;
        return `
            <div class="flex items-center justify-between p-3 bg-white/80 dark:bg-white/5 rounded-2xl border border-amber-200/70 dark:border-white/10 hover:border-amber-400 transition cursor-pointer" onclick="window.setPlaylistInput('${name}')">
                <div class="flex items-center gap-2.5">
                    <span class="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center">📚</span>
                    <div>
                        <h5 class="text-xs font-bold text-[#1e1b18] dark:text-[#f8fafc]">${name}</h5>
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8]">${count} ലേഖനങ്ങൾ ഉൾപ്പെടുത്തിയിട്ടുണ്ട്</p>
                    </div>
                </div>
                <button type="button" class="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/20 px-2.5 py-1 rounded-full hover:bg-amber-200 transition">
                    തിരഞ്ഞെടുക്കുക
                </button>
            </div>
        `;
    }).join("");
}

window.setPlaylistInput = function (name) {
    const playlistInput = document.getElementById("art-playlist-name");
    if (playlistInput) {
        playlistInput.value = name;
        playlistInput.focus();
        showGlobalStatus(`പ്ലേലിസ്റ്റ് '${name}' സെലക്ട് ചെയ്തു!`, "info");
    }
};

/* ═══════════════════════════════════════════════════════════
   7. LIVE FIRESTORE SYNC & PUBLISHED ARTICLES LIST (TAB 4)
   ═══════════════════════════════════════════════════════════ */
function listenToFirestoreArticles() {
    const listContainer = document.getElementById("admin-articles-list");

    console.log("[NUQTHA ADMIN] Initializing direct Firestore listener on 'articles' collection...");

    const colRef = collection(db, "articles");

    function processArticlesData(items) {
        // Client-side robust sorting by createdAt/updatedAt/date in descending order
        items.sort((a, b) => {
            const getMillis = (item) => {
                if (item.createdAt?.toMillis) return item.createdAt.toMillis();
                if (item.createdAt?.seconds) return item.createdAt.seconds * 1000;
                if (item.updatedAt?.toMillis) return item.updatedAt.toMillis();
                if (item.updatedAt?.seconds) return item.updatedAt.seconds * 1000;
                if (item.createdAt) {
                    const parsed = new Date(item.createdAt).getTime();
                    if (!isNaN(parsed)) return parsed;
                }
                if (item.date) {
                    const parsed = new Date(item.date).getTime();
                    if (!isNaN(parsed)) return parsed;
                }
                return 0;
            };
            return getMillis(b) - getMillis(a);
        });

        currentArticlesList = items;
        
        // Dynamically update counters immediately
        updateArticleCounters(items.length);
        
        // Render views without delay (hides loading message smoothly)
        renderAdminPublishedList(items);
        updateActivePlaylistOverview(items);
        renderLayoutManagerList(items);
    }

    // 1. Direct onSnapshot (bypasses complex index requirements)
    try {
        onSnapshot(colRef, (snapshot) => {
            console.log(`[NUQTHA ADMIN] Snapshot received: ${snapshot.size} articles found.`);
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processArticlesData(items);
        }, (err) => {
            console.warn("[NUQTHA ADMIN] onSnapshot error:", err);
            // 2. Direct getDocs fallback
            getDocs(colRef).then(snap => {
                const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                processArticlesData(items);
            }).catch(fallbackErr => {
                console.error("[NUQTHA ADMIN] getDocs fallback error:", fallbackErr);
                if (listContainer) {
                    listContainer.innerHTML = '<p class="text-xs text-rose-500 font-semibold p-4 text-center">ലേഖനങ്ങൾ ലോഡ് ചെയ്യാനായില്ല. Firebase Rules പരിശോധിക്കുക.</p>';
                }
            });
        });
    } catch (e) {
        console.error("[NUQTHA ADMIN] Exception starting onSnapshot:", e);
    }

    // 3. Parallel getDocs instant bootstrap for fastest initial load
    getDocs(colRef).then(snap => {
        if (!snap.empty && currentArticlesList.length === 0) {
            console.log(`[NUQTHA ADMIN] Fast getDocs initial load: ${snap.size} articles.`);
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            processArticlesData(items);
        }
    }).catch(err => {
        console.warn("[NUQTHA ADMIN] Fast bootstrap getDocs notice:", err.message);
    });
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
                        <p class="text-[11px] text-[#8c7a6b] dark:text-[#94a3b8] mt-1">${data.author || 'Author'}</p>
                    </div>
                </div>

                ${playlistBadge ? `
                    <div class="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 px-2.5 py-1 rounded-lg">
                        <span>${playlistBadge}</span>
                    </div>
                ` : ''}

                <div class="flex items-center justify-between pt-2.5 border-t border-[#ebdccb]/60 dark:border-white/10">
                    <a href="article.html?id=${data.id}" target="_blank" class="inline-flex items-center gap-1 text-[11px] font-bold text-[#b4532c] hover:underline font-english">
                        <span>Live Preview</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>

                    <div class="flex items-center gap-2">
                        <button type="button" onclick="window.startEditArticle('${data.id}')" title="ലേഖനം എഡിറ്റ് ചെയ്യുക" class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100/70 hover:bg-amber-200 dark:bg-amber-500/20 border border-amber-300 px-3 py-1 rounded-xl transition font-english">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            <span>Edit</span>
                        </button>
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
                        ${currentPlaylist ? `<span class="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">📚 ${currentPlaylist}</span>` : ''}
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
                        <p class="text-[11px] text-[#8c7a6b] mt-0.5">${art.author || 'Author'}</p>
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

    const newPlacement = placementSelect.value;
    const newPriority = parseInt(priorityInput.value, 10) || 10;

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
