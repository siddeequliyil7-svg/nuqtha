/**
 * Test suite for User Profile Dashboard and Drag-and-Drop Avatar Uploading
 */
import assert from "node:assert";
import fs from "node:fs";

console.log("==================================================");
console.log("RUNNING USER PROFILE DASHBOARD & AVATAR UPLOAD TESTS");
console.log("==================================================");

// ─── Test 1: Verify Profile Dashboard Source Module ───
console.log("Test 1: Verifying js/profile-dashboard.js exports and functions...");

const profileDashboardCode = fs.readFileSync("js/profile-dashboard.js", "utf8");

assert.ok(
    profileDashboardCode.includes("export function processAvatarImageFile"),
    "js/profile-dashboard.js must export processAvatarImageFile"
);
assert.ok(
    profileDashboardCode.includes("export function ensureProfileDashboardDOM"),
    "js/profile-dashboard.js must export ensureProfileDashboardDOM"
);
assert.ok(
    profileDashboardCode.includes("export function openProfileDashboard"),
    "js/profile-dashboard.js must export openProfileDashboard"
);
assert.ok(
    profileDashboardCode.includes("export function closeProfileDashboard"),
    "js/profile-dashboard.js must export closeProfileDashboard"
);

console.log("  [OK] Profile Dashboard module exports all required functions.");

// ─── Test 2: Verify Drag-and-Drop & Canvas Avatar Upload Logic ───
console.log("Test 2: Verifying Drag-and-Drop elements and Canvas center-crop processing...");

// Check modal HTML template elements inside profile-dashboard.js
assert.ok(
    profileDashboardCode.includes('id="nuqtha-profile-modal"'),
    "Profile dashboard modal must have id 'nuqtha-profile-modal'"
);
assert.ok(
    profileDashboardCode.includes('id="profile-avatar-dropzone"'),
    "Profile dashboard must include dedicated drag-and-drop dropzone 'profile-avatar-dropzone'"
);
assert.ok(
    profileDashboardCode.includes('id="profile-avatar-circle-target"'),
    "Avatar circular preview must serve as interactive drop and click target"
);
assert.ok(
    profileDashboardCode.includes('id="profile-avatar-file-input"'),
    "Hidden file input for fallback click-to-upload must exist"
);
assert.ok(
    profileDashboardCode.includes('id="profile-avatar-preview-img"'),
    "Avatar preview image element must exist"
);
assert.ok(
    profileDashboardCode.includes('id="profile-avatar-remove-btn"'),
    "Option to remove or clear avatar must exist"
);
assert.ok(
    profileDashboardCode.includes('id="profile-save-btn"'),
    "Save profile button must exist"
);

// Drag event listener bindings
assert.ok(
    profileDashboardCode.includes('"dragenter"') &&
    profileDashboardCode.includes('"dragover"') &&
    profileDashboardCode.includes('"dragleave"') &&
    profileDashboardCode.includes('"drop"'),
    "Dropzone must bind dragenter, dragover, dragleave, and drop event handlers"
);

// Canvas center-crop math
assert.ok(
    profileDashboardCode.includes("Math.min(img.width, img.height)"),
    "Canvas processor must compute square center-crop based on min dimension"
);
assert.ok(
    profileDashboardCode.includes("toDataURL"),
    "Canvas processor must export compressed data URL"
);

console.log("  [OK] Drag-and-drop dropzone, events, and canvas center-crop are verified.");

// ─── Test 3: Verify User Information and Reading Preferences ───
console.log("Test 3: Verifying User Details & Reading Preferences in Profile Dashboard...");

assert.ok(
    profileDashboardCode.includes('id="profile-name-input"'),
    "Dashboard must include Display Name input"
);
assert.ok(
    profileDashboardCode.includes('id="profile-bio-input"'),
    "Dashboard must include Bio / Reader Notes textarea"
);
assert.ok(
    profileDashboardCode.includes('id="profile-saved-count-val"'),
    "Dashboard must display saved articles metric"
);
assert.ok(
    profileDashboardCode.includes('id="profile-theme-ivory-btn"') &&
    profileDashboardCode.includes('id="profile-theme-dark-btn"'),
    "Dashboard must include reading theme selectors"
);

console.log("  [OK] Profile information and preferences elements verified.");

// ─── Test 4: Verify Auth System & Auth UI Integration ───
console.log("Test 4: Verifying auth-system.js and auth-ui.js integration...");

const authSystemCode = fs.readFileSync("js/auth-system.js", "utf8");
assert.ok(
    authSystemCode.includes("export async function updateUserProfile"),
    "js/auth-system.js must export updateUserProfile"
);

const authUiCode = fs.readFileSync("js/auth-ui.js", "utf8");
assert.ok(
    authUiCode.includes("openProfileDashboard") &&
    authUiCode.includes("ensureProfileDashboardDOM"),
    "js/auth-ui.js must import and integrate profile dashboard"
);
assert.ok(
    authUiCode.includes("dropdown-profile-btn"),
    "js/auth-ui.js must wire dropdown-profile-btn click listener"
);

console.log("  [OK] Auth system & Auth UI integration verified.");

// ─── Test 5: Verify Header User Dropdown in HTML entrypoints ───
console.log("Test 5: Verifying profile triggers across index.html, article.html, and author.html...");

const indexHtml = fs.readFileSync("index.html", "utf8");
const articleHtml = fs.readFileSync("article.html", "utf8");
const authorHtml = fs.readFileSync("author.html", "utf8");

assert.ok(
    indexHtml.includes('id="dropdown-profile-btn"'),
    "index.html must include dropdown-profile-btn"
);
assert.ok(
    articleHtml.includes('id="dropdown-profile-btn"'),
    "article.html must include dropdown-profile-btn"
);
assert.ok(
    authorHtml.includes('id="dropdown-profile-btn"'),
    "author.html must include dropdown-profile-btn"
);

assert.ok(
    indexHtml.includes('id="dropdown-user-header-block"'),
    "index.html must have clickable dropdown-user-header-block"
);
assert.ok(
    articleHtml.includes('id="dropdown-user-header-block"'),
    "article.html must have clickable dropdown-user-header-block"
);
assert.ok(
    authorHtml.includes('id="dropdown-user-header-block"'),
    "author.html must have clickable dropdown-user-header-block"
);

console.log("  [OK] All HTML entrypoints expose profile dashboard triggers.");

// ─── Test 6: Verify Firestore Hydration & Safe Avatar Persistence ───
console.log("Test 6: Verifying Firestore hydration and safe Storage/Auth avatar persistence...");

assert.ok(
    authSystemCode.includes("fetchUserProfileFromFirestore") &&
    authSystemCode.includes("mergeStoredProfileFields"),
    "js/auth-system.js must hydrate and merge stored/Firestore user profile fields on auth state changes"
);
assert.ok(
    authSystemCode.includes("uploadImageDataUrl") &&
    authSystemCode.includes("resolvedPhotoURL.length <= 2000"),
    "js/auth-system.js must upload data-URL avatars to Storage and guard Firebase Auth updateProfile photoURL length"
);

const analyticsCode = fs.readFileSync("js/analytics-tracker.js", "utf8");
assert.ok(
    analyticsCode.includes('if (typeof user.bio === "string")') &&
    !analyticsCode.includes('bio: user.bio !== undefined ? user.bio : ""'),
    "js/analytics-tracker.js must not overwrite saved bio with empty string during passive auth sync"
);

const storageRules = fs.readFileSync("storage.rules", "utf8");
assert.ok(
    storageRules.includes("match /users/{userId}/{fileName}"),
    "storage.rules must allow authenticated users to upload their own avatar under /users/{userId}/"
);

console.log("  [OK] Firestore hydration, safe Auth photoURL, and storage rules verified.");

console.log("==================================================");
console.log("PASS: ALL USER PROFILE DASHBOARD & AVATAR TESTS PASSED!");
console.log("==================================================");

