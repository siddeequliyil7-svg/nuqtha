/**
 * NUQTHA Authentication & Role-Based Access Control (RBAC) System
 * Supports Google Sign-In, Email/Password, and Phone Number (OTP)
 * Powered by Firebase Auth v10.8.0
 */

import { app } from "../firebase-config.js";

// Cache for loaded Firebase Auth SDK module
let authModulePromise = null;
let currentRecaptchaVerifier = null;
let currentConfirmationResult = null;

// Approved Admin Identifiers
export const APPROVED_ADMIN_EMAILS = [
    "aboobakersiddeequliyil@gmail.com",
    "admin@nuqtha.com",
    "nuqtha.editor@gmail.com"
];

export const APPROVED_ADMIN_PHONES = [];

export const AUTH_STORAGE_KEY = "nuqtha_auth_user";
export const LEGACY_GOOGLE_KEY = "nuqtha_google_user";
export const ADMIN_SESSION_KEY = "nuqtha_admin_auth";

/**
 * Dynamically loads Firebase Auth SDK from CDN
 */
export function loadFirebaseAuth() {
    if (!authModulePromise) {
        authModulePromise = import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js")
            .then(mod => {
                const auth = mod.getAuth(app);
                return { auth, ...mod };
            })
            .catch(err => {
                console.warn("[Auth] Failed to load firebase-auth.js:", err);
                authModulePromise = null;
                throw err;
            });
    }
    return authModulePromise;
}

/**
 * Maps a Firebase user object into a clean normalized NUQTHA profile
 */
export function mapFirebaseUser(user) {
    if (!user) return null;
    const email = user.email || "";
    const phone = user.phoneNumber || "";
    const name = user.displayName || (phone ? `User (${phone.slice(-4)})` : (email ? email.split("@")[0] : "വായനക്കാരൻ"));
    const isAdmin = checkIsAdminUser({ email, phoneNumber: phone, uid: user.uid });

    return {
        uid: user.uid,
        name: name,
        email: email,
        phoneNumber: phone,
        avatar: user.photoURL || "",
        role: isAdmin ? "admin" : "reader",
        isAdmin: isAdmin,
        providerId: user.providerData && user.providerData[0] ? user.providerData[0].providerId : "firebase"
    };
}

/**
 * Checks if a user has admin privileges
 */
export function checkIsAdminUser(user) {
    if (!user) return false;
    if (user.isAdmin === true || user.role === "admin") return true;

    // Check email against approved list
    const email = (user.email || "").toLowerCase().trim();
    if (email) {
        if (APPROVED_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) return true;
        if (window.APPROVED_ADMIN_EMAILS && Array.isArray(window.APPROVED_ADMIN_EMAILS)) {
            if (window.APPROVED_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) return true;
        }
    }

    // Check phone against approved list
    const phone = (user.phoneNumber || "").replace(/\s+/g, "");
    if (phone) {
        if (APPROVED_ADMIN_PHONES.includes(phone)) return true;
        if (window.APPROVED_ADMIN_PHONES && Array.isArray(window.APPROVED_ADMIN_PHONES)) {
            if (window.APPROVED_ADMIN_PHONES.includes(phone)) return true;
        }
    }

    // Check admin session key
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
        return true;
    }

    return false;
}

/**
 * Safely persists user to localStorage with fallback
 */
export function safeSaveAuthUser(profile) {
    try {
        if (profile) {
            const data = JSON.stringify(profile);
            localStorage.setItem(AUTH_STORAGE_KEY, data);
            localStorage.setItem(LEGACY_GOOGLE_KEY, data);
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            localStorage.removeItem(LEGACY_GOOGLE_KEY);
        }
    } catch (e) {
        try {
            if (profile) {
                const data = JSON.stringify(profile);
                sessionStorage.setItem(AUTH_STORAGE_KEY, data);
                sessionStorage.setItem(LEGACY_GOOGLE_KEY, data);
            } else {
                sessionStorage.removeItem(AUTH_STORAGE_KEY);
                sessionStorage.removeItem(LEGACY_GOOGLE_KEY);
            }
        } catch (_) {}
    }
}

/**
 * Retrieves cached user to prevent UI flicker
 */
export function getCachedAuthUser() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(LEGACY_GOOGLE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && (parsed.uid || parsed.name || parsed.email || parsed.phoneNumber)) {
                // Re-evaluate admin state
                parsed.isAdmin = checkIsAdminUser(parsed);
                parsed.role = parsed.isAdmin ? "admin" : "reader";
                return parsed;
            }
        }
    } catch (_) {}
    return null;
}

/**
 * Sets up the Firebase Auth state change listener
 */
export function initAuthStateListener(onUserChange) {
    // Dispatch cached state immediately to eliminate UI flicker
    const cached = getCachedAuthUser();
    if (onUserChange) onUserChange(cached);

    loadFirebaseAuth().then(({ auth, onAuthStateChanged }) => {
        onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                const profile = mapFirebaseUser(firebaseUser);
                safeSaveAuthUser(profile);
                if (onUserChange) onUserChange(profile);
            } else {
                safeSaveAuthUser(null);
                if (onUserChange) onUserChange(null);
            }
        });
    }).catch(err => {
        console.warn("[Auth] Failed to initialize auth state listener:", err);
    });
}

/**
 * 1-Click Google Sign-In with popup
 */
export async function signInWithGoogle() {
    const { auth, signInWithPopup, GoogleAuthProvider } = await loadFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const res = await signInWithPopup(auth, provider);
    const profile = mapFirebaseUser(res.user);
    safeSaveAuthUser(profile);
    return profile;
}

/**
 * Email & Password Sign-In
 */
export async function signInWithEmailPassword(email, password) {
    const { auth, signInWithEmailAndPassword } = await loadFirebaseAuth();
    const res = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = mapFirebaseUser(res.user);
    safeSaveAuthUser(profile);
    return profile;
}

/**
 * Email & Password Registration
 */
export async function registerWithEmailPassword(email, password, displayName) {
    const { auth, createUserWithEmailAndPassword, updateProfile } = await loadFirebaseAuth();
    const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName && displayName.trim()) {
        try {
            await updateProfile(res.user, { displayName: displayName.trim() });
        } catch (_) {}
    }
    const profile = mapFirebaseUser(res.user);
    if (displayName && displayName.trim()) {
        profile.name = displayName.trim();
    }
    safeSaveAuthUser(profile);
    return profile;
}

/**
 * Phone Number (OTP) - Clean Recaptcha lifecycle management
 */
export function cleanupRecaptcha() {
    if (currentRecaptchaVerifier) {
        try {
            currentRecaptchaVerifier.clear();
        } catch (e) {
            console.warn("[Auth] Recaptcha cleanup error:", e);
        }
        currentRecaptchaVerifier = null;
    }
    const container = document.getElementById("recaptcha-container");
    if (container) {
        container.innerHTML = "";
    }
}

/**
 * Sends OTP to the provided phone number
 */
export async function sendPhoneOtp(phoneNumber, containerId = "recaptcha-container") {
    cleanupRecaptcha();
    const { auth, RecaptchaVerifier, signInWithPhoneNumber } = await loadFirebaseAuth();

    currentRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: "invisible",
        callback: () => {
            // Invisible reCAPTCHA completed
        },
        "expired-callback": () => {
            console.warn("[Auth] reCAPTCHA expired, resetting");
            cleanupRecaptcha();
        }
    });

    await currentRecaptchaVerifier.render();
    currentConfirmationResult = await signInWithPhoneNumber(auth, phoneNumber, currentRecaptchaVerifier);
    return currentConfirmationResult;
}

/**
 * Verifies the 6-digit phone OTP code
 */
export async function verifyPhoneOtp(otpCode) {
    if (!currentConfirmationResult) {
        throw new Error("ആദ്യം ഫോൺ നമ്പറിലേക്ക് OTP അയക്കുക (Please request OTP first)");
    }
    const res = await currentConfirmationResult.confirm(otpCode.trim());
    const profile = mapFirebaseUser(res.user);
    safeSaveAuthUser(profile);
    cleanupRecaptcha();
    return profile;
}

/**
 * Signs out current user and clears session
 */
export async function signOutUser() {
    try {
        const { auth, signOut } = await loadFirebaseAuth();
        await signOut(auth);
    } catch (e) {
        console.warn("[Auth] Sign out error:", e);
    }
    safeSaveAuthUser(null);
    try {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (_) {}
    cleanupRecaptcha();
}
