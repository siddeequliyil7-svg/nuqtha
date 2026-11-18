import { APPROVED_ADMIN_EMAILS, loadFirebaseAuth } from "./auth-system.js";

let activeAction = null;
let activeActionButton = null;
const runningButtons = new WeakSet();
let toastTimer = 0;

function getToast() {
    let toast = document.getElementById("admin-action-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "admin-action-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;max-width:min(92vw,480px);padding:14px 18px;border:1px solid;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);font:700 13px/1.5 system-ui,sans-serif;display:none";
        document.body.append(toast);
    }
    return toast;
}

function showToast(message, type) {
    const toast = getToast();
    toast.textContent = message;
    toast.style.display = "block";
    toast.style.background = type === "success" ? "#ecfdf5" : type === "pending" ? "#fffbeb" : "#fff1f2";
    toast.style.borderColor = type === "success" ? "#86efac" : type === "pending" ? "#fcd34d" : "#fda4af";
    toast.style.color = type === "success" ? "#065f46" : type === "pending" ? "#92400e" : "#9f1239";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.style.display = "none";
    }, 4000);
}

function focusInvalidField(error, form) {
    const field = error?.field instanceof HTMLElement
        ? error.field
        : (typeof error?.field === "string" ? document.querySelector(error.field) : null);
    const target = field || form?.querySelector(":invalid");
    if (!target || target.disabled || target.closest("[hidden], .hidden")) return;
    target.classList.add("border-rose-500", "ring-2", "ring-rose-200");
    target.addEventListener("input", () => {
        target.classList.remove("border-rose-500", "ring-2", "ring-rose-200");
    }, { once: true });
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "smooth", block: "center" });
}

export async function assertApprovedAdmin() {
    let auth;
    try {
        ({ auth } = await loadFirebaseAuth());
    } catch (error) {
        throw new Error(`Firebase Authentication could not initialize: ${error?.message || error}`);
    }

    const user = auth?.currentUser;
    if (!user) {
        const error = new Error("Please sign in as admin.");
        error.code = "admin/not-authenticated";
        throw error;
    }

    const email = String(user.email || "").trim().toLowerCase();
    const approved = user.emailVerified === true && APPROVED_ADMIN_EMAILS.some(candidate =>
        String(candidate).trim().toLowerCase() === email
    );
    if (!approved) {
        const error = new Error("Admin permission denied. Sign in with an approved, verified admin email.");
        error.code = "admin/permission-denied";
        throw error;
    }
    return user;
}

function formatActionError(error) {
    if (error?.code === "admin/not-authenticated") return "Please sign in as admin";
    const code = error?.code ? `${error.code}: ` : "";
    return `${code}${error?.message || String(error || "Unknown error")}`;
}

export async function runAction(button, asyncFn, options = {}) {
    const event = options.event;
    if (event?.preventDefault) event.preventDefault();

    const actionButton = button instanceof HTMLElement
        ? button
        : (document.activeElement instanceof HTMLElement ? document.activeElement.closest("button, input[type=submit]") : null);
    if (activeAction) {
        if (actionButton === activeActionButton) {
            return options.nested
                ? { ok: true, value: await asyncFn(activeAction), nested: true }
                : { ok: false, skipped: true };
        }
        if (options.nested && !actionButton) {
            return { ok: true, value: await asyncFn(activeAction), nested: true };
        }
        if (!options.nested || actionButton !== activeActionButton) {
            showToast("Another admin action is in progress. Please retry.", "error");
            return { ok: false, skipped: true };
        }
    }
    if (actionButton && runningButtons.has(actionButton)) return { ok: false, skipped: true };

    const previousDisabled = actionButton?.disabled;
    let loadingIndicator = null;
    if (actionButton) {
        runningButtons.add(actionButton);
        actionButton.disabled = true;
        actionButton.setAttribute("aria-busy", "true");
        if (actionButton instanceof HTMLButtonElement) {
            loadingIndicator = document.createElement("span");
            loadingIndicator.className = "admin-action-loading";
            loadingIndicator.textContent = ` ${options.loadingText || "Saving..."}`;
            loadingIndicator.style.cssText = "font-size:.9em;white-space:nowrap";
            actionButton.append(loadingIndicator);
        }
    }

    const context = {
        reportProgress(progress) {
            const percent = Number.isFinite(progress?.percent) ? ` ${Math.round(progress.percent)}%` : "";
            const message = progress?.message || options.loadingText || "Saving...";
            if (loadingIndicator?.isConnected) loadingIndicator.textContent = ` ${message}${percent}`;
            showToast(`${message}${percent}`, "pending");
        }
    };
    activeAction = context;
    activeActionButton = actionButton;
    showToast(options.loadingText || "Saving...", "pending");

    try {
        await assertApprovedAdmin();
        if (typeof options.validate === "function") options.validate();
        const value = await asyncFn(context);
        if (value === false) return { ok: false, validation: true };
        if (options.successMsg) showToast(options.successMsg, "success");
        return { ok: true, value };
    } catch (error) {
        console.error("[Admin Action] Action failed:", error);
        focusInvalidField(error, options.form);
        showToast(formatActionError(error), "error");
        if (options.rethrow) throw error;
        return { ok: false, error };
    } finally {
        activeAction = null;
        activeActionButton = null;
        if (actionButton) {
            loadingIndicator?.remove();
            actionButton.removeAttribute("aria-busy");
            actionButton.disabled = Boolean(previousDisabled);
            runningButtons.delete(actionButton);
        }
    }
}
