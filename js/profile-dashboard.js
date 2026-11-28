/**
 * NUQTHA User Profile Dashboard & Drag-and-Drop Avatar Uploading Module
 * Provides comprehensive user profile management, reading preferences,
 * and high-fidelity client-side drag-and-drop avatar cropping and upload.
 */

import {
    getCachedAuthUser,
    updateUserProfile,
    signOutUser,
    initAuthStateListener
} from "./auth-system.js";
import { openAuthModal, updateHeaderUserUI } from "./auth-ui.js";

// Staged avatar state before saving (null = no change, "" = removed, "data:..." = new image)
let stagedAvatarDataUrl = null;
let isSavingProfile = false;

/**
 * Validates and processes an image file with client-side center-square cropping
 * via an HTML5 Canvas, returning an optimized lightweight data URL.
 */
export function processAvatarImageFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            return reject(new Error("ദയവായി ഒരു ചിത്രം തിരഞ്ഞെടുക്കുക (Please choose an image file)."));
        }

        const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
        const isImage = file.type ? file.type.startsWith("image/") : /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);
        if (!isImage) {
            return reject(new Error("സാധുവായ ഇമേജ് ഫയൽ തിരഞ്ഞെടുക്കുക (Supported: JPG, PNG, WebP)."));
        }

        const MAX_BYTES = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_BYTES) {
            return reject(new Error("ഫയൽ വലുപ്പം 5MB-ൽ കൂടാൻ പാടില്ല (File size must be under 5MB)."));
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("ഫയൽ വായിക്കാൻ സാധിച്ചില്ല (Could not read file)."));
        reader.onload = (e) => {
            const rawDataUrl = e.target?.result;
            if (typeof rawDataUrl !== "string") {
                return reject(new Error("ഇമേജ് ഡാറ്റ ലഭ്യമായില്ല."));
            }

            const img = new Image();
            img.onerror = () => reject(new Error("ഇമേജ് ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല (Corrupted image)."));
            img.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    const size = 320; // High-DPI square crop
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext("2d");

                    if (!ctx) {
                        return resolve(rawDataUrl);
                    }

                    // Calculate center square crop
                    const minDim = Math.min(img.width, img.height);
                    const sx = (img.width - minDim) / 2;
                    const sy = (img.height - minDim) / 2;

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

                    // Prefer webp, fallback to jpeg
                    let compressedUrl = canvas.toDataURL("image/webp", 0.88);
                    if (!compressedUrl.startsWith("data:image/webp")) {
                        compressedUrl = canvas.toDataURL("image/jpeg", 0.88);
                    }
                    resolve(compressedUrl);
                } catch (err) {
                    console.warn("[Avatar] Canvas crop error; falling back to raw data URL:", err);
                    resolve(rawDataUrl);
                }
            };
            img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Ensures the Profile Dashboard DOM modal is present in document.body
 */
export function ensureProfileDashboardDOM() {
    if (document.getElementById("nuqtha-profile-modal")) return;

    const modalHTML = `
    <!-- ═══════════ NUQTHA USER PROFILE DASHBOARD MODAL ═══════════ -->
    <div id="nuqtha-profile-modal" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md hidden opacity-0 transition-opacity duration-200" aria-modal="true" role="dialog" aria-labelledby="profile-modal-title">
        
        <div id="nuqtha-profile-modal-card" class="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#fbf7ee] dark:bg-[#12151f] text-[#1e1b18] dark:text-[#f8fafc] rounded-3xl shadow-2xl border border-[#ebdccb] dark:border-white/10 overflow-hidden transform scale-95 transition-transform duration-200">
            
            <!-- Header Bar -->
            <div class="px-6 py-4 border-b border-[#ebdccb] dark:border-white/10 flex items-center justify-between bg-white/50 dark:bg-white/[0.02]">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#b4532c] to-[#d97706] text-white flex items-center justify-center shadow-sm">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                        </svg>
                    </div>
                    <div>
                        <h2 id="profile-modal-title" class="text-base sm:text-lg font-bold text-[#1e1b18] dark:text-white leading-tight">
                            പ്രൊഫൈൽ ഡാഷ്‌ബോർഡ് <span class="text-xs font-semibold text-[#8c7a6b] dark:text-slate-400 font-english">(Profile Dashboard)</span>
                        </h2>
                        <p class="text-[11px] text-[#705e50] dark:text-slate-400 font-['Anek_Malayalam']">
                            വ്യക്തിഗത വിവരങ്ങളും വായനാ ക്രമീകരണങ്ങളും
                        </p>
                    </div>
                </div>

                <!-- Close Button -->
                <button type="button" id="profile-modal-close-btn" class="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer" aria-label="Close Profile">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <!-- Scrollable Content Body -->
            <div class="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">

                <!-- ── SECTION 1: DRAG & DROP AVATAR UPLOADER ── -->
                <div class="bg-white dark:bg-[#1a1e2e] p-4 sm:p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 shadow-xs space-y-4">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-[#b4532c] dark:text-amber-400 font-english flex items-center gap-1.5">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            <span>പ്രൊഫൈൽ ചിത്രം (Profile Avatar)</span>
                        </h3>
                        <span id="profile-avatar-staged-indicator" class="hidden text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            മാറ്റം സേവ് ചെയ്തിട്ടില്ല
                        </span>
                    </div>

                    <div class="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                        
                        <!-- Circular Avatar Preview with Dropzone Target -->
                        <div id="profile-avatar-circle-target" class="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-[#b4532c] to-[#d97706] text-white flex items-center justify-center relative overflow-hidden shadow-md ring-4 ring-[#b4532c]/15 group cursor-pointer shrink-0 transition-transform hover:scale-105" title="ക്ലിക്ക് ചെയ്യുക അല്ലെങ്കിൽ ചിത്രം ഡ്രാഗ് ചെയ്തിടുക">
                            <img id="profile-avatar-preview-img" class="w-full h-full object-cover hidden" alt="User Avatar Preview">
                            <span id="profile-avatar-preview-initial" class="hidden items-center justify-center w-full h-full text-white font-black text-2xl sm:text-3xl font-english"></span>
                            <svg id="profile-avatar-preview-fallback" class="w-10 h-10 sm:w-12 sm:h-12 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                            </svg>
                            
                            <!-- Hover upload overlay -->
                            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold gap-1 pointer-events-none">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                <span>മാറ്റുക</span>
                            </div>
                        </div>

                        <!-- Drag and Drop Box Area -->
                        <div id="profile-avatar-dropzone" class="flex-1 w-full border-2 border-dashed border-[#ebdccb] dark:border-white/15 hover:border-[#b4532c] dark:hover:border-amber-400 rounded-2xl p-4 text-center cursor-pointer transition-all bg-black/[0.015] dark:bg-white/[0.015] flex flex-col items-center justify-center gap-1.5 select-none">
                            <div class="w-8 h-8 rounded-full bg-[#b4532c]/10 dark:bg-amber-400/10 text-[#b4532c] dark:text-amber-400 flex items-center justify-center">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                </svg>
                            </div>
                            
                            <p id="profile-dropzone-label" class="text-xs font-bold text-[#1e1b18] dark:text-white">
                                ചിത്രം ഇവിടെ ഡ്രാഗ് ചെയ്യുക, അല്ലെങ്കിൽ ക്ലിക്ക് ചെയ്യുക
                            </p>
                            <p class="text-[11px] text-[#8c7a6b] dark:text-slate-400">
                                PNG, JPG, WebP • Max 5MB (സ്വയമേവ സ്ക്വയർ ക്രോപ്പ് ചെയ്യും)
                            </p>

                            <!-- Hidden file input for browser file picker -->
                            <input type="file" id="profile-avatar-file-input" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
                        </div>

                    </div>

                    <!-- Action buttons for Avatar -->
                    <div class="flex items-center justify-end gap-2 pt-1 border-t border-black/5 dark:border-white/5">
                        <button type="button" id="profile-avatar-browse-btn" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#1e1b18] dark:text-white transition cursor-pointer flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            <span>ഫയൽ തിരഞ്ഞെടുക്കുക</span>
                        </button>
                        <button type="button" id="profile-avatar-remove-btn" class="px-3 py-1.5 text-xs font-bold rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            <span>ചിത്രം മാറ്റുക / നീക്കം ചെയ്യുക</span>
                        </button>
                    </div>
                </div>

                <!-- ── SECTION 2: PERSONAL INFORMATION ── -->
                <div class="bg-white dark:bg-[#1a1e2e] p-4 sm:p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 shadow-xs space-y-4">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-[#b4532c] dark:text-amber-400 font-english flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"/></svg>
                        <span>അക്കൗണ്ട് വിവരങ്ങൾ (Account Information)</span>
                    </h3>

                    <div class="space-y-3.5">
                        <!-- Display Name -->
                        <div>
                            <label for="profile-name-input" class="block text-xs font-bold text-[#5a4b41] dark:text-slate-300 mb-1">
                                പേര് (Display Name)
                            </label>
                            <input type="text" id="profile-name-input" placeholder="നിങ്ങളുടെ പേര് നൽകുക" class="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-[#fbf7ee]/50 dark:bg-[#12151f] text-xs sm:text-sm font-bold outline-none focus:border-[#b4532c] dark:focus:border-amber-400 transition">
                        </div>

                        <!-- Read-only Identifiers & Badges -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div class="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ebdccb]/60 dark:border-white/5 space-y-1">
                                <span class="text-[10px] font-bold text-[#8c7a6b] dark:text-slate-400 uppercase font-english">ഇമെയിൽ (Email)</span>
                                <p id="profile-email-display" class="text-xs font-bold text-[#1e1b18] dark:text-white truncate font-english">—</p>
                            </div>
                            <div class="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ebdccb]/60 dark:border-white/5 space-y-1">
                                <span class="text-[10px] font-bold text-[#8c7a6b] dark:text-slate-400 uppercase font-english">ഫോൺ നമ്പർ (Phone)</span>
                                <p id="profile-phone-display" class="text-xs font-bold text-[#1e1b18] dark:text-white truncate font-english">—</p>
                            </div>
                        </div>

                        <!-- Role & Provider row -->
                        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] text-[#8c7a6b] dark:text-slate-400">റോൾ:</span>
                                <span id="profile-role-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-english bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    Reader
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[11px] text-[#8c7a6b] dark:text-slate-400">ലോഗിൻ:</span>
                                <span id="profile-provider-badge" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-english bg-black/5 dark:bg-white/10 text-[#5a4b41] dark:text-slate-300">
                                    Google
                                </span>
                            </div>
                        </div>

                        <!-- Bio / Reader Notes -->
                        <div class="pt-1">
                            <label for="profile-bio-input" class="block text-xs font-bold text-[#5a4b41] dark:text-slate-300 mb-1">
                                വായനാ കുറിപ്പുകൾ / Bio <span class="text-[10px] font-normal text-[#8c7a6b]">(ഓപ്ഷണൽ)</span>
                            </label>
                            <textarea id="profile-bio-input" rows="2" placeholder="നിങ്ങളുടെ വായനാ താല്പര്യങ്ങൾ അല്ലെങ്കിൽ ലഘു വിവരണം..." class="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-[#fbf7ee]/50 dark:bg-[#12151f] text-xs font-normal outline-none focus:border-[#b4532c] dark:focus:border-amber-400 transition resize-none"></textarea>
                        </div>
                    </div>
                </div>

                <!-- ── SECTION 3: READING STATS & PREFERENCES ── -->
                <div class="bg-white dark:bg-[#1a1e2e] p-4 sm:p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 shadow-xs space-y-4">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-[#b4532c] dark:text-amber-400 font-english flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        <span>വായന & സെറ്റിംഗ്സുകൾ (Reading & Themes)</span>
                    </h3>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        
                        <!-- Saved Articles Metric -->
                        <div class="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between">
                            <div>
                                <span class="text-[10px] font-bold text-amber-900/70 dark:text-amber-300/70 uppercase font-english">സേവ് ചെയ്തവ (Saved)</span>
                                <p class="text-lg font-black text-amber-900 dark:text-amber-200 font-mono tabular-nums">
                                    <span id="profile-saved-count-val">0</span> <span class="text-xs font-normal">ലേഖനങ്ങൾ</span>
                                </p>
                            </div>
                            <button type="button" id="profile-view-saved-btn" class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer">
                                തുറക്കുക
                            </button>
                        </div>

                        <!-- Reading Theme Quick Picker -->
                        <div class="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ebdccb]/60 dark:border-white/5 space-y-2">
                            <span class="text-[10px] font-bold text-[#8c7a6b] dark:text-slate-400 uppercase font-english">വായനാ തീം (Reading Theme)</span>
                            <div class="grid grid-cols-3 gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-xl text-[11px] font-bold text-center">
                                <button type="button" id="profile-theme-ivory-btn" class="profile-theme-opt py-1.5 rounded-lg transition hover:bg-white dark:hover:bg-white/10" data-theme-val="ivory">
                                    ക്രീം
                                </button>
                                <button type="button" id="profile-theme-white-btn" class="profile-theme-opt py-1.5 rounded-lg transition hover:bg-white dark:hover:bg-white/10" data-theme-val="white">
                                    വെളുപ്പ്
                                </button>
                                <button type="button" id="profile-theme-dark-btn" class="profile-theme-opt py-1.5 rounded-lg transition hover:bg-white dark:hover:bg-white/10" data-theme-val="dark">
                                    കറുപ്പ്
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Status Feedback Notification Box -->
                <div id="profile-status-box" class="hidden p-3.5 rounded-xl text-xs font-bold transition-all"></div>

            </div>

            <!-- Footer Action Controls -->
            <div class="px-6 py-4 border-t border-[#ebdccb] dark:border-white/10 bg-white/50 dark:bg-white/[0.02] flex items-center justify-between gap-3">
                <button type="button" id="profile-signout-btn" class="px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    <span>ലോഗൗട്ട് (Sign Out)</span>
                </button>

                <div class="flex items-center gap-2">
                    <button type="button" id="profile-cancel-btn" class="px-4 py-2.5 rounded-xl text-xs font-bold text-[#705e50] dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer">
                        റദ്ദാക്കുക (Close)
                    </button>
                    <button type="button" id="profile-save-btn" class="px-5 py-2.5 rounded-xl bg-[#b4532c] hover:bg-[#923e1b] dark:bg-amber-600 dark:hover:bg-amber-500 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer">
                        <svg id="profile-save-spinner" class="w-3.5 h-3.5 animate-spin hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span id="profile-save-label">മാറ്റങ്ങൾ സേവ് ചെയ്യുക</span>
                    </button>
                </div>
            </div>

        </div>
    </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    setupProfileDashboardListeners();
}

/**
 * Sets up all event listeners for the Profile Dashboard modal
 */
function setupProfileDashboardListeners() {
    const modal = document.getElementById("nuqtha-profile-modal");
    const closeBtn = document.getElementById("profile-modal-close-btn");
    const cancelBtn = document.getElementById("profile-cancel-btn");
    const dropzone = document.getElementById("profile-avatar-dropzone");
    const circleTarget = document.getElementById("profile-avatar-circle-target");
    const fileInput = document.getElementById("profile-avatar-file-input");
    const browseBtn = document.getElementById("profile-avatar-browse-btn");
    const removeBtn = document.getElementById("profile-avatar-remove-btn");
    const saveBtn = document.getElementById("profile-save-btn");
    const signoutBtn = document.getElementById("profile-signout-btn");
    const viewSavedBtn = document.getElementById("profile-view-saved-btn");

    if (closeBtn) closeBtn.addEventListener("click", closeProfileDashboard);
    if (cancelBtn) cancelBtn.addEventListener("click", closeProfileDashboard);

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeProfileDashboard();
        });
    }

    // Keyboard ESC to close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
            closeProfileDashboard();
        }
    });

    // File picker click triggers
    if (browseBtn && fileInput) {
        browseBtn.addEventListener("click", () => fileInput.click());
    }
    if (dropzone && fileInput) {
        dropzone.addEventListener("click", (e) => {
            if (e.target !== fileInput) fileInput.click();
        });
    }
    if (circleTarget && fileInput) {
        circleTarget.addEventListener("click", () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target?.files?.[0];
            if (file) {
                await handleSelectedAvatarFile(file);
            }
            fileInput.value = "";
        });
    }

    // Drag and drop event handlers on dropzone AND avatar circle
    const dragTargets = [dropzone, circleTarget].filter(Boolean);
    dragTargets.forEach(target => {
        ["dragenter", "dragover"].forEach(evt => {
            target.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                target.classList.add("border-[#b4532c]", "dark:border-amber-400", "bg-[#b4532c]/10", "scale-[1.02]");
                const label = document.getElementById("profile-dropzone-label");
                if (label) label.textContent = "ചിത്രം ഇവിടെ ഇടുക (Drop image to upload)...";
            });
        });

        ["dragleave", "dragend"].forEach(evt => {
            target.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                target.classList.remove("border-[#b4532c]", "dark:border-amber-400", "bg-[#b4532c]/10", "scale-[1.02]");
                const label = document.getElementById("profile-dropzone-label");
                if (label) label.textContent = "ചിത്രം ഇവിടെ ഡ്രാഗ് ചെയ്യുക, അല്ലെങ്കിൽ ക്ലിക്ക് ചെയ്യുക";
            });
        });

        target.addEventListener("drop", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            target.classList.remove("border-[#b4532c]", "dark:border-amber-400", "bg-[#b4532c]/10", "scale-[1.02]");
            const label = document.getElementById("profile-dropzone-label");
            if (label) label.textContent = "ചിത്രം ഇവിടെ ഡ്രാഗ് ചെയ്യുക, അല്ലെങ്കിൽ ക്ലിക്ക് ചെയ്യുക";

            const file = e.dataTransfer?.files?.[0];
            if (file) {
                await handleSelectedAvatarFile(file);
            }
        });
    });

    // Remove avatar handler
    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            stagedAvatarDataUrl = ""; // Staged for removal
            renderAvatarPreview("", document.getElementById("profile-name-input")?.value || "");
            showProfileStatus("ചിത്രം നീക്കം ചെയ്തു. സ്ഥിരീകരിക്കാൻ സേവ് ചെയ്യുക (Avatar removed. Click Save).", "info");
            const stagedInd = document.getElementById("profile-avatar-staged-indicator");
            if (stagedInd) stagedInd.classList.remove("hidden");
        });
    }

    // Save profile handler
    if (saveBtn) {
        saveBtn.addEventListener("click", executeSaveProfile);
    }

    // Sign out handler
    if (signoutBtn) {
        signoutBtn.addEventListener("click", async () => {
            closeProfileDashboard();
            await signOutUser();
        });
    }

    // View saved handler
    if (viewSavedBtn) {
        viewSavedBtn.addEventListener("click", () => {
            closeProfileDashboard();
            if (typeof window.filterBySavedArticles === "function") {
                window.filterBySavedArticles();
            } else {
                window.location.href = "/#saved";
            }
        });
    }

    // Live-update initial avatar preview when typing name if no image avatar is active
    const nameInput = document.getElementById("profile-name-input");
    if (nameInput) {
        nameInput.addEventListener("input", () => {
            const currentUser = getCachedAuthUser();
            const activeAvatar = stagedAvatarDataUrl !== null ? stagedAvatarDataUrl : (currentUser?.avatar || currentUser?.photoURL || "");
            if (!activeAvatar) {
                renderAvatarPreview("", nameInput.value);
            }
        });
    }

    // Theme selector options
    setupThemeSelectorListeners();
}

/**
 * Theme buttons handler inside profile dashboard
 */
function setupThemeSelectorListeners() {
    const themeButtons = document.querySelectorAll(".profile-theme-opt");
    themeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const val = btn.dataset.themeVal;
            if (!val) return;

            const isDark = val === "dark";
            const readingBg = val === "white" ? "white" : "cream";

            try {
                document.documentElement.classList.toggle("dark", isDark);
                document.body.classList.toggle("dark-mode", isDark);
                document.documentElement.style.colorScheme = isDark ? "dark" : "light";

                if (!isDark) {
                    document.documentElement.dataset.reading = readingBg;
                    localStorage.setItem("nuqtha:reading-bg", readingBg);
                }

                localStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");
                localStorage.setItem("theme", isDark ? "dark" : "light");
                localStorage.setItem("nuqtha_reading_bg", val);
            } catch (_) {}

            // Sync header theme icons if present
            const sunIcons = [document.getElementById("sun-icon"), document.getElementById("theme-sun-icon")].filter(Boolean);
            const moonIcons = [document.getElementById("moon-icon"), document.getElementById("theme-moon-icon")].filter(Boolean);
            sunIcons.forEach(el => el.classList.toggle("hidden", !isDark));
            moonIcons.forEach(el => el.classList.toggle("hidden", isDark));

            updateThemeButtonStyles(val);
        });
    });
}

function updateThemeButtonStyles(activeTheme) {
    const themeButtons = document.querySelectorAll(".profile-theme-opt");
    themeButtons.forEach(b => {
        const isMatch = b.dataset.themeVal === activeTheme;
        b.classList.toggle("bg-white", isMatch);
        b.classList.toggle("dark:bg-[#1a1e2e]", isMatch);
        b.classList.toggle("shadow-xs", isMatch);
        b.classList.toggle("text-[#b4532c]", isMatch);
        b.classList.toggle("dark:text-amber-400", isMatch);
    });
}

/**
 * Handles incoming file dropped or selected via file picker
 */
async function handleSelectedAvatarFile(file) {
    clearProfileStatus();
    try {
        const previewEl = document.getElementById("profile-avatar-preview-img");
        if (previewEl) {
            previewEl.style.opacity = "0.5";
        }

        const dataUrl = await processAvatarImageFile(file);
        stagedAvatarDataUrl = dataUrl;

        // Render preview immediately
        renderAvatarPreview(dataUrl, document.getElementById("profile-name-input")?.value || "");

        const stagedInd = document.getElementById("profile-avatar-staged-indicator");
        if (stagedInd) stagedInd.classList.remove("hidden");

        showProfileStatus("പുതിയ ചിത്രം തിരഞ്ഞെടുത്തു! സേവ് ചെയ്യാൻ താഴെയുള്ള ബട്ടൺ ക്ലിക്ക് ചെയ്യുക (Avatar ready. Click Save).", "success");
    } catch (err) {
        console.warn("[Avatar] File processing error:", err);
        showProfileStatus(err.message || "ചിത്രം പ്രോസസ്സ് ചെയ്യാൻ സാധിച്ചില്ല.", "error");
    } finally {
        const previewEl = document.getElementById("profile-avatar-preview-img");
        if (previewEl) previewEl.style.opacity = "1";
    }
}

/**
 * Renders avatar preview inside profile dashboard
 */
function renderAvatarPreview(avatarUrl, name = "") {
    const previewImg = document.getElementById("profile-avatar-preview-img");
    const previewInitial = document.getElementById("profile-avatar-preview-initial");
    const previewFallback = document.getElementById("profile-avatar-preview-fallback");

    if (avatarUrl) {
        if (previewImg) {
            previewImg.src = avatarUrl;
            previewImg.hidden = false;
            previewImg.classList.remove("hidden");
            previewImg.style.display = "block";
        }
        if (previewInitial) {
            previewInitial.classList.add("hidden");
            previewInitial.style.display = "none";
        }
        if (previewFallback) {
            previewFallback.classList.add("hidden");
            previewFallback.style.display = "none";
        }
    } else {
        const initial = name ? name.trim().charAt(0).toUpperCase() : "";
        if (previewImg) {
            previewImg.removeAttribute("src");
            previewImg.hidden = true;
            previewImg.classList.add("hidden");
            previewImg.style.display = "none";
        }
        if (initial && previewInitial) {
            previewInitial.textContent = initial;
            previewInitial.classList.remove("hidden");
            previewInitial.style.display = "flex";
            if (previewFallback) {
                previewFallback.classList.add("hidden");
                previewFallback.style.display = "none";
            }
        } else {
            if (previewInitial) {
                previewInitial.classList.add("hidden");
                previewInitial.style.display = "none";
            }
            if (previewFallback) {
                previewFallback.classList.remove("hidden");
                previewFallback.style.display = "block";
            }
        }
    }
}

/**
 * Saves profile updates to Firebase Auth, Firestore, and local cache
 */
async function executeSaveProfile() {
    if (isSavingProfile) return;
    const user = getCachedAuthUser();
    if (!user) {
        showProfileStatus("പ്രൊഫൈൽ അപ്‌ഡേറ്റ് ചെയ്യാൻ ദയവായി ലോഗിൻ ചെയ്യുക (Please sign in).", "error");
        return;
    }

    const nameInput = document.getElementById("profile-name-input");
    const bioInput = document.getElementById("profile-bio-input");
    const saveBtn = document.getElementById("profile-save-btn");
    const spinner = document.getElementById("profile-save-spinner");
    const label = document.getElementById("profile-save-label");

    const newDisplayName = nameInput ? nameInput.value.trim() : (user.name || "");
    if (!newDisplayName) {
        showProfileStatus("ദയവായി സാധുവായ പേര് നൽകുക (Please enter your name).", "error");
        if (nameInput) nameInput.focus();
        return;
    }

    const newBio = bioInput ? bioInput.value.trim() : "";

    try {
        isSavingProfile = true;
        if (saveBtn) saveBtn.disabled = true;
        if (spinner) spinner.classList.remove("hidden");
        if (label) label.textContent = "സേവ് ചെയ്യുന്നു...";
        clearProfileStatus();

        const updates = {
            displayName: newDisplayName,
            bio: newBio
        };

        if (stagedAvatarDataUrl !== null) {
            updates.photoURL = stagedAvatarDataUrl;
        }

        const updatedProfile = await updateUserProfile(updates);

        // Update header UI immediately
        updateHeaderUserUI(updatedProfile);

        // Reset staged state
        stagedAvatarDataUrl = null;
        const stagedInd = document.getElementById("profile-avatar-staged-indicator");
        if (stagedInd) stagedInd.classList.add("hidden");

        showProfileStatus("പ്രൊഫൈൽ വിജയകരമായി സേവ് ചെയ്തു! (Profile updated successfully!)", "success");

        // Notify app
        try {
            window.dispatchEvent(new CustomEvent("nuqtha_profile_updated", { detail: { user: updatedProfile } }));
        } catch (_) {}

    } catch (err) {
        console.error("[Profile] Save error:", err);
        showProfileStatus("പ്രൊഫൈൽ സേവ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.", "error");
    } finally {
        isSavingProfile = false;
        if (saveBtn) saveBtn.disabled = false;
        if (spinner) spinner.classList.add("hidden");
        if (label) label.textContent = "മാറ്റങ്ങൾ സേവ് ചെയ്യുക";
    }
}

function showProfileStatus(message, type = "info") {
    const box = document.getElementById("profile-status-box");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden", "bg-red-50", "dark:bg-red-950/40", "text-red-700", "dark:text-red-300", "border-red-200", "bg-emerald-50", "dark:bg-emerald-950/40", "text-emerald-800", "dark:text-emerald-300", "border-emerald-200", "bg-blue-50", "text-blue-700");

    if (type === "error") {
        box.classList.add("bg-red-50", "dark:bg-red-950/40", "text-red-700", "dark:text-red-300", "border", "border-red-200", "dark:border-red-900/60");
    } else if (type === "success") {
        box.classList.add("bg-emerald-50", "dark:bg-emerald-950/40", "text-emerald-800", "dark:text-emerald-300", "border", "border-emerald-200", "dark:border-emerald-900/60");
    } else {
        box.classList.add("bg-blue-50", "dark:bg-blue-950/40", "text-blue-700", "dark:text-blue-300", "border", "border-blue-200", "dark:border-blue-900/60");
    }
}

function clearProfileStatus() {
    const box = document.getElementById("profile-status-box");
    if (box) {
        box.textContent = "";
        box.classList.add("hidden");
    }
}

/**
 * Opens the User Profile Dashboard
 */
export function openProfileDashboard() {
    ensureProfileDashboardDOM();

    const user = getCachedAuthUser();
    if (!user || (!user.uid && !user.name && !user.email)) {
        // Not signed in; prompt sign in modal first
        openAuthModal("google");
        return;
    }

    populateProfileData(user);

    const modal = document.getElementById("nuqtha-profile-modal");
    const card = document.getElementById("nuqtha-profile-modal-card");
    if (!modal) return;

    stagedAvatarDataUrl = null;
    clearProfileStatus();
    const stagedInd = document.getElementById("profile-avatar-staged-indicator");
    if (stagedInd) stagedInd.classList.add("hidden");

    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
        modal.classList.remove("opacity-0");
        if (card) {
            card.classList.remove("scale-95");
            card.classList.add("scale-100");
        }
    });
}

/**
 * Populates user data into the modal fields
 */
function populateProfileData(user) {
    const nameInput = document.getElementById("profile-name-input");
    const emailDisplay = document.getElementById("profile-email-display");
    const phoneDisplay = document.getElementById("profile-phone-display");
    const roleBadge = document.getElementById("profile-role-badge");
    const providerBadge = document.getElementById("profile-provider-badge");
    const bioInput = document.getElementById("profile-bio-input");
    const savedCountEl = document.getElementById("profile-saved-count-val");

    if (nameInput) {
        nameInput.value = user.name || user.displayName || "";
    }
    if (emailDisplay) {
        emailDisplay.textContent = user.email || "ഇമെയിൽ ലഭ്യമല്ല";
    }
    if (phoneDisplay) {
        phoneDisplay.textContent = user.phoneNumber || "ഫോൺ ചേർത്തിട്ടില്ല";
    }
    if (roleBadge) {
        if (user.isAdmin || user.role === "admin") {
            roleBadge.textContent = "Admin / അഡ്മിൻ";
            roleBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-english bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700";
        } else {
            roleBadge.textContent = "Reader / വായനക്കാരൻ";
            roleBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-english bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
        }
    }
    if (providerBadge) {
        if (user.providerId === "google.com") {
            providerBadge.textContent = "Google Account";
        } else if (user.phoneNumber) {
            providerBadge.textContent = "Mobile OTP";
        } else {
            providerBadge.textContent = "Email Auth";
        }
    }
    if (bioInput) {
        bioInput.value = user.bio || "";
    }

    // Avatar preview
    renderAvatarPreview(user.avatar || user.photoURL || "", user.name || "");

    // Saved count
    let count = 0;
    try {
        const saved = JSON.parse(localStorage.getItem("nuqtha_saved_books") || "[]");
        count = Array.isArray(saved) ? saved.length : 0;
    } catch (_) {}
    if (savedCountEl) savedCountEl.textContent = count;

    // Theme active style
    let currentTheme = "ivory";
    try {
        if (document.documentElement.classList.contains("dark")) {
            currentTheme = "dark";
        } else {
            const bg = localStorage.getItem("nuqtha_reading_bg");
            currentTheme = bg === "white" ? "white" : "ivory";
        }
    } catch (_) {}
    updateThemeButtonStyles(currentTheme);
}

/**
 * Closes the Profile Dashboard modal
 */
export function closeProfileDashboard() {
    const modal = document.getElementById("nuqtha-profile-modal");
    const card = document.getElementById("nuqtha-profile-modal-card");
    if (!modal) return;

    if (card) {
        card.classList.remove("scale-100");
        card.classList.add("scale-95");
    }
    modal.classList.add("opacity-0");
    setTimeout(() => {
        modal.classList.add("hidden");
        stagedAvatarDataUrl = null;
        clearProfileStatus();
    }, 200);
}

// Expose globally on window for easy interoperability across multi-page scripts
if (typeof window !== "undefined") {
    window.openProfileDashboard = openProfileDashboard;
    window.closeProfileDashboard = closeProfileDashboard;
    window.processAvatarImageFile = processAvatarImageFile;
}
