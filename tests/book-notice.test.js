import {
    isPremiumBook,
    PREMIUM_BOOK_UNAVAILABLE_MESSAGE,
    showPremiumBookUnavailableModal
} from "../js/book-notice.js";

const { describe, it } = window;
const { expect } = window.chai;

describe("Premium book availability notice", () => {
    it("uses the requested exact notice text", () => {
        expect(PREMIUM_BOOK_UNAVAILABLE_MESSAGE).to.equal(
            "It's currently unavailable. We will make it ready and bring it to you soon so you can unlock it with payment, as we are setting it up and waiting for our PAN card details which will take a few days."
        );
    });

    it("recognizes paid metadata and leaves free books available", () => {
        expect(isPremiumBook({ category: "Premium Book" })).to.equal(true);
        expect(isPremiumBook({ type: "PAID" })).to.equal(true);
        expect(isPremiumBook({ price: 25 })).to.equal(true);
        expect(isPremiumBook({ category: "Study", price: 0 })).to.equal(false);
    });

    it("shows the notice in a closable modal", () => {
        const dialog = showPremiumBookUnavailableModal();
        expect(dialog?.open).to.equal(true);
        expect(dialog.querySelector("#nuqtha-premium-book-unavailable-message").textContent)
            .to.equal(PREMIUM_BOOK_UNAVAILABLE_MESSAGE);
        dialog.close();
    });
});
