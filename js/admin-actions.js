import { APPROVED_ADMIN_EMAILS, loadFirebaseAuth } from "./auth-system.js";

let activeAction = null;
let activeActionButton = null;
const runningButtons = new WeakSet();
const successFeedbackTimers = new WeakMap();
const successFeedbackOriginalStyles = new WeakMap();
let toastTimer = 0;
const ACTION_SAFETY_TIMEOUT_MS = 15000;

function clearSuccessButtonFeedback(button) {
    const timer = successFeedbackTimers.get(button);
    if (timer) window.clearTimeout(timer);
    successFeedbackTimers.delete(button);
    const message = button.dataset.adminSuccessMessage;
    const originalHtml = button.dataset.adminSuccessOriginalHtml;
    if (!message) return;
    if (button.textContent === message && originalHtml) button.innerHTML = originalHtml;
    delete button.dataset.adminSuccessMessage;
    delete button.dataset.adminSuccessOriginalHtml;
    const originalStyles = successFeedbackOriginalStyles.get(button);
    ["background-color", "border-color", "color"].forEach(property => {
        const value = originalStyles?.[property];
        if (value) button.style.setProperty(property, value);
        else button.style.removeProperty(property);
    });
    successFeedbackOriginalStyles.delete(button);
}

function showSuccessButtonFeedback(button, message, originalHtml) {
    if (!(button instanceof HTMLButtonElement) || !message) return;
    clearSuccessButtonFeedback(button);
    successFeedbackOriginalStyles.set(button, {
        "background-color": button.style.getPropertyValue("background-color"),
        "border-color": button.style.getPropertyValue("border-color"),
        color: button.style.getPropertyValue("color")
    });
    button.dataset.adminSuccessMessage = message;
    button.dataset.adminSuccessOriginalHtml = originalHtml;
    button.textContent = message;
    button.style.backgroundColor = "#059669";
    button.style.borderColor = "#047857";
    button.style.color = "#ffffff";
    successFeedbackTimers.set(button, window.setTimeout(() => {
        if (button.dataset.adminSuccessMessage !== message) return;
        if (button.textContent === message) button.innerHTML = originalHtml;
        delete button.dataset.adminSuccessMessage;
        delete button.dataset.adminSuccessOriginalHtml;
        const originalStyles = successFeedbackOriginalStyles.get(button);
        ["background-color", "border-color", "color"].forEach(property => {
            const value = originalStyles?.[property];
            if (value) button.style.setProperty(property, value);
            else button.style.removeProperty(property);
        });
        successFeedbackOriginalStyles.delete(button);
        successFeedbackTimers.delete(button);
    }, 3000));
}

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

function releaseAction(context, actionButton, previousDisabled, previousHtml, loadingIndicator, restoreHtml = false) {
    if (activeAction !== context) return false;
    activeAction = null;
    activeActionButton = null;
    if (actionButton) {
        loadingIndicator?.remove();
        actionButton.removeAttribute("aria-busy");
        actionButton.disabled = Boolean(previousDisabled);
        if (restoreHtml && actionButton instanceof HTMLButtonElement && previousHtml) {
            actionButton.innerHTML = previousHtml;
        }
        runningButtons.delete(actionButton);
    }
    return true;
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
    if (actionButton instanceof HTMLButtonElement) clearSuccessButtonFeedback(actionButton);
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
    const previousHtml = actionButton instanceof HTMLButtonElement ? actionButton.innerHTML : "";
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
            if (context.timedOut) return;
            const percent = Number.isFinite(progress?.percent) ? ` ${Math.round(progress.percent)}%` : "";
            const message = progress?.message || options.loadingText || "Saving...";
            if (loadingIndicator?.isConnected) loadingIndicator.textContent = ` ${message}${percent}`;
            showToast(`${message}${percent}`, "pending");
        },
        timedOut: false,
        timeoutError: null
    };
    activeAction = context;
    activeActionButton = actionButton;
    showToast(options.loadingText || "Saving...", "pending");
    const safetyTimeoutId = window.setTimeout(() => {
        if (activeAction !== context || context.timedOut) return;
        context.timedOut = true;
        context.timeoutError = new Error(
            `This admin action did not finish within ${ACTION_SAFETY_TIMEOUT_MS / 1000} seconds. Check your connection and try again.`
        );
        context.timeoutError.code = "admin/action-timeout";
        console.warn("[Admin Action] Safety timeout reached; the operation may still complete.", context.timeoutError);
        showToast("This action is taking longer than usual. The save may still complete; check before retrying.", "pending");
        releaseAction(context, actionButton, previousDisabled, previousHtml, loadingIndicator, true);
        try {
            options.onTimeout?.(context.timeoutError);
        } catch (error) {
            console.error("[Admin Action] Could not restore the timed-out action UI:", error);
        }
    }, ACTION_SAFETY_TIMEOUT_MS);

    try {
        await assertApprovedAdmin();
        if (context.timedOut) throw context.timeoutError;
        if (typeof options.validate === "function") options.validate();
        const value = await asyncFn(context);
        if (value === false) return { ok: false, validation: true };
        if (context.timedOut) {
            if (options.successMsg && !activeAction) showToast(options.successMsg, "success");
        } else {
            if (options.successMsg) showToast(options.successMsg, "success");
            if (options.successButtonText) showSuccessButtonFeedback(actionButton, options.successButtonText, previousHtml);
        }
        return { ok: true, value };
    } catch (error) {
        if (options.logError !== false) console.error("[Admin Action] Action failed:", error);
        focusInvalidField(error, options.form);
        showToast(formatActionError(error), "error");
        if (options.rethrow) throw error;
        return { ok: false, error };
    } finally {
        window.clearTimeout(safetyTimeoutId);
        releaseAction(context, actionButton, previousDisabled, previousHtml, loadingIndicator);
    }
}
