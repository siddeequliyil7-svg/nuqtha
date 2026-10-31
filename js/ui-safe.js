"use strict";

/**
 * NUQTHA UI-Safe Error Boundary & Module Initializer
 * Prevents single-point-of-failure crashes across scripts.
 */

window.onerror = function (message, source, lineno, colno, error) {
    console.error("[NUQTHA UI-Safe] Unhandled Error:", {
        message,
        source,
        lineno,
        colno,
        error: error ? error.stack || error.message : null
    });
    return false;
};

window.addEventListener("unhandledrejection", function (event) {
    console.error("[NUQTHA UI-Safe] Unhandled Promise Rejection:", {
        reason: event.reason ? (event.reason.stack || event.reason.message || event.reason) : "Unknown rejection"
    });
});

export function safeInit(name, fn) {
    try {
        if (typeof fn === "function") {
            return fn();
        }
    } catch (err) {
        console.error(`[NUQTHA UI-Safe] ${name} failed:`, err ? (err.message || err) : "Unknown error");
    }
}

/**
 * Detects if an error is a Storage QuotaExceededError across browsers & engines:
 * - Chrome/Edge: QuotaExceededError (code 22)
 * - Firefox: NS_ERROR_DOM_QUOTA_REACHED (code 1014)
 * - Safari / WebKit: QuotaExceededError (code 22, number -2147024882)
 * - Mobile private browsing restrictions
 */
export function isQuotaExceededError(err) {
    if (!err) return false;
    return (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014 ||
        (typeof err.message === 'string' && err.message.toLowerCase().includes('quota'))
    );
}

/**
 * Clears old, volatile, or non-essential cache items from storage.
 */
export function clearVolatileStorage(storage = window.localStorage) {
    if (!storage) return;
    try {
        const keysToRemove = [];
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (!k) continue;
            // Clean up temporary caches, article lists, large book/author caches
            if (
                k.startsWith("nuqtha_cache_") ||
                k.startsWith("nuqtha_cached_") ||
                k.startsWith("nuqtha_book_") ||
                k.startsWith("cache_") ||
                k.includes("_cache") ||
                k === "nuqtha_more_menu"
            ) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => {
            try { storage.removeItem(k); } catch (_) {}
        });

        // Also prune reading history if it has grown excessively large
        try {
            const readKey = "nuqtha_read_articles";
            const readRaw = storage.getItem(readKey);
            if (readRaw) {
                const readList = JSON.parse(readRaw);
                if (Array.isArray(readList) && readList.length > 50) {
                    storage.setItem(readKey, JSON.stringify(readList.slice(-50)));
                }
            }
        } catch (_) {}
    } catch (e) {
        console.warn("[NUQTHA UI-Safe] Cache cleanup encountered an error:", e);
    }
}

/**
 * Safely writes to localStorage with automatic QuotaExceededError recovery:
 * 1. Tries localStorage.setItem.
 * 2. On QuotaExceededError: clears old/volatile caches and retries.
 * 3. If still full: falls back to sessionStorage.
 * 4. If sessionStorage also fails: gracefully bypasses persistence without throwing.
 */
export function safeSetLocalStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (err) {
        if (isQuotaExceededError(err)) {
            console.warn(`[NUQTHA UI-Safe] QuotaExceededError writing "${key}". Cleaning caches...`);
            try {
                clearVolatileStorage(window.localStorage);
                window.localStorage.setItem(key, value);
                return true;
            } catch (retryErr) {
                console.warn(`[NUQTHA UI-Safe] localStorage full after cleanup. Falling back to sessionStorage for "${key}".`);
            }
        }
        // Fall back to sessionStorage
        try {
            window.sessionStorage.setItem(key, value);
            return true;
        } catch (sessErr) {
            console.warn(`[NUQTHA UI-Safe] Storage persistence bypassed for "${key}".`);
            return false;
        }
    }
}

/**
 * Safely retrieves an item from localStorage with fallback to sessionStorage.
 */
export function safeGetLocalStorage(key) {
    try {
        const val = window.localStorage.getItem(key);
        if (val !== null) return val;
    } catch (_) {}
    try {
        return window.sessionStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

/**
 * Safely writes to sessionStorage with cache clearing and graceful bypass.
 */
export function safeSetSessionStorage(key, value) {
    try {
        window.sessionStorage.setItem(key, value);
        return true;
    } catch (err) {
        try {
            clearVolatileStorage(window.sessionStorage);
            window.sessionStorage.setItem(key, value);
            return true;
        } catch (_) {
            console.warn(`[NUQTHA UI-Safe] sessionStorage persistence bypassed for "${key}".`);
            return false;
        }
    }
}

// Global immunity: Wrap Storage.prototype.setItem so all legacy / third-party / direct calls never crash
(function applyStoragePrototypeGuard() {
    if (typeof window === "undefined" || !window.Storage || !Storage.prototype) return;
    try {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            try {
                originalSetItem.call(this, key, value);
            } catch (err) {
                if (isQuotaExceededError(err)) {
                    console.warn(`[NUQTHA Storage Guard] Quota exceeded on "${key}". Attempting cache recovery.`);
                    try {
                        clearVolatileStorage(this);
                        originalSetItem.call(this, key, value);
                        return;
                    } catch (retryErr) {
                        if (this === window.localStorage) {
                            try {
                                window.sessionStorage.setItem(key, value);
                                return;
                            } catch (_) {}
                        }
                        // Gracefully bypass persistence
                        return;
                    }
                }
                // If it's another storage error (e.g. security error in sandboxed environment), fallback or ignore
                try {
                    if (this === window.localStorage) {
                        window.sessionStorage.setItem(key, value);
                    }
                } catch (_) {}
            }
        };
    } catch (e) {
        console.warn("[NUQTHA UI-Safe] Could not patch Storage.prototype.setItem:", e);
    }
})();

// Also expose globally on window for inline / non-module scripts
if (typeof window !== "undefined") {
    window.safeInit = safeInit;
    window.isQuotaExceededError = isQuotaExceededError;
    window.clearVolatileStorage = clearVolatileStorage;
    window.safeSetLocalStorage = safeSetLocalStorage;
    window.safeGetLocalStorage = safeGetLocalStorage;
    window.safeSetSessionStorage = safeSetSessionStorage;
}
