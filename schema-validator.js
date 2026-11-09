/**
 * NUQTHA — Strict Schema Validator & Data Sanitization Engine
 * Protects Firebase Firestore from corrupted, malformed, or oversized documents.
 * Guarantees UTF-8 Malayalam text integrity and safe fallbacks.
 */

// Permitted categories
export const ALLOWED_CATEGORIES = ["HISTORY", "STUDY", "STORY", "GENERAL"];

// Permitted placement slots (Hero section removed)
export const ALLOWED_PLACEMENTS = ["AUTO", "CAROUSEL", "FEED"];

// Category English label mappings
export const CATEGORY_LABELS = {
    "HISTORY": "HISTORY",
    "STUDY": "STUDY",
    "STORY": "STORY",
    "GENERAL": "GENERAL"
};

/**
 * High-precision Malayalam-to-English phonetic transliterator.
 * Produces clean, readable Latin URLs (e.g., 'ആമുഖം' -> 'aamukham',
 * 'ഇമാമുമാരുടെ ജീവിതം' -> 'imamumaarude-jeevitham').
 */
export function transliterateMalayalam(str) {
    if (!str) return "";
    const VOWELS = {
        '\u0D05': 'a', '\u0D06': 'aa', '\u0D07': 'i', '\u0D08': 'ee',
        '\u0D09': 'u', '\u0D0A': 'oo', '\u0D0B': 'ri', '\u0D0E': 'e',
        '\u0D0F': 'e', '\u0D10': 'ai', '\u0D12': 'o', '\u0D13': 'o',
        '\u0D14': 'au'
    };
    const MATRAS = {
        '\u0D3E': 'aa', '\u0D3F': 'i', '\u0D40': 'ee', '\u0D41': 'u',
        '\u0D42': 'oo', '\u0D43': 'ri', '\u0D46': 'e', '\u0D47': 'e',
        '\u0D48': 'ai', '\u0D4A': 'o', '\u0D4B': 'o', '\u0D4C': 'au',
        '\u0D57': 'au'
    };
    const CONSONANTS = {
        '\u0D15': 'k', '\u0D16': 'kh', '\u0D17': 'g', '\u0D18': 'gh', '\u0D19': 'ng',
        '\u0D1A': 'ch', '\u0D1B': 'chh', '\u0D1C': 'j', '\u0D1D': 'jh', '\u0D1E': 'ny',
        '\u0D1F': 't', '\u0D20': 'th', '\u0D21': 'd', '\u0D22': 'dh', '\u0D23': 'n',
        '\u0D24': 'th', '\u0D25': 'th', '\u0D26': 'd', '\u0D27': 'dh', '\u0D28': 'n',
        '\u0D2A': 'p', '\u0D2B': 'ph', '\u0D2C': 'b', '\u0D2D': 'bh', '\u0D2E': 'm',
        '\u0D2F': 'y', '\u0D30': 'r', '\u0D31': 'r', '\u0D32': 'l', '\u0D33': 'l',
        '\u0D34': 'zh', '\u0D35': 'v', '\u0D36': 'sh', '\u0D37': 'sh', '\u0D38': 's',
        '\u0D39': 'h'
    };
    const CHILLUS = {
        '\u0D7A': 'n', '\u0D7B': 'n', '\u0D7C': 'r', '\u0D7D': 'l',
        '\u0D7E': 'l', '\u0D7F': 'k'
    };

    const s = String(str)
        .normalize("NFC")
        .replace(/\u0D23\u0D4D\u200D/g, "\u0D7A")
        .replace(/\u0D28\u0D4D\u200D/g, "\u0D7B")
        .replace(/\u0D30\u0D4D\u200D/g, "\u0D7C")
        .replace(/\u0D32\u0D4D\u200D/g, "\u0D7D")
        .replace(/\u0D33\u0D4D\u200D/g, "\u0D7E")
        .replace(/\u0D15\u0D4D\u200D/g, "\u0D7F")
        .replace(/[\u200B-\u200D\uFEFF]/g, "");

    let out = "";
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (VOWELS[c]) {
            out += VOWELS[c];
        } else if (CHILLUS[c]) {
            out += CHILLUS[c];
        } else if (c === '\u0D02') { // Anusvara (ം)
            out += 'm';
        } else if (c === '\u0D03') { // Visarga (ഃ)
            out += 'h';
        } else if (CONSONANTS[c]) {
            const base = CONSONANTS[c];
            const next = s[i + 1];
            if (next === '\u0D4D') { // Virama (്)
                out += base;
                i++; // skip virama
            } else if (next && MATRAS[next]) {
                out += base + MATRAS[next];
                i++; // skip matra
            } else {
                // Inherent 'a'
                out += base + 'a';
            }
        } else {
            out += c;
        }
    }
    return out;
}

/**
 * Clean Malayalam Raw Slug generator (keeps Malayalam characters)
 */
export function slugifyMalayalamRaw(str) {
    if (!str) return "";
    return String(str)
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u0D00-\u0D7F]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Clean URL slug generator for English and Malayalam text.
 * Generates SEO-friendly transliterated slugs for Malayalam (e.g. aamukham)
 * avoiding messy %E0%B4%86... percent-encoded URLs on WhatsApp and social sharing.
 */
export function slugifyText(str) {
    if (!str) return "";
    const transliterated = transliterateMalayalam(str);
    const slug = transliterated
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (slug) return slug;
    return slugifyMalayalamRaw(str);
}

export function cleanUrlPart(str) {
    if (!str) return "";
    let s = String(str).trim();
    for (let i = 0; i < 3; i++) {
        if (!s.includes("%")) break;
        try {
            const dec = decodeURIComponent(s);
            if (dec === s) break;
            s = dec;
        } catch (_) { break; }
    }
    s = s.trim().replace(/^\/+|\/+$/g, "");
    for (let i = 0; i < 3; i++) {
        s = s.replace(/^(?:book|story|article)[\/\\]+/gi, "")
             .replace(/^2f/gi, "")
             .trim();
    }
    return s.replace(/^\/+|\/+$/g, "");
}

/**
 * Builds clean SEO-friendly URLs:
 * - Standalone story: /story/:slug
 * - Book edition chapter: /story/:bookSlug/:chapterSlug
 * - Book edition overview: /book/:slug
 */
export function getStoryUrl(item) {
    if (!item) return "/";
    const isBook = (item.type || "").toString().toUpperCase() === "BOOK" || item.isBook === true;

    // 1. Dedicated Book: /book/:slug
    if (isBook) {
        let rawBookSlug = item.slug || item.bookSlug || (item.title ? slugifyText(item.title) : "") || item.id || "";
        let cleanBookSlug = cleanUrlPart(rawBookSlug);
        return `/book/${encodeURIComponent(cleanBookSlug)}`;
    }

    // 2. Chapter belonging to a book: /story/:bookSlug/:chapterSlug
    const bookTitle = item.bookName || item.playlistName;
    const hasParentBook = Boolean(item.bookId || (bookTitle && String(bookTitle).trim()));
    if (hasParentBook) {
        const parentBookSlug = item.bookSlug || (bookTitle ? slugifyText(bookTitle) : "") || item.bookId || "";
        // Chapter's own slug must ALWAYS be its own slug or title, NEVER the parent's bookSlug!
        const chapterSlug = item.slug || (item.title ? slugifyText(item.title) : "") || item.id || "";
        let cleanBook = cleanUrlPart(parentBookSlug);
        let cleanChapter = cleanUrlPart(chapterSlug);

        // Strip parent book slug prefix if chapter slug was prefixed with book slug (e.g. imaamumaarute-jeevitham/chapter)
        if (cleanBook && cleanChapter.startsWith(cleanBook + "/")) {
            cleanChapter = cleanChapter.slice(cleanBook.length + 1);
        } else if (cleanBook && cleanChapter.startsWith(cleanBook + "-")) {
            cleanChapter = cleanChapter.slice(cleanBook.length + 1);
        }
        cleanChapter = cleanUrlPart(cleanChapter);

        if (!cleanChapter || cleanChapter === cleanBook) {
            cleanChapter = cleanUrlPart((item.title ? slugifyText(item.title) : "") || item.id || "");
        }
        if (cleanBook && cleanChapter) {
            return `/story/${encodeURIComponent(cleanBook)}/${encodeURIComponent(cleanChapter)}`;
        }
    }

    // If slug is already a complete custom path/prefix with slash (e.g. "opinion/my-article")
    let rawSlug = item.slug || (item.title ? slugifyText(item.title) : "") || item.id || "";
    let s = String(rawSlug).trim().replace(/^\/+|\/+$/g, "");
    if (s.includes("/")) {
        const cleanPath = s.split("/").map(seg => encodeURIComponent(cleanUrlPart(seg))).join("/");
        return `/${cleanPath}`;
    }

    // 3. Standalone Story: /story/:slug
    let cleanStory = cleanUrlPart(rawSlug);
    return `/story/${encodeURIComponent(cleanStory)}`;
}

if (typeof window !== "undefined") {
    window.transliterateMalayalam = transliterateMalayalam;
    window.slugifyMalayalamRaw = slugifyMalayalamRaw;
    window.slugifyText = slugifyText;
    window.cleanUrlPart = cleanUrlPart;
    window.getStoryUrl = getStoryUrl;
}

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
    const trimmed = String(cat).trim();
    if (!trimmed) return "GENERAL";
    const cleaned = trimmed.toUpperCase();
    if (ALLOWED_CATEGORIES.includes(cleaned)) return cleaned;
    // Map common aliases or partial matches
    if (cleaned.includes("HIST") || cleaned.includes("ചരിത്ര")) return "HISTORY";
    if (cleaned.includes("STUD") || cleaned.includes("പഠന")) return "STUDY";
    if (cleaned.includes("STOR") || cleaned.includes("കഥ")) return "STORY";
    // Allow any custom category or special book tag safely sanitized
    return sanitizeString(trimmed, 60, "GENERAL");
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
 * Guards against malformed data, script injections, or broken headers.
 * Disallows SVG Data URIs to prevent Stored XSS vectors.
 */
export function sanitizeImageUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (trimmed.length === 0) return "";

    // Allow root-relative and relative local asset paths (e.g., /assets/..., ./assets/..., assets/..., /favicon.ico)
    if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("assets/")) {
        const lower = trimmed.toLowerCase();
        // Prevent protocol-relative URLs (//evil.com) and code execution characters
        if (!lower.startsWith("//") && !lower.includes("<") && !lower.includes(">") && !lower.includes('"') && !lower.includes("'")) {
            return trimmed;
        }
    }

    // Allow valid Data URIs for safe raster images only (JPEG, PNG, WEBP, GIF)
    if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
        return trimmed;
    }

    // Allow standard HTTP/HTTPS URLs
    if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed)) {
        return trimmed;
    }

    // Disallow corrupted/unknown strings or dangerous pseudo-protocols
    // Do not log warning for empty strings or common benign non-image values
    if (trimmed.length > 5 && !trimmed.startsWith("blob:")) {
        console.warn("[Sanitizer] Ignored malformed image URL/DataURI:", trimmed.slice(0, 30));
    }
    return "";
}

export function getArticleImageUrl(item, fallback = "/cover-placeholder.svg") {
    if (item && typeof item === "object") {
        const candidates = [
            item.imageUrl,
            item.coverUrl,
            item.coverImage,
            item.image,
            item.thumbnail,
            item.thumbnailUrl,
            item.ogImage
        ];
        for (const candidate of candidates) {
            if (typeof candidate === "string" && /^data:/i.test(candidate)) continue;
            const safeUrl = sanitizeImageUrl(candidate);
            if (safeUrl) return safeUrl;
        }
    }
    const safeFallback = sanitizeImageUrl(fallback);
    return safeFallback && !/^data:/i.test(safeFallback) ? safeFallback : "/cover-placeholder.svg";
}

/**
 * Validate HTTP/HTTPS URL
 * Prevents javascript: or data: pseudo-protocol code execution.
 */
export function sanitizeUrl(url, fallback = "") {
    if (!url || typeof url !== "string") return fallback;
    const trimmed = url.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("#")) {
        const lower = trimmed.toLowerCase();
        if (!lower.startsWith("//") && !lower.includes("<") && !lower.includes(">") && !lower.includes('"') && !lower.includes("'")) {
            return trimmed;
        }
    }
    if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(trimmed)) {
        return trimmed;
    }
    return fallback;
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
    const authorId = sanitizeString(raw.authorId, 100, "");
    const transcription = sanitizeString(raw.transcription, 100, "");

    // 5. Excerpt (default first 160 chars of content)
    const rawExcerptVal = raw.excerpt || raw.intro || raw.introduction || raw.summary || "";
    const hasCustomExcerpt = Boolean(rawExcerptVal && String(rawExcerptVal).trim());
    const storedExcerpt = hasCustomExcerpt ? sanitizeString(rawExcerptVal, 1500, "") : "";
    let excerpt = storedExcerpt;
    if (!excerpt) {
        excerpt = content.substring(0, 160) + (content.length > 160 ? "…" : "");
    }

    // 6. Cover image
    const imageUrl = sanitizeImageUrl(raw.imageUrl || raw.coverUrl || raw.coverImage || raw.image || "");
    const thumbnailUrl = sanitizeImageUrl(raw.thumbnailUrl || raw.ogImage || raw.imageUrl || "");

    // 7. Colors & Font Size
    const titleColor = sanitizeColor(raw.titleColor, "#1e1b18");
    const contentColor = sanitizeColor(raw.contentColor, "#2b2118");
    const fontSize = sanitizeFontSize(raw.fontSize, "medium");

    // 8. Placement & Priority
    const placement = sanitizePlacement(raw.placement);
    const priority = sanitizePriority(raw.priority, 10);

    // 9. Book Name
    const bookName = sanitizeString(raw.bookName || raw.playlistName, 120, "");
    const bookId = sanitizeString(raw.bookId, 120, "");
    const hasOrder = raw.order !== undefined && raw.order !== null && raw.order !== "" && !isNaN(raw.order);
    const order = hasOrder ? parseInt(raw.order, 10) : undefined;
    const status = sanitizeString(raw.status, 50, "published");
    const volume = sanitizeString(raw.volume, 50, "");
    const issue = sanitizeString(raw.issue, 50, "");
    const leadTitle = sanitizeString(raw.leadTitle, 250, "");
    const featuredTitle = sanitizeString(raw.featuredTitle, 250, "");
    const slug = sanitizeString(raw.slug || slugifyText(title), 200, "");
    const bookSlug = sanitizeString(raw.bookSlug || (raw.bookName ? slugifyText(raw.bookName) : (bookName ? slugifyText(bookName) : "")), 200, "");

    // 10. Type (ARTICLE or BOOK)
    const rawTypeVal = (raw.type || "").toString().toLowerCase().trim();
    const rawCategory = (raw.category || "").toString().trim().toLowerCase();
    const isExplicitChapter = raw.isChapter === true ||
                              rawTypeVal === "chapter" ||
                              rawCategory === "chapter" ||
                              (raw.chapterIndex !== undefined && raw.chapterIndex !== null);
    const isExplicitBook = !isExplicitChapter && (
        rawTypeVal === "book" ||
        rawTypeVal === "free" ||
        rawTypeVal === "premium" ||
        raw.isBook === true ||
        rawCategory === "book" ||
        rawCategory === "books" ||
        rawCategory === "premium book"
    );
    const type = isExplicitChapter
        ? "CHAPTER"
        : isExplicitBook
            ? (rawTypeVal === "free" || rawTypeVal === "premium" ? rawTypeVal.toUpperCase() : "BOOK")
            : (raw.type || "ARTICLE");

    // 11. Date string
    const date = sanitizeString(raw.date, 30, new Date().toLocaleDateString("en-GB"));
    const isPremium = Boolean(raw.isPremium === true || (typeof raw.category === "string" && raw.category.toLowerCase().includes("premium")));
    const price = !isNaN(raw.price) && Number(raw.price) >= 0 ? Number(raw.price) : 0;
    const apkUrl = sanitizeUrl(raw.apkUrl, "");

    // Estimate payload size for Firestore 1MB doc ceiling
    const estimatedBytes = (title.length + content.length + imageUrl.length + excerpt.length + author.length + transcription.length) * 2;
    if (estimatedBytes > 950000) {
        throw new Error("ലേഖനത്തിന്റെ ആകെ വലിപ്പം കൂടുതലാണ് (ചിത്രത്തിന്റെയോ ഉള്ളടക്കത്തിന്റെയോ വലിപ്പം കുറയ്ക്കുക).");
    }

    const chapters = Array.isArray(raw.chapters) ? raw.chapters : [];
    const tags = [];
    const seenTags = new Set();
    if (Array.isArray(raw.tags)) {
        for (const rawTag of raw.tags) {
            const tag = sanitizeString(rawTag, 60, "").trim();
            const tagKey = tag.toLowerCase();
            if (!tag || seenTags.has(tagKey)) continue;
            seenTags.add(tagKey);
            tags.push(tag);
            if (tags.length === 20) break;
        }
    }

    return {
        title,
        slug,
        bookSlug,
        category,
        author,
        authorId,
        transcription,
        imageUrl,
        thumbnailUrl,
        ogImage: thumbnailUrl,
        hasCustomExcerpt,
        storedExcerpt,
        excerpt,
        content,
        titleColor,
        contentColor,
        fontSize,
        placement,
        priority,
        bookName,
        bookId,
        parentBookId: sanitizeString(raw.parentBookId || bookId, 120, ""),
        tags,
        order,
        status,
        chapters,
        volume,
        issue,
        leadTitle,
        featuredTitle,
        type,
        isBook: isExplicitBook,
        isChapter: isExplicitChapter,
        isPremium,
        price,
        apkUrl,
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
            slug: "",
            bookSlug: "",
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
            bookId: "",
            parentBookId: "",
            tags: [],
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
    const firstSafeCoverUrl = candidates => {
        for (const candidate of candidates) {
            if (typeof candidate !== "string" || /^data:/i.test(candidate)) continue;
            const safeUrl = sanitizeImageUrl(candidate);
            if (safeUrl) return safeUrl;
        }
        return "";
    };
    const imageUrl = firstSafeCoverUrl([
        rawDoc.imageUrl, rawDoc.coverUrl, rawDoc.coverImage, rawDoc.image,
        rawDoc.thumbnailUrl, rawDoc.thumbnail, rawDoc.ogImage
    ]) || "/cover-placeholder.svg";
    const thumbnailUrl = firstSafeCoverUrl([
        rawDoc.thumbnailUrl, rawDoc.thumbnail, rawDoc.ogImage, rawDoc.imageUrl,
        rawDoc.coverUrl, rawDoc.coverImage, rawDoc.image
    ]) || imageUrl;
    const slug = sanitizeString(rawDoc.slug || slugifyText(title), 200, "");
    const bookSlug = sanitizeString(rawDoc.bookSlug || (rawDoc.bookName ? slugifyText(rawDoc.bookName) : (rawDoc.playlistName ? slugifyText(rawDoc.playlistName) : "")), 200, "");
    const content = sanitizeString(rawDoc.content, 500000, "");
    
    const rawExcerptVal = rawDoc.excerpt || rawDoc.intro || rawDoc.introduction || rawDoc.summary || "";
    const hasCustomExcerpt = Boolean(rawExcerptVal && String(rawExcerptVal).trim());
    const storedExcerpt = hasCustomExcerpt ? sanitizeString(rawExcerptVal, 1500, "") : "";
    let excerpt = storedExcerpt;
    if (!excerpt && content) {
        excerpt = content.substring(0, 160) + (content.length > 160 ? "…" : "");
    }

    const titleColor = sanitizeColor(rawDoc.titleColor, "#1e1b18");
    const contentColor = sanitizeColor(rawDoc.contentColor, "#2b2118");
    const fontSize = sanitizeFontSize(rawDoc.fontSize, "medium");
    const placement = sanitizePlacement(rawDoc.placement);
    const priority = sanitizePriority(rawDoc.priority, 10);
    const bookName = sanitizeString(rawDoc.bookName || rawDoc.playlistName, 120, "");
    const bookId = sanitizeString(rawDoc.bookId, 120, "");
    const hasOrder = rawDoc.order !== undefined && rawDoc.order !== null && rawDoc.order !== "" && !isNaN(rawDoc.order);
    const order = hasOrder ? parseInt(rawDoc.order, 10) : undefined;
    const status = sanitizeString(rawDoc.status, 50, "published");
    const chapters = Array.isArray(rawDoc.chapters) ? rawDoc.chapters : [];
    const tags = [];
    const seenTags = new Set();
    if (Array.isArray(rawDoc.tags)) {
        for (const rawTag of rawDoc.tags) {
            const tag = sanitizeString(rawTag, 60, "").trim();
            const tagKey = tag.toLowerCase();
            if (!tag || seenTags.has(tagKey)) continue;
            seenTags.add(tagKey);
            tags.push(tag);
            if (tags.length === 20) break;
        }
    }
    const volume = sanitizeString(rawDoc.volume, 50, "");
    const issue = sanitizeString(rawDoc.issue, 50, "");
    const leadTitle = sanitizeString(rawDoc.leadTitle, 250, "");
    const featuredTitle = sanitizeString(rawDoc.featuredTitle, 250, "");
    // Normalizing Type (ARTICLE or BOOK)
    const rawCat = (rawDoc.category || "").toString().toLowerCase().trim();
    const isBookCat = rawCat === "premium book" || rawCat === "book" || rawCat === "books";
    const hasChaptersArray = chapters.length > 0;
    const isChapter = rawDoc.isChapter === true ||
                      String(rawDoc.type || "").toUpperCase() === "CHAPTER" ||
                      rawCat === "chapter" ||
                      (rawDoc.chapterIndex !== undefined && rawDoc.chapterIndex !== null);

    const rawType = (rawDoc.type || "").toString().toLowerCase().trim();
    const isExplicitBook = rawType === "book" ||
                           rawType === "free" ||
                           rawType === "premium" ||
                           rawDoc.isBook === true ||
                           isBookCat;
    const isBook = !isChapter && isExplicitBook;
    const type = isChapter
        ? "CHAPTER"
        : isBook
            ? (rawType === "free" || rawType === "premium" ? rawType.toUpperCase() : "BOOK")
            : (rawDoc.type || "ARTICLE");

    // Normalizing createdAt timestamp
    const createdAt = rawDoc.createdAt || rawDoc.createTime || null;
    const date = sanitizeString(rawDoc.date, 30, formatDateSafe(createdAt, "Recent"));
    const isPremium = Boolean(rawDoc.isPremium === true || isBookCat || (Array.isArray(rawDoc.tags) && rawDoc.tags.some(t => String(t).toLowerCase().includes("premium"))));
    const price = !isNaN(rawDoc.price) && Number(rawDoc.price) >= 0 ? Number(rawDoc.price) : 0;
    const apkUrl = sanitizeUrl(rawDoc.apkUrl, "");

    return {
        id,
        title,
        slug,
        bookSlug,
        category,
        author,
        authorId,
        transcription,
        imageUrl,
        coverImage: imageUrl,
        coverUrl: imageUrl,
        thumbnailUrl,
        ogImage: thumbnailUrl,
        hasCustomExcerpt,
        storedExcerpt,
        excerpt,
        content,
        titleColor,
        contentColor,
        fontSize,
        placement,
        priority,
        bookName,
        bookId,
        parentBookId: sanitizeString(rawDoc.parentBookId, 120, ""),
        playlistName: sanitizeString(rawDoc.playlistName, 120, ""),
        tags,
        order,
        status,
        chapters,
        volume,
        issue,
        leadTitle,
        featuredTitle,
        type,
        isBook: isBook,
        isChapter: isChapter,
        isPremium,
        price,
        apkUrl,
        date,
        createdAt
    };
}
