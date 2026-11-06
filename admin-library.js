// admin-library.js : self-contained "Library" panel for your admin page.
// Usage: import { initLibraryAdmin } from "./admin-library.js"; initLibraryAdmin(document.getElementById("library-admin"));
import { db, collection, getDocs, addDoc, setDoc, updateDoc, deleteDoc, doc, query, limit } from "./firebase-config.js";

const MAX_BOOKS = 6, MAX_PAPERS = 5;
const $ = (r, s) => r.querySelector(s);

export async function initLibraryAdmin(root) {
  if (!root) return;

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
        </h3>
        <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-english">
          Shelf limit: ${MAX_BOOKS}
        </span>
      </div>

      <form id="bk-form" class="bg-[#faf6f0] dark:bg-white/5 p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 space-y-4">
        <input type="hidden" name="id">

        <!-- Existing Books Quick-Selector -->
        <div class="p-3.5 rounded-2xl bg-[#b4532c]/10 dark:bg-[#b4532c]/20 border border-[#b4532c]/30 space-y-2">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <label for="bk-existing-select" class="text-xs font-bold text-[#b4532c] dark:text-[#f87171] flex items-center gap-1.5">
              <span class="text-base">📖</span>
              <span>നിലവിലുള്ള പുസ്തകങ്ങളിൽ നിന്ന് തിരഞ്ഞെടുക്കുക (Import Existing Book):</span>
            </label>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#b4532c]/15 text-[#b4532c] dark:text-[#f87171] font-bold">
              1-Click Auto-Fill
            </span>
          </div>
          <select id="bk-existing-select" class="w-full px-3 py-2 rounded-xl border border-[#b4532c]/30 bg-white dark:bg-[#12141d] text-xs font-bold text-[var(--text)] dark:text-white outline-none cursor-pointer focus:ring-1 focus:ring-[#b4532c]">
            <option value="">-- ലോഡ് ചെയ്യുന്നു... (Loading existing books...) --</option>
          </select>
          <div class="flex items-center justify-between flex-wrap gap-2 pt-0.5">
            <p class="text-[11px] text-[#8c7a6b] dark:text-slate-400">
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

  const form = $(root, "#bk-form"), bkStatus = $(root, "#bk-status"), tbStatus = $(root, "#tb-status");
  let books = [];

  async function loadBooks() {
    try {
      const snap = await getDocs(collection(db, "books"));
      books = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
          form.contents.value = (b.contents || []).join("\n");
          form.visible.checked = !!b.visible;
          form.scrollIntoView({ behavior: "smooth" });
          bkStatus.textContent = `Editing: ${b.title}`;
        };

        del.onclick = async () => {
          if (confirm(`Delete “${b.title}”?`)) {
            try {
              await deleteDoc(doc(db, "books", b.id));
              loadBooks();
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
      const ul = $(root, "#bk-list");
      ul.innerHTML = '<li class="p-4 text-center text-red-600">Error loading books. Check Firestore rules.</li>';
    }
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
      loadBooks();
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

  function populateExistingBooks(snap) {
    const sel = $(root, "#bk-existing-select");
    const quickAddBtn = $(root, "#bk-quick-add-btn");
    if (!sel || !snap) return;

    try {
      const allArts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      existingBooks = [];

      allArts.forEach(a => {
        const isBook = a.isBook === true || (a.type || "").toUpperCase() === "BOOK" || (a.category || "").toLowerCase() === "premium book" || (a.category || "").toLowerCase() === "book";
        const isChapter = a.isChapter === true || (a.type || "").toUpperCase() === "CHAPTER" || a.chapterIndex !== undefined;
        if (isBook && !isChapter) {
          // Find chapters for this book
          const chapters = allArts.filter(c => {
            if (c.id === a.id) return false;
            if (c.bookId && String(c.bookId).trim() === String(a.id)) return true;
            if (c.bookName && c.title && c.bookName.trim().toLowerCase() === (a.title || a.bookName || "").trim().toLowerCase()) return true;
            return false;
          }).sort((x, y) => (Number(x.order ?? x.chapterIndex ?? 0)) - (Number(y.order ?? y.chapterIndex ?? 0)));

          existingBooks.push({
            id: a.id,
            title: a.title || a.bookName || "Untitled Book",
            author: a.author || "Nuqtha Press",
            description: a.introduction || a.excerpt || a.description || (a.content ? a.content.replace(/<[^>]*>/g, " ").slice(0, 250) : ""),
            pages: a.pages || (chapters.length > 0 ? chapters.length * 15 : 120),
            chapters: chapters.map((ch, idx) => ch.title || `Chapter ${idx + 1}`)
          });
        }
      });

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

      sel.onchange = () => {
        const idx = sel.value;
        if (idx === "" || !existingBooks[idx]) {
          if (quickAddBtn) quickAddBtn.classList.add("hidden");
          return;
        }
        const b = existingBooks[idx];
        form.id.value = "";
        form.title.value = b.title;
        form.author.value = b.author;
        form.pages.value = b.pages;
        form.description.value = b.description;
        form.contents.value = b.chapters.join("\n");
        form.visible.checked = true;
        bkStatus.textContent = `✓ "${b.title}" വിവരങ്ങൾ ഫോമിൽ നിറച്ചു! താഴെ "Save book" അമർത്തിയാൽ ഇത് 3D ഷെൽഫിൽ എത്തും.`;
        if (quickAddBtn) {
          quickAddBtn.classList.remove("hidden");
          quickAddBtn.onclick = () => quickAddBook(b);
        }
      };
    } catch (err) {
      console.warn("[Admin Library] Error populating existing books:", err);
    }
  }

  async function quickAddBook(b) {
    const currentOnShelf = books.filter(x => x.visible).length;
    if (currentOnShelf >= MAX_BOOKS) {
      bkStatus.textContent = `ഷെൽഫിൽ പരമാവധി ${MAX_BOOKS} പുസ്തകങ്ങൾ മാത്രമേ വെക്കാൻ കഴിയൂ. ദയവായി മറ്റൊന്ന് അൺചെക്ക് ചെയ്യുക.`;
      return;
    }
    const data = {
      title: b.title.trim(),
      author: b.author.trim() || "Nuqtha Press",
      pages: Number(b.pages) || 120,
      color: "#7b2d26",
      order: books.length + 1,
      description: b.description.trim(),
      contents: b.chapters,
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
      loadBooks();
    } catch (err) {
      console.error(err);
      bkStatus.textContent = "സേവ് ചെയ്യാൻ സാധിച്ചില്ല. അഡ്മിൻ ലോഗിൻ പരിശോധിക്കുക.";
    }
  }

  async function loadPapers() {
    try {
      const snap = await getDocs(query(collection(db, "articles"), limit(200)));
      populateExistingBooks(snap);
      const ul = $(root, "#tb-list");
      ul.innerHTML = "";
      if (!snap.docs.length) {
        ul.innerHTML = '<li class="p-4 text-center text-[#8c7a6b]">No articles found.</li>';
        return;
      }
      snap.docs.forEach((d) => {
        const a = d.data(), li = document.createElement("li"), cb = document.createElement("input");
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
            await updateDoc(doc(db, "articles", d.id), { showOnTable: cb.checked });
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
        titleSpan.textContent = a.title || d.id;
        label.append(cb, titleSpan);

        li.appendChild(label);
        ul.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      const ul = $(root, "#tb-list");
      ul.innerHTML = '<li class="p-4 text-center text-red-600">Error loading articles. Check Firestore rules.</li>';
    }
  }

  await Promise.all([loadBooks(), loadPapers()]);
}

