/**
 * NUQTHA — Premium Book Paywall & Razorpay UPI Payment Service
 * 
 * Features:
 * 1. Device-specific UX (Android APK install prompt vs. iOS/Web direct Razorpay UPI modal)
 * 2. Purchase verification & synchronization with Firestore `purchases` collection
 * 3. Dynamic book preview (introduction open, chapters locked until purchased)
 * 4. Seamless unlock on successful transaction
 */

import { getCachedAuthUser, signInWithGoogle } from "./auth-system.js";

// Default APK download URL if not specifically configured on the book doc
export const DEFAULT_APK_URL = "https://nuqtha.vercel.app/download/nuqtha.apk";

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
 * Checks if a book is purchased by the current user
 * 1. Fast in-memory / localStorage check (0ms)
 * 2. Firestore `purchases` query for logged-in user
 */
export async function isBookPurchased(bookId, user = null) {
    if (!bookId) return false;
    const bId = String(bookId).trim();

    // 1. Fast localStorage check
    try {
        if (localStorage.getItem(`nuqtha_purchased_${bId}`) === "true") {
            return true;
        }
    } catch (_) {}

    // 2. Check logged-in user against Firestore purchases collection
    const activeUser = user || getCachedAuthUser();
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
 */
export function loadRazorpaySDK() {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.Razorpay) {
            return resolve(window.Razorpay);
        }
        const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Razorpay));
            existing.addEventListener('error', () => reject(new Error("Razorpay script load error")));
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

/**
 * Initiates Razorpay Standard Checkout Modal
 */
export async function triggerRazorpayPayment({ book, user, onSuccess, onFailure }) {
    try {
        await loadRazorpaySDK();
        const price = Number(book.price) || 49;
        const amountPaise = Math.round(price * 100);
        let activeUser = user || getCachedAuthUser();

        // If user is not signed in, prompt Google Sign-In so purchase is preserved across devices
        if (!activeUser || !activeUser.email) {
            try {
                activeUser = await signInWithGoogle();
            } catch (authErr) {
                console.log("[Paywall] Google sign in bypassed, continuing as guest:", authErr);
            }
        }

        const rzpKey = (typeof window !== "undefined" && window.RAZORPAY_KEY_ID) || "rzp_test_51O7Q2Nuqtha";

        const options = {
            key: rzpKey,
            amount: amountPaise,
            currency: "INR",
            name: "NUQTHA (നൂഖ്ത)",
            description: `Unlock: ${book.title || "Premium Book"}`,
            image: book.imageUrl || "https://nuqtha.vercel.app/favicon.ico",
            prefill: {
                name: activeUser?.name || "",
                email: activeUser?.email || "",
                contact: activeUser?.phoneNumber || ""
            },
            theme: {
                color: "#b4532c"
            },
            handler: async function (response) {
                console.log("[Razorpay] Transaction success:", response);
                await recordPurchase({
                    book,
                    user: activeUser,
                    paymentId: response.razorpay_payment_id,
                    orderId: response.razorpay_order_id,
                    amount: price
                });

                if (typeof onSuccess === "function") {
                    onSuccess(response);
                }
            },
            modal: {
                ondismiss: function () {
                    console.log("[Razorpay] Modal closed");
                    if (typeof onFailure === "function") onFailure("dismissed");
                }
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
    } catch (err) {
        console.error("[Paywall] Payment trigger failed:", err);
        if (typeof onFailure === "function") onFailure(err);
    }
}

/**
 * Displays the device-specific Paywall Modal
 * 
 * - Android: "Please install our APK file first to continue", Direct Install App button + Razorpay Pay option.
 * - iOS/Web: Sleek Razorpay UPI "Pay to Unlock" modal directly.
 */
export function showPaywallModal({ book, onUnlocked }) {
    if (!book) return;

    // Remove any existing paywall modal
    const existingModal = document.getElementById("nuqtha-paywall-modal");
    if (existingModal) existingModal.remove();

    const platform = getDevicePlatform();
    const isAndroid = platform === "android";
    const price = Number(book.price) || 49;
    const apkUrl = book.apkUrl || DEFAULT_APK_URL;
    const cleanTitle = (book.title || "പ്രീമിയം പുസ്തകം").replace(/[*_#~`]/g, "");

    const modal = document.createElement("div");
    modal.id = "nuqtha-paywall-modal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in";

    modal.innerHTML = `
        <div class="relative w-full max-w-md bg-white dark:bg-[#151722] rounded-3xl border border-[#ebdccb] dark:border-white/10 shadow-2xl p-6 sm:p-8 space-y-6 text-center overflow-hidden">
            <!-- Background Decorative Ambient Glow -->
            <div class="absolute -top-20 -right-20 w-44 h-44 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" aria-hidden="true"></div>
            <div class="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-[#b4532c]/15 blur-3xl pointer-events-none" aria-hidden="true"></div>

            <!-- Close Button -->
            <button id="pw-close-btn" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer">
                ✕
            </button>

            <!-- Header Badge & Icon -->
            <div class="space-y-2">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center text-3xl shadow-lg shadow-amber-500/30">
                    🔒
                </div>
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 text-[10px] font-black uppercase tracking-widest font-english">
                    <span>PREMIUM EDITION</span>
                </div>
                <h3 class="text-xl sm:text-2xl font-black text-[var(--text)] dark:text-white leading-tight font-['Anek_Malayalam']">
                    ${cleanTitle}
                </h3>
            </div>

            <!-- Device Specific Content -->
            ${isAndroid ? `
                <!-- Android Experience -->
                <div class="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 space-y-2 text-left">
                    <div class="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                        <span>📲</span>
                        <span>ആൻഡ്രോയിഡ് ആപ്പ് ഇൻസ്റ്റാളേഷൻ</span>
                    </div>
                    <p class="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-['Noto_Sans_Malayalam'] font-semibold">
                        ഈ പ്രീമിയം പുസ്തകം പൂർണ്ണമായി വായിക്കാൻ ദയവായി ആദ്യം ഞങ്ങളുടെ ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക.
                    </p>
                    <p class="text-[11px] text-amber-800/80 dark:text-amber-300/80 font-english">
                        Please install our APK file first to continue.
                    </p>
                </div>

                <!-- Android Action Buttons -->
                <div class="space-y-3 pt-2">
                    <!-- 1. Direct Install App (APK) -->
                    <a href="${apkUrl}" download class="w-full py-3.5 px-6 rounded-2xl bg-[#00875A] hover:bg-[#007048] text-white font-bold text-xs sm:text-sm font-english transition shadow-md shadow-emerald-700/20 active:scale-98 flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0002s.4482-1.0002.9993-1.0002c.5516 0 .9997.4486.9997 1.0002s-.4481 1.0002-.9997 1.0002m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.411 13.8566 8.1 12 8.1s-3.5902.311-5.1368.8497L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        <span>📲 Install App (ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യുക)</span>
                    </a>

                    <!-- 2. Alternative: Razorpay Payment directly on web -->
                    <button id="pw-pay-now-btn" class="w-full py-3 px-6 rounded-2xl bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/15 text-[var(--text)] dark:text-white border border-[#ebdccb] dark:border-white/10 font-bold text-xs font-english transition flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                        <span>💳 UPI / Razorpay വഴി ഇപ്പോൾ വാങ്ങുക (₹${price})</span>
                    </button>
                </div>
            ` : `
                <!-- iOS / Web Experience: Direct Razorpay UPI Checkout -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-1.5 text-center">
                    <p class="text-xs text-[var(--text)] dark:text-white font-['Noto_Sans_Malayalam']">
                        ഈ പുസ്തകത്തിലെ മുഴുവൻ അധ്യായങ്ങളും വായിക്കാൻ ഇപ്പോൾ അൺലോക്ക് ചെയ്യുക.
                    </p>
                    <div class="flex items-center justify-center gap-1.5 pt-1">
                        <span class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] font-english">One-time payment:</span>
                        <span class="text-2xl font-black text-[#b4532c] dark:text-[#f87171] font-english">₹${price}</span>
                    </div>
                </div>

                <!-- Instant Razorpay Button -->
                <div class="space-y-3 pt-2">
                    <button id="pw-pay-now-btn" class="w-full py-4 px-6 rounded-2xl bg-[#b4532c] hover:bg-[#923e1b] text-white font-bold text-sm font-english transition shadow-lg shadow-[#b4532c]/30 active:scale-98 flex items-center justify-center gap-2 cursor-pointer touch-target-44">
                        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                        <span>⚡ Pay to Unlock with UPI / Card (₹${price})</span>
                    </button>
                    <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                        Secure instant checkout via Razorpay &bull; Supports Google Pay, PhonePe, Paytm, BHIM & Cards
                    </p>
                </div>
            `}
        </div>
    `;

    document.body.appendChild(modal);

    // Event Listeners
    const closeBtn = modal.querySelector("#pw-close-btn");
    closeBtn?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
    });

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
