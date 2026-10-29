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

// Also expose globally on window for inline / non-module scripts
if (typeof window !== "undefined") {
    window.safeInit = safeInit;
}
