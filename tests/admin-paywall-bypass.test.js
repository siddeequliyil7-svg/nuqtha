/**
 * Admin Paywall Bypass Verification Test Suite
 */
import assert from "assert";

console.log("==================================================");
console.log("RUNNING ADMIN PAYWALL BYPASS TEST SUITE");
console.log("==================================================");

// Approved Admin Identifiers
const APPROVED_ADMIN_EMAILS = [
    "sayyidsalman314@gmail.com",
    "aboobakersiddeequliyil@gmail.com",
    "admin@nuqtha.com",
    "nuqtha.editor@gmail.com"
];

function checkIsAdminUser(user) {
    if (!user) return false;
    if (user.isAdmin === true || user.role === "admin") return true;

    const email = (user.email || "").toLowerCase().trim();
    if (email) {
        if (APPROVED_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email)) return true;
    }
    return false;
}

async function isBookPurchased(bookId, user = null) {
    if (!bookId) return false;
    const bId = String(bookId).trim();

    // 1. Admin Paywall Bypass: Free access to all books & chapters
    const activeUser = user;
    if (activeUser && (checkIsAdminUser(activeUser) || (activeUser.email && activeUser.email.toLowerCase().trim() === "sayyidsalman314@gmail.com"))) {
        return true;
    }

    return false;
}

// Test 1: Verify sayyidsalman314@gmail.com is in APPROVED_ADMIN_EMAILS
console.log("Test 1: Verifying admin email in approved list...");
assert(
    APPROVED_ADMIN_EMAILS.map(e => e.toLowerCase()).includes("sayyidsalman314@gmail.com"),
    "sayyidsalman314@gmail.com must be in APPROVED_ADMIN_EMAILS"
);
console.log("  [OK] sayyidsalman314@gmail.com is present in APPROVED_ADMIN_EMAILS.");

// Test 2: Verify checkIsAdminUser
console.log("Test 2: Verifying checkIsAdminUser recognition...");
const adminUser1 = { email: "sayyidsalman314@gmail.com", uid: "admin1" };
const adminUserUpper = { email: "SAYYIDSALMAN314@GMAIL.COM", uid: "admin2" };
const adminUserSpaced = { email: "  sayyidsalman314@gmail.com  ", uid: "admin3" };
const adminRoleUser = { email: "other@gmail.com", role: "admin" };
const regularUser = { email: "reader@example.com", uid: "reader1" };
const guestUser = null;

assert.strictEqual(checkIsAdminUser(adminUser1), true, "Admin user 1 must be true");
assert.strictEqual(checkIsAdminUser(adminUserUpper), true, "Uppercase email must be true");
assert.strictEqual(checkIsAdminUser(adminUserSpaced), true, "Trimmed email must be true");
assert.strictEqual(checkIsAdminUser(adminRoleUser), true, "Role admin must be true");
assert.strictEqual(checkIsAdminUser(regularUser), false, "Regular user must be false");
assert.strictEqual(checkIsAdminUser(guestUser), false, "Guest user must be false");
console.log("  [OK] checkIsAdminUser accurately identifies admin and rejects regular users.");

// Test 3: Verify isBookPurchased Admin Bypass
console.log("Test 3: Verifying isBookPurchased Admin Bypass...");

async function run() {
    const bookId = "badr-charitham";

    // 1. Admin gets instant true bypass
    const adminAccess = await isBookPurchased(bookId, adminUser1);
    assert.strictEqual(adminAccess, true, "Admin must be granted free access bypass");

    const adminUpperAccess = await isBookPurchased(bookId, adminUserUpper);
    assert.strictEqual(adminUpperAccess, true, "Admin uppercase email must be granted free access");

    const adminRoleAccess = await isBookPurchased(bookId, adminRoleUser);
    assert.strictEqual(adminRoleAccess, true, "Admin role must be granted free access");

    console.log("  [OK] Admin granted immediate free access to read all books & chapters.");

    // 2. Regular user does NOT get bypass
    const regularAccess = await isBookPurchased(bookId, regularUser);
    assert.strictEqual(regularAccess, false, "Regular non-purchased user must NOT get admin bypass");

    // 3. Guest does NOT get bypass
    const guestAccess = await isBookPurchased(bookId, null);
    assert.strictEqual(guestAccess, false, "Guest non-purchased user must NOT get admin bypass");

    console.log("  [OK] Regular users and guests correctly remain subject to standard paywall.");
}

run().then(() => {
    console.log("==================================================");
    console.log("PASS: ALL ADMIN PAYWALL BYPASS TESTS PASSED!");
    console.log("==================================================");
});
