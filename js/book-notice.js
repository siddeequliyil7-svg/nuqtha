export const PREMIUM_BOOK_UNAVAILABLE_MESSAGE = "It's currently unavailable. We will make it ready and bring it to you soon so you can unlock it with payment, as we are setting it up and waiting for our PAN card details which will take a few days.";

export function isPremiumBook(book) {
    if (!book || typeof book !== "object") return false;
    const types = [book.type, book.bookType].map(value => String(value || "").trim().toUpperCase());
    const category = String(book.category || "").trim().toLowerCase();
    const price = Number(book.price);
    const hasPremiumTag = Array.isArray(book.tags) &&
        book.tags.some(tag => String(tag).toLowerCase().includes("premium"));
    return book.isPremium === true ||
        types.some(type => type.includes("PREMIUM") || type.includes("PAID")) ||
        category.includes("premium") ||
        category.includes("paid") ||
        hasPremiumTag ||
        (Number.isFinite(price) && price > 0);
}

export function showPremiumBookUnavailableModal() {
    if (typeof document === "undefined") return null;

    const existing = document.getElementById("nuqtha-premium-book-unavailable");
    if (existing) {
        if (!existing.open) existing.showModal?.();
        existing.querySelector("button")?.focus();
        return existing;
    }

    const dialog = document.createElement("dialog");
    dialog.id = "nuqtha-premium-book-unavailable";
    dialog.className = "book-unavailable-dialog";

    const heading = document.createElement("h2");
    heading.className = "book-unavailable-dialog-title";
    heading.textContent = "Premium Book";

    const message = document.createElement("p");
    message.className = "book-unavailable-dialog-message";
    message.textContent = PREMIUM_BOOK_UNAVAILABLE_MESSAGE;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "book-unavailable-dialog-close";
    closeButton.textContent = "Close";
    const closeDialog = () => {
        if (typeof dialog.close === "function" && dialog.open) dialog.close();
        else dialog.remove();
    };
    closeButton.addEventListener("click", closeDialog);

    dialog.setAttribute("aria-labelledby", `${dialog.id}-title`);
    dialog.setAttribute("aria-describedby", `${dialog.id}-message`);
    heading.id = `${dialog.id}-title`;
    message.id = `${dialog.id}-message`;
    dialog.append(heading, message, closeButton);
    dialog.addEventListener("click", event => {
        if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });

    document.body.append(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeButton.focus();
    return dialog;
}
