/**
 * Automated Test Suite: Social Thumbnail Share & Image Endpoint Verification
 */

import assert from "assert";
import { getStoryUrl, cleanUrlPart, slugifyText } from "../schema-validator.js";
import { updatePageMeta, getSiteOrigin, getAbsoluteUrl } from "../site-config.js";
import ogHandler from "../api/og.js";
import imageHandler from "../api/image.js";

console.log("==================================================");
console.log("RUNNING SOCIAL THUMBNAIL SHARING & PREVIEW TESTS");
console.log("==================================================");

// Mock DOM environment for site-config tests
class MockElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.attributes = new Map();
    }
    setAttribute(key, val) {
        this.attributes.set(key, String(val));
    }
    getAttribute(key) {
        return this.attributes.get(key) || null;
    }
}

class MockDocument {
    constructor() {
        this.elements = [];
        this.head = {
            appendChild: (el) => this.elements.push(el)
        };
    }
    querySelector(selector) {
        if (selector === 'link[rel="canonical"]') {
            return this.elements.find(e => e.tagName === "link" && e.getAttribute("rel") === "canonical") || null;
        }
        if (selector.startsWith('meta[property="')) {
            const prop = selector.match(/meta\[property="([^"]+)"\]/)[1];
            return this.elements.find(e => e.tagName === "meta" && e.getAttribute("property") === prop) || null;
        }
        if (selector.startsWith('meta[name="')) {
            const name = selector.match(/meta\[name="([^"]+)"\]/)[1];
            return this.elements.find(e => e.tagName === "meta" && e.getAttribute("name") === name) || null;
        }
        return null;
    }
    createElement(tagName) {
        const el = new MockElement(tagName);
        this.elements.push(el);
        return el;
    }
}

globalThis.document = new MockDocument();
globalThis.window = {
    location: {
        origin: "https://nuqtha.vercel.app",
        pathname: "/article.html",
        search: "?id=12345"
    }
};

// ─── Test 1: cleanUrlPart and getStoryUrl Prefix Stripping ───
console.log("Test 1: Verifying getStoryUrl prevents duplicate book slug prefixes...");
const chapterWithPrefixedSlug = {
    id: "chap_1",
    title: "ഈ സ്ത്രീയിൽ രാജാവ് പിറക്കും",
    bookId: "book_khilaafath",
    bookName: "ഖിലാഫത്തുർറാശിദ",
    bookSlug: "khilaaphaththurraashida",
    slug: "khilaaphaththurraashida/ee-sthreeyil-raajaav-pirakkum"
};

const storyUrl = getStoryUrl(chapterWithPrefixedSlug);
assert.strictEqual(
    storyUrl,
    "/story/khilaaphaththurraashida/ee-sthreeyil-raajaav-pirakkum",
    `Expected clean story URL without duplicated book slug, got: ${storyUrl}`
);

const dedicatedBook = {
    id: "57iJx0eBBXQKKF2MMRM6",
    title: "അബ്ബാസിയ്യ ഖിലാഫത്ത്",
    type: "BOOK",
    isBook: true,
    slug: "abbaasiyya-khilaaphathth"
};
const bookUrl = getStoryUrl(dedicatedBook);
assert.strictEqual(
    bookUrl,
    "/book/abbaasiyya-khilaaphathth",
    `Expected clean book URL, got: ${bookUrl}`
);
console.log("  [OK] getStoryUrl creates clean canonical paths for chapters and books without prefix repetition.");

// ─── Test 2: site-config updatePageMeta resolves base64 to /api/image?id=... ───
console.log("Test 2: Verifying updatePageMeta resolves base64 image data to binary /api/image endpoint...");
updatePageMeta({
    path: "/story/uhd-lakshyangngalum-paathangngalum",
    title: "ഉഹ്ദ് യുദ്ധം ; ലക്ഷ്യങ്ങളും പാഠങ്ങളും",
    description: "ചരിത്രത്തിലെ പ്രധാന ഏട്",
    imageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...",
    articleId: "5hfIMjAEPkHsrzFC5cQN"
});

const ogImage = document.querySelector('meta[property="og:image"]');
assert.ok(ogImage, "og:image meta tag must exist");
assert.strictEqual(
    ogImage.getAttribute("content"),
    "https://nuqtha.vercel.app/api/image?id=5hfIMjAEPkHsrzFC5cQN",
    `Expected og:image to be /api/image?id=5hfIMjAEPkHsrzFC5cQN, got: ${ogImage.getAttribute("content")}`
);

const canonical = document.querySelector('link[rel="canonical"]');
assert.strictEqual(
    canonical.getAttribute("href"),
    "https://nuqtha.vercel.app/story/uhd-lakshyangngalum-paathangngalum",
    "Canonical URL must match canonical path passed"
);
console.log("  [OK] Base64 image correctly resolved to /api/image?id=5hfIMjAEPkHsrzFC5cQN and canonical link set.");

// ─── Test 3: api/og serverless function social scraper test ───
console.log("Test 3: Testing api/og with social crawler request for chapter...");
async function runOgTest() {
    let statusCode = null;
    let headers = {};
    let responseBody = "";

    const req = {
        headers: {
            "user-agent": "WhatsApp/2.21.12.21 A"
        },
        query: {
            bookSlug: "khilaaphaththurraashida",
            slug: "ee-sthreeyil-raajaav-pirakkum"
        },
        url: "/api/og?bookSlug=khilaaphaththurraashida&slug=ee-sthreeyil-raajaav-pirakkum"
    };

    const res = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (code) => {
            statusCode = code;
            return {
                send: (body) => { responseBody = body; }
            };
        },
        redirect: (code, url) => {
            statusCode = code;
            responseBody = url;
        }
    };

    await ogHandler(req, res);
    assert.strictEqual(statusCode, 200, `Expected status 200 from api/og, got ${statusCode}`);
    assert.ok(responseBody.includes('<meta property="og:image"'), "Response must contain og:image tag");
    assert.ok(!responseBody.includes('&amp;slug='), "Response must not contain &amp; parameter corruption");
    assert.ok(responseBody.includes('/api/image?id='), "Response must use /api/image?id= endpoint for base64 images");
    console.log("  [OK] api/og successfully returns 200 with dynamic og:image tag for chapter crawler.");
}

// ─── Test 4: api/image serverless function image decoding test ───
console.log("Test 4: Testing api/image decoding binary JPEG with Content-Type header...");
async function runImageTest() {
    let statusCode = null;
    let headers = {};
    let responseBuffer = null;

    const req = {
        headers: {},
        query: {
            id: "5hfIMjAEPkHsrzFC5cQN"
        },
        url: "/api/image?id=5hfIMjAEPkHsrzFC5cQN"
    };

    const res = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (code) => {
            statusCode = code;
            return {
                send: (buf) => { responseBuffer = buf; }
            };
        },
        redirect: (code, url) => {
            statusCode = code;
            responseBuffer = url;
        }
    };

    await imageHandler(req, res);
    assert.strictEqual(statusCode, 200, `Expected status 200 from api/image, got ${statusCode}`);
    assert.strictEqual(headers["Content-Type"], "image/jpeg", `Expected Content-Type image/jpeg, got ${headers["Content-Type"]}`);
    assert.ok(Buffer.isBuffer(responseBuffer), "Response must be a valid binary buffer");
    assert.ok(responseBuffer.length > 1000, "Image buffer must contain decoded bytes");
    // JPEG magic bytes: 0xFF, 0xD8
    assert.strictEqual(responseBuffer[0], 0xFF, "Buffer byte 0 must be 0xFF");
    assert.strictEqual(responseBuffer[1], 0xD8, "Buffer byte 1 must be 0xD8");
    console.log(`  [OK] api/image successfully returned ${responseBuffer.length} bytes binary JPEG with Content-Type: image/jpeg.`);
}

// ─── Test 5: api/og serverless function for dedicated book edition ───
console.log("Test 5: Testing api/og for dedicated book edition in books collection...");
async function runBookOgTest() {
    let statusCode = null;
    let headers = {};
    let responseBody = "";

    const req = {
        headers: {
            "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
        },
        query: {
            slug: "abbaasiyya-khilaaphathth",
            edition: "true"
        },
        url: "/api/og?slug=abbaasiyya-khilaaphathth&edition=true"
    };

    const res = {
        setHeader: (k, v) => { headers[k] = v; },
        status: (code) => {
            statusCode = code;
            return {
                send: (body) => { responseBody = body; }
            };
        },
        redirect: (code, url) => {
            statusCode = code;
            responseBody = url;
        }
    };

    await ogHandler(req, res);
    assert.strictEqual(statusCode, 200, `Expected status 200 from api/og for book, got ${statusCode}`);
    assert.ok(responseBody.includes('<meta property="og:image"'), "Response must contain og:image tag");
    assert.ok(responseBody.includes('/api/image?id=') || responseBody.includes('57iJx0eBBXQKKF2MMRM6'), "Response must point to book image endpoint");
    assert.ok(responseBody.includes('/book/abbaasiyya-khilaaphathth'), "Share URL must point to clean /book/ path");
    console.log("  [OK] Dedicated book correctly resolves title, book cover, and canonical /book/ URL.");
}

Promise.all([runOgTest(), runImageTest(), runBookOgTest()]).then(() => {
    console.log("==================================================");
    console.log("PASS: ALL SOCIAL THUMBNAIL SHARING TESTS PASSED!");
    console.log("==================================================");
}).catch(err => {
    console.error("Test failure:", err);
    process.exit(1);
});
