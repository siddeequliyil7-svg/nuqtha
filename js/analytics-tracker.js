/**
 * NUQTHA User Tracking & Advanced Reading Analytics Module
 * Tracks Google Users, Guest Visitors, and 3-Stage Reading Engagements:
 *   1. Page View (Instant)
 *   2. Engaged Read (5+ Seconds)
 *   3. Full Read (80%+ Scroll Depth)
 */

import { db, doc, collection, addDoc, updateDoc, setDoc, serverTimestamp } from "../firebase-config.js";
import { getCachedAuthUser, initAuthStateListener } from "./auth-system.js";

const GUEST_STORAGE_KEY = "nuqtha_guest_id";

/**
 * Returns a persistent Guest Visitor ID or creates a new one
 */
export function getOrCreateGuestId() {
    try {
        let guestId = localStorage.getItem(GUEST_STORAGE_KEY);
        if (!guestId) {
            const rand = Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
            guestId = "guest_" + rand;
            localStorage.setItem(GUEST_STORAGE_KEY, guestId);
        }
        return guestId;
    } catch (_) {
        return "guest_" + Math.random().toString(36).substring(2, 9);
    }
}

/**
 * Syncs authenticated user profile to `users` collection in Firestore:
 * { uid, displayName, email, photoURL, lastLogin: serverTimestamp() }
 */
export async function syncUserProfileToFirestore(user) {
    if (!user || !user.uid) return null;
    try {
        const userRef = doc(db, "users", user.uid);
        const userPayload = {
            uid: user.uid,
            displayName: user.displayName || user.name || "Google User",
            email: user.email || "",
            photoURL: user.photoURL || user.avatar || "",
            phoneNumber: user.phoneNumber || "",
            providerId: user.providerId || "google.com",
            lastLogin: serverTimestamp(),
            lastActive: serverTimestamp()
        };
        await setDoc(userRef, userPayload, { merge: true });
        return userPayload;
    } catch (err) {
        console.warn("[Analytics] Failed to sync user profile to Firestore:", err);
        return null;
    }
}

// Active session tracking state in current window
let currentSession = {
    historyDocId: null,
    articleId: null,
    engagedTimer: null,
    scrollListener: null,
    hasEngaged: false,
    hasFullRead: false
};

/**
 * 3-Stage Reading Activity Tracker for /story/[slug] & article.html
 */
export async function trackReadingActivity(article) {
    if (!article || (!article.id && !article.slug && !article.title)) return;

    const targetArticleId = String(article.id || article.slug || article.title);

    // If already tracked this exact article session in this window load, do not duplicate
    if (currentSession.articleId === targetArticleId && currentSession.historyDocId) {
        return;
    }

    // Cleanup any previous tracking session if navigating between chapters/articles
    cleanupCurrentSession();

    currentSession.articleId = targetArticleId;

    // 1. Identify User (Google User OR Persistent Guest Visitor)
    const currentUser = getCachedAuthUser() || (typeof window !== "undefined" ? window.currentUser : null);
    const isGuest = !currentUser || !currentUser.uid;
    const guestId = isGuest ? getOrCreateGuestId() : null;

    const userDetails = isGuest ? {
        userType: "guest",
        isGuest: true,
        guestId: guestId,
        displayName: `Guest (${guestId.slice(-6)})`,
        email: "",
        photoURL: ""
    } : {
        userType: "google",
        isGuest: false,
        uid: currentUser.uid,
        displayName: currentUser.displayName || currentUser.name || "Google User",
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || currentUser.avatar || ""
    };

    // If user is logged in, ensure profile is synced to users collection
    if (!isGuest && currentUser) {
        syncUserProfileToFirestore(currentUser).catch(() => {});
    }

    const rawPath = typeof window !== "undefined" ? (window.location.pathname || "") : "";
    const articleTitle = article.title || article.bookName || "Untitled Article";
    const articleCategory = article.category || "General";
    const articleAuthor = article.author || "NUQTHA";
    const articleSlug = article.slug || article.id || "";

    // ── STAGE 1: Instant Page View ──
    try {
        const payload = {
            event: "page_view",
            status: "page_view",
            engagementStatus: "page_view",
            articleId: targetArticleId,
            articleTitle: articleTitle,
            slug: articleSlug,
            category: articleCategory,
            author: articleAuthor,
            path: rawPath,
            ...userDetails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, "reading_history"), payload);
        currentSession.historyDocId = docRef.id;
        if (typeof window !== "undefined") {
            window.__currentTrackedHistoryId = docRef.id;
            window.__currentTrackedArticleId = targetArticleId;
        }
    } catch (err) {
        console.warn("[Analytics] Error logging Stage 1 Page View:", err);
        return;
    }

    const historyDocId = currentSession.historyDocId;

    // ── STAGE 2: Engaged Read (5+ Seconds) ──
    currentSession.engagedTimer = setTimeout(async () => {
        if (!currentSession.historyDocId || currentSession.hasEngaged) return;
        try {
            currentSession.hasEngaged = true;
            const historyRef = doc(db, "reading_history", historyDocId);
            await updateDoc(historyRef, {
                event: "engaged_read",
                status: "engaged_read",
                engagementStatus: "engaged_read",
                durationSeconds: 5,
                engagedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.warn("[Analytics] Error updating Stage 2 Engaged Read:", err);
        }
    }, 5000);

    // ── STAGE 3: Full Read (80%+ Scroll Depth) ──
    function checkScrollDepth() {
        if (!currentSession.historyDocId || currentSession.hasFullRead) return;

        const scrollPercent = calculateScrollPercent();
        if (scrollPercent >= 80) {
            currentSession.hasFullRead = true;
            if (currentSession.scrollListener) {
                window.removeEventListener("scroll", currentSession.scrollListener);
                currentSession.scrollListener = null;
            }

            const historyRef = doc(db, "reading_history", historyDocId);
            updateDoc(historyRef, {
                event: "full_read",
                status: "full_read",
                engagementStatus: "full_read",
                scrollPercent: Math.round(scrollPercent),
                fullReadAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }).catch(err => {
                console.warn("[Analytics] Error updating Stage 3 Full Read:", err);
            });
        }
    }

    currentSession.scrollListener = throttle(checkScrollDepth, 250);
    window.addEventListener("scroll", currentSession.scrollListener, { passive: true });

    // Initial check in case of short content or small screen
    setTimeout(checkScrollDepth, 1200);

    // Auto-update history document if a guest logs in during this reading session
    listenAuthUpgrade(historyDocId);
}

function cleanupCurrentSession() {
    if (currentSession.engagedTimer) {
        clearTimeout(currentSession.engagedTimer);
        currentSession.engagedTimer = null;
    }
    if (currentSession.scrollListener) {
        window.removeEventListener("scroll", currentSession.scrollListener);
        currentSession.scrollListener = null;
    }
    currentSession.historyDocId = null;
    currentSession.articleId = null;
    currentSession.hasEngaged = false;
    currentSession.hasFullRead = false;
}

function calculateScrollPercent() {
    if (typeof window === "undefined" || typeof document === "undefined") return 0;
    const docEl = document.documentElement;
    const body = document.body;

    const contentEl = document.getElementById("article-content") || 
                      document.getElementById("standard-article-view") ||
                      document.getElementById("art-content");

    if (contentEl) {
        const rect = contentEl.getBoundingClientRect();
        const winHeight = window.innerHeight || 800;
        const totalHeight = rect.height;

        // If whole article fits in viewport
        if (totalHeight <= winHeight) return 100;

        const scrolled = Math.max(0, -rect.top + (winHeight * 0.75));
        const progress = Math.min(100, Math.round((scrolled / totalHeight) * 100));
        if (progress >= 80) return progress;
    }

    const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop || 0;
    const scrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight) - (window.innerHeight || 800);
    if (scrollHeight <= 0) return 100;
    return Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
}

function throttle(func, wait) {
    let timeout = null;
    let previous = 0;
    return function (...args) {
        const now = Date.now();
        const remaining = wait - (now - previous);
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func.apply(this, args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = Date.now();
                timeout = null;
                func.apply(this, args);
            }, remaining);
        }
    };
}

let isAuthUpgradeListening = false;
function listenAuthUpgrade(historyDocId) {
    if (isAuthUpgradeListening) return;
    isAuthUpgradeListening = true;

    initAuthStateListener((user) => {
        if (user && user.uid && currentSession.historyDocId) {
            syncUserProfileToFirestore(user).catch(() => {});
            try {
                const historyRef = doc(db, "reading_history", currentSession.historyDocId);
                updateDoc(historyRef, {
                    userType: "google",
                    isGuest: false,
                    uid: user.uid,
                    displayName: user.displayName || user.name || "Google User",
                    email: user.email || "",
                    photoURL: user.photoURL || user.avatar || "",
                    updatedAt: serverTimestamp()
                }).catch(() => {});
            } catch (_) {}
        }
    });
}

// Auto-sync logged-in profile whenever auth listener fires
if (typeof window !== "undefined") {
    window.trackReadingActivity = trackReadingActivity;
    window.syncUserProfileToFirestore = syncUserProfileToFirestore;
    window.getOrCreateGuestId = getOrCreateGuestId;
}

