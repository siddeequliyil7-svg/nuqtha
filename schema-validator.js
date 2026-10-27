/**
 * NUQTHA — Strict Schema Validator & Data Sanitization Engine
 * Protects Firebase Firestore from corrupted, malformed, or oversized documents.
 * Guarantees UTF-8 Malayalam text integrity and safe fallbacks.
 */

// Permitted categories
export const ALLOWED_CATEGORIES = ["HISTORY", "STUDY", "STORY", "GENERAL"];

// Permitted placement slots
export const ALLOWED_PLACEMENTS = ["AUTO", "HERO", "CAROUSEL", "FEED"];

// Category English label mappings
export const CATEGORY_LABELS = {
    "HISTORY": "HISTORY",
    "STUDY": "STUDY",
    "STORY": "STORY",
    "GENERAL": "GENERAL"
};

const CP437_MAP = {
    0x00C7: 0x80, 0x00FC: 0x81, 0x00E9: 0x82, 0x00E2: 0x83, 0x00E4: 0x84, 0x00E0: 0x85, 0x00E5: 0x86, 0x00E7: 0x87,
    0x00EA: 0x88, 0x00EB: 0x89, 0x00E8: 0x8A, 0x00EF: 0x8B, 0x00EE: 0x8C, 0x00EC: 0x8D, 0x00C4: 0x8E, 0x00C5: 0x8F,
    0x00C9: 0x90, 0x00E6: 0x91, 0x00C6: 0x92, 0x00F4: 0x93, 0x00F6: 0x94, 0x00F2: 0x95, 0x00FB: 0x96, 0x00F9: 0x97,
    0x00FF: 0x98, 0x00D6: 0x99, 0x00DC: 0x9A, 0x00A2: 0x9B, 0x00A3: 0x9C, 0x00A5: 0x9D, 0x20A7: 0x9E, 0x0192: 0x9F,
    0x00E1: 0xA0, 0x00ED: 0xA1, 0x00F3: 0xA2, 0x00FA: 0xA3, 0x00F1: 0xA4, 0x00D1: 0xA5, 0x00AA: 0xA6, 0x00BA: 0xA7,
    0x00BF: 0xA8, 0x2310: 0xA9, 0x00AC: 0xAA, 0x00BD: 0xAB, 0x00BC: 0xAC, 0x00A1: 0xAD, 0x00AB: 0xAE, 0x00BB: 0xAF,
    0x2591: 0xB0, 0x2592: 0xB1, 0x2593: 0xB2, 0x2502: 0xB3, 0x2524: 0xB4, 0x2561: 0xB5, 0x2562: 0xB6, 0x2556: 0xB7,
    0x2555: 0xB8, 0x2563: 0xB9, 0x2551: 0xBA, 0x2557: 0xBB, 0x255D: 0xBC, 0x255C: 0xBD, 0x255B: 0xBE, 0x2510: 0xBF,
    0x2514: 0xC0, 0x2534: 0xC1, 0x252C: 0xC2, 0x251C: 0xC3, 0x2500: 0xC4, 0x253C: 0xC5, 0x255E: 0xC6, 0x255F: 0xC7,
    0x255A: 0xC8, 0x2554: 0xC9, 0x2569: 0xCA, 0x2566: 0xCB, 0x2560: 0xCC, 0x2550: 0xCD, 0x256C: 0xCE, 0x2567: 0xCF,
    0x2568: 0xD0, 0x2564: 0xD1, 0x2565: 0xD2, 0x2559: 0xD3, 0x2558: 0xD4, 0x2552: 0xD5, 0x2553: 0xD6, 0x256B: 0xD7,
    0x256A: 0xD8, 0x2518: 0xD9, 0x250C: 0xDA, 0x2588: 0xDB, 0x2584: 0xDC, 0x258C: 0xDD, 0x2590: 0xDE, 0x2580: 0xDF,
    0x03B1: 0xE0, 0x00DF: 0xE1, 0x0393: 0xE2, 0x03C0: 0xE3, 0x03A3: 0xE4, 0x03C3: 0xE5, 0x00B5: 0xE6, 0x03C4: 0xE7,
    0x03A6: 0xE8, 0x0398: 0xE9, 0x03A9: 0xEA, 0x03B4: 0xEB, 0x221E: 0xEC, 0x03C6: 0xED, 0x03B5: 0xEE, 0x2229: 0xEF,
    0x2261: 0xF0, 0x00B1: 0xF1, 0x2265: 0xF2, 0x2264: 0xF3, 0x2320: 0xF4, 0x2321: 0xF5, 0x00F7: 0xF6, 0x2248: 0xF7,
    0x00B0: 0xF8, 0x2219: 0xF9, 0x00B7: 0xFA, 0x221A: 0xFB, 0x207F: 0xFC, 0x00B2: 0xFD, 0x25A0: 0xFE, 0x00A0: 0xFF
};

export function decodeMojibake(str) {
    if (!str || typeof str !== "string") return str;
    if (/[\u03B1\u03C0\u03C3\u03C4\u03C6\u221E\u2500-\u259F]/.test(str)) {
        try {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                if (code <= 0x7F) {
                    bytes.push(code);
                } else if (CP437_MAP[code] !== undefined) {
                    bytes.push(CP437_MAP[code]);
                } else if (code <= 0xFF) {
                    bytes.push(code);
                } else {
                    bytes.push(0x3F);
                }
            }
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
            if (decoded && !decoded.includes('\uFFFD')) {
                return decoded;
            }
        } catch(e) {}
    }
    return str;
}

/**
 * Clean & normalize a string:
 * - Decodes CP437/Latin1 mangled Malayalam characters if present
 * - NFC Unicode normalization (fixes disjoint Malayalam combining marks)
 * - Strip NULL bytes and non-printable control characters except \n, \r, \t
 * - Trim leading/trailing whitespace
 * - Enforce maxLength
 */
export function sanitizeString(val, maxLength = 10000, fallback = "") {
    if (val === null || val === undefined) return fallback;
    try {
        let str = String(val);
        // Automatically repair any legacy mojibake
        str = decodeMojibake(str);

        // Normalize Unicode for pristine Malayalam character composition
        if (typeof str.normalize === "function") {
            str = str.normalize("NFC");
        }
        // Remove null bytes and non-standard control characters (keep \r, \n, \t)
        str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
        str = str.trim();
        if (maxLength && str.length > maxLength) {
            str = str.slice(0, maxLength);
        }
        return str || fallback;
    } catch (e) {
        console.warn("[Sanitizer] sanitizeString warning:", e);
        return fallback;
    }
}

/**
 * Validate category against allowed set, uppercase, with fallback
 */
export function sanitizeCategory(cat) {
    if (!cat) return "GENERAL";
    const cleaned = String(cat).trim().toUpperCase();
    if (ALLOWED_CATEGORIES.includes(cleaned)) return cleaned;
    // Map common aliases or partial matches
    if (cleaned.includes("HIST") || cleaned.includes("ചരിത്ര")) return "HISTORY";
    if (cleaned.includes("STUD") || cleaned.includes("പഠന")) return "STUDY";
    if (cleaned.includes("STOR") || cleaned.includes("കഥ")) return "STORY";
    return "GENERAL";
}

/**
 * Validate placement against allowed set
 */
export function sanitizePlacement(placement) {
    if (!placement) return "AUTO";
    const cleaned = String(placement).trim().toUpperCase();
    return ALLOWED_PLACEMENTS.includes(cleaned) ? cleaned : "AUTO";
}

/**
 * Validate priority number between 1 and 999 (default 10)
 */
export function sanitizePriority(priority, defaultVal = 10) {
    const parsed = parseInt(priority, 10);
    if (isNaN(parsed) || parsed < 1) return defaultVal;
    if (parsed > 999) return 999;
    return parsed;
}

/**
 * Validate hex color code (#RGB, #RRGGBB, #RRGGBBAA)
 */
export function sanitizeColor(hex, defaultColor = "#1e1b18") {
    if (!hex || typeof hex !== "string") return defaultColor;
    const trimmed = hex.trim();
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    return hexRegex.test(trimmed) ? trimmed : defaultColor;
}

/**
 * Validate font size preset (small, medium, large, xlarge) or default to medium
 */
export function sanitizeFontSize(size, defaultSize = "medium") {
    if (!size || typeof size !== "string") return defaultSize;
    const cleaned = size.trim().toLowerCase();
    const allowed = ["small", "medium", "large", "xlarge"];
    return allowed.includes(cleaned) ? cleaned : defaultSize;
}

/**
 * Validate image URL or Base64 Data URI
 * Guards against malformed data, script injections, or broken headers
 */
export function sanitizeImageUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (trimmed.length === 0) return "";

    // Allow valid Data URIs for images
    if (/^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
        return trimmed;
    }

    // Allow standard HTTP/HTTPS URLs
    if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed)) {
        return trimmed;
    }

    // Disallow corrupted/unknown strings
    console.warn("[Sanitizer] Ignored malformed image URL/DataURI");
    return "";
}

/**
 * Safe Date/Timestamp parser
 * Returns timestamp number in milliseconds or current time
 */
export function parseTimestampMillis(ts) {
    if (!ts) return 0;
    try {
        if (typeof ts.toMillis === "function") return ts.toMillis();
        if (typeof ts.seconds === "number") return ts.seconds * 1000;
        if (typeof ts === "number" && !isNaN(ts)) return ts;
        if (typeof ts === "string") {
            const parsed = new Date(ts).getTime();
            if (!isNaN(parsed)) return parsed;
        }
        if (ts instanceof Date) return ts.getTime();
    } catch (e) {
        // Fallback to 0
    }
    return 0;
}

/**
 * Format a timestamp into readable string (e.g., "24 Oct 2026")
 */
export function formatDateSafe(ts, fallback = "") {
    if (!ts) return fallback;
    try {
        let d = null;
        if (typeof ts.toDate === "function") {
            d = ts.toDate();
        } else if (typeof ts.seconds === "number") {
            d = new Date(ts.seconds * 1000);
        } else if (typeof ts === "number") {
            d = new Date(ts);
        } else if (typeof ts === "string") {
            d = new Date(ts);
        } else if (ts instanceof Date) {
            d = ts;
        }
        if (d && !isNaN(d.getTime())) {
            return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        }
    } catch (e) {
        console.warn("[Sanitizer] formatDateSafe notice:", e);
    }
    return fallback;
}

/**
 * Validate and Sanitize Article Data strictly before saving to Firestore
 * Throws an Error with Malayalam explanation if critical validation fails
 */
export function validateAndSanitizeArticleForSave(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error("അസാധുവായ ഡാറ്റ (Invalid article object).");
    }

    // 1. Title validation (Required, 2-300 chars)
    const title = sanitizeString(raw.title, 300, "");
    if (!title || title.length < 2) {
        throw new Error("ലേഖനത്തിന് സാധുവായ തലക്കെട്ട് (Title) നിർബന്ധമാണ് (കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ).");
    }

    // 2. Content validation (Required, min 5 chars, max 500k chars)
    const content = sanitizeString(raw.content, 500000, "");
    if (!content || content.length < 5) {
        throw new Error("ലേഖനത്തിന്റെ ഉള്ളടക്കം (Content) നിർബന്ധമാണ്.");
    }

    // 3. Category
    const category = sanitizeCategory(raw.category);

    // 4. Author & Transcription
    const author = sanitizeString(raw.author, 100, "NUQTHA");
    const transcription = sanitizeString(raw.transcription, 100, "");

    // 5. Excerpt (default first 160 chars of content)
    let excerpt = sanitizeString(raw.excerpt, 350, "");
    if (!excerpt) {
        excerpt = content.substring(0, 160) + (content.length > 160 ? "…" : "");
    }

    // 6. Cover image
    const imageUrl = sanitizeImageUrl(raw.imageUrl);

    // 7. Colors & Font Size
    const titleColor = sanitizeColor(raw.titleColor, "#1e1b18");
    const contentColor = sanitizeColor(raw.contentColor, "#2b2118");
    const fontSize = sanitizeFontSize(raw.fontSize, "medium");

    // 8. Placement & Priority
    const placement = sanitizePlacement(raw.placement);
    const priority = sanitizePriority(raw.priority, 10);

    // 9. Book Name
    const bookName = sanitizeString(raw.bookName || raw.playlistName, 120, "");

    // 10. Type (ARTICLE or BOOK)
    const type = raw.type === "BOOK" ? "BOOK" : "ARTICLE";

    // 11. Date string
    const date = sanitizeString(raw.date, 30, new Date().toLocaleDateString("en-GB"));

    // Estimate payload size for Firestore 1MB doc ceiling
    const estimatedBytes = (title.length + content.length + imageUrl.length + excerpt.length + author.length + transcription.length) * 2;
    if (estimatedBytes > 950000) {
        throw new Error("ലേഖനത്തിന്റെ ആകെ വലിപ്പം കൂടുതലാണ് (ചിത്രത്തിന്റെയോ ഉള്ളടക്കത്തിന്റെയോ വലിപ്പം കുറയ്ക്കുക).");
    }

    return {
        title,
        category,
        author,
        authorId,
        transcription,
        imageUrl,
        excerpt,
        content,
        titleColor,
        contentColor,
        fontSize,
        placement,
        priority,
        bookName,
        type,
        date
    };
}

/**
 * Normalizes an article document fetched from Firestore (whether SDK snapshot or REST API)
 * Guarantees that every expected field exists and has clean fallbacks.
 * The UI will NEVER crash or render undefined.
 */
export function normalizeArticleDoc(rawDoc, docId = "") {
    if (!rawDoc || typeof rawDoc !== "object") {
        return {
            id: docId || "unknown",
            title: "തലക്കെട്ടില്ല (Untitled)",
            category: "GENERAL",
            author: "NUQTHA",
            authorId: "",
            transcription: "",
            imageUrl: "",
            excerpt: "",
            content: "",
            titleColor: "#1e1b18",
            contentColor: "#2b2118",
            fontSize: "medium",
            placement: "AUTO",
            priority: 10,
            bookName: "",
            type: "ARTICLE",
            date: "",
            createdAt: null
        };
    }

    const id = sanitizeString(rawDoc.id || docId, 100, "doc_" + Math.random().toString(36).substring(2, 9));
    const title = sanitizeString(rawDoc.title, 300, "തലക്കെട്ടില്ല (Untitled)");
    const category = sanitizeCategory(rawDoc.category);
    const author = sanitizeString(rawDoc.author, 100, "NUQTHA");
    const authorId = sanitizeString(rawDoc.authorId || "", 100, "");
    const transcription = sanitizeString(rawDoc.transcription, 100, "");
    const imageUrl = sanitizeImageUrl(rawDoc.imageUrl);
    const content = sanitizeString(rawDoc.content, 500000, "");
    
    let excerpt = sanitizeString(rawDoc.excerpt, 350, "");
    if (!excerpt && content) {
        excerpt = content.substring(0, 160) + (content.length > 160 ? "…" : "");
    }

    const titleColor = sanitizeColor(rawDoc.titleColor, "#1e1b18");
    const contentColor = sanitizeColor(rawDoc.contentColor, "#2b2118");
    const fontSize = sanitizeFontSize(rawDoc.fontSize, "medium");
    const placement = sanitizePlacement(rawDoc.placement);
    const priority = sanitizePriority(rawDoc.priority, 10);
    const bookName = sanitizeString(rawDoc.bookName || rawDoc.playlistName, 120, "");
    const type = rawDoc.type === "BOOK" ? "BOOK" : "ARTICLE";

    // Normalizing createdAt timestamp
    const createdAt = rawDoc.createdAt || rawDoc.createTime || null;
    const date = sanitizeString(rawDoc.date, 30, formatDateSafe(createdAt, "Recent"));

    return {
        id,
        title,
        category,
        author,
        transcription,
        imageUrl,
        excerpt,
        content,
        titleColor,
        contentColor,
        fontSize,
        placement,
        priority,
        bookName,
        type,
        date,
        createdAt
    };
}
