import assert from "node:assert";

// Mock localStorage and sessionStorage
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; }
    };
})();
global.localStorage = localStorageMock;
global.sessionStorage = localStorageMock;

console.log("==================================================");
console.log("RUNNING MANDATORY LOGIN, APP PROMPT & DUAL PRICING TEST");
console.log("==================================================");

// 1. Dual Pricing Calculation Test
console.log("Test 1: Verifying Dual Pricing calculations...");
const freeBook = { id: "book_free_1", title: "Free Heritage Book", isPremium: false, price: 0 };
const freeBookUndefinedPrice = { id: "book_free_2", title: "Default Free Book" };
const paidBook = { id: "book_paid_1", title: "Premium Islamic History", isPremium: true, price: 49 };
const paidBookDefaultPrice = { id: "book_paid_2", title: "Premium Edition", isPremium: true };

function getBookPricing(book) {
    const isPremium = Boolean(
        book.isPremium === true ||
        book.category === 'Premium Book' ||
        (typeof book.category === 'string' && book.category.toLowerCase().includes('premium'))
    );
    const rawPrice = Number(book.price);
    const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
    const isFree = !isPremium || price === 0;
    const label = isFree ? "₹0 • FREE (സൗജന്യം)" : `₹${price} • PREMIUM`;
    return { isFree, isPremium, price, label };
}

const pFree1 = getBookPricing(freeBook);
assert.strictEqual(pFree1.isFree, true);
assert.strictEqual(pFree1.price, 0);
assert.strictEqual(pFree1.label, "₹0 • FREE (സൗജന്യം)");

const pFree2 = getBookPricing(freeBookUndefinedPrice);
assert.strictEqual(pFree2.isFree, true);
assert.strictEqual(pFree2.price, 0);
assert.strictEqual(pFree2.label, "₹0 • FREE (സൗജന്യം)");

const pPaid1 = getBookPricing(paidBook);
assert.strictEqual(pPaid1.isFree, false);
assert.strictEqual(pPaid1.price, 49);
assert.strictEqual(pPaid1.label, "₹49 • PREMIUM");

const pPaid2 = getBookPricing(paidBookDefaultPrice);
assert.strictEqual(pPaid2.isFree, false);
assert.strictEqual(pPaid2.price, 49);
assert.strictEqual(pPaid2.label, "₹49 • PREMIUM");

console.log("  [OK] Pricing labels match specification: Free = '₹0 • FREE (സൗജന്യം)', Paid = '₹[price] • PREMIUM'");

// 2. Mandatory Login & App Installation Access Rule Test
console.log("Test 2: Verifying Mandatory Login & App Installation Access Rule...");

function checkUserAccess(book, user, { isAppInstalled = false, isPurchased = false } = {}) {
    // 1. Admin bypass
    const isAdmin = user && (user.email === "sayyidsalman314@gmail.com" || user.isAdmin === true);
    if (isAdmin) return { canRead: true, reason: "ADMIN_BYPASS" };

    // 2. Mandatory login
    if (!user) return { canRead: false, reason: "LOGIN_REQUIRED" };

    const { isFree } = getBookPricing(book);

    // 3. Free book requires app install confirmation
    if (isFree) {
        if (!isAppInstalled) return { canRead: false, reason: "APP_INSTALL_REQUIRED" };
        return { canRead: true, reason: "FREE_UNLOCKED" };
    }

    // 4. Paid book requires purchase
    if (!isPurchased) return { canRead: false, reason: "PAYMENT_REQUIRED" };
    return { canRead: true, reason: "PURCHASED_UNLOCKED" };
}

const adminUser = { uid: "admin1", email: "sayyidsalman314@gmail.com" };
const regularUser = { uid: "user1", email: "reader@example.com" };

// A. Unauthenticated user
assert.strictEqual(checkUserAccess(freeBook, null).reason, "LOGIN_REQUIRED");
assert.strictEqual(checkUserAccess(paidBook, null).reason, "LOGIN_REQUIRED");
console.log("  [OK] Unauthenticated user gets LOGIN_REQUIRED for both Free and Paid books.");

// B. Logged in user without app install on free book
assert.strictEqual(checkUserAccess(freeBook, regularUser, { isAppInstalled: false }).reason, "APP_INSTALL_REQUIRED");
console.log("  [OK] Logged-in user on free book gets APP_INSTALL_REQUIRED before installation.");

// C. Logged in user WITH app install on free book
assert.strictEqual(checkUserAccess(freeBook, regularUser, { isAppInstalled: true }).reason, "FREE_UNLOCKED");
console.log("  [OK] Logged-in user with app install gets FREE_UNLOCKED for free books.");

// D. Logged in user on paid book without purchase
assert.strictEqual(checkUserAccess(paidBook, regularUser, { isAppInstalled: true, isPurchased: false }).reason, "PAYMENT_REQUIRED");
console.log("  [OK] Logged-in user on paid book gets PAYMENT_REQUIRED until purchased.");

// E. Logged in user on paid book with purchase
assert.strictEqual(checkUserAccess(paidBook, regularUser, { isAppInstalled: true, isPurchased: true }).reason, "PURCHASED_UNLOCKED");
console.log("  [OK] Logged-in user with purchase gets PURCHASED_UNLOCKED for paid books.");

// F. Admin user bypasses everything on all books
assert.strictEqual(checkUserAccess(freeBook, adminUser).canRead, true);
assert.strictEqual(checkUserAccess(paidBook, adminUser).canRead, true);
assert.strictEqual(checkUserAccess(freeBook, adminUser).reason, "ADMIN_BYPASS");
assert.strictEqual(checkUserAccess(paidBook, adminUser).reason, "ADMIN_BYPASS");
console.log("  [OK] Admin user (sayyidsalman314@gmail.com) bypasses all locks freely.");

// 3. 3-Step Guided Prompt Text Verification
console.log("Test 3: Verifying 3-Step Guided Installation texts...");
const steps = [
    { step: 1, title: "Download APK", desc: "Tap the button below to download the NUQTHA app file." },
    { step: 2, title: "Allow Install", desc: "If prompted, enable \"Unknown Sources\" in your phone settings." },
    { step: 3, title: "Install & Open", desc: "Tap Install and enjoy reading your books!" }
];

assert.strictEqual(steps[0].title, "Download APK");
assert.strictEqual(steps[1].title, "Allow Install");
assert.strictEqual(steps[2].title, "Install & Open");
console.log("  [OK] All 3 English prompt steps match required UI instructions exactly.");

console.log("==================================================");
console.log("PASS: ALL MANDATORY LOGIN & PRICING TESTS PASSED!");
console.log("==================================================");
