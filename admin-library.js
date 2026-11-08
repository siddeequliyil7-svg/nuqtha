// admin-library.js : self-contained "Library" panel for your admin page.
// Usage: import { initLibraryAdmin } from "./admin-library.js"; initLibraryAdmin(document.getElementById("library-admin"));
import { db, collection, getDocs, getDocsFromCache, addDoc, setDoc, updateDoc, deleteDoc, doc } from "./firebase-config.js";
import { FALLBACK_ARTICLE_ITEMS, FALLBACK_BOOKS } from "./fallback-data.js";

const MAX_BOOKS = 6, MAX_PAPERS = 5;
const $ = (r, s) => r.querySelector(s);
const normalizedTitle = (value) => String(value || "").normalize("NFC").trim().toLowerCase();

function countWithFallback(records, fallbackRecords) {
  const ids = new Set(records.map((record) => String(record.id || "")));
  const slugs = new Set(records.map((record) => String(record.slug || "")));
  const titles = new Set(records.map((record) => normalizedTitle(record.title)));
  const missing = fallbackRecords.filter((record) =>
    !ids.has(String(record.id || "")) &&
    (!record.slug || !slugs.has(String(record.slug))) &&
    !titles.has(normalizedTitle(record.title))
  );
  return records.length + missing.length;
}

async function getCollectionSnapshot(ref, name) {
  try {
    return await getDocs(ref);
  } catch (error) {
    console.warn(`[Admin Library] ${name} request failed; checking Firestore's local cache.`, error);
    return getDocsFromCache(ref);
  }
}

export async function initLibraryAdmin(root) {
  if (!root) return;

  if (root.dataset.libraryInited === "true") {
    if (typeof root._refreshLibraryData === "function") {
      await root._refreshLibraryData();
    }
    return;
  }
  root.dataset.libraryInited = "true";

  if (!root.querySelector("#bk-form")) {
    root.innerHTML = `
  <div class="space-y-8">
    <!-- Header -->
    <div class="border-b border-[#ebdccb] dark:border-white/10 pb-4">
      <div class="flex items-center gap-2.5">
        <span class="text-2xl">🏛️</span>
        <div>
          <h2 class="text-xl font-black text-[#1e1b18] dark:text-white font-english">Library Shelf & Table Manager</h2>
          <p class="text-xs text-[#8c7a6b] dark:text-slate-400">Manage 3D Books on the shelf and printed papers on the table for the Library view.</p>
        </div>
      </div>
    </div>

    <!-- Section 1: Books on the Shelf -->
    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-[#1e1b18] dark:text-white flex items-center gap-2">
          <span>📚</span>
          <span>Library books (max ${MAX_BOOKS} on the shelf)</span>
          <span id="lib-book-total" class="text-xs font-english text-[#8c7a6b]">0 total</span>
        </h3>
        <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-english">
          Shelf limit: ${MAX_BOOKS}
        </span>
      </div>

      <form id="bk-form" class="bg-[#faf6f0] dark:bg-white/5 p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 space-y-4">
        <input type="hidden" name="id">

        <!-- Existing Items Quick-Selector (Books / Articles) -->
        <div class="p-3.5 rounded-2xl bg-[#b4532c]/10 dark:bg-[#b4532c]/20 border border-[#b4532c]/30 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <label for="bk-existing-select" class="text-xs font-bold text-[#b4532c] dark:text-[#f87171] flex items-center gap-1.5">
              <span class="text-base" id="bk-import-icon">📖</span>
              <span id="bk-import-label">നിലവിലുള്ള പുസ്തകങ്ങളിൽ നിന്ന് തിരഞ്ഞെടുക്കുക (Import Existing Book):</span>
            </label>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#b4532c]/15 text-[#b4532c] dark:text-[#f87171] font-bold">
              1-Click Auto-Fill
            </span>
          </div>

          <!-- Toggle / Radio Option: Import Book vs Import Article -->
          <div class="flex items-center gap-4 pt-0.5 pb-0.5 flex-wrap">
            <span class="text-xs font-semibold text-[#8c7a6b] dark:text-slate-400">Import Mode:</span>
            <label class="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a4b41] dark:text-slate-300 cursor-pointer select-none">
              <input type="radio" name="bk-import-type" value="book" checked class="text-[#b4532c] focus:ring-0 cursor-pointer">
              <span>📚 Import Book (പുസ്തകം)</span>
            </label>
            <label class="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a4b41] dark:text-slate-300 cursor-pointer select-none">
              <input type="radio" name="bk-import-type" value="article" class="text-[#b4532c] focus:ring-0 cursor-pointer">
              <span>📝 Import Article (ലേഖനം)</span>
            </label>
          </div>

          <select id="bk-existing-select" class="w-full px-3 py-2 rounded-xl border border-[#b4532c]/30 bg-white dark:bg-[#12141d] text-xs font-bold text-[var(--text)] dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-[#b4532c]">
            <option value="">-- ലോഡ് ചെയ്യുന്നു... (Loading existing items...) --</option>
          </select>
          <div class="flex items-center justify-between flex-wrap gap-2 pt-0.5">
            <p id="bk-import-hint" class="text-[11px] text-[#8c7a6b] dark:text-slate-400">
              നേരത്തെ ചേർത്ത പുസ്തകങ്ങൾ (ഉദാ: ഇമാമുമാരുടെ ജീവിതം) തിരഞ്ഞെടുത്താൽ വിവരങ്ങളും അധ്യായങ്ങളും സ്വയം ഫോമിൽ നിറയും.
            </p>
            <button type="button" id="bk-quick-add-btn" class="hidden px-3.5 py-1 bg-[#b4532c] hover:bg-[#923e1b] text-white text-xs font-bold rounded-lg shadow transition cursor-pointer">
              + ഷെൽഫിലേക്ക് ഉടൻ ചേർക്കുക (Add to Shelf)
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
            <span>Title (തലക്കെട്ട്) *</span>
            <input name="title" required maxlength="40" placeholder="e.g. നുഖ്ത പതിപ്പ്" class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white">
          </label>

          <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
            <span>Author (രചയിതാവ്)</span>
            <input name="author" value="Nuqtha Press" maxlength="40" placeholder="Author name" class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white">
          </label>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
            <span>Pages (പേജുകൾ)</span>
            <input name="pages" type="number" min="1" placeholder="e.g. 180" class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white">
          </label>

          <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
            <span>Spine colour (നിറം)</span>
            <div class="flex items-center gap-2">
              <input name="color" type="color" value="#7b2d26" class="w-10 h-9 p-0.5 rounded-lg border border-[#ebdccb] dark:border-white/10 cursor-pointer bg-white">
              <span class="text-[11px] text-[#8c7a6b] font-mono">Hex Code</span>
            </div>
          </label>

          <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
            <span>Order (1 = first)</span>
            <input name="order" type="number" value="1" class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white">
          </label>
        </div>

        <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
          <span>Description (വിവരണം)</span>
          <textarea name="description" rows="3" maxlength="300" placeholder="A brief intro about this volume..." class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white"></textarea>
        </label>

        <label class="block space-y-1 text-xs font-bold text-[#5a4b41] dark:text-slate-300">
          <span>Inside this book (one title per line)</span>
          <textarea name="contents" rows="3" placeholder="Chapter 1: ആമുഖം&#10;Chapter 2: ചരിത്രം" class="w-full px-3.5 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#12141d] text-xs font-semibold outline-none focus:border-[#b4532c] dark:text-white"></textarea>
        </label>

        <div class="flex items-center justify-between pt-1 flex-wrap gap-3">
          <label class="inline-flex items-center gap-2 text-xs font-bold text-[#5a4b41] dark:text-slate-300 cursor-pointer select-none">
            <input name="visible" type="checkbox" checked class="w-4 h-4 text-[#b4532c] rounded focus:ring-0 cursor-pointer">
            <span>Show on shelf (ഷെൽഫിൽ കാണിക്കുക)</span>
          </label>

          <div class="flex items-center gap-2">
            <button type="button" id="bk-clear" class="px-4 py-2 rounded-xl border border-[#ebdccb] dark:border-white/10 text-xs font-bold text-[#5a4b41] dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer">
              Clear
            </button>
            <button type="submit" class="px-5 py-2 rounded-xl bg-[#b4532c] hover:bg-[#923e1b] text-white text-xs font-bold shadow transition cursor-pointer">
              Save book
            </button>
          </div>
        </div>

        <p id="bk-status" role="status" class="text-xs font-bold text-[#b4532c] dark:text-amber-400 min-h-[1.2rem]"></p>
      </form>

      <!-- Books list -->
      <div class="bg-white dark:bg-[#12141d] rounded-2xl border border-[#ebdccb] dark:border-white/10 overflow-hidden">
        <div class="px-4 py-3 bg-[#faf6f0] dark:bg-white/5 border-b border-[#ebdccb] dark:border-white/10 text-xs font-bold text-[#5a4b41] dark:text-slate-300 font-english uppercase tracking-wider">
          Current Books in Database
        </div>
        <ul id="bk-list" class="divide-y divide-[#ebdccb]/60 dark:divide-white/10 text-xs"></ul>
      </div>
    </section>

    <!-- Section 2: Papers on the Table -->
    <section class="space-y-4 pt-4 border-t border-[#ebdccb] dark:border-white/10">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-bold text-[#1e1b18] dark:text-white flex items-center gap-2">
          <span>📰</span>
          <span>Papers on the table (max ${MAX_PAPERS})</span>
          <span id="lib-article-total" class="text-xs font-english text-[#8c7a6b]">0 total</span>
        </h3>
        <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-english">
          Table limit: ${MAX_PAPERS}
        </span>
      </div>
      <p class="text-xs text-[#8c7a6b] dark:text-slate-400">Tick the articles that should appear as printed papers on the reading table.</p>
      
      <p id="tb-status" role="status" class="text-xs font-bold text-[#b4532c] dark:text-amber-400 min-h-[1.2rem]"></p>

      <div class="bg-white dark:bg-[#12141d] rounded-2xl border border-[#ebdccb] dark:border-white/10 overflow-hidden max-h-96 overflow-y-auto">
        <ul id="tb-list" class="divide-y divide-[#ebdccb]/60 dark:divide-white/10 text-xs"></ul>
      </div>
    </section>
  </div>`;
  }

  const form = $(root, "#bk-form"), bkStatus = $(root, "#bk-status"), tbStatus = $(root, "#tb-status");
  let books = [];
  let booksLoaded = false;
  let articleRecords = null;
  let articleLoadPromise = null;
  let papersLoaded = false;

  async function loadBooks(force = false) {
    if (booksLoaded && !force) return;
    try {
      const snap = await getCollectionSnapshot(collection(db, "books"), "books");
      books = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      booksLoaded = true;
      const total = $(root, "#lib-book-total");
      if (total) total.textContent = `${countWithFallback(books, FALLBACK_BOOKS)} total`;
      const ul = $(root, "#bk-list");
      ul.innerHTML = "";
      if (!books.length) {
        ul.innerHTML = '<li class="p-4 text-center text-[#8c7a6b]">No books added yet.</li>';
        return;
      }
      books.forEach((b) => {
        const li = document.createElement("li");
        li.className = "p-3.5 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition";
        
        const info = document.createElement("div");
        info.className = "flex items-center gap-3 min-w-0";
        info.innerHTML = `
          <span class="w-4 h-4 rounded-full flex-shrink-0 border border-black/10" style="background:${b.color || '#7b2d26'}"></span>
          <span class="font-bold text-[var(--text)] dark:text-white truncate">
            #${b.order ?? 0} &bull; ${b.title || "Untitled"} ${b.visible ? '<span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">(On Shelf)</span>' : '<span class="text-[10px] text-slate-400 font-semibold">(Hidden)</span>'}
          </span>
        `;

        const actions = document.createElement("div");
        actions.className = "flex items-center gap-1.5 flex-shrink-0";

        const edit = Object.assign(document.createElement("button"), {
          type: "button",
          textContent: "Edit",
          className: "px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition cursor-pointer"
        });

        const del = Object.assign(document.createElement("button"), {
          type: "button",
          textContent: "Delete",
          className: "px-2.5 py-1 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
        });

        edit.onclick = () => {
          form.id.value = b.id;
          form.title.value = b.title || "";
          form.author.value = b.author || "";
          form.pages.value = b.pages || "";
          form.color.value = b.color || "#7b2d26";
          form.order.value = b.order ?? 1;
          form.description.value = b.description || "";
          form.contents.value = (Array.isArray(b.contents) ? b.contents : []).map((item) =>
            typeof item === "string" ? item : item?.title || ""
          ).filter(Boolean).join("\n");
          form.visible.checked = !!b.visible;
          form.scrollIntoView({ behavior: "smooth" });
          bkStatus.textContent = `Editing: ${b.title}`;
        };

        del.onclick = async () => {
          if (confirm(`Delete “${b.title}”?`)) {
            try {
              await deleteDoc(doc(db, "books", b.id));
              loadBooks(true);
            } catch (err) {
              console.error(err);
              bkStatus.textContent = "Could not delete book.";
            }
          }
        };

        actions.append(edit, del);
        li.append(info, actions);
        ul.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      const total = $(root, "#lib-book-total");
      if (total) total.textContent = `${countWithFallback([], FALLBACK_BOOKS)} total (fallback)`;
      const ul = $(root, "#bk-list");
      ul.innerHTML = '<li class="p-4 text-center text-red-600">Error loading books. Check Firestore rules.</li>';
    }
  }

  async function loadArticleRecords() {
    if (articleRecords) return articleRecords;
    if (!articleLoadPromise) {
      articleLoadPromise = getCollectionSnapshot(collection(db, "articles"), "articles")
        .then((snap) => {
          articleRecords = snap.docs.map((articleDoc) => ({ id: articleDoc.id, ...articleDoc.data() }));
          return articleRecords;
        })
        .finally(() => {
          articleLoadPromise = null;
        });
    }
    return articleLoadPromise;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = form.id.value, visible = form.visible.checked;
    const others = books.filter((b) => b.visible && b.id !== id).length;
    if (visible && others >= MAX_BOOKS) {
      bkStatus.textContent = `Shelf is full (${MAX_BOOKS}). Hide another book first.`;
      return;
    }
    const data = {
      title: form.title.value.trim(),
      author: form.author.value.trim() || "Nuqtha Press",
      pages: Number(form.pages.value) || null,
      color: form.color.value || "#7b2d26",
      order: Number(form.order.value) || 0,
      description: form.description.value.trim(),
      contents: form.contents.value.split("\n").map((x) => x.trim()).filter(Boolean),
      visible,
    };
    try {
      bkStatus.textContent = "Saving...";
      if (id) {
        await setDoc(doc(db, "books", id), data, { merge: true });
      } else {
        await addDoc(collection(db, "books"), data);
      }
      bkStatus.textContent = "Saved.";
      form.reset();
      form.id.value = "";
      loadBooks(true);
    } catch (err) {
      console.error(err);
      bkStatus.textContent = "Couldn’t save. Are you signed in as admin?";
    }
  });

  const clearBtn = $(root, "#bk-clear");
  if (clearBtn) {
    clearBtn.onclick = () => {
      form.reset();
      form.id.value = "";
      bkStatus.textContent = "";
    };
  }

  let existingBooks = [];
  let existingArticles = [];

  function getImportMode() {
    const checked = root.querySelector('input[name="bk-import-type"]:checked');
    return checked ? checked.value : "book";
  }

  function parseExistingItems(allDocs) {
    if (!Array.isArray(allDocs)) return;
    const records = allDocs.filter((record) => record && typeof record === "object");

    // 1. Parse Books
    existingBooks = [];
    records.forEach(a => {
      const type = String(a.type || "").toUpperCase();
      const category = String(a.category || "").toLowerCase();
      const isBook = a.isBook === true || type === "BOOK" || category === "premium book" || category === "book";
      const isChapter = a.isChapter === true || type === "CHAPTER" || a.chapterIndex != null;
      if (isBook && !isChapter) {
        const chapters = records.filter(c => {
          if (c.id === a.id) return false;
          if (String(c.bookId || "").trim() === String(a.id || "")) return true;
          if (typeof c.bookName === "string" && typeof c.title === "string" &&
              c.bookName.trim().toLowerCase() === String(a.title || a.bookName || "").trim().toLowerCase()) return true;
          return false;
        }).sort((x, y) => (Number(x.order ?? x.chapterIndex ?? 0) || 0) - (Number(y.order ?? y.chapterIndex ?? 0) || 0));

        existingBooks.push({
          id: a.id,
          title: String(a.title || a.bookName || "Untitled Book"),
          author: a.author || "Nuqtha Press",
          description: a.introduction || a.excerpt || a.description || (typeof a.content === "string" ? a.content.replace(/<[^>]*>/g, " ").slice(0, 250) : ""),
          pages: a.pages || (chapters.length > 0 ? chapters.length * 15 : 120),
          chapters: chapters.map((ch, idx) => String(ch.title || `Chapter ${idx + 1}`)),
          type: "book"
        });
      }
    });

    // 2. Parse Articles
    existingArticles = records.filter(a => {
      const type = String(a.type || "").toUpperCase();
      const category = String(a.category || "").toLowerCase();
      const isBook = a.isBook === true || type === "BOOK" || category === "premium book" || category === "book";
      const isChapter = a.isChapter === true || type === "CHAPTER" || a.chapterIndex != null;
      return !isBook && !isChapter && typeof a.title === "string" && a.title.trim().length > 0;
    }).map(a => {
      const content = typeof a.content === "string" ? a.content : "";
      const cleanContent = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const words = cleanContent ? cleanContent.split(/\s+/).length : 0;
      const estPages = a.pages ? Number(a.pages) : Math.max(8, Math.ceil(words / 250) || 12);

      // Extract h2 or h3 headings if any
      const headings = [];
      const headingRegex = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
      let match;
      while ((match = headingRegex.exec(content)) !== null) {
        const hText = match[1].replace(/<[^>]*>/g, "").trim();
        if (hText && !headings.includes(hText)) headings.push(hText);
      }
      if (headings.length === 0 && a.title) {
        headings.push(`1. ${a.title}`);
      }

      return {
        id: a.id,
        title: a.title || "Untitled Article",
        author: a.author || "Nuqtha Author",
        category: a.category || "General",
        description: a.excerpt || a.description || (cleanContent.slice(0, 250) + (cleanContent.length > 250 ? "..." : "")),
        pages: estPages,
        chapters: headings,
        type: "article"
      };
    });
  }

  async function fetchArticlesDynamically() {
    const sel = $(root, "#bk-existing-select");
    if (sel) {
      sel.innerHTML = `<option value="">-- ലേഖനങ്ങൾ Firestore-ൽ നിന്ന് ലോഡ് ചെയ്യുന്നു... (Fetching articles...) --</option>`;
    }
    try {
      const records = await loadArticleRecords();
      parseExistingItems(records);
      renderImportDropdown();
    } catch (err) {
      console.error("[Admin Library] Error fetching articles collection:", err);
      if (sel) {
        sel.innerHTML = `<option value="">-- ലേഖനങ്ങൾ ലോഡ് ചെയ്യാൻ സാധിച്ചില്ല (Error loading articles) --</option>`;
      }
    }
  }

  function renderImportDropdown() {
    const sel = $(root, "#bk-existing-select");
    const quickAddBtn = $(root, "#bk-quick-add-btn");
    const importIcon = $(root, "#bk-import-icon");
    const importLabel = $(root, "#bk-import-label");
    const importHint = $(root, "#bk-import-hint");
    if (!sel) return;

    if (quickAddBtn) quickAddBtn.classList.add("hidden");

    const mode = getImportMode();
    if (mode === "article") {
      if (importIcon) importIcon.textContent = "📝";
      if (importLabel) importLabel.textContent = "നിലവിലുള്ള ലേഖനങ്ങളിൽ നിന്ന് തിരഞ്ഞെടുക്കുക (Import Existing Article):";
      if (importHint) importHint.textContent = "സൈറ്റിലെ ലേഖനങ്ങൾ തിരഞ്ഞെടുത്താൽ തലക്കെട്ട്, രചയിതാവ്, വിവരണം എന്നിവ സ്വയം ഫോമിൽ നിറയും.";

      if (existingArticles.length === 0) {
        sel.innerHTML = `<option value="">-- ലേഖനങ്ങൾ കണ്ടെത്തിയില്ല (No articles found) --</option>`;
        return;
      }
      sel.innerHTML = `<option value="">-- നിലവിലുള്ള ലേഖനം തിരഞ്ഞെടുക്കുക (${existingArticles.length} എണ്ണം ലഭ്യമാണ്) / Select an Article --</option>`;
      existingArticles.forEach((art, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${art.title} — [${art.author}] (${art.category || "Article"})`;
        sel.appendChild(opt);
      });
    } else {
      if (importIcon) importIcon.textContent = "📖";
      if (importLabel) importLabel.textContent = "നിലവിലുള്ള പുസ്തകങ്ങളിൽ നിന്ന് തിരഞ്ഞെടുക്കുക (Import Existing Book):";
      if (importHint) importHint.textContent = "നേരത്തെ ചേർത്ത പുസ്തകങ്ങൾ (ഉദാ: ഇമാമുമാരുടെ ജീവിതം) തിരഞ്ഞെടുത്താൽ വിവരങ്ങളും അധ്യായങ്ങളും സ്വയം ഫോമിൽ നിറയും.";

      if (existingBooks.length === 0) {
        sel.innerHTML = `<option value="">-- നിലവിൽ മറ്റ് പുസ്തകങ്ങൾ കണ്ടെത്തിയില്ല --</option>`;
        return;
      }
      sel.innerHTML = `<option value="">-- നിലവിലുള്ള പുസ്തകം തിരഞ്ഞെടുക്കുക (${existingBooks.length} എണ്ണം ലഭ്യമാണ്) --</option>`;
      existingBooks.forEach((b, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = `${b.title} (${b.author}) — ${b.chapters.length} അധ്യായങ്ങൾ`;
        sel.appendChild(opt);
      });
    }
  }

  // Handle Dropdown Selection & Auto-Fill Form
  const sel = $(root, "#bk-existing-select");
  if (sel) {
    sel.onchange = () => {
      const idx = sel.value;
      const mode = getImportMode();
      const list = mode === "article" ? existingArticles : existingBooks;
      const quickAddBtn = $(root, "#bk-quick-add-btn");

      if (idx === "" || !list[idx]) {
        if (quickAddBtn) quickAddBtn.classList.add("hidden");
        return;
      }

      const item = list[idx];
      form.id.value = "";
      form.title.value = item.title || "";
      form.author.value = item.author || (mode === "article" ? "Nuqtha Author" : "Nuqtha Press");
      form.pages.value = item.pages || (mode === "article" ? 12 : 120);
      form.description.value = item.description || "";
      form.contents.value = (item.chapters || []).join("\n");
      form.visible.checked = true;

      const typeLabelMalayalam = mode === "article" ? "ലേഖന" : "പുസ്തക";
      bkStatus.textContent = `✓ "${item.title}" ${typeLabelMalayalam} വിവരങ്ങൾ ഫോമിൽ നിറച്ചു! താഴെ "Save book" അമർത്തിയാൽ ഇത് 3D ഷെൽഫിൽ എത്തും.`;

      if (quickAddBtn) {
        quickAddBtn.classList.remove("hidden");
        quickAddBtn.textContent = mode === "article" ? "+ ലേഖനം ഷെൽഫിലേക്ക് ചേർക്കുക (Add Article to Shelf)" : "+ ഷെൽഫിലേക്ക് ഉടൻ ചേർക്കുക (Add to Shelf)";
        quickAddBtn.onclick = () => quickAddBook(item);
      }
    };
  }

  // Handle Radio Toggle Change (Import Book vs Import Article)
  const radioInputs = root.querySelectorAll('input[name="bk-import-type"]');
  radioInputs.forEach(radio => {
    radio.addEventListener("change", () => {
      const mode = getImportMode();
      if (mode === "article" && existingArticles.length === 0) {
        fetchArticlesDynamically();
      } else {
        renderImportDropdown();
      }
    });
  });

  async function quickAddBook(b) {
    const currentOnShelf = books.filter(x => x.visible).length;
    if (currentOnShelf >= MAX_BOOKS) {
      bkStatus.textContent = `ഷെൽഫിൽ പരമാവധി ${MAX_BOOKS} പുസ്തകങ്ങൾ മാത്രമേ വെക്കാൻ കഴിയൂ. ദയവായി മറ്റൊന്ന് അൺചെക്ക് ചെയ്യുക.`;
      return;
    }
    const data = {
      title: String(b?.title || "").trim(),
      author: String(b?.author || "").trim() || "Nuqtha Press",
      pages: Number(b.pages) || 120,
      color: "#7b2d26",
      order: books.length + 1,
      description: String(b?.description || "").trim(),
      contents: Array.isArray(b?.chapters) ? b.chapters.filter(Boolean) : [],
      visible: true
    };
    try {
      bkStatus.textContent = `"${b.title}" ഷെൽഫിലേക്ക് ചേർക്കുന്നു...`;
      await addDoc(collection(db, "books"), data);
      bkStatus.textContent = `✓ "${b.title}" ഷെൽഫിൽ വിജയകരമായി ചേർത്തു!`;
      form.reset();
      form.id.value = "";
      const quickAddBtn = $(root, "#bk-quick-add-btn");
      if (quickAddBtn) quickAddBtn.classList.add("hidden");
      loadBooks(true);
    } catch (err) {
      console.error(err);
      bkStatus.textContent = "സേവ് ചെയ്യാൻ സാധിച്ചില്ല. അഡ്മിൻ ലോഗിൻ പരിശോധിക്കുക.";
    }
  }

  async function loadPapers(force = false) {
    if (papersLoaded && !force) return;
    try {
      const records = await loadArticleRecords();
      parseExistingItems(records);
      renderImportDropdown();
      papersLoaded = true;
      const total = $(root, "#lib-article-total");
      if (total) total.textContent = `${countWithFallback(records, FALLBACK_ARTICLE_ITEMS)} total`;
      const ul = $(root, "#tb-list");
      ul.innerHTML = "";
      if (!records.length) {
        ul.innerHTML = '<li class="p-4 text-center text-[#8c7a6b]">No articles found.</li>';
        return;
      }
      records.forEach((a) => {
        const li = document.createElement("li"), cb = document.createElement("input");
        li.className = "p-3 flex items-center justify-between gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition";
        cb.type = "checkbox";
        cb.className = "w-4 h-4 text-[#b4532c] rounded focus:ring-0 cursor-pointer flex-shrink-0";
        cb.checked = !!a.showOnTable;
        
        cb.onchange = async () => {
          const count = ul.querySelectorAll("input:checked").length;
          if (cb.checked && count > MAX_PAPERS) {
            cb.checked = false;
            tbStatus.textContent = `Table is full (${MAX_PAPERS}). Untick another first.`;
            return;
          }
          try {
            tbStatus.textContent = "Updating table...";
            await updateDoc(doc(db, "articles", a.id), { showOnTable: cb.checked });
            a.showOnTable = cb.checked;
            tbStatus.textContent = "Saved.";
          } catch (err) {
            console.error(err);
            cb.checked = !cb.checked;
            tbStatus.textContent = "Couldn’t save. Are you signed in as admin?";
          }
        };

        const label = document.createElement("label");
        label.className = "flex items-center gap-3 cursor-pointer flex-1 min-w-0 font-medium text-[var(--text)] dark:text-white";
        const titleSpan = document.createElement("span");
        titleSpan.className = "truncate";
        titleSpan.textContent = a.title || a.id;
        label.append(cb, titleSpan);

        li.appendChild(label);
        ul.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      const total = $(root, "#lib-article-total");
      if (total) total.textContent = `${countWithFallback([], FALLBACK_ARTICLE_ITEMS)} total (fallback)`;
      const ul = $(root, "#tb-list");
      ul.innerHTML = '<li class="p-4 text-center text-red-600">Error loading articles. Check Firestore rules.</li>';
    }
  }

  root._refreshLibraryData = () => Promise.all([loadBooks(), loadPapers()]);
  await root._refreshLibraryData();
}
