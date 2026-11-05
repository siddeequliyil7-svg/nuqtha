/**
 * NUQTHA — Premium Book Paywall & Razorpay UPI Payment Service
 * 
 * Features:
 * 1. Seamless iOS Safari Razorpay integration (preloaded embedded modal, no popup blockers or redirect delays)
 * 2. World-class Android APK Guided 3-Step Setup UI/UX
 * 3. Server-side payment verification integration (/api/verify-payment & /api/razorpay-webhook)
 * 4. Purchase verification & synchronization with Firestore `purchases` collection
 * 5. Dynamic book preview (introduction open, chapters locked until purchased)
 */

import { getCachedAuthUser, checkIsAdminUser, signInWithGoogle } from "./auth-system.js";
import { openAuthModal } from "./auth-ui.js";

// Default APK download URL if not specifically configured on the book doc
export const DEFAULT_APK_URL = "https://nuqtha.vercel.app/download/nuqtha.apk";

/**
 * Check if the active user has admin privileges
 */
export function isUserAdmin(user = null) {
    const u = user || getCachedAuthUser();
    if (!u) return false;
    if (checkIsAdminUser(u)) return true;
    const email = (u.email || "").toLowerCase().trim();
    return email === "sayyidsalman314@gmail.com";
}

/**
 * Detect client platform via navigator.userAgent
 * Returns "android" | "ios" | "web"
 */
export function getDevicePlatform() {
    if (typeof window === "undefined" || !navigator) return "web";
    const ua = (navigator.userAgent || navigator.vendor || window.opera || "").toLowerCase();
    if (/android/i.test(ua)) return "android";
    if (/ipad|iphone|ipod/i.test(ua) && !window.MSStream) return "ios";
    return "web";
}

/**
 * Check if user has confirmed app install for free book reading
 */
export function isAppInstalledConfirmed() {
    try {
        return localStorage.getItem("nuqtha_app_installed") === "true";
    } catch (_) {
        return false;
    }
}

/**
 * Marks app installation as confirmed
 */
export function markAppInstalledConfirmed() {
    try {
        localStorage.setItem("nuqtha_app_installed", "true");
    } catch (_) {}
}

/**
 * Checks if a book is purchased by the current user
 * 1. Admin Paywall Bypass (sayyidsalman314@gmail.com / Admin role): Immediate Free Access
 * 2. Fast in-memory / localStorage check (0ms)
 * 3. Firestore `purchases` query for logged-in user
 */
export async function isBookPurchased(bookId, user = null) {
    if (!bookId) return false;
    const bId = String(bookId).trim();

    // 1. Admin Paywall Bypass: Free access to all books & chapters
    const activeUser = user || getCachedAuthUser();
    if (isUserAdmin(activeUser)) {
        console.log(`[Paywall] Admin bypass granted for ${activeUser?.email || activeUser?.uid} on book ${bId}`);
        return true;
    }

    // 2. Fast localStorage check
    try {
        if (localStorage.getItem(`nuqtha_purchased_${bId}`) === "true") {
            return true;
        }
    } catch (_) {}

    // 3. Check logged-in user against Firestore purchases collection
    if (!activeUser || (!activeUser.uid && !activeUser.email)) {
        return false;
    }

    try {
        const { db, collection, query, where, getDocs, limit } = await import("../firebase-config.js");

        // A. Check by UID
        if (activeUser.uid) {
            const qUid = query(
                collection(db, "purchases"),
                where("bookId", "==", bId),
                where("userId", "==", activeUser.uid),
                where("status", "==", "completed"),
                limit(1)
            );
            const snap = await getDocs(qUid);
            if (!snap.empty) {
                try { localStorage.setItem(`nuqtha_purchased_${bId}`, "true"); } catch (_) {}
                return true;
            }
        }

        // B. Check by Email
        if (activeUser.email) {
            const qEmail = query(
                collection(db, "purchases"),
                where("bookId", "==", bId),
                where("userEmail", "==", activeUser.email.toLowerCase()),
                where("status", "==", "completed"),
                limit(1)
            );
            const snap = await getDocs(qEmail);
            if (!snap.empty) {
                try { localStorage.setItem(`nuqtha_purchased_${bId}`, "true"); } catch (_) {}
                return true;
            }
        }
    } catch (err) {
        console.warn("[Paywall] Check purchase failed:", err);
    }

    return false;
}

/**
 * Comprehensive check whether the current user can read the given book's chapters
 */
export async function isUserUnlockedForBook(book) {
    if (!book) return false;
    const activeUser = getCachedAuthUser();
    if (isUserAdmin(activeUser)) return true;

    const isPremium = Boolean(
        book.isPremium === true ||
        book.category === 'Premium Book' ||
        (typeof book.category === 'string' && book.category.toLowerCase().includes('premium'))
    );
    const price = isPremium ? (Number(book.price) || 49) : 0;
    const isFree = !isPremium || price === 0;

    // Must be logged in for both Free and Paid books
    if (!activeUser) return false;

    if (isFree) {
        // Free books require App Installation Confirmation
        return isAppInstalledConfirmed();
    } else {
        // Paid books require purchase verification
        return await isBookPurchased(book.id, activeUser);
    }
}

/**
 * Records a successful purchase in Firestore `purchases`
 */
export async function recordPurchase({ book, user, paymentId, orderId, amount }) {
    if (!book || !book.id) return false;
    const bId = String(book.id).trim();
    const activeUser = user || getCachedAuthUser();
    const platform = getDevicePlatform();

    const record = {
        bookId: bId,
        bookTitle: book.title || "Premium Book",
        userId: activeUser?.uid || localStorage.getItem("nuqtha_guest_id") || "guest_" + Math.random().toString(36).substring(2, 9),
        userEmail: (activeUser?.email || "").toLowerCase(),
        userName: activeUser?.name || "വായനക്കാരൻ",
        amount: Number(amount) || Number(book.price) || 49,
        currency: "INR",
        paymentId: paymentId || "",
        orderId: orderId || "",
        status: "completed",
        platform: platform,
        deviceInfo: navigator.userAgent || "",
        createdAt: new Date().toISOString()
    };

    try {
        const { db, collection, addDoc, serverTimestamp } = await import("../firebase-config.js");
        await addDoc(collection(db, "purchases"), {
            ...record,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        console.log("[Paywall] Purchase saved in Firestore");
    } catch (e) {
        console.warn("[Paywall] Offline / fallback purchase save:", e);
    }

    try {
        localStorage.setItem(`nuqtha_purchased_${bId}`, "true");
    } catch (_) {}

    return true;
}

/**
 * Loads Razorpay Standard Checkout SDK from CDN
 * Pre-warms cache and returns the Razorpay constructor
 */
export function loadRazorpaySDK() {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.Razorpay) {
            return resolve(window.Razorpay);
        }
        if (typeof document === "undefined") {
            return reject(new Error("Document is undefined"));
        }
        const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Razorpay));
            existing.addEventListener('error', () => reject(new Error("Razorpay script load error")));
            if (window.Razorpay) return resolve(window.Razorpay);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve(window.Razorpay);
        script.onerror = () => reject(new Error("Failed to load Razorpay script"));
        document.head.appendChild(script);
    });
}

// Background pre-load Razorpay SDK immediately to eliminate delays and Safari popup blocks
if (typeof window !== "undefined") {
    loadRazorpaySDK().catch(() => {});
}

/**
 * Initiates Razorpay Standard Checkout Modal
 * 
 * iOS Safari Optimization:
 * Executes synchronously in direct user click tick, using embedded iframe modal
 * with redirect: false, preventing Safari popup window blocker from triggering.
 */
export function triggerRazorpayPayment({ book, user, onSuccess, onFailure }) {
    if (!book) return;

    // Admin Paywall Bypass: Immediately grant access without payment
    const activeUser = user || getCachedAuthUser();
    if (activeUser && (checkIsAdminUser(activeUser) || (activeUser.email && activeUser.email.toLowerCase().trim() === "sayyidsalman314@gmail.com"))) {
        console.log(`[Paywall] Admin payment bypass granted for ${activeUser.email || activeUser.uid}`);
        if (typeof onSuccess === "function") onSuccess();
        return;
    }

    const price = Number(book.price) || 49;
    const amountPaise = Math.round(price * 100);
    const guestId = (typeof localStorage !== "undefined" && localStorage.getItem("nuqtha_guest_id")) || "guest_" + Math.random().toString(36).substring(2, 9);
    if (typeof localStorage !== "undefined" && !localStorage.getItem("nuqtha_guest_id")) {
        try { localStorage.setItem("nuqtha_guest_id", guestId); } catch (_) {}
    }

    const cleanTitle = (book.title || "Premium Book").replace(/[*_#~`]/g, "").trim();
    const rzpKey = (typeof window !== "undefined" && window.RAZORPAY_KEY_ID) || "rzp_test_51O7Q2Nuqtha";

    const options = {
        key: rzpKey,
        amount: amountPaise,
        currency: "INR",
        name: "NUQTHA (നൂഖ്ത)",
        description: `Unlock: ${cleanTitle}`,
        image: book.imageUrl || "https://nuqtha.vercel.app/favicon.ico",
        prefill: {
            name: activeUser?.name || "",
            email: activeUser?.email || "",
            contact: activeUser?.phoneNumber || ""
        },
        notes: {
            bookId: String(book.id || ""),
            bookTitle: cleanTitle,
            userId: activeUser?.uid || activeUser?.email || guestId,
            userName: activeUser?.name || "വായനക്കാരൻ"
        },
        theme: {
            color: "#b4532c",
            backdrop_color: "rgba(0, 0, 0, 0.65)"
        },
        modal: {
            backdropclose: false,
            escape: true,
            handleback: true,
            confirm_close: true,
            animation: true,
            ondismiss: function () {
                console.log("[Razorpay] Checkout modal dismissed");
                if (typeof onFailure === "function") onFailure("dismissed");
            }
        },
        // Prevent iOS Safari from opening external popup tabs or redirecting away
        redirect: false,
        handler: async function (response) {
            console.log("[Razorpay] Transaction success:", response);

            // 1. Client Server-Side Payment Verification Call
            try {
                fetch("/api/verify-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        paymentId: response.razorpay_payment_id,
                        orderId: response.razorpay_order_id || "",
                        signature: response.razorpay_signature || "",
                        bookId: book.id,
                        bookTitle: cleanTitle,
                        userId: activeUser?.uid || activeUser?.email || guestId,
                        userEmail: activeUser?.email || response.razorpay_email || "",
                        userName: activeUser?.name || "വായനക്കാരൻ",
                        amount: price
                    })
                }).catch(err => console.warn("[VerifyPayment] Server background verification warning:", err));
            } catch (_) {}

            // 2. Commit purchase locally and to Firestore
            await recordPurchase({
                book,
                user: activeUser,
                paymentId: response.razorpay_payment_id,
                orderId: response.razorpay_order_id,
                amount: price
            });

            // 3. Invoke success callback
            if (typeof onSuccess === "function") {
                onSuccess(response);
            }
        }
    };

    // If Razorpay SDK is already loaded, open directly (maintains iOS Safari gesture token)
    if (typeof window !== "undefined" && window.Razorpay) {
        try {
            const rzp = new window.Razorpay(options);
            rzp.open();
            return;
        } catch (err) {
            console.error("[Paywall] Direct Razorpay open error:", err);
        }
    }

    // Fallback load if not ready yet
    loadRazorpaySDK()
        .then((RazorpayConstructor) => {
            const rzp = new RazorpayConstructor(options);
            rzp.open();
        })
        .catch(err => {
            console.error("[Paywall] Razorpay SDK load failure:", err);
            if (typeof onFailure === "function") onFailure(err);
        });
}

/**
 * Displays the device-specific Paywall & App Installation Modal
 * 
 * Rules:
 * 1. User MUST be logged in for both Free and Paid books. If not logged in, prompt Login first.
 * 2. Admin (sayyidsalman314@gmail.com / admin role) bypasses all locks immediately.
 * 3. Free Books (price === 0 / isFree): Display price as '₹0 (Free)'. Prompt App installation with 3-step guide.
 *    Once APK is downloaded or user continues, free reading is fully unlocked.
 * 4. Paid Books (price > 0): Display actual price '₹[price]'. Provide App installation and Razorpay UPI checkout.
 */
export function showPaywallModal({ book, onUnlocked }) {
    if (!book) return;

    // 1. Admin Paywall Bypass: Immediately unlock without showing modal
    const activeUser = getCachedAuthUser();
    if (isUserAdmin(activeUser)) {
        console.log(`[Paywall] Admin bypass granted for ${activeUser?.email || activeUser?.uid}`);
        if (typeof onUnlocked === "function") onUnlocked();
        return;
    }

    // 2. Mandatory Login Rule: User MUST be logged in first to read any book
    if (!activeUser) {
        showLoginRequiredModal({
            book,
            onLoginSuccess: () => {
                showPaywallModal({ book, onUnlocked });
            }
        });
        return;
    }

    // Remove any existing paywall modal
    const existingModal = document.getElementById("nuqtha-paywall-modal");
    if (existingModal) existingModal.remove();

    const platform = getDevicePlatform();
    const isAndroid = platform === "android";
    const isPremium = Boolean(
        book.isPremium === true ||
        book.category === 'Premium Book' ||
        (typeof book.category === 'string' && book.category.toLowerCase().includes('premium'))
    );
    const rawPrice = Number(book.price);
    const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
    const isFree = !isPremium || price === 0;
    const apkUrl = book.apkUrl || DEFAULT_APK_URL;
    const cleanTitle = (book.title || "പുസ്തകം").replace(/[*_#~`]/g, "");

    const modal = document.createElement("div");
    modal.id = "nuqtha-paywall-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto";

    modal.innerHTML = `
        <div class="relative w-full max-w-md bg-white dark:bg-[#151722] rounded-3xl border border-[#ebdccb] dark:border-white/10 shadow-2xl p-5 sm:p-7 space-y-5 text-center overflow-hidden my-auto">
            <!-- Background Decorative Ambient Glow -->
            <div class="absolute -top-24 -right-24 w-48 h-48 rounded-full ${isFree ? 'bg-emerald-500/15' : 'bg-amber-500/15'} blur-3xl pointer-events-none" aria-hidden="true"></div>
            <div class="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-[#b4532c]/15 blur-3xl pointer-events-none" aria-hidden="true"></div>

            <!-- Close Button -->
            <button id="pw-close-btn" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer z-10" aria-label="Close">
                ✕
            </button>

            <!-- Header Badge & Icon -->
            <div class="space-y-2 pt-1">
                <div class="w-14 h-14 mx-auto rounded-2xl ${isFree ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/25' : 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/25'} text-white flex items-center justify-center text-2xl shadow-lg">
                    ${isFree ? '📲' : (isAndroid ? '📲' : '🔒')}
                </div>
                
                <!-- Dual Pricing Pill -->
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${isFree ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'} text-xs font-black uppercase tracking-wider font-english">
                    <span>${isFree ? '₹0 • FREE (സൗജന്യം)' : `₹${price} • PREMIUM`}</span>
                </div>

                <h3 class="text-lg sm:text-xl font-black text-[var(--text)] dark:text-white leading-tight font-['Anek_Malayalam']">
                    ${cleanTitle}
                </h3>

                <p class="text-xs text-[#8c7a6b] dark:text-slate-400 font-['Noto_Sans_Malayalam'] leading-relaxed">
                    ${isFree 
                        ? 'ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്താൽ ഈ ബുക്കിലെ മുഴുവൻ അധ്യായങ്ങളും സൗജന്യമായി വായിക്കാം.' 
                        : 'മുഴുവൻ അധ്യായങ്ങളും വായിക്കാൻ ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുകയോ ഓൺലൈനായി പെയ്‌മെന്റ് നടത്തുകയോ ചെയ്യുക.'}
                </p>
            </div>

            <!-- 3-Step Guided App Installation Card (For Both Android & Web App Prompts) -->
            <div class="space-y-3 text-left">
                <div class="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
                    <span class="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-400 font-english flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Easy 3-Step App Installation</span>
                    </span>
                    <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 font-english bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">v1.0 APK</span>
                </div>

                <!-- 3 Steps -->
                <div class="space-y-2.5">
                    <!-- Step 1 -->
                    <div class="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 transition hover:border-emerald-500 shadow-2xs">
                        <div class="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] font-black flex-shrink-0 shadow-xs">
                            1
                        </div>
                        <div class="min-w-0 flex-1">
                            <h5 class="text-xs font-black text-emerald-950 dark:text-emerald-100 font-english">Download APK</h5>
                            <p class="text-[11px] text-emerald-800 dark:text-emerald-300 font-english leading-tight mt-0.5">
                                Tap the button below to download the NUQTHA app file.
                            </p>
                        </div>
                        <span class="text-base flex-shrink-0">📥</span>
                    </div>

                    <!-- Step 2 -->
                    <div class="flex items-start gap-3 p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 transition hover:border-amber-500 shadow-2xs">
                        <div class="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-[11px] font-black flex-shrink-0 shadow-xs">
                            2
                        </div>
                        <div class="min-w-0 flex-1">
                            <h5 class="text-xs font-black text-amber-950 dark:text-amber-100 font-english">Allow Install</h5>
                            <p class="text-[11px] text-amber-800 dark:text-amber-300 font-english leading-tight mt-0.5">
                                If prompted, enable "Unknown Sources" in your phone settings.
                            </p>
                            <span class="inline-block mt-1 text-[9px] font-bold text-amber-800 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-900/40 px-2 py-0.5 rounded-md font-english">
                                Settings ➔ Security ➔ Install Unknown Apps
                            </span>
                        </div>
                        <span class="text-base flex-shrink-0">⚙️</span>
                    </div>

                    <!-- Step 3 -->
                    <div class="flex items-start gap-3 p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/40 transition hover:border-indigo-500 shadow-2xs">
                        <div class="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-black flex-shrink-0 shadow-xs">
                            3
                        </div>
                        <div class="min-w-0 flex-1">
                            <h5 class="text-xs font-black text-indigo-950 dark:text-indigo-100 font-english">Install & Open</h5>
                            <p class="text-[11px] text-indigo-800 dark:text-indigo-300 font-english leading-tight mt-0.5">
                                Tap Install and enjoy reading your books!
                            </p>
                        </div>
                        <span class="text-base flex-shrink-0">🚀</span>
                    </div>
                </div>
            </div>

            <!-- Action Buttons Row -->
            <div class="space-y-3 pt-2">
                <!-- Primary CTA: Direct Download APK -->
                <a href="${apkUrl}" download id="pw-apk-download-btn" class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs sm:text-sm font-english transition shadow-lg shadow-emerald-700/25 active:scale-98 flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                    <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
                    <span>Download APK (NUQTHA Mobile App)</span>
                </a>

                ${isFree ? `
                    <!-- Free Book Option: Continue Reading after APK Download / Already Installed -->
                    <button id="pw-continue-free-btn" class="w-full py-3 px-5 rounded-2xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-[var(--text)] dark:text-white font-bold text-xs sm:text-sm font-['Noto_Sans_Malayalam'] transition flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                        <span>തുടർന്നു വായിക്കുക (Continue / App Installed) &rarr;</span>
                    </button>
                ` : `
                    <!-- Paid Book Option: Razorpay Payment CTA -->
                    <div class="relative flex items-center justify-center py-0.5">
                        <div class="border-t border-slate-200 dark:border-white/10 w-full"></div>
                        <span class="bg-white dark:bg-[#151722] px-2.5 text-[9px] uppercase font-black text-slate-400 font-english tracking-widest relative">or pay to read on web</span>
                    </div>

                    <button id="pw-pay-now-btn" class="w-full py-3.5 px-6 rounded-2xl bg-[#b4532c] hover:bg-[#923e1b] text-white font-bold text-xs sm:text-sm font-english transition shadow-lg shadow-[#b4532c]/30 active:scale-98 flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                        <span>⚡ Pay ₹${price} to Unlock Full Book</span>
                    </button>
                    <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                        Instant UPI / GPay / PhonePe / Card payment &bull; Unlocks immediately
                    </p>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button
    const closeBtn = modal.querySelector("#pw-close-btn");
    closeBtn?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });

    // Android APK download button toast helper
    const downloadBtn = modal.querySelector("#pw-apk-download-btn");
    downloadBtn?.addEventListener("click", () => {
        markAppInstalledConfirmed();
        showDownloadStartedToast();
    });

    // Continue Free Button for Free Books
    const continueFreeBtn = modal.querySelector("#pw-continue-free-btn");
    continueFreeBtn?.addEventListener("click", () => {
        markAppInstalledConfirmed();
        modal.remove();
        showUnlockSuccessBanner(cleanTitle);
        if (typeof onUnlocked === "function") {
            onUnlocked();
        }
    });

    // Pay Now button (Web / iOS or Android alternative)
    const payBtn = modal.querySelector("#pw-pay-now-btn");
    payBtn?.addEventListener("click", () => {
        modal.remove();
        triggerRazorpayPayment({
            book,
            onSuccess: (res) => {
                showUnlockSuccessBanner(cleanTitle);
                if (typeof onUnlocked === "function") {
                    onUnlocked(res);
                }
            },
            onFailure: (err) => {
                if (err !== "dismissed") {
                    alert("പെയ്‌മെന്റ് പൂർത്തിയാക്കാൻ സാധിച്ചില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.");
                }
            }
        });
    });
}

/**
 * Displays the sleek "Login Required" modal before opening/reading any book
 */
export function showLoginRequiredModal({ book, onLoginSuccess }) {
    const existing = document.getElementById("nuqtha-login-prompt-modal");
    if (existing) existing.remove();

    const cleanTitle = (book?.title || "പുസ്തകം").replace(/[*_#~`]/g, "");

    const modal = document.createElement("div");
    modal.id = "nuqtha-login-prompt-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in";

    modal.innerHTML = `
        <div class="relative w-full max-w-sm bg-white dark:bg-[#151722] rounded-3xl border border-[#ebdccb] dark:border-white/10 shadow-2xl p-6 sm:p-7 space-y-5 text-center overflow-hidden my-auto">
            <!-- Close Button -->
            <button id="login-prompt-close-btn" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center text-xs font-bold transition cursor-pointer" aria-label="Close">
                ✕
            </button>

            <!-- Brand Icon -->
            <div class="space-y-2 pt-2">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#1d4ed8] to-[#3b82f6] text-white flex items-center justify-center text-2xl shadow-lg shadow-blue-500/25">
                    🔑
                </div>
                <div class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-wider font-english">
                    <span>LOGIN REQUIRED • പ്രവേശനം</span>
                </div>
                <h3 class="text-lg font-black text-[var(--text)] dark:text-white leading-tight font-['Anek_Malayalam']">
                    ${cleanTitle}
                </h3>
                <p class="text-xs text-[#8c7a6b] dark:text-slate-400 font-['Noto_Sans_Malayalam'] leading-relaxed">
                    പുസ്തകങ്ങളും അധ്യായങ്ങളും വായിക്കുന്നതിനായി ദയവായി ആദ്യം അക്കൗണ്ടിലേക്ക് ലോഗിൻ ചെയ്യുക.
                </p>
            </div>

            <!-- Action Buttons -->
            <div class="space-y-2.5 pt-1">
                <!-- 1-Click Google Sign In -->
                <button id="prompt-google-signin-btn" class="w-full py-3.5 px-5 rounded-2xl bg-white dark:bg-[#1c2030] hover:bg-slate-50 dark:hover:bg-[#252b40] text-slate-700 dark:text-white border border-slate-200 dark:border-white/15 font-bold text-xs sm:text-sm font-english transition shadow-xs flex items-center justify-center gap-3 cursor-pointer touch-target-44 active:scale-98">
                    <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    <span>Continue with Google</span>
                </button>

                <!-- Phone OTP Alternative -->
                <button id="prompt-phone-signin-btn" class="w-full py-3 px-4 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-semibold text-xs font-english transition flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                    <span>📱 Sign in with Phone Number (OTP)</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#login-prompt-close-btn");
    closeBtn?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });

    // Google Sign In Click
    const googleBtn = modal.querySelector("#prompt-google-signin-btn");
    googleBtn?.addEventListener("click", async () => {
        try {
            googleBtn.disabled = true;
            googleBtn.innerHTML = `<span>ലോഗിൻ ചെയ്യുന്നു...</span>`;
            await signInWithGoogle();
            modal.remove();
            if (typeof onLoginSuccess === "function") {
                onLoginSuccess();
            }
        } catch (err) {
            console.warn("[Paywall Login] Google error:", err);
            googleBtn.disabled = false;
            googleBtn.innerHTML = `<span>Continue with Google</span>`;
            if (err?.code !== "auth/popup-closed-by-user") {
                alert("Google ലോഗിൻ പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.");
            }
        }
    });

    // Phone OTP Click
    const phoneBtn = modal.querySelector("#prompt-phone-signin-btn");
    phoneBtn?.addEventListener("click", () => {
        modal.remove();
        if (typeof openAuthModal === "function") {
            openAuthModal("phone");
        }
    });
}

/**
 * Toast notification when APK download begins with follow-up instructions
 */
function showDownloadStartedToast() {
    const existing = document.getElementById("nuqtha-download-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "nuqtha-download-toast";
    toast.className = "fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] p-3.5 rounded-2xl bg-emerald-800 text-white shadow-2xl flex items-center gap-3 text-xs animate-bounce font-english";
    toast.innerHTML = `
        <span class="text-xl">📥</span>
        <div class="min-w-0 flex-1">
            <p class="font-bold">Downloading NUQTHA App...</p>
            <p class="text-[10px] text-emerald-200">Once downloaded, open the file and follow Step 2 & 3 to install!</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white text-xs px-1">✕</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

/**
 * Toast / Banner on successful book unlock
 */
function showUnlockSuccessBanner(bookTitle) {
    const banner = document.createElement("div");
    banner.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl bg-emerald-700 text-white font-bold text-xs sm:text-sm font-['Noto_Sans_Malayalam'] shadow-2xl flex items-center gap-2 animate-bounce";
    banner.innerHTML = `
        <span>🎉</span>
        <span>'${bookTitle}' പുസ്തകം വിജയകരമായി അൺലോക്ക് ചെയ്തു! എല്ലാ അധ്യായങ്ങളും ഇപ്പോൾ ലഭ്യമാണ്.</span>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

/**
 * Renders subtle "Install App" banner for Android users on Free Books
 */
export function renderAndroidAppBanner(container, apkUrl = DEFAULT_APK_URL) {
    if (!container || getDevicePlatform() !== "android") return;

    // Check if dismissed previously
    if (sessionStorage.getItem("nuqtha_android_prompt_dismissed") === "true") return;

    const banner = document.createElement("div");
    banner.id = "nuqtha-android-free-banner";
    banner.className = "my-4 p-3.5 sm:p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between gap-3 text-xs";
    banner.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-xl flex-shrink-0">📲</span>
            <div class="min-w-0">
                <p class="font-bold text-emerald-950 dark:text-emerald-200 truncate font-['Noto_Sans_Malayalam']">
                    Android ആപ്പിൽ കൂടുതൽ മികച്ച വായനാനുഭവം നേടാം
                </p>
                <p class="text-[10px] text-emerald-800 dark:text-emerald-400 font-english">
                    Download NUQTHA Mobile App (APK)
                </p>
            </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
            <a href="${apkUrl}" download class="px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs font-english transition shadow-xs">
                Install App
            </a>
            <button onclick="document.getElementById('nuqtha-android-free-banner')?.remove(); sessionStorage.setItem('nuqtha_android_prompt_dismissed', 'true');" class="text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer">
                ✕
            </button>
        </div>
    `;

    container.prepend(banner);
}
