/**
 * NUQTHA — Frosted Glass Feed Engine
 * Realtime Firestore → Category-Sectioned Feed, Latest-First
 * Protected by Strict Schema Validator & Safe Fallbacks
 */
<<<<<<< HEAD
import { db, collection, onSnapshot } from "./firebase-config.js";
import { normalizeArticleDoc, parseTimestampMillis, formatDateSafe } from "./schema-validator.js";
import { getBookChapters } from "./book-data.js";
import { getThemeSafeTextColor, initializeThemeToggle } from "./theme.js";
=======
import { db, collection, onSnapshot, doc, getDoc, getDocs, fetchWithRetry, getFirebaseApiKey } from "./firebase-config.js";
import { normalizeArticleDoc, parseTimestampMillis, formatDateSafe, slugifyText, getStoryUrl } from "./schema-validator.js";
import { getSiteOrigin, getAbsoluteUrl, updatePageMeta, PRIMARY_DOMAIN } from "./site-config.js";
import { countBookChapters, filterAndSortChapters } from "./js/book-data.js";
import { getAuthorsMap, getAuthorPhoto, slugifyAuthor } from "./js/author-service.js";
import { initHeaderAuthUI } from "./js/auth-ui.js";
import { categoryUrl, categoryTag, normalizeCategoryName, categorySlug, handleCategoryLinkClick } from "./js/category-link.js";
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17

/* ═══════════ Pre-bundled Fallback Data for 100% Uptime & Smooth Load ═══════════ */
export const FALLBACK_ARTICLES = [
    {
        id: "badr-preaching",
        title: "ബദ്ർ; ചരിത്രവും ഖുർആനിന്റെ പ്രവചനവും",
        slug: "badr-charithravum-khuraaninte-pravachanavum",
        category: "HISTORY",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "വിശ്വാസവും അവിശ്വാസവും തമ്മിൽ ഏറ്റുമുട്ടിയ ചരിത്രപ്രസിദ്ധമായ ബദ്ർ യുദ്ധത്തിന്റെ പശ്ചാത്തലവും ഖുർആനിക ദർശനങ്ങളും.",
        content: "സത്യവും അസത്യവും തമ്മിൽ ഏറ്റുമുട്ടിയ ചരിത്രപ്രസിദ്ധമായ ബദ്ർ യുദ്ധത്തിന്റെ പശ്ചാത്തലവും ഖുർആനിക ദർശനങ്ങളും സമഗ്രമായി പ്രതിപാദിക്കുന്ന പഠനം.\n\nഹിജ്റ രണ്ടാം വർഷം റമദാൻ 17-നാണ് ഇസ്ലാമിക ചരിത്രത്തിലെ ആദ്യത്തെ നിർണ്ണായക പോരാട്ടം അരങ്ങേറുന്നത്. എണ്ണത്തിലും ആയുധബലത്തിലും വളരെ മുന്നിലായിരുന്ന ഖുറൈശി സൈന്യത്തിനെതിരെ, വിശ്വാസദാർഢ്യം കൊണ്ട് മാത്രം പൊരുതിയ മുന്നൂറ്റിപ്പതിമൂന്ന് സ്വഹാബികളുടെ വിജയഗാഥയാണിത്.\n\nവിശുദ്ധ ഖുർആൻ ഈ ദിവസത്തെ 'യൗമുൽ ഫുർഖാൻ' അഥവാ സത്യവും അസത്യവും വേർതിരിഞ്ഞ ദിവസം എന്നാണ് വിശേഷിപ്പിച്ചത്. ചരിത്രപരമായ സംഭവവികാസങ്ങളെയും വിശുദ്ധ ഖുർആനിലെ അനുബന്ധ വചനങ്ങളെയും ആഴത്തിൽ വിശകലനം ചെയ്യുന്നതാണ് ഈ പ്രബന്ധം.",
        placement: "HERO",
        priority: 1,
        imageUrl: "",
        thumbnailUrl: "",
        date: "2026-11-01",
        createdAt: 1762000000000,
        type: "ARTICLE"
    },
    {
        id: "badr-lessons",
        title: "ബദ്ർ; ലക്ഷ്യവും പാഠങ്ങളും",
        slug: "badr-lakshyavum-paadhangngalum",
        category: "HISTORY",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "ചരിത്രത്തിലെ വഴിത്തിരിവായ പോരാട്ടത്തിൽ നിന്നും ആധുനിക സമൂഹത്തിന് ഉൾക്കൊള്ളാനുള്ള വലിയ ജീവിത പാഠങ്ങൾ.",
        content: "ചരിത്രത്തിലെ വഴിത്തിരിവായ ബദ്ർ പോരാട്ടത്തിൽ നിന്നും ആധുനിക സമൂഹത്തിന് ഉൾക്കൊള്ളാനുള്ള വലിയ ജീവിത പാഠങ്ങൾ ഈ ലേഖനത്തിൽ പരിശോധിക്കുന്നു.\n\nപ്രവാചകൻ മുഹമ്മദ് നബി (സ) യുടെ നേതൃത്വപാടവവും അനുചരന്മാരുടെ നിരുപാധികമായ സമർപ്പണവും ഏത് പ്രതിസന്ധി ഘട്ടത്തിലും വിജയം വരിക്കാൻ സമൂഹത്തെ പ്രാപ്തമാക്കും എന്നതിന്റെ ഉത്തമ ദൃഷ്ടാന്തമാണ് ബദ്ർ.\n\nഐക്യവും അച്ചടക്കവും ദൈവത്തിലുള്ള സമ്പൂർണ്ണ സമർപ്പണവുമാണ് വിജയത്തിന്റെ അടിസ്ഥാന ഘടകങ്ങൾ. ഭൗതികമായ എണ്ണപ്പെരുപ്പത്തിനപ്പുറം ആദർശപരമായ അടിത്തറയാണ് ഒരു പ്രസ്ഥാനത്തിന്റെ യഥാർത്ഥ കരുത്ത് എന്ന് ബദ്ർ നമ്മെ നിരന്തരം ഓർമ്മിപ്പിക്കുന്നു.",
        placement: "CAROUSEL",
        priority: 2,
        imageUrl: "",
        thumbnailUrl: "",
        date: "2026-11-02",
        createdAt: 1762000000000,
        type: "ARTICLE"
    },
    {
        id: "woman-king",
        title: "ഈ സ്ത്രീയിൽ രാജാവ് പിറക്കും",
        slug: "ee-sthreeyil-raajaav-pirakkum",
        category: "STUDY",
        author: "സുലൈമാൻ ഫൈസി കിഴിശ്ശേരി",
        excerpt: "ചരിത്രത്തിലെ വിസ്മയകരമായ ഒരു ചരിത്ര മുഹൂർത്തത്തെക്കുറിച്ചുള്ള ആഴത്തിലുള്ള പഠനവും വിശകലനവും.",
        content: "ചരിത്രത്തിലെ വിസ്മയകരമായ ഒരു ചരിത്ര മുഹൂർത്തത്തെക്കുറിച്ചുള്ള ആഴത്തിലുള്ള പഠനവും വിശകലനവുമാണിത്.\n\nഇസ്ലാമിക ചരിത്രത്തിൽ സ്ത്രീകളുടെ പങ്ക് കേവലം ഗാർഹിക ജീവിതത്തിൽ മാത്രം ഒതുങ്ങിനിൽക്കുന്ന ഒന്നായിരുന്നില്ല. ജ്ഞാനരംഗത്തും രാഷ്ട്രീയ സാംസ്കാരിക മണ്ഡലങ്ങളിലും ധീരമായ നേതൃത്വം നൽകിയ പ്രമുഖ വനിതകളുടെ ചരിത്രം ഇന്നും അത്ഭുതത്തോടെയാണ് നാം വായിക്കുന്നത്.\n\nത്യാഗവും വിവേകവും കൊണ്ട് ചരിത്രഗതിയെ മാറ്റിമറിച്ച അത്തരം മഹത് വ്യക്തിത്വങ്ങളുടെ ജീവിതത്തിലൂടെയുള്ള ഒരു യാത്രയാണ് ഈ പഠനം.",
        placement: "CAROUSEL",
        priority: 3,
        imageUrl: "",
        thumbnailUrl: "",
        date: "2026-11-03",
        createdAt: 1762000000000,
        type: "ARTICLE"
    },
    {
        id: "uhud-lessons",
        title: "ഉഹ്ദ് യുദ്ധം ; ലക്ഷ്യങ്ങളും പാഠങ്ങളും",
        slug: "uhud-yuddham-lakshyavum-paadhangngalum",
        category: "HISTORY",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "അച്ചടക്കത്തിന്റെയും ഐക്യത്തിന്റെയും അനിവാര്യത പഠിപ്പിച്ച ഉഹ്ദ് യുദ്ധത്തിന്റെ ചരിത്രാന്വേഷണം.",
        content: "അച്ചടക്കത്തിന്റെയും അനുസരണയുടെയും അനിവാര്യത വിശ്വാസി സമൂഹത്തിന് പഠിപ്പിച്ചുകൊടുത്ത വലിയ പാഠശാലയാണ് ഉഹ്ദ് യുദ്ധം.\n\nനേതൃത്വത്തിന്റെ നിർദ്ദേശങ്ങൾ അണുവിട വ്യതിചലിക്കാതെ പാലിക്കേണ്ടതിന്റെ ആവശ്യകതയാണ് ഉഹ്ദിൽ ഉണ്ടായ താൽക്കാലിക തിരിച്ചടി നമ്മെ പഠിപ്പിക്കുന്നത്. ഭൗതിക നേട്ടങ്ങളേക്കാൾ ലക്ഷ്യബോധത്തിന് മുൻഗണന നൽകണമെന്ന് ഈ ചരിത്ര സംഭവം ബോധ്യപ്പെടുത്തുന്നു.\n\nപരാജയങ്ങളിൽ പതറാതെ വീണ്ടും ഒത്തുചേർന്ന് മുന്നോട്ട് പോകാനുള്ള മനക്കരുത്ത് നൽകിയ ഉഹ്ദിന്റെ പാഠങ്ങൾ കാലാതീതമാണ്.",
        placement: "AUTO",
        priority: 4,
        imageUrl: "",
        thumbnailUrl: "",
        date: "2026-11-04",
        createdAt: 1762000000000,
        type: "ARTICLE"
    },
    {
        id: "khwaja-thangal",
        title: "ഖാജ തങ്ങളും ചിശ്തി ത്വരീഖത്തും",
        slug: "khaaja-thangngalum-chishthi-thvareekhaththum",
        category: "STUDY",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "ഇന്ത്യയിലെ ആത്മീയ വിപ്ലവത്തിന് അടിത്തറയിട്ട ഖാജ മുഈനുദ്ദീൻ ചിശ്തി (റ) യുടെ ജീവചരിത്രവും ദർശനവും.",
        content: "ഇന്ത്യൻ ഉപഭൂഖണ്ഡത്തിൽ ആത്മീയ സംസ്കാരത്തിന്റെ ദിവ്യവെളിച്ചം പരത്തിയ സുൽത്താനുൽ ഹിന്ദ് ഖാജ മുഈനുദ്ദീൻ ചിശ്തി (റ) യുടെ ജീവിതവും ചിശ്തി ത്വരീഖത്തിന്റെ സന്ദേശങ്ങളും പ്രതിപാദിക്കുന്ന പ്രബന്ധം.\n\nസ്നേഹവും കാരുണ്യവും മാനവികതയുമായിരുന്നു ഖാജ തങ്ങളുടെ പ്രധാന പ്രബോധന ആയുധങ്ങൾ. ജാതിമത ഭേദമന്യേ സർവ്വ ജനങ്ങളെയും ആലിംഗനം ചെയ്ത ആ വിശുദ്ധ ജീവിതം ഇന്ത്യയുടെ സാംസ്കാരിക ഭൂപടത്തിൽ മായാത്ത മുദ്ര പതിപ്പിച്ചു.",
        placement: "AUTO",
        priority: 5,
        imageUrl: "",
        thumbnailUrl: "",
        date: "2026-11-05",
        createdAt: 1762000000000,
        type: "ARTICLE"
    },
    {
        id: "imamumaarude-jeevitham",
        title: "ഇമാമുമാരുടെ ജീവിതം",
        slug: "imamumaarude-jeevitham",
        bookSlug: "imamumaarude-jeevitham",
        category: "BOOKS",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "ഇസ്ലാമിക ലോകത്തെ മഹാന്മാരായ നാല് ഇമാമുമാരുടെയും പ്രമുഖ പണ്ഡിതന്മാരുടെയും ജീവിത സമർപ്പണം.",
        content: "ഇസ്ലാമിക ലോകത്തെ മഹാന്മാരായ നാല് മദ്ഹബുകളുടെ ഇമാമുമാരായ ഇമാം അബൂഹനീഫ (റ), ഇമാം മാലിക് (റ), ഇമാം ശാഫിഈ (റ), ഇമാം അഹ്മദ് ബിൻ ഹൻബൽ (റ) എന്നിവരുടെ ജീവിതം, പാണ്ഡിത്യം, കർമ്മശാസ്ത്ര സംഭാവനകൾ എന്നിവ സവിസ്തരം പ്രതിപാദിക്കുന്ന പുസ്തകം.",
        type: "BOOK",
        isBook: true,
        priority: 1,
        imageUrl: "",
        thumbnailUrl: "",
        chapters: [
            { id: "imam-abu-hanifa", title: "ഇമാം അബൂഹനീഫ (റ) - ജ്ഞാന സൂര്യൻ", order: 1, slug: "imam-abu-hanifa" },
            { id: "imam-malik", title: "ഇമാം മാലിക് (റ) - മദീനയുടെ പണ്ഡിതൻ", order: 2, slug: "imam-malik" },
            { id: "imam-shafi", title: "ഇമാം ശാഫിഈ (റ) - അഹ്‌ലുസ്സുന്നയുടെ സംരക്ഷകൻ", order: 3, slug: "imam-shafi" },
            { id: "imam-ahmed", title: "ഇമാം അഹ്മദ് ബിൻ ഹൻബൽ (റ) - സഹനത്തിന്റെ മാതൃക", order: 4, slug: "imam-ahmed" }
        ],
        date: "2026-11-01",
        createdAt: 1762000000000
    },
    {
        id: "abbaasiyya-khilaaphathth",
        title: "അബ്ബാസിയ്യ ഖിലാഫത്ത്",
        slug: "abbaasiyya-khilaaphathth",
        bookSlug: "abbaasiyya-khilaaphathth",
        category: "BOOKS",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "ഇസ്ലാമിക സുവർണ്ണ കാലഘട്ടത്തിന്റെ ജ്ഞാന വിപ്ലവവും ഭരണ ചരിത്രവും സമഗ്രമായി പ്രതിപാദിക്കുന്ന പുസ്തകം.",
        content: "ബഗ്ദാദ് ആസ്ഥാനമായി ലോകത്തിന്റെ വൈജ്ഞാനിക സാംസ്കാരിക തലസ്ഥാനമായി മാറിയ അബ്ബാസിയ്യ സാമ്രാജ്യത്തിന്റെ സമഗ്ര ചരിത്ര രേഖ.\n\nബൈതുൽ ഹിക്മ ഉൾപ്പെടെയുള്ള വൈജ്ഞാനിക സ്ഥാപനങ്ങളും ശാസ്ത്ര-തത്വചിന്താ മേഖലകളിലെ സുവർണ്ണ നേട്ടങ്ങളും ഈ കൃതി അനാവരണം ചെയ്യുന്നു.",
        type: "BOOK",
        isBook: true,
        priority: 2,
        imageUrl: "",
        thumbnailUrl: "",
        chapters: [
            { id: "abbasiyya-genesis", title: "അബ്ബാസിയ്യ ഖിലാഫത്തിന്റെ ഉദയം", order: 1, slug: "abbasiyya-genesis" },
            { id: "golden-age-baghdad", title: "ബഗ്ദാദിലെ സുവർണ്ണ യുഗം", order: 2, slug: "golden-age-baghdad" },
            { id: "baytul-hikmah", title: "ബൈതുൽ ഹിക്മയും ജ്ഞാന വിപ്ലവവും", order: 3, slug: "baytul-hikmah" }
        ],
        date: "2026-11-02",
        createdAt: 1762000000000
    },
    {
        id: "umaviyya-khilaaphathth",
        title: "ഉമവിയ്യ ഖിലാഫത്ത്",
        slug: "umaviyya-khilaaphathth",
        bookSlug: "umaviyya-khilaaphathth",
        category: "BOOKS",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "ദമാസ്കസ് ആസ്ഥാനമായി ഭരണം നടത്തിയ ഉമവിയ്യ രാജവംശത്തിന്റെ ഉദയവും അസ്തമയവും.",
        content: "ദമാസ്കസ് കേന്ദ്രമാക്കി മൂന്ന് ഭൂഖണ്ഡങ്ങളിലേക്ക് ഇസ്ലാമിക ഭരണകൂടത്തിന്റെ അതിരുകൾ വികസിപ്പിച്ച ഉമവിയ്യ ഖിലാഫത്തിന്റെ ഉദയവും വളർച്ചയും അസ്തമയവും വിവരിക്കുന്ന ഗ്രന്ഥം.",
        type: "BOOK",
        isBook: true,
        priority: 3,
        imageUrl: "",
        thumbnailUrl: "",
        chapters: [
            { id: "umaviyya-foundation", title: "ഉമവിയ്യ ഭരണത്തിന്റെ സ്ഥാപനം", order: 1, slug: "umaviyya-foundation" },
            { id: "damascus-era", title: "ദമാസ്കസിലെ സാംസ്കാരിക മുന്നേറ്റം", order: 2, slug: "damascus-era" }
        ],
        date: "2026-11-03",
        createdAt: 1762000000000
    },
    {
        id: "badr-charitham",
        title: "ബദ്ർ ചരിത്രം",
        slug: "badr-charitham",
        bookSlug: "badr-charitham",
        category: "BOOKS",
        author: "സയ്യിദ് സൽമാൻ അദനി കരിപ്പൂർ",
        excerpt: "സത്യവും അസത്യവും വേർതിരിച്ച ചരിത്രപ്രസിദ്ധമായ ബദ്ർ യുദ്ധത്തിന്റെ സമഗ്ര ചരിത്ര പുസ്തകം.",
        content: "ബദ്ർ യുദ്ധത്തിന്റെ പശ്ചാത്തലവും യുദ്ധതന്ത്രങ്ങളും വിശദമായി അപഗ്രഥിക്കുന്ന ആധികാരിക ചരിത്ര ഗ്രന്ഥം.",
        type: "BOOK",
        isBook: true,
        priority: 4,
        imageUrl: "",
        thumbnailUrl: "",
        chapters: [
            { id: "badr-background", title: "യുദ്ധത്തിലേക്ക് നയിച്ച സാഹചര്യങ്ങൾ", order: 1, slug: "badr-background" },
            { id: "badr-battlefield", title: "ബദ്റിന്റെ രണാങ്കണത്തിൽ", order: 2, slug: "badr-battlefield" },
            { id: "badr-aftermath", title: "വിജയവും പുതിയ പ്രഭാതവും", order: 3, slug: "badr-aftermath" }
        ],
        date: "2026-11-04",
        createdAt: 1762000000000
    }
];

const CACHE_KEY = 'nuqtha_cached_articles_v7';

function safeCacheArticles(articles) {
    if (!Array.isArray(articles) || articles.length === 0) return;
    try {
        const lightweight = articles.slice(0, 30).map(a => {
            const copy = { ...a };
            delete copy.content;
            delete copy.transcription;
            if (copy.imageUrl && copy.imageUrl.startsWith("data:image/")) {
                delete copy.imageUrl;
            }
            if (copy.thumbnailUrl && copy.thumbnailUrl.startsWith("data:image/")) {
                delete copy.thumbnailUrl;
            }
            if (copy.ogImage && copy.ogImage.startsWith("data:image/")) {
                delete copy.ogImage;
            }
            return copy;
        });
        const str = JSON.stringify(lightweight);
        sessionStorage.setItem(CACHE_KEY, str);
        try { localStorage.setItem(CACHE_KEY, str); } catch (_) {}
    } catch (e) {
        try {
            if (typeof window.clearVolatileStorage === "function") {
                window.clearVolatileStorage(sessionStorage);
            }
        } catch (_) {}
    }
}

let allArticles = [];
<<<<<<< HEAD
=======
try {
    // Purge outdated or corrupted cache keys
    sessionStorage.removeItem('nuqtha_cached_articles');
    localStorage.removeItem('nuqtha_cached_articles');
    sessionStorage.removeItem('nuqtha_cached_articles_v5');
    localStorage.removeItem('nuqtha_cached_articles_v5');
    sessionStorage.removeItem('nuqtha_cached_authors');

    const cachedArts = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY);
    if (cachedArts) {
        const parsed = JSON.parse(cachedArts);
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Verify cache contains NO aistudio images and no obsolete authors
            const hasNoAiStudio = !parsed.some(a => (a.imageUrl || "").includes("aistudio") || (a.thumbnailUrl || "").includes("aistudio"));
            const hasNoOldAuthor = !parsed.some(a => (a.author || "").includes("അബൂബക്കർ"));
            if (hasNoAiStudio && hasNoOldAuthor) {
                allArticles = parsed;
            }
        }
    }
} catch (e) {}

// Pre-fill with normalized fallback articles so feed is NEVER empty, broken, or stuck on skeletons
if (!Array.isArray(allArticles) || allArticles.length === 0) {
    allArticles = FALLBACK_ARTICLES.map(a => normalizeArticleDoc(a, a.id));
    safeCacheArticles(allArticles);
}

let siteAuthorsMap = null;
try {
    const stored = sessionStorage.getItem('nuqtha_cached_authors');
    if (stored) siteAuthorsMap = JSON.parse(stored);
} catch (e) {}

getAuthorsMap(db).then(map => {
    siteAuthorsMap = map;
    if (typeof renderFeed === 'function' && allArticles.length > 0) {
        renderFeed();
    }
}).catch(() => {});
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
let currentCategory = "ALL";

// Ordered list of categories shown on HOME
const CATEGORY_ORDER = ["HISTORY", "STUDY", "STORY"];

// Category labels map (English)
const CATEGORY_ML = {
    "HISTORY": "HISTORY",
    "STUDY": "STUDY",
    "STORY": "STORY"
};

function categoryLabel(cat) {
    if (!cat) return "GENERAL";
    return CATEGORY_ML[cat.toUpperCase()] || cat.toUpperCase();
}

/**
 * Robust Malayalam Unicode text decoder to reverse CP437/Windows-1252/Latin1 mojibake corruption
 */
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

export function sanitizeMalayalamText(str) {
    if (!str || typeof str !== "string") return str;
    // Check if string contains CP437 mangling signatures like 'α' (0x03B1) or typical mojibake characters
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
                    bytes.push(0x3F); // fallback '?'
                }
            }
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
            if (decoded && !decoded.includes('\uFFFD')) {
                return decoded;
            }
        } catch(e) {
            console.warn("Failed CP437 decode attempt:", e);
        }
    }
    return str;
}

let currentSearchQuery = "";

document.addEventListener("DOMContentLoaded", () => {
    setupThemeToggle();
    setupCategoryNav();
    setupMoreDropdown();
    setupHomeLink();
    setupSidebarDrawer();
    setupSearch();
<<<<<<< HEAD
    listenForArticles();
});
=======
    setupLibraryView();
    setupGlobalCategoryBadges();
    checkUrlCategory();
    renderFeed();
    initAppData(db);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

/* ═══════════ Navbar Dropdown & Link Setup ═══════════ */
function setupArticlesDropdown() {
    const articlesBtn = document.getElementById("articles-dropdown-btn");
    const dropdown = document.getElementById("articles-dropdown-menu");
    const arrow = document.getElementById("articles-arrow");

    if (!articlesBtn || !dropdown) return;

    articlesBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Close more dropdown if open
        const moreDropdown = document.getElementById("more-categories-dropdown");
        if (moreDropdown && !moreDropdown.classList.contains("hidden")) {
            moreDropdown.classList.add("hidden");
            const moreArrow = document.getElementById("more-arrow");
            if (moreArrow) moreArrow.style.transform = "rotate(0deg)";
        }

        const isHidden = dropdown.classList.contains("hidden");
        dropdown.classList.toggle("hidden", !isHidden);
        if (arrow) arrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
        articlesBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
        if (!articlesBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
            if (arrow) arrow.style.transform = "rotate(0deg)";
            articlesBtn.setAttribute("aria-expanded", "false");
        }
    });

    dropdown.addEventListener("click", (e) => {
        const item = e.target.closest("[data-category]");
        if (item) {
            e.preventDefault();
            const cat = item.dataset.category;
            if (cat) {
                switchToCategory(cat);
                dropdown.classList.add("hidden");
                if (arrow) arrow.style.transform = "rotate(0deg)";
                articlesBtn.setAttribute("aria-expanded", "false");
            }
        }
    });
}

function setupBooksNavLink() {
    const booksLink = document.getElementById("nav-books-link");
    if (!booksLink) return;

    booksLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchToCategory("BOOKS");
        document.getElementById("articles-dropdown-menu")?.classList.add("hidden");
        document.getElementById("more-categories-dropdown")?.classList.add("hidden");
    });
}

export const DEFAULT_FRONT_MORE_MENU = [
    { id: "menu-authors", label: "AUTHORS (എഴുത്തുകാർ)", url: "author.html?id=സയ്യിദ്-സൽമാൻ-അദനി-കരിപ്പൂർ", icon: "✍️", order: 1, targetBlank: false, isActive: true },
    { id: "menu-contact", label: "ABOUT & CONTACT", url: "contact.html", icon: "📬", order: 2, targetBlank: false, isActive: true },
    { id: "menu-admin", label: "ADMIN PORTAL", url: "admin.html", icon: "⚙️", order: 3, targetBlank: false, isActive: true }
];

function renderDynamicMoreMenu(items) {
    const dropdown = document.getElementById("more-categories-dropdown");
    if (!dropdown) return;

    const list = Array.isArray(items) && items.length > 0 ? items : DEFAULT_FRONT_MORE_MENU;
    const activeItems = list.filter(item => item && item.isActive !== false);
    const sorted = activeItems.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    dropdown.innerHTML = sorted.map((item, index) => {
        const isAdmin = (item.url && item.url.includes("admin.html")) || (item.label && item.label.toUpperCase().includes("ADMIN"));
        const colorClass = isAdmin ? "text-[#b4532c] dark:text-[#f87171]" : "text-[#1e1b18] dark:text-white";
        const icon = item.icon || "🔗";
        const targetAttr = item.targetBlank ? `target="_blank" rel="noopener noreferrer"` : "";
        const divider = (index > 0 && isAdmin) ? `<div class="border-t border-[#ebdccb]/60 dark:border-white/10 my-1"></div>` : "";

        return `
            ${divider}
            <a href="${item.url || '#'}" ${targetAttr} class="more-dropdown-item flex items-center gap-2.5 px-4 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold ${colorClass} transition font-english">
                <span>${icon}</span>
                <span>${item.label || ''}</span>
            </a>
        `;
    }).join("");
}

function initDynamicMoreMenu() {
    // 1. Instant cache paint
    try {
        const cached = sessionStorage.getItem("nuqtha_more_menu");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                renderDynamicMoreMenu(parsed);
                return;
            }
        }
    } catch (e) {}

    // 2. Fetch once from Firestore
    try {
        const menuDocRef = doc(db, "settings", "more_menu");
        getDoc(menuDocRef).then(snap => {
            if (snap && snap.exists()) {
                const data = snap.data();
                if (Array.isArray(data.items) && data.items.length > 0) {
                    try {
                        sessionStorage.setItem("nuqtha_more_menu", JSON.stringify(data.items));
                    } catch (_) {}
                    renderDynamicMoreMenu(data.items);
                    return;
                }
            }
            renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
        }).catch(() => {
            renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
        });
    } catch (_) {
        renderDynamicMoreMenu(DEFAULT_FRONT_MORE_MENU);
    }
}
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17

/* ═══════════ More Categories Dropdown Setup ═══════════ */
function setupMoreDropdown() {
    const moreBtn = document.getElementById("more-categories-btn");
    const dropdown = document.getElementById("more-categories-dropdown");
    const arrow = document.getElementById("more-arrow");

    if (!moreBtn || !dropdown) return;

    moreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = dropdown.classList.contains("hidden");
        dropdown.classList.toggle("hidden", !isHidden);
        if (arrow) arrow.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    });

    document.addEventListener("click", (e) => {
        if (!moreBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add("hidden");
            if (arrow) arrow.style.transform = "rotate(0deg)";
        }
    });

    document.querySelectorAll(".more-dropdown-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = item.dataset.category;
            if (cat) {
                switchToCategory(cat);
                dropdown.classList.add("hidden");
                if (arrow) arrow.style.transform = "rotate(0deg)";
<<<<<<< HEAD
=======
                moreBtn.setAttribute("aria-expanded", "false");
            }
        }
    });
}

function isBookEntity(article) {
    if (!article) return false;
    const artType = (article.type || "").toUpperCase();
    if (artType === "BOOK" || artType === "FREE" || artType === "PREMIUM" || article.isBook === true) return true;
    if (article.bookId && String(article.bookId).trim()) return true;
    if (article.bookName && String(article.bookName).trim()) return true;
    if (article.playlistName && String(article.playlistName).trim()) return true;
    if (article.category && (article.category.toLowerCase() === "premium book" || article.category.toLowerCase() === "book")) return true;
    return false;
}

function isChapterEntity(article) {
    if (!article) return false;
    if (article.isChapter === true || article.type === "CHAPTER") return true;
    if (article.chapterIndex !== undefined && article.chapterIndex !== null) return true;
    if (article.bookId && String(article.bookId).trim() && String(article.bookId).trim() !== String(article.id)) return true;
    const t = (article.title || "").toString().normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
    const b = (article.bookName || "").toString().normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toLowerCase();
    if (b && t && b !== t) return true;
    if (article.order !== undefined && article.order !== null && !isNaN(article.order) && Number(article.order) > 0 && (article.bookId || (b && t && b !== t))) return true;
    return false;
}

function updateMoreCategoriesMenu() {
    // Populate dynamic categories into Articles dropdown
    const container = document.getElementById("dynamic-articles-categories");
    if (!container) return;

    const baseCats = new Set(["ALL", "HISTORY", "STUDY", "STORY", "BOOKS", "BOOK", "PREMIUM BOOK"]);
    const extraCats = new Set();

    allArticles.forEach(a => {
        if (isBookEntity(a)) return;
        const cat = (a.category || "").toUpperCase().trim();
        if (cat && !baseCats.has(cat)) {
            extraCats.add(cat);
        }
    });

    if (extraCats.size === 0) {
        container.innerHTML = "";
        return;
    }

    let html = `<div class="border-t border-[#ebdccb]/60 dark:border-white/10 my-1"></div>`;
    extraCats.forEach(cat => {
        const malLabel = categoryLabel(cat);
        html += `
            <a href="${categoryUrl(cat)}" data-category="${cat}" class="articles-dropdown-item flex items-center justify-between px-4 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#1e1b18] dark:text-white transition uppercase font-english">
                <span>${cat}</span>
                <span class="text-[10px] text-[#8c7a6b] font-normal font-['Noto_Sans_Malayalam']">${malLabel}</span>
            </a>
        `;
    });
    container.innerHTML = html;
}

function setupGlobalCategoryBadges() {
    document.addEventListener("click", (e) => {
        const badge = e.target.closest(".category-glass-badge, .category-badge-pill, .carousel-card-cat, [data-badge-category], .category-pill-link, .show-more-pill, .articles-dropdown-item");
        if (badge) {
            const cat = badge.dataset.badgeCategory || badge.dataset.category;
            if (cat) {
                e.preventDefault();
                e.stopPropagation();
                switchToCategory(cat);
            }
        }
    });
}

function checkUrlCategory() {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const catParam = params.get('category') || params.get('cat');
    const hash = window.location.hash.replace(/^#/, '').trim();

    if (viewParam === 'saved' || hash.toLowerCase() === 'saved') {
        switchToCategory('SAVED');
        return;
    }

    let targetCat = catParam || '';
    if (!targetCat && hash && hash !== 'home') {
        const hashClean = hash.replace(/^category=/, '').trim();
        targetCat = hashClean;
    }

    if (targetCat) {
        let decoded = targetCat;
        try { decoded = decodeURIComponent(targetCat); } catch (_) {}
        const norm = normalizeCategoryName(decoded);
        const upper = norm ? norm.toUpperCase() : '';
        if (upper === 'BOOK' || upper === 'BOOKS') {
            switchToCategory('BOOKS');
        } else if (upper) {
            switchToCategory(upper);
        }
    } else if (!hash || hash === 'home') {
        if (currentCategory !== 'ALL') {
            switchToCategory('ALL');
        }
    }
}

window.addEventListener('hashchange', checkUrlCategory);
window.addEventListener('popstate', checkUrlCategory);

/* ═══════════ Light / Dark Mode Toggle ═══════════ */
function setupThemeToggle() {
    const themeBtn = document.getElementById("theme-toggle-btn");
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");

    // Check saved preference or system preference
    const savedTheme = localStorage.getItem("nuqtha_theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
        if (sunIcon) sunIcon.classList.remove("hidden");
        if (moonIcon) moonIcon.classList.add("hidden");
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-mode");
            try {
                localStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");
            } catch (err) {
                try {
                    sessionStorage.setItem("nuqtha_theme", isDark ? "dark" : "light");
                } catch (_) {}
            }

            if (isDark) {
                if (sunIcon) sunIcon.classList.remove("hidden");
                if (moonIcon) moonIcon.classList.add("hidden");
            } else {
                if (sunIcon) sunIcon.classList.add("hidden");
                if (moonIcon) moonIcon.classList.remove("hidden");
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
            }
        });
    });
}

/* ═══════════ Dynamic Top Horizontal Scrolling Category Navigation Bar ═══════════ */
function renderCategoryNavBar() {
    const nav = document.getElementById("category-nav");
    if (!nav) return;

    // Discover all unique categories across standalone regular articles (excluding books/chapters)
    const regularArticles = allArticles.filter(a => !isBookEntity(a));
    const discovered = new Set();
    regularArticles.forEach(a => {
        const cat = (a.category || "").toUpperCase().trim();
        if (cat && cat !== "BOOKS" && cat !== "BOOK" && cat !== "PREMIUM BOOK") {
            discovered.add(cat);
        }
    });

    // Preset order + any new categories added dynamically from admin!
    const ordered = [...CATEGORY_ORDER.filter(c => discovered.has(c)), ...[...discovered].filter(c => !CATEGORY_ORDER.includes(c))];

    if (ordered.length === 0) {
        ordered.push("HISTORY", "STUDY", "STORY");
    }

    let html = `
        <a href="#" data-category="ALL" class="nav-category-link px-3.5 py-1.5 rounded-full border text-xs font-bold transition uppercase tracking-wider shrink-0 ${currentCategory === 'ALL' ? 'bg-[#1e1b18] text-white dark:bg-white dark:text-[#12141d] border-transparent shadow-xs' : 'bg-white/70 dark:bg-white/5 border-[#ebdccb] dark:border-white/10 text-[#4a3c33] dark:text-[#cbbba9] hover:border-[#b4532c]/50'}">ALL</a>
    `;

    ordered.forEach(cat => {
        const isActive = currentCategory === cat;
        html += `
            <a href="#" data-category="${escapeHtml(cat)}" class="nav-category-link px-3.5 py-1.5 rounded-full border text-xs font-bold transition uppercase tracking-wider shrink-0 ${isActive ? 'bg-[#b4532c] text-white border-[#b4532c] shadow-xs' : 'bg-white/70 dark:bg-white/5 border-[#ebdccb] dark:border-white/10 text-[#4a3c33] dark:text-[#cbbba9] hover:border-[#b4532c]/50 hover:text-[#b4532c]'}">${escapeHtml(cat)}</a>
        `;
    });

    // Dedicated Books tab
    const isBooksActive = currentCategory === "BOOKS";
    html += `
        <a href="#" data-category="BOOKS" class="nav-category-link px-3.5 py-1.5 rounded-full border text-xs font-bold transition uppercase tracking-wider shrink-0 ${isBooksActive ? 'bg-[#b4532c] text-white border-[#b4532c] shadow-xs' : 'bg-white/70 dark:bg-white/5 border-[#ebdccb] dark:border-white/10 text-[#4a3c33] dark:text-[#cbbba9] hover:border-[#b4532c]/50 hover:text-[#b4532c]'}">BOOKS 📚</a>
    `;

    nav.innerHTML = html;

    nav.querySelectorAll(".nav-category-link").forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = link.dataset.category;
            if (cat) switchToCategory(cat);
        });
    });
}

/* ─── Helper: Identify Book Entities (Covers and Chapters) ─── */
function isBookEntity(article) {
    if (!article) return false;
    if (article.type === "BOOK") return true;
    if (article.bookName && article.bookName.trim()) return true;
    if (article.playlistName && article.playlistName.trim()) return true;
    return false;
}

function updateMoreCategoriesMenu() {
    const dropdown = document.getElementById("more-categories-dropdown");
    if (!dropdown) return;

    const baseCats = new Set(["HISTORY", "STUDY", "STORY"]);
    const extraCats = new Set();

    allArticles.forEach(a => {
        if (isBookEntity(a)) return; // Exclude books & chapters from categories dropdown
        const cat = (a.category || "").toUpperCase();
        if (cat && !baseCats.has(cat) && cat !== "BOOKS" && cat !== "BOOK" && cat !== "PREMIUM BOOK") {
            extraCats.add(cat);
        }
    });

    let html = ``;
    if (extraCats.size > 0) {
        extraCats.forEach(cat => {
            html += `
                <a href="#" data-category="${escapeHtml(cat)}" class="more-dropdown-item flex items-center gap-2 px-3.5 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#1e1b18] dark:text-white transition uppercase font-english">
                    <span>📌</span>
                    <span>${escapeHtml(cat)}</span>
                </a>
            `;
        });
    } else {
        html += `
            <a href="#" data-category="GENERAL" class="more-dropdown-item flex items-center gap-2 px-3.5 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#1e1b18] dark:text-white transition uppercase font-english">
                <span>📌</span>
                <span>GENERAL</span>
            </a>
        `;
    }

    html += `
        <a href="#" data-category="ALL" class="more-dropdown-item flex items-center gap-2 px-3.5 py-2 hover:bg-[#b4532c]/10 dark:hover:bg-white/10 text-xs font-bold text-[#b4532c] dark:text-[#f87171] transition border-t border-[#ebdccb]/60 dark:border-white/10 uppercase font-english">
            <span>🏠</span>
            <span>ALL ARTICLES</span>
        </a>
    `;

    dropdown.innerHTML = html;

    dropdown.querySelectorAll(".more-dropdown-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = item.dataset.category;
            if (cat) {
                switchToCategory(cat);
                dropdown.classList.add("hidden");
                const arrow = document.getElementById("more-arrow");
                if (arrow) arrow.style.transform = "rotate(0deg)";
            }
        });
    });
}

/* ═══════════ Light / Dark Mode Toggle ═══════════ */
function setupThemeToggle() {
    const themeBtn = document.getElementById("theme-toggle-btn");
    const sunIcon = document.getElementById("sun-icon");
    const moonIcon = document.getElementById("moon-icon");
    initializeThemeToggle(themeBtn, sunIcon, moonIcon);
}

/* ═══════════ Category Tab Switching ═══════════ */
function setupCategoryNav() {
    const links = document.querySelectorAll("#category-nav .nav-category-link");
    links.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            switchToCategory(link.dataset.category);
        });
    });
}

function setupHomeLink() {
    const homeLink = document.getElementById("home-link");
    if (!homeLink) return;

    homeLink.addEventListener("click", event => {
        event.preventDefault();
        switchToCategory("ALL");
        document.getElementById("home")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

/* ═══════════ 3-Bar Sidebar Drawer Setup ═══════════ */
function setupSidebarDrawer() {
    const toggleBtn = document.getElementById("sidebar-toggle-btn");
    const closeBtn = document.getElementById("sidebar-close-btn");
    const backdrop = document.getElementById("sidebar-backdrop");
    const drawer = document.getElementById("sidebar-drawer");

    function openDrawer() {
        if (drawer) drawer.classList.add("drawer-open");
        if (backdrop) backdrop.classList.add("backdrop-active");
        document.body.style.overflow = "hidden";
    }

    function closeDrawer() {
        if (drawer) drawer.classList.remove("drawer-open");
        if (backdrop) backdrop.classList.remove("backdrop-active");
        document.body.style.overflow = "";
    }

    if (toggleBtn) toggleBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    document.querySelectorAll(".drawer-nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const cat = item.dataset.category;
            if (cat) {
                e.preventDefault();
                switchToCategory(cat);
                closeDrawer();
            }
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeDrawer();
    });
}

/* ═══════════ 3D Library View Switcher Setup ═══════════ */
function setupLibraryView() {
    const feed = document.getElementById("feed");
    const lib = document.getElementById("library");
    const bA = document.getElementById("view-articles");
    const bL = document.getElementById("view-library");
    const drawerLibLink = document.getElementById("drawer-library-link");

    if (!feed || !lib) return;

    let mounted = false;

    async function showView(name) {
        const isLib = name === "library";
        feed.hidden = isLib;
        lib.hidden = !isLib;
        if (bA) bA.setAttribute("aria-pressed", String(!isLib));
        if (bL) bL.setAttribute("aria-pressed", String(isLib));

        if (isLib) {
            if (window.location.hash !== "#library") {
                history.replaceState(null, null, "#library");
            }
            if (!mounted) {
                mounted = true;
                const { mountLibrary } = await import("./library.js");
                mountLibrary(lib);
            }
        } else {
            if (window.location.hash === "#library") {
                history.replaceState(null, null, "#home");
            }
        }
    }

    if (bA) bA.addEventListener("click", () => showView("articles"));
    if (bL) bL.addEventListener("click", () => showView("library"));

    if (drawerLibLink) {
        drawerLibLink.addEventListener("click", () => {
            const closeBtn = document.getElementById("sidebar-close-btn");
            if (closeBtn) closeBtn.click();
            showView("library");
            lib.scrollIntoView({ behavior: "smooth" });
        });
    }

    window.showNuqthaView = showView;

    // Check if URL requests library view (e.g. #library or ?view=library)
    const urlParams = new URLSearchParams(window.location.search);
    if (window.location.hash === "#library" || urlParams.get("view") === "library") {
        showView("library");
    }
}

/* ═══════════ Real-Time Article Search Setup ═══════════ */
function setupSearch() {
    const searchToggleBtn = document.getElementById("header-search-btn");
    const searchContainer = document.getElementById("header-search-container");
    const headerInput = document.getElementById("header-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");
    const drawerInput = document.getElementById("drawer-search-input");

    function onSearchChange(val) {
        currentSearchQuery = val;
        if (headerInput && headerInput.value !== val) headerInput.value = val;
        if (drawerInput && drawerInput.value !== val) drawerInput.value = val;
        if (headerClearBtn) {
            headerClearBtn.classList.toggle("hidden", !val.trim());
        }
        renderFeed();
    }

    if (searchToggleBtn && searchContainer) {
        searchToggleBtn.addEventListener("click", () => {
            const isHidden = searchContainer.classList.contains("hidden");
            searchContainer.classList.toggle("hidden", !isHidden);
            if (isHidden && headerInput) {
                headerInput.focus();
            }
        });
    }

    if (headerInput) {
        headerInput.addEventListener("input", (e) => onSearchChange(e.target.value));
    }

    if (drawerInput) {
        drawerInput.addEventListener("input", (e) => {
            onSearchChange(e.target.value);
            // Open header search container as well so state is consistent
            if (searchContainer && searchContainer.classList.contains("hidden")) {
                searchContainer.classList.remove("hidden");
            }
        });
    }

    if (headerClearBtn) {
        headerClearBtn.addEventListener("click", () => clearSearch(true));
    }
}

function clearSearch(triggerRender = true) {
    currentSearchQuery = "";
    const headerInput = document.getElementById("header-search-input");
    const drawerInput = document.getElementById("drawer-search-input");
    const headerClearBtn = document.getElementById("header-search-clear");
    if (headerInput) headerInput.value = "";
    if (drawerInput) drawerInput.value = "";
    if (headerClearBtn) headerClearBtn.classList.add("hidden");
    if (triggerRender) renderFeed();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/* ═══════════ App Data Loader (Single Fetch & Cached - Fixes 429) ═══════════ */
let isAppDataLoading = false;
export async function initAppData(database = db) {
    if (isAppDataLoading) return;

    // 1. Instant cache paint
    try {
        const cached = sessionStorage.getItem(CACHE_KEY) || localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const hasNoAiStudio = !parsed.some(a => (a.imageUrl || "").includes("aistudio") || (a.thumbnailUrl || "").includes("aistudio"));
                if (hasNoAiStudio) {
                    allArticles = parsed;
                    renderFeed();
                }
            }
        }
    } catch (_) {}

    isAppDataLoading = true;
    try {
        const [articlesSnapshot, booksSnapshot] = await Promise.all([
            getDocs(collection(database, "articles")).catch(() => ({ docs: [], size: 0 })),
            getDocs(collection(database, "books")).catch(() => ({ docs: [], size: 0 }))
        ]);

        const artCount = articlesSnapshot?.size || articlesSnapshot?.docs?.length || 0;
        const bkCount = booksSnapshot?.size || booksSnapshot?.docs?.length || 0;
        if (artCount > 0 || bkCount > 0) {
            console.log(`[NUQTHA App] Received ${artCount} articles and ${bkCount} books from Firestore.`);
        }

        const rawArticlesList = [];
        articlesSnapshot.docs.forEach(articleDoc => {
            const article = articleDoc.data();
            const normalized = normalizeArticleDoc({
                ...article,
                title: sanitizeMalayalamText(article.title),
                author: sanitizeMalayalamText(article.author),
                excerpt: sanitizeMalayalamText(article.excerpt),
                content: sanitizeMalayalamText(article.content),
                playlistName: sanitizeMalayalamText(article.playlistName)
            }, articleDoc.id);
            rawArticlesList.push(normalized);
        });

<<<<<<< HEAD
        hasServerSnapshot = !snapshot.metadata.fromCache;
        allArticles = snapshot.metadata.fromCache
            ? mergeArticles(snapshotArticles, restArticles)
            : sortArticles(snapshotArticles);
        renderFeed();
    }, error => {
        console.error("Firestore articles listener failed:", error);
        loadArticlesFromRest();
    });

    loadArticlesFromRest();

    async function loadArticlesFromRest() {
        if (restFetchPromise) return restFetchPromise;

        restFetchPromise = (async () => {
            try {
                const { apiKey, projectId } = db.app.options;
                if (!apiKey || !projectId) {
                    throw new Error("Firebase project ID or API key is missing.");
                }

                const documents = [];
                let nextPageToken = "";
                do {
                    const params = new URLSearchParams({ pageSize: "300", key: apiKey });
                    if (nextPageToken) params.set("pageToken", nextPageToken);
                    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/articles?${params}`;
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`Firestore REST request failed (${response.status}): ${await response.text()}`);
                    }

                    const page = await response.json();
                    documents.push(...(page.documents || []));
                    nextPageToken = page.nextPageToken || "";
                } while (nextPageToken);

                restArticles = documents.map(document => {
                    const id = document.name.split("/").pop();
                    const fields = decodeFirestoreFields(document.fields || {});
                    return normalizeArticleDoc({
                        ...fields,
                        createdAt: fields.createdAt || document.createTime,
                        updatedAt: fields.updatedAt || document.updateTime
                    }, id);
                });

                if (!hasServerSnapshot) {
                    allArticles = sortArticles(restArticles);
                    renderFeed();
                }
            } catch (error) {
                console.error("Firestore REST article fetch failed:", error);
                if (!hasServerSnapshot && allArticles.length === 0) {
                    renderEmpty("ലേഖനങ്ങൾ Firestore-ൽ നിന്ന് ലോഡ് ചെയ്യാനായില്ല. നെറ്റ്‌വർക്ക്, Firebase project ID, Firestore Rules എന്നിവ പരിശോധിക്കുക.");
                }
            } finally {
                restFetchPromise = null;
            }
        })();

        return restFetchPromise;
=======
        const rawBooksList = [];
        booksSnapshot.docs.forEach(bDoc => {
            const bData = bDoc.data();
            const norm = normalizeArticleDoc({
                ...bData,
                title: sanitizeMalayalamText(bData.title),
                author: sanitizeMalayalamText(bData.author),
                excerpt: sanitizeMalayalamText(bData.excerpt)
            }, bDoc.id);
            norm.type = "BOOK";
            norm.isBook = true;
            norm.isChapter = false;
            rawBooksList.push(norm);
        });

        const combined = [...rawArticlesList];
        rawBooksList.forEach(bk => {
            const exists = combined.some(a => a.id === bk.id || (a.slug && a.slug === bk.slug && (a.type === "BOOK" || a.type === "free" || a.type === "premium")));
            if (!exists) combined.push(bk);
        });

        if (combined.length > 0) {
            allArticles = sortArticles(combined);
            safeCacheArticles(allArticles);
            renderFeed();
        } else if (allArticles.length === 0) {
            allArticles = FALLBACK_ARTICLES.map(a => normalizeArticleDoc(a, a.id));
            safeCacheArticles(allArticles);
            renderFeed();
        }
    } catch (_) {
        if (allArticles.length === 0) {
            allArticles = FALLBACK_ARTICLES.map(a => normalizeArticleDoc(a, a.id));
            safeCacheArticles(allArticles);
        }
        renderFeed();
    } finally {
        isAppDataLoading = false;
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
    }
}
window.initAppData = initAppData;
export const listenForArticles = initAppData;

function decodeFirestoreFields(fields) {
    return Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
    );
}

function decodeFirestoreValue(value) {
    if (!value || typeof value !== "object") return value;
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("booleanValue" in value) return value.booleanValue;
    if ("timestampValue" in value) return value.timestampValue;
    if ("referenceValue" in value) return value.referenceValue;
    if ("bytesValue" in value) return value.bytesValue;
    if ("geoPointValue" in value) return value.geoPointValue;
    if ("arrayValue" in value) {
        return (value.arrayValue.values || []).map(decodeFirestoreValue);
    }
    if ("mapValue" in value) {
        return decodeFirestoreFields(value.mapValue.fields || {});
    }
    return value;
}

function mergeArticles(...articleGroups) {
    const articlesById = new Map();
    articleGroups.flat().forEach(article => articlesById.set(article.id, article));
    return sortArticles(Array.from(articlesById.values()));
}

function sortArticles(articles) {
    return articles.sort((a, b) => {
        const timestampB = parseTimestampMillis(b.createdAt)
            || parseTimestampMillis(b.updatedAt)
            || parseTimestampMillis(b.date)
            || 0;
        const timestampA = parseTimestampMillis(a.createdAt)
            || parseTimestampMillis(a.updatedAt)
            || parseTimestampMillis(a.date)
            || 0;
        return timestampB - timestampA;
    });
}

/* ═══════════ Render Feed ═══════════ */
function renderFeed() {
    renderCategoryNavBar();
    const container = document.getElementById("feed-container");
    if (!container) return;

    updateMoreCategoriesMenu();

    if (currentSearchQuery && currentSearchQuery.trim()) {
        renderSearchFeed(container, currentSearchQuery.trim());
    } else if (currentCategory === "ALL") {
        renderHomeFeed(container);
    } else if (currentCategory === "BOOKS" || currentCategory === "BOOK") {
        renderBooksCategoryFeed(container);
    } else {
        renderCategoryFeed(container, currentCategory);
    }

    attachCardListeners();
    attachShowMoreListeners();
    setupCarousel();
}

/* ═══════════ Search Feed: Displays matching articles ═══════════ */
function renderSearchFeed(container, query) {
    const lower = query.toLowerCase();
    const matched = allArticles.filter(art => {
        const title = (art.title || "").toLowerCase();
        const author = (art.author || "").toLowerCase();
        const excerpt = (art.excerpt || "").toLowerCase();
        const content = (art.content || "").toLowerCase();
        const cat = (art.category || "").toLowerCase();
        return title.includes(lower) || author.includes(lower) || excerpt.includes(lower) || content.includes(lower) || cat.includes(lower);
    });

    let html = `
    <div class="search-result-banner flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-white/80 dark:bg-[#12141d]/80 backdrop-blur-md border border-[#ebdccb] dark:border-white/10 shadow-sm">
        <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-[#b4532c]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <span class="text-xs font-bold text-[#1e1b18] dark:text-[#f1f5f9]">തിരഞ്ഞ ഫലങ്ങൾ: <strong class="text-[#b4532c]">"${escapeHtml(query)}"</strong></span>
            <span class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">(${matched.length} ലേഖനങ്ങൾ)</span>
        </div>
        <button id="clear-search-result-btn" class="text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] transition flex items-center gap-1 font-english">
            <span>&times; CLEAR</span>
        </button>
    </div>
    `;

    if (matched.length === 0) {
        html += `
        <div class="article-glass-card p-10 sm:p-14 text-center cursor-default space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-[#1e1b18] dark:text-white">തിരഞ്ഞ വാക്കിന് അനുയോജ്യമായ ലേഖനങ്ങൾ ലഭ്യമല്ല</h3>
            <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] max-w-sm mx-auto">മറ്റൊരു വാക്ക് നൽകി വീണ്ടും തിരഞ്ഞുനോക്കുക അല്ലെങ്കിൽ എല്ലാ ലേഖനങ്ങളിലേക്കും മടങ്ങുക.</p>
            <button id="empty-search-reset-btn" class="mt-2 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs font-bold hover:bg-[#923e1b] transition shadow-md font-english">
                VIEW ALL ARTICLES
            </button>
        </div>
        `;
    } else {
        html += buildFeaturedCard(matched[0]);
        if (matched.length > 1) {
            html += `<div class="category-cards-list space-y-3 mt-4">`;
            matched.slice(1).forEach(art => {
                html += buildCompactRecentCard(art);
            });
            html += `</div>`;
        }
    }

    container.innerHTML = html;
    const clearResultBtn = document.getElementById("clear-search-result-btn");
    if (clearResultBtn) clearResultBtn.addEventListener("click", () => clearSearch(true));
    const emptyResetBtn = document.getElementById("empty-search-reset-btn");
    if (emptyResetBtn) emptyResetBtn.addEventListener("click", () => clearSearch(true));
}

/* ─── HOME FEED: Scrolling Carousel + Hero Featured + Dedicated Books + Category Feeds ─── */
function renderHomeFeed(container) {
    // Distinguish book covers from standard articles
    const isBookCoverItem = (a) => ((a.type || "").toUpperCase() === "BOOK" || (a.type || "").toLowerCase() === "free" || (a.type || "").toLowerCase() === "premium" || a.isBook === true) && !isChapterEntity(a);
    const bookCovers = allArticles.filter(isBookCoverItem);
    // Regular articles: keep only genuine standalone articles (exclude book covers AND all book chapters)
    const regularArticles = allArticles.filter(a => !isBookCoverItem(a) && !isChapterEntity(a));

    if (regularArticles.length === 0 && bookCovers.length === 0) {
<<<<<<< HEAD
=======
        if (allArticles.length === 0) {
            allArticles = FALLBACK_ARTICLES.map(a => normalizeArticleDoc(a, a.id));
            renderHomeFeed(container);
            return;
        }
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
        renderEmpty("ലേഖനങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല. Admin-ൽ നിന്ന് പുതിയ ലേഖനങ്ങൾ പബ്ലിഷ് ചെയ്യാം.");
        return;
    }

    if (regularArticles.length === 0 && bookCovers.length > 0) {
        container.innerHTML = buildBookShowcaseSection(bookCovers, allArticles);
        attachShowMoreListeners();
        return;
    }

    // Helper: priority comparator (lower priority number = first; tiebreak by creation time desc)
    const comparePriority = (a, b) => {
        const pA = (a.priority !== undefined && a.priority !== null && !isNaN(a.priority)) ? a.priority : 10;
        const pB = (b.priority !== undefined && b.priority !== null && !isNaN(b.priority)) ? b.priority : 10;
        if (pA !== pB) return pA - pB;
        return 0;
    };

    // 1. Group regular articles by explicit Placement or AUTO (No books/chapters!)
    const explicitHero = regularArticles.filter(a => a.placement === "HERO").sort(comparePriority);
    const explicitCarousel = regularArticles.filter(a => a.placement === "CAROUSEL").sort(comparePriority);
    const autoArticles = regularArticles.filter(a => !a.placement || a.placement === "AUTO");

    // Determine Hero Article strictly from regular standalone articles
    let heroArticle = null;
    let usedIds = new Set();

    if (explicitHero.length > 0) {
        heroArticle = explicitHero[0];
        usedIds.add(heroArticle.id);
    } else if (autoArticles.length > 0) {
        heroArticle = autoArticles[0];
        usedIds.add(heroArticle.id);
    } else {
        heroArticle = regularArticles[0];
        usedIds.add(heroArticle.id);
    }

    // 2. Determine Carousel Articles for Top Horizontal Swipe:
    // Pool regular articles marked for CAROUSEL or HERO or recent AUTO (No books/chapters!)
    const carouselPool = [
        ...explicitCarousel,
        heroArticle,
        ...explicitHero.filter(a => a.id !== heroArticle.id),
        ...autoArticles.filter(a => a.id !== heroArticle.id)
    ].filter(Boolean);

    // Deduplicate
    const carouselSeen = new Set();
    const swipeArticles = carouselPool.filter(a => {
        if (carouselSeen.has(a.id)) return false;
        carouselSeen.add(a.id);
        return true;
    }).slice(0, 10);

    // Track used IDs for subsequent sections
    swipeArticles.forEach(a => usedIds.add(a.id));

    let html = '';

    // ════════════════════════════════════════════════════════════════
    // 1. TOP HORIZONTAL SCROLLING CAROUSEL (AS SEEN IN PICTURE)
    // ════════════════════════════════════════════════════════════════
    if (swipeArticles.length > 0) {
        html += buildCarouselSection(swipeArticles);
    }

    // 2. HERO FEATURED MAIN CARD REMOVED AS REQUESTED

    // ════════════════════════════════════════════════════════════════
    // 3. DEDICATED BOOK SECTION
    // ════════════════════════════════════════════════════════════════
    if (bookCovers.length > 0) {
        html += buildBookShowcaseSection(bookCovers, allArticles);
    }

    // ════════════════════════════════════════════════════════════════
    // 4. CATEGORY FEEDS
    // ════════════════════════════════════════════════════════════════
    const existingCats = new Set(regularArticles.map(a => (a.category || "").toUpperCase().trim()).filter(Boolean));
    const orderedCats = [...CATEGORY_ORDER.filter(c => existingCats.has(c)), ...[...existingCats].filter(c => !CATEGORY_ORDER.includes(c) && c !== "BOOKS" && c !== "BOOK" && c !== "PREMIUM BOOK")];

    orderedCats.forEach(cat => {
        const catArticles = regularArticles.filter(a => (a.category || "").toUpperCase().trim() === cat).sort(comparePriority);
        if (catArticles.length === 0) return;

        const theme = getCategoryTheme(cat);
        const featuredArt = catArticles[0];
        const subsequentArticles = catArticles.slice(1, 5);
        const hasMore = catArticles.length > 5;
        const catName = categoryLabel(cat);

        html += `
        <section class="category-section-block category-section-${cat.toLowerCase().replace(/[^a-z0-9-]/g, "-")} mt-7 sm:mt-9 p-4 sm:p-5 rounded-3xl border ${theme.sectionBorder} bg-gradient-to-b ${theme.bgTint}">
            ${buildCategorySectionHeader(cat, hasMore, false, theme)}
            
            <!-- Category Featured Card -->
            <div class="category-featured-wrapper mt-3 mb-3 sm:mb-4">
                ${buildCategoryFeaturedCard(featuredArt, theme)}
            </div>

            <!-- Subsequent Compact Cards -->
            ${subsequentArticles.length > 0 ? `
            <div class="category-cards-list space-y-2.5 sm:space-y-3">
                ${subsequentArticles.map(art => buildCompactRecentCard(art, theme)).join('')}
            </div>
            ` : ''}

            ${hasMore ? `
            <div class="flex justify-end pt-3">
                <button class="show-more-pill" data-category="${escapeHtml(cat)}" title="${escapeHtml(catName)} വിഭാഗത്തിലെ കൂടുതൽ ലേഖനങ്ങൾ കാണുക" style="border-color: ${theme.color}40; color: ${theme.color};">
                    <span class="font-english">VIEW ALL ${catName}</span>
                    <span class="text-xs">&rarr;</span>
                </button>
            </div>
            ` : ''}
        </section>
        `;
    });

    container.innerHTML = html;
    attachShowMoreListeners();
}

function renderCategoryFeed(container, category) {
    const targetNorm = normalizeCategoryName(category).toUpperCase();
    const isBookCover = (a) => ((a.type || "").toUpperCase() === "BOOK" || (a.type || "").toLowerCase() === "free" || (a.type || "").toLowerCase() === "premium" || a.isBook === true) && !isChapterEntity(a);

    const filtered = allArticles.filter(a => {
        if (isBookCover(a)) return false;
        const catNorm = normalizeCategoryName(a.category).toUpperCase();
        return catNorm === targetNorm ||
               categorySlug(catNorm) === categorySlug(targetNorm) ||
               (targetNorm === "HISTORY" && (catNorm === "HISTORY" || catNorm === "ചരിത്രം")) ||
               (targetNorm === "STUDY" && (catNorm === "STUDY" || catNorm === "പഠനം")) ||
               (targetNorm === "STORY" && (catNorm === "STORY" || catNorm === "കഥ"));
    });

    if (filtered.length === 0) {
        renderEmpty(`${category} വിഭാഗത്തിൽ ലേഖനങ്ങൾ ഇപ്പോൾ ലഭ്യമല്ല.`);
        return;
    }

    // Filter indicator banner with 'SHOW ALL' button to return home
    let html = `
    <div class="category-filter-banner flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-white/60 dark:bg-[#12141d]/70 backdrop-blur-md border border-[#ebdccb] dark:border-white/10">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-[#8c7a6b] dark:text-[#94a3b8]">വിഭാഗം:</span>
            <span class="category-glass-badge">
                <span class="font-english text-xs font-black tracking-widest uppercase">${escapeHtml(categoryLabel(category))}</span>
            </span>
            <span class="text-xs text-[#8c7a6b] dark:text-[#94a3b8]">(${filtered.length} ലേഖനങ്ങൾ)</span>
        </div>
        <button class="show-all-home-btn text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] dark:hover:text-white transition flex items-center gap-1 font-english">
            <span>&larr; ALL ARTICLES</span>
        </button>
    </div>
    `;

    // Hero card is the latest article in this category
    html += buildFeaturedCard(filtered[0]);

    if (filtered.length > 1) {
        const rest = filtered.slice(1);
        html += `<div class="category-section-block mt-6">`;
        html += buildCategorySectionHeader(category, false, true);
        html += `<div class="category-cards-list space-y-3 mt-3">`;
        rest.forEach(art => { html += buildCompactRecentCard(art); });
        html += `</div></div>`;
    }

    container.innerHTML = html;

    const showAllBtn = container.querySelector(".show-all-home-btn");
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => switchToCategory("ALL"));
    }
}

/* ─── Category Section Header: glass badge + show-more pill ─── */
function buildCategorySectionHeader(cat, hasMore, isFilteredView = false, theme = null) {
    const label = cat === "ALL" ? "പുതിയ ലേഖനങ്ങൾ" : categoryLabel(cat);
    const safeLabel = escapeHtml(label);
    const t = theme || getCategoryTheme(cat);
    const showMoreBtn = (hasMore && !isFilteredView)
        ? `<button class="show-more-pill" data-category="${escapeHtml(cat)}" title="${safeLabel} വിഭാഗത്തിലെ എല്ലാ ലേഖനങ്ങളും കാണുക" style="border-color: ${t.color}40; color: ${t.color};">
            <span class="font-english">SHOW MORE</span>
            <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
            <span class="text-xs">&rsaquo;</span>
           </button>`
        : ``;

    return `
    <div class="category-section-header flex items-center justify-between mb-2">
        <div class="category-glass-badge border ${t.badgeBorder}">
            <span class="w-2 h-2 rounded-full inline-block flex-shrink-0" style="background-color: ${t.color};"></span>
            <span class="font-english text-xs font-black tracking-wider uppercase ${t.badgeText}">${safeLabel}</span>
        </div>
        ${showMoreBtn}
    </div>`;
}

/* ─── Show-More → switch to category filter ─── */
function attachShowMoreListeners() {
    document.querySelectorAll(".show-more-pill").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const cat = btn.dataset.category;
            switchToCategory(cat);
        });
    });
}

function switchToCategory(cat) {
    if (typeof window.showNuqthaView === "function") {
        window.showNuqthaView("articles");
    }
    const norm = normalizeCategoryName(cat);
    const upper = norm ? norm.toUpperCase() : "ALL";
    currentCategory = upper;
    clearSearch(false);
<<<<<<< HEAD
    renderCategoryNavBar();
=======

    // Update active state on nav links
    const articlesBtn = document.getElementById("articles-dropdown-btn");
    const booksLink = document.getElementById("nav-books-link");
    const isBook = upper === "BOOKS" || upper === "BOOK";

    if (booksLink) booksLink.classList.toggle("active", isBook);
    if (articlesBtn) articlesBtn.classList.toggle("active", !isBook && upper !== "ALL");

    document.querySelectorAll("#category-nav .nav-category-link").forEach(link => {
        const linkCat = (link.dataset.category || "").toUpperCase();
        if (linkCat) {
            link.classList.toggle("active", linkCat === upper);
        }
    });

    // Update page title & URL hash
    if (upper === "ALL") {
        document.title = "NUQTHA | മലയാളം ഇ-മാഗസിൻ";
        if (window.location.hash && window.location.hash !== "#home") {
            try {
                history.pushState(null, "", window.location.pathname + window.location.search);
            } catch (_) {}
        }
    } else {
        const catName = isBook ? "പുസ്തകങ്ങൾ (Books)" : categoryLabel(upper);
        document.title = `${catName} | NUQTHA`;
        const slug = isBook ? "books" : categorySlug(upper);
        const newHash = "#" + slug;
        if (window.location.hash !== newHash) {
            try {
                history.pushState(null, "", newHash);
            } catch (_) {}
        }
    }

>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
    renderFeed();
    // Scroll to top of feed
    const feedEl = document.getElementById("feed-container");
    if (feedEl) feedEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

<<<<<<< HEAD
/* ═══════════ Format Markdown/Rich Text (Bold, Highlight, Subheadings, Inline Images, Highlight Cards) ═══════════ */
function formatRichContent(rawText, contentStyle) {
    if (!rawText) return "";
    return rawText
        .split("\n\n")
        .filter(p => p.trim())
=======
window.switchToCategory = switchToCategory;
window.filterBySavedArticles = function() {
    switchToCategory("SAVED");
};

/* ═══════════ Format Markdown/Rich Text (Render helper only) ═══════════ */
function formatRichContent(rawText, contentStyle = "") {
    if (!rawText || typeof rawText !== "string") return "";

    // 1. Clean Rendering: Collapse 3+ line breaks to standard double line break
    let cleaned = rawText
        .trim()
        .replace(/(?:\r?\n){3,}/g, "\n\n")
        .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");

    // 2. Strip clashing inline styles (font-size, color, font-family, line-height, text-align: justify)
    // while strictly keeping classes like text-marker, font-black, highlight-glass-card
    cleaned = cleaned.replace(/style\s*=\s*(["'])(.*?)\1/gi, (match, quote, styleStr) => {
        const kept = styleStr
            .split(";")
            .map(s => s.trim())
            .filter(rule => {
                if (!rule) return false;
                const lower = rule.toLowerCase();
                if (lower.startsWith("font-size") ||
                    lower.startsWith("font-family") ||
                    lower.startsWith("line-height") ||
                    lower.startsWith("color") ||
                    lower.includes("text-align: justify") ||
                    lower.includes("text-align:justify")) {
                    return false;
                }
                return true;
            })
            .join("; ");
        return kept ? `style="${kept}"` : "";
    });

    const paragraphs = cleaned
        .split(/\r?\n\r?\n/)
        .map(p => p.trim())
        .filter(p => {
            if (!p) return false;
            // Filter out empty HTML paragraphs like <p></p> or <p>&nbsp;</p>
            const stripped = p.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, "").trim();
            if (!stripped && !p.includes("<img") && !p.includes("![") && !p.includes(":::")) return false;
            return true;
        });

    return paragraphs
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
        .map(paragraph => {
            const p = paragraph.trim();

            // Dedicated Highlight Card Callout: :::highlight ... ::: or > [!NOTE]
            if (p.startsWith(":::highlight") && p.endsWith(":::")) {
                const inner = p.replace(/^:::highlight\s*/, "").replace(/\s*:::$/, "").trim();
                const formattedInner = escapeHtml(inner)
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black">$1</strong>')
                    .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');
                return `<div class="highlight-glass-card"><p>${formattedInner}</p></div>`;
            }

            // Subheadings: H2 (## ) and H3 (### )
            if (p.startsWith("## ")) {
<<<<<<< HEAD
                return `<h2 class="article-h2">${escapeHtml(p.replace("## ", ""))}</h2>`;
            }
            if (p.startsWith("### ")) {
                return `<h3 class="article-h3">${escapeHtml(p.replace("### ", ""))}</h3>`;
=======
                return `<h2 class="article-h2 text-xl font-bold mt-6 mb-2 text-[var(--text)] dark:text-white">${p.replace("## ", "")}</h2>`;
            }
            if (p.startsWith("### ")) {
                return `<h3 class="article-h3 text-lg font-bold mt-4 mb-2 text-[var(--text)] dark:text-white">${p.replace("### ", "")}</h3>`;
            }

            // Editorial Blockquote
            if (p.startsWith("> ")) {
                const quoteText = p.replace(/^>\s*/, "").trim()
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black">$1</strong>')
                    .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');
                return `<blockquote class="editorial-quote"><p>${quoteText}</p></blockquote>`;
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
            }

            // Inline Image with Layout/Size: ![caption|size](url) or ![caption](url)
            const imgMatch = p.match(/^!\[(.*?)(?:\|(small|medium|full))?\]\((.*?)\)$/);
            if (imgMatch) {
                const caption = imgMatch[1] || "";
                const url = imgMatch[3];
<<<<<<< HEAD
                if (!/^https?:\/\//i.test(url) && !/^data:image\/(jpeg|png|webp);base64,/i.test(url)) return "";
                const sizeClass = size === "small" ? "img-small" : size === "medium" ? "img-medium" : "img-full";
                return `
                    <div class="article-img-wrap ${sizeClass}">
                        <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}">
                        ${caption && caption !== "ചിത്രം" ? `<div class="article-img-caption">${escapeHtml(caption)}</div>` : ''}
                    </div>
=======
                return `
                    <figure class="article-image-wrap my-6">
                        <img src="${url}" alt="${caption}" class="w-full h-auto rounded-2xl mx-auto block" loading="lazy">
                        ${caption && caption !== "ചിത്രം" ? `<figcaption class="p-2 text-center text-xs text-[#8c7a6b] dark:text-[#94a3b8]">${caption}</figcaption>` : ''}
                    </figure>
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
                `;
            }

            // Parse bold (**text**) and highlight (==text==)
<<<<<<< HEAD
            let formatted = escapeHtml(p)
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-[#1e1b18] dark:text-white">$1</strong>')
                .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');

            return `<p class="text-base sm:text-lg leading-relaxed mb-4" ${contentStyle}>${formatted}</p>`;
=======
            let formatted = p
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-[var(--text)] dark:text-white">$1</strong>')
                .replace(/==(.*?)==/g, '<mark class="text-marker">$1</mark>');

            return `<p class="reading-p" ${contentStyle || ""}>${formatted}</p>`;
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
        })
        .join("");
}

/* ═══════════ Helper: Strip Markdown Artifacts ═══════════ */
function stripMarkdown(text) {
    if (!text || typeof text !== "string") return "";
    return text
        .replace(/:::highlight[\s\S]*?:::/g, "")
        .replace(/!\[.*?\](?:\(.*?\))?/g, "")
        .replace(/==(.*?)==/g, "$1")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/>\s+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/* ═══════════ Category Theme Helper & Subtle Variations ═══════════ */
function getCategoryTheme(cat) {
    const c = (cat || "").toUpperCase();
    if (c === "HISTORY") {
        return {
            color: "#b4532c",
            darkColor: "#f87171",
            sectionBorder: "border-[#b4532c]/25 dark:border-[#b4532c]/30",
            cardBorder: "border-[#b4532c]/25 dark:border-[#b4532c]/30 hover:border-[#b4532c]/50",
            bgTint: "from-[#b4532c]/[0.03] to-transparent dark:from-[#b4532c]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#b4532c]/10 dark:bg-[#b4532c]/20",
            badgeText: "text-[#b4532c] dark:text-[#f87171]",
            badgeBorder: "border-[#b4532c]/30 dark:border-[#b4532c]/40",
            accentGrad: "from-[#b4532c] via-[#aa4923] to-[#7c2d12]"
        };
    } else if (c === "STUDY") {
        return {
            color: "#1d4ed8",
            darkColor: "#60a5fa",
            sectionBorder: "border-[#1d4ed8]/25 dark:border-[#3b82f6]/30",
            cardBorder: "border-[#1d4ed8]/25 dark:border-[#3b82f6]/30 hover:border-[#1d4ed8]/50",
            bgTint: "from-[#1d4ed8]/[0.03] to-transparent dark:from-[#1d4ed8]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#1d4ed8]/10 dark:bg-[#1d4ed8]/20",
            badgeText: "text-[#1d4ed8] dark:text-[#60a5fa]",
            badgeBorder: "border-[#1d4ed8]/30 dark:border-[#1d4ed8]/40",
            accentGrad: "from-[#1e40af] via-[#1d4ed8] to-[#172554]"
        };
    } else if (c === "STORY") {
        return {
            color: "#059669",
            darkColor: "#34d399",
            sectionBorder: "border-[#059669]/25 dark:border-[#10b981]/30",
            cardBorder: "border-[#059669]/25 dark:border-[#10b981]/30 hover:border-[#059669]/50",
            bgTint: "from-[#059669]/[0.03] to-transparent dark:from-[#059669]/[0.05] dark:to-transparent",
            badgeBg: "bg-[#059669]/10 dark:bg-[#059669]/20",
            badgeText: "text-[#059669] dark:text-[#34d399]",
            badgeBorder: "border-[#059669]/30 dark:border-[#059669]/40",
            accentGrad: "from-[#047857] via-[#059669] to-[#064e3b]"
        };
    }
    // Dynamic / General Fallback
    return {
        color: "#b4532c",
        darkColor: "#f87171",
        sectionBorder: "border-[#ebdccb] dark:border-white/10",
        cardBorder: "border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c]/40",
        bgTint: "from-white/40 to-transparent dark:from-white/[0.02] dark:to-transparent",
        badgeBg: "bg-[#b4532c]/10 dark:bg-[#b4532c]/20",
        badgeText: "text-[#b4532c] dark:text-[#f87171]",
        badgeBorder: "border-[#ebdccb] dark:border-white/20",
        accentGrad: "from-[#b8542c] to-[#803113]"
    };
}

/* ═══════════ Category Featured Card (Larger & More Prominent) ═══════════ */
function buildCategoryFeaturedCard(art, theme = null) {
    const t = theme || getCategoryTheme(art.category);
    const dateStr = escapeHtml(art.date || formatDate(art.createdAt));
    const cleanTitle = escapeHtml(stripMarkdown(art.title));
    const rawPreview = art.excerpt || (art.content ? art.content.substring(0, 160) : "");
    const cleanPreview = escapeHtml(stripMarkdown(rawPreview));
    const preview = cleanPreview.substring(0, 150) + (cleanPreview.length > 150 ? "…" : "");
    const titleStyle = art.titleColor ? `style="color: ${getThemeSafeTextColor(art.titleColor)};"` : '';
    const contentStyle = art.contentColor ? `style="color: ${getThemeSafeTextColor(art.contentColor)};"` : '';

    const authorName = escapeHtml(art.author || "NUQTHA");
    const authorInitial = escapeHtml((art.author || "NUQTHA").trim().charAt(0) || "N");
    const categoryMalayalam = escapeHtml(categoryLabel(art.category));

    return `
    <article class="category-featured-card group cursor-pointer hover:shadow-xl transition-all duration-300 ${t.cardBorder}" data-id="${escapeHtml(art.id)}">
        <a href="article.html?id=${encodeURIComponent(art.id)}" class="block">
            <!-- Large Prominent Cover Image -->
            <div class="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden bg-gradient-to-br ${t.accentGrad}">
                ${art.imageUrl ? `
                    <img src="${escapeHtml(art.imageUrl)}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90">
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                `}
                <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"></div>
                <!-- Floating Category Badge -->
                <div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/20 shadow-sm font-english">
                        <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${t.color};"></span>
                        FEATURED · ${categoryMalayalam}
                    </span>
                </div>
                <!-- Floating Date -->
                <div class="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/50 backdrop-blur-md text-white/90 border border-white/10 font-english">
                        ${dateStr}
                    </span>
                </div>
            </div>

            <!-- Content Area with Bolder Typography -->
            <div class="p-4 sm:p-6 space-y-2.5 sm:space-y-3">
                <h3 class="text-xl sm:text-2xl md:text-[1.65rem] font-black text-[#1e1b18] dark:text-white leading-snug tracking-tight group-hover:text-[${t.color}] transition-colors" ${titleStyle}>
                    ${cleanTitle}
                </h3>

                ${preview ? `
                <p class="text-xs sm:text-sm text-[#5a4b41] dark:text-[#cbd5e1] line-clamp-2 sm:line-clamp-3 leading-relaxed" ${contentStyle}>
                    ${preview}
                </p>
                ` : ''}

                <!-- Author & CTA Row -->
                <div class="flex items-center justify-between pt-3 border-t border-[#ebdccb]/60 dark:border-white/10 gap-2 flex-wrap">
                    <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center flex-shrink-0">
                            ${authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[10px] sm:text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 ${escapeHtml(art.transcription)}</span>` : ''}
                        </div>
                    </div>

                    <div class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold font-english text-white shadow-sm transition-all group-hover:shadow-md" style="background-color: ${t.color};">
                        <span>വായിക്കുക</span>
                        <span class="text-xs">&rarr;</span>
                    </div>
                </div>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ 1. Featured Article Card (Reference Design) ═══════════ */
function buildFeaturedCard(art) {
    const dateStr = escapeHtml(art.date || formatDate(art.createdAt));
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
    const cleanTitle = escapeHtml(stripMarkdown(art.title));
    const rawPreview = art.excerpt || (art.content ? art.content.substring(0, 160) : "");
    const cleanPreview = escapeHtml(stripMarkdown(rawPreview));
    const preview = cleanPreview.substring(0, 160) + (cleanPreview.length > 160 ? "…" : "");
    const titleStyle = art.titleColor ? `style="color: ${getThemeSafeTextColor(art.titleColor)};"` : '';
    const contentStyle = art.contentColor ? `style="color: ${getThemeSafeTextColor(art.contentColor)};"` : '';

    const authorName = escapeHtml(art.author || "NUQTHA");
    const authorInitial = escapeHtml((art.author || "NUQTHA").trim().charAt(0) || "N");

    const categoryMalayalam = escapeHtml(categoryLabel(art.category));

    return `
    <article class="featured-article-card group cursor-pointer hover:shadow-2xl transition-all duration-300" data-id="${escapeHtml(art.id)}">
        <a href="article.html?id=${encodeURIComponent(art.id)}" class="block">
            <!-- Large Top Cover Image Container -->
            <div class="featured-cover-container relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-gradient-to-br from-[#b8542c] via-[#aa4923] to-[#803113]">
                ${art.imageUrl ? `
                    <img src="${escapeHtml(art.imageUrl)}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
                ` : `
                    <div class="w-full h-full flex flex-col items-center justify-center p-6 text-white/90">
                        <div class="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-2 border border-white/20">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                        </div>
                        <span class="text-xs font-bold uppercase tracking-widest text-white/80 font-english">${categoryMalayalam}</span>
                    </div>
                `}
            </div>

            <!-- Content Details Area -->
            <div class="featured-card-body p-6 sm:p-8 space-y-4">
                <!-- Category Pill & Date / Read Time Row -->
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <span class="featured-category-pill">
                        ${categoryMalayalam}
                    </span>
                    <span class="text-xs text-[#8c7a6b] dark:text-[#a0aec0] font-medium font-['Noto_Sans_Malayalam']">
                        ${dateStr}
                    </span>
                </div>

                <!-- Bold Title -->
                <h2 class="featured-title text-2xl sm:text-3xl font-black leading-snug tracking-tight hover:text-[#b4532c] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${cleanTitle}
                </h2>

                <!-- Excerpt text -->
                <p class="featured-excerpt text-sm sm:text-base leading-relaxed line-clamp-3 text-[#5a4b41] dark:text-[#cbd5e1]" ${contentStyle}>
                    ${preview}
                </p>

                <!-- Bottom Row: Author profile & Sleek 'വായിക്കുക →' Button -->
                <div class="featured-bottom-row flex items-center justify-between pt-4 border-t border-[#ebdccb]/60 dark:border-white/10 gap-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-full bg-[#ebdccb]/80 dark:bg-white/10 text-[#7a4124] dark:text-[#f8fafc] font-black text-xs flex items-center justify-center">
                            ${authorInitial}
                        </div>
                        <div class="flex flex-col">
                            <span class="text-xs sm:text-sm font-bold text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                                ${authorName}
                            </span>
                            ${art.transcription ? `<span class="text-[11px] font-semibold text-[#8c7a6b] dark:text-[#cbd5e1] font-['Noto_Sans_Malayalam']">📝 കേട്ടെഴുത്ത്: ${escapeHtml(art.transcription)}</span>` : ''}
                        </div>
                    </div>

                    <div class="featured-read-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#b4532c] text-white text-xs sm:text-sm font-bold shadow-md hover:bg-[#923e1b] transition-all group-hover:shadow-lg">
                        <span>വായിക്കുക</span>
                        <span class="text-base">&rarr;</span>
                    </div>
                </div>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ 2. Compact Horizontal Recent Article Card ═══════════ */
function buildCompactRecentCard(art, theme = null) {
    const dateStr = escapeHtml(art.date || formatDate(art.createdAt));
    const words = (art.content || "").length;
    const readMin = Math.max(1, Math.round(words / 400));
    const cleanTitle = escapeHtml(stripMarkdown(art.title));
    const titleStyle = art.titleColor ? `style="color: ${getThemeSafeTextColor(art.titleColor)};"` : '';

    const categoryMalayalam = escapeHtml(categoryLabel(art.category));
    const authorName = escapeHtml(art.author || "NUQTHA");
    const t = theme || getCategoryTheme(art.category);

    return `
    <article class="compact-recent-card group cursor-pointer hover:shadow-lg transition-all duration-300 ${t.cardBorder}" data-id="${escapeHtml(art.id)}">
        <a href="article.html?id=${encodeURIComponent(art.id)}" class="flex items-center p-3 sm:p-4 gap-3.5 sm:gap-4 w-full">
            <!-- Left Thumbnail -->
            <div class="compact-thumbnail-wrap w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br ${t.accentGrad}">
                ${art.imageUrl ? `
                    <img src="${escapeHtml(art.imageUrl)}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
                ` : `
                    <div class="w-full h-full flex items-center justify-center text-white/70 text-[10px]">
                        ചിത്രം
                    </div>
                `}
            </div>

            <!-- Right Details -->
            <div class="flex-1 min-w-0 space-y-1 sm:space-y-1.5">
                <span class="text-[11px] font-bold ${t.badgeText} uppercase font-['Noto_Sans_Malayalam'] tracking-wide">
                    [${categoryMalayalam}]
                </span>

                <h4 class="text-sm sm:text-base font-extrabold line-clamp-2 leading-snug group-hover:text-[${t.color}] transition-colors" ${titleStyle || 'style="color: #1e1b18;"'}>
                    ${cleanTitle}
                </h4>

                <div class="flex items-center gap-1.5 text-[11px] sm:text-xs flex-wrap font-['Noto_Sans_Malayalam']">
                    <span class="font-bold text-[#1e1b18] dark:text-white">${authorName}</span>
                    ${art.transcription ? `<span class="text-[#8c7a6b] dark:text-[#a0aec0]">(📝 ${escapeHtml(art.transcription)})</span>` : ''}
                    <span class="text-[#8c7a6b] dark:text-[#a0aec0]">• ${dateStr}</span>
                </div>
            </div>
        </a>
    </article>
    `;
}

/* ═══════════ Backward Compatibility buildCard ═══════════ */
function buildCard(art) {
    return buildFeaturedCard(art);
}

/* ═══════════ Full-Width Auto-Play Banner Carousel ═══════════ */
function buildBannerCarousel(articles) {
    if (!articles || articles.length === 0) return '';

    const slides = articles.map((art, i) => {
        const dateStr = art.date || formatDate(art.createdAt);
        const catLabel = categoryLabel(art.category);
        const cleanTitle = stripMarkdown(art.title);
        const rawExcerpt = art.excerpt || (art.content ? art.content.substring(0, 160) : '');
        const cleanExcerpt = stripMarkdown(rawExcerpt);
        const excerpt = cleanExcerpt.substring(0, 130) + (cleanExcerpt.length > 130 ? '…' : '');
        const authorName = art.author || "NUQTHA";
        let bgStyle = 'background: linear-gradient(135deg, #b8542c 0%, #803113 100%);';
        if (art.imageUrl) {
            bgStyle = 'background-image: url("' + art.imageUrl + '"); background-size: cover; background-position: center;';
        }

        return '<div class="banner-slide' + activeClass + '" data-index="' + i + '" data-id="' + art.id + '">' +
            '<div class="banner-slide-bg" style="' + bgStyle + '"></div>' +
            '<div class="banner-slide-overlay"></div>' +
            '<a href="article.html?id=' + art.id + '" class="banner-slide-content" draggable="false">' +
                '<span class="banner-cat-pill">' + catLabel + '</span>' +
                '<h2 class="banner-slide-title">' + cleanTitle + '</h2>' +
                (excerpt ? '<p class="banner-slide-excerpt">' + excerpt + '</p>' : '') +
                '<div class="banner-slide-meta flex items-center gap-2">' +
                    '<span class="font-bold text-[#1e1b18] dark:text-white">' + authorName + '</span>' +
                    '<span>· ' + dateStr + '</span>' +
                    '<span class="banner-read-btn">വായിക്കുക &rarr;</span>' +
                '</div>' +
            '</a>' +
        '</div>';
    }).join('');

    const dots = articles.map((_, i) =>
        '<button class="banner-dot' + (i === 0 ? ' banner-dot--active' : '') + '" data-slide="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>'
    ).join('');

    return '<div class="banner-carousel" id="banner-carousel" role="region" aria-label="Featured Articles Banner">' +
        '<div class="banner-slides-track" id="banner-track">' + slides + '</div>' +
        '<button class="banner-arrow banner-arrow--prev" id="banner-prev" aria-label="Previous slide">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>' +
        '</button>' +
        '<button class="banner-arrow banner-arrow--next" id="banner-next" aria-label="Next slide">' +
            '<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>' +
        '</button>' +
        '<div class="banner-progress-bar" id="banner-progress"></div>' +
        '<div class="banner-dots" id="banner-dots">' + dots + '</div>' +
    '</div>';
}

/* ═══════════ Legacy Horizontal Swipe Carousel (kept for backward compat) ═══════════ */
function buildCarouselSection(articles) {
    if (!articles || articles.length === 0) return '';
    const cards = articles.map(art => buildCarouselCard(art)).join('');
    return '<div class="carousel-section">' +
        '<div class="carousel-section-header">' +
            '<div class="carousel-nav-btns" style="margin-left: auto;">' +
                '<button class="carousel-nav-btn" id="carousel-prev" aria-label="Previous">' +
                    '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>' +
                '</button>' +
                '<button class="carousel-nav-btn" id="carousel-next" aria-label="Next">' +
                    '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="carousel-scroll-wrapper">' +
            '<div class="carousel-scroll-track" id="carousel-track">' + cards + '</div>' +
        '</div>' +
        '<div class="carousel-dots" id="carousel-dots"></div>' +
    '</div>';
}

function buildCarouselCard(art) {
    const dateStr = art.date || formatDate(art.createdAt);
    const titleStyle = art.titleColor ? 'style="color: ' + art.titleColor + ';"' : '';
    const catLabel = categoryLabel(art.category);
    const cleanTitle = stripMarkdown(art.title);
    const authorName = art.author || "NUQTHA";

<<<<<<< HEAD
    const imgHtml = art.imageUrl
        ? '<img src="' + art.imageUrl + '" alt="' + cleanTitle + '" class="carousel-card-img" loading="lazy">'
        : '<div class="carousel-card-img-placeholder"><svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.45)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>';
=======
    const cardImg = art.thumbnailUrl || art.ogImage || art.imageUrl || art.coverImage;
    const imgHtml = cardImg
        ? '<img src="' + cardImg + '" alt="' + cleanTitle + '" class="carousel-card-img" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';"><div class="carousel-card-img-placeholder" style="display:none; background: linear-gradient(135deg, #2a201c, #4a3328); align-items:center; justify-content:center; color:rgba(255,255,255,0.7); font-weight:bold; font-size:12px;"><span style=\"font-family: \'Anek Malayalam\', sans-serif;\">' + escapeHtml(catLabel || 'ലേഖനം') + '</span></div>'
        : '<div class="carousel-card-img-placeholder" style="background: linear-gradient(135deg, #2a201c, #4a3328); display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.7); font-weight:bold; font-size:12px;"><span style=\"font-family: \'Anek Malayalam\', sans-serif;\">' + escapeHtml(catLabel || 'ലേഖനം') + '</span></div>';
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17

    return '<a href="article.html?id=' + art.id + '" class="carousel-card" data-id="' + art.id + '">' +
        imgHtml +
        '<div class="carousel-card-body">' +
            '<span class="carousel-card-cat">' + catLabel + '</span>' +
            '<h4 class="carousel-card-title" ' + titleStyle + '>' + cleanTitle + '</h4>' +
            '<p class="carousel-card-meta font-bold text-[#1e1b18] dark:text-white">' + authorName + '</p>' +
            '<p class="carousel-card-meta">' + dateStr + '</p>' +
        '</div>' +
    '</a>';
}

/* ═══════════ Auto-Play Banner Setup (called after renderFeed) ═══════════ */
let bannerAutoPlayTimer = null;

function setupBannerCarousel() {
    const banner = document.getElementById('banner-carousel');
    if (!banner) return;

    // Clear any previous interval when re-rendering
    if (bannerAutoPlayTimer) {
        clearInterval(bannerAutoPlayTimer);
        bannerAutoPlayTimer = null;
    }

    const slides = Array.from(banner.querySelectorAll('.banner-slide'));
    const dots = Array.from(banner.querySelectorAll('.banner-dot'));
    const prevBtn = document.getElementById('banner-prev');
    const nextBtn = document.getElementById('banner-next');
    const progressBar = document.getElementById('banner-progress');
    if (slides.length === 0) return;

    // Single slide: no need for controls, progress bar, or auto-advance
    if (slides.length <= 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (progressBar) progressBar.style.display = 'none';
        const dotsWrap = document.getElementById('banner-dots');
        if (dotsWrap) dotsWrap.style.display = 'none';
        return;
    }

    let currentIndex = 0;
    const INTERVAL = 4200; // 4.2 seconds for comfortable reading

    function goTo(index, direction = 'next') {
        const prev = currentIndex;
        currentIndex = (index + slides.length) % slides.length;

        slides[prev].classList.remove('banner-slide--active', 'banner-slide--exit-left', 'banner-slide--exit-right');
        slides[currentIndex].classList.remove('banner-slide--enter-left', 'banner-slide--enter-right');

        // Set enter direction class before making active
        if (direction === 'next') {
            slides[currentIndex].classList.add('banner-slide--enter-right');
        } else {
            slides[currentIndex].classList.add('banner-slide--enter-left');
        }

        // Force reflow for animation restart
        slides[currentIndex].getBoundingClientRect();

        // Remove enter class and activate (triggers CSS transition)
        slides[currentIndex].classList.remove('banner-slide--enter-right', 'banner-slide--enter-left');
        slides[prev].classList.add(direction === 'next' ? 'banner-slide--exit-left' : 'banner-slide--exit-right');
        slides[currentIndex].classList.add('banner-slide--active');

        // Clean up exit class after animation finishes
        setTimeout(() => {
            slides[prev].classList.remove('banner-slide--exit-left', 'banner-slide--exit-right');
        }, 620);

        // Update dots
        dots.forEach((d, i) => d.classList.toggle('banner-dot--active', i === currentIndex));

        // Restart progress bar
        restartProgress();
    }

    function goNext() { goTo(currentIndex + 1, 'next'); }
    function goPrev() { goTo(currentIndex - 1, 'prev'); }

    function restartProgress() {
        if (!progressBar) return;
        progressBar.style.transition = 'none';
        progressBar.style.width = '0%';
        progressBar.getBoundingClientRect();
        progressBar.style.transition = `width ${INTERVAL}ms linear`;
        progressBar.style.width = '100%';
    }

    function startAutoPlay() {
        stopAutoPlay();
        bannerAutoPlayTimer = setInterval(goNext, INTERVAL);
        restartProgress();
    }

    function stopAutoPlay() {
        if (bannerAutoPlayTimer) {
            clearInterval(bannerAutoPlayTimer);
            bannerAutoPlayTimer = null;
        }
        if (progressBar) {
            progressBar.style.transition = 'none';
        }
    }

    // Arrow buttons
    if (prevBtn) prevBtn.addEventListener('click', () => { goPrev(); startAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { goNext(); startAutoPlay(); });

    // Dot clicks
    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            const dir = i > currentIndex ? 'next' : 'prev';
            goTo(i, dir);
            startAutoPlay();
        });
    });

    // Pause on hover / touch
    banner.addEventListener('mouseenter', stopAutoPlay);
    banner.addEventListener('mouseleave', startAutoPlay);
    banner.addEventListener('touchstart', stopAutoPlay, { passive: true });
    banner.addEventListener('touchend', () => setTimeout(startAutoPlay, 1200), { passive: true });

    // Touch / swipe support
    let touchStartX = 0;
    banner.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    banner.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 48) {
            if (dx < 0) goNext(); else goPrev();
            startAutoPlay();
        }
    }, { passive: true });

    // Start auto-play
    startAutoPlay();
}

function setupCarousel() {
    const track = document.getElementById('carousel-track');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const dotsContainer = document.getElementById('carousel-dots');
    if (!track) return;

    const cards = Array.from(track.querySelectorAll('.carousel-card'));
    if (cards.length === 0) return;

    // Staggered entrance via IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('carousel-visible');
                observer.unobserve(entry.target);
                setTimeout(() => { entry.target.style.transitionDelay = '0ms'; }, 700);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });

    cards.forEach((card, i) => {
        card.style.transitionDelay = `${i * 65}ms`;
        observer.observe(card);
    });

    if (dotsContainer) {
        dotsContainer.innerHTML = '';
        cards.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => scrollToCard(i));
            dotsContainer.appendChild(dot);
        });
    }

    function getCardStride() {
        const card = track.querySelector('.carousel-card');
        if (!card) return 240;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.gap) || 14;
        return card.getBoundingClientRect().width + gap;
    }

    function scrollToCard(index) {
        track.scrollTo({ left: index * getCardStride(), behavior: 'smooth' });
    }

    function updateDots() {
        if (!dotsContainer) return;
        const index = Math.round(track.scrollLeft / getCardStride());
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) =>
            d.classList.toggle('active', i === index)
        );
    }

    if (prevBtn) prevBtn.addEventListener('click', () => track.scrollBy({ left: -getCardStride() * 2, behavior: 'smooth' }));
    if (nextBtn) nextBtn.addEventListener('click', () => track.scrollBy({ left: getCardStride() * 2, behavior: 'smooth' }));
    track.addEventListener('scroll', updateDots, { passive: true });

    // Auto-scroll every 3 seconds (3000ms) with smooth step
    let autoScrollInterval = null;
    const AUTO_INTERVAL = 3000;

    function startAutoScroll() {
        stopAutoScroll();
        if (cards.length <= 1) return;
        autoScrollInterval = setInterval(() => {
            const stride = getCardStride();
            const maxScroll = track.scrollWidth - track.clientWidth;
            if (track.scrollLeft >= maxScroll - 10) {
                // Loop back to start smoothly
                track.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                track.scrollBy({ left: stride, behavior: 'smooth' });
            }
        }, AUTO_INTERVAL);
    }

    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }

    // Pause on hover & touch
    track.addEventListener('mouseenter', stopAutoScroll);
    track.addEventListener('mouseleave', startAutoScroll);
    track.addEventListener('touchstart', stopAutoScroll, { passive: true });
    track.addEventListener('touchend', () => setTimeout(startAutoScroll, 1500), { passive: true });

    // Desktop Mouse Drag to Scroll with Click Protection
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let moved = false;

    track.addEventListener('mousedown', (e) => {
        isDown = true;
        moved = false;
        stopAutoScroll();
        track.classList.add('is-dragging');
        startX = e.pageX - track.offsetLeft;
        scrollStart = track.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        track.classList.remove('is-dragging');
        startAutoScroll();
    });

    track.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - track.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) moved = true;
        track.scrollLeft = scrollStart - walk;
    });

    // Prevent navigation click when dragging
    track.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Start auto-scroll initially
    startAutoScroll();
}

/* ═══════════ Interactive Book / Article Series Widget ═══════════ */
function buildBookWidget(seriesName, articles) {
    if (!articles || articles.length === 0) return '';
    const totalCount = articles.length;

    const itemsHtml = articles.map((art, idx) => {
        const titleStyle = art.titleColor ? `style="color: ${getThemeSafeTextColor(art.titleColor)};"` : '';
        const dateStr = escapeHtml(art.date || formatDate(art.createdAt));
        return `
        <a href="article.html?id=${encodeURIComponent(art.id)}" class="playlist-item-row group/row" data-id="${escapeHtml(art.id)}">
            <div class="playlist-index-badge">
                <span>0${idx + 1}</span>
            </div>
            <div class="playlist-item-info min-w-0 flex-1">
                <h5 class="playlist-item-title line-clamp-1 group-hover/row:text-[#b4532c] dark:group-hover/row:text-[#f87171] transition-colors" ${titleStyle}>
                    ${escapeHtml(art.title)}
                </h5>
                <div class="flex items-center gap-2 text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                    <span>${escapeHtml(categoryLabel(art.category))}</span>
                    <span>•</span>
                    <span>${dateStr}</span>
                </div>
            </div>
            <div class="playlist-play-icon text-[#b4532c] dark:text-[#f87171] opacity-70 group-hover/row:opacity-100 group-hover/row:translate-x-1 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </div>
        </a>
        `;
    }).join('');

    return `
    <div class="playlist-glass-card mt-7 mb-3 overflow-hidden" data-playlist="${escapeHtml(seriesName)}">
        <div class="playlist-header flex items-center justify-between p-4 sm:p-5 border-b border-[#ebdccb]/60 dark:border-white/10">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 font-black">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                </div>
                <div>
                    <span class="text-[10px] font-black tracking-widest uppercase font-english text-blue-600 dark:text-blue-400">SERIES / COLLECTION</span>
                    <h3 class="text-base sm:text-lg font-black text-[#1e1b18] dark:text-[#f8fafc] font-['Manjari',sans-serif] leading-tight">
                                ${escapeHtml(seriesName)}
                    </h3>
                </div>
            </div>
            <div class="playlist-count-pill font-english text-xs font-bold px-3 py-1 rounded-full bg-white/70 dark:bg-white/10 text-blue-600 dark:text-blue-400 border border-[#ebdccb] dark:border-white/15">
                ${totalCount} Articles
            </div>
        </div>
        <div class="playlist-items-list p-3 sm:p-4 space-y-2">
            ${itemsHtml}
        </div>
    </div>
    `;
}

/* ═══════════ Book / Edition Collection Card (Risala Update Style) ═══════════ */
function buildBookCard(book, articles) {
    const cleanTitle = escapeHtml(stripMarkdown(book.title));
    const count = articles.length;
    const dateStr = escapeHtml(book.date || formatDate(book.createdAt));
    const safeId = escapeHtml(book.id);
    const safeImageUrl = escapeHtml(book.imageUrl || "");

    return `
    <div class="book-glass-card group cursor-pointer overflow-hidden transition-all duration-300 flex flex-col" data-id="${safeId}">
        <!-- Cover Image Container (Vertical Magazine Style) -->
        <div class="relative w-full aspect-[3/4] overflow-hidden bg-[#1e1b18]">
            ${book.imageUrl ? `
                <img src="${safeImageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105">
            ` : `
                <div class="w-full h-full flex items-center justify-center text-white/50 text-xl font-bold">📘</div>
            `}
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
        </div>
        <!-- Bottom Risala-Style Banner -->
        <div class="bg-[#b4532c] text-white p-4 text-center space-y-1 group-hover:bg-[#923e1b] transition-colors">
            <h3 class="text-sm sm:text-base font-bold tracking-tight font-['Anek_Malayalam']">
                ${cleanTitle}
            </h3>
            <p class="text-[11px] text-white/90 font-english uppercase tracking-wider font-bold">
                Volume 15 • ${count} Articles
            </p>
        </div>
    </div>
    `;
}

/* ═══════════ Attach Click → Direct Navigation ═══════════ */
function attachCardListeners() {
    document.querySelectorAll(".featured-article-card, .category-featured-card, .compact-recent-card, .carousel-card, .playlist-item-row, .article-glass-card, .book-glass-card").forEach(card => {
        card.addEventListener("click", function (e) {
            // Direct navigation to article.html
            const id = this.dataset.id;
            const art = allArticles.find(a => a.id === id);
            if (id && !e.target.closest("button") && !e.target.closest("a")) {
                if (art && ((art.type || "").toUpperCase() === "BOOK" || art.isBook === true)) {
                    // Open Book index page/modal
                    openBookIndex(art);
                } else {
                    window.location.href = `article.html?id=${id}`;
                }
            }
        });
    });
}

function openBookIndex(book) {
    // We can use the existing full screen reader to show a "Book Index"
    // Or just redirect to article.html which will handle showing the index if it's a BOOK type
    window.location.href = `article.html?id=${encodeURIComponent(book.id)}`;
}

/* ═══════════ Empty State ═══════════ */
function renderEmpty(message) {
    const container = document.getElementById("feed-container");
    if (!container) return;
    container.innerHTML = `
    <div class="article-glass-card p-10 sm:p-14 text-center cursor-default hover:transform-none" style="cursor: default;">
        <div class="w-14 h-14 rounded-full bg-[#b4532c]/10 text-[#b4532c] flex items-center justify-center mx-auto mb-5">
            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>
        </div>
        <p class="text-lg font-bold text-[#4a3b32] mb-2">${escapeHtml(message)}</p>
    </div>`;
}

/* ═══════════ Option 2: Full Screen Reader Overlay ═══════════ */
window.openFullScreenReader = function(id) {
    const art = allArticles.find(a => a.id === id);
    if (!art) return;
    window.currentActiveArticle = art;

    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (!overlay) return;

    const readerTitleEl = document.getElementById("reader-title");
    readerTitleEl.textContent = art.title;
    if (art.titleColor) {
        readerTitleEl.style.color = getThemeSafeTextColor(art.titleColor);
    } else {
        readerTitleEl.style.color = '';
    }

    document.getElementById("reader-category").textContent = categoryLabel(art.category);
    document.getElementById("reader-author").textContent = art.author || "NUQTHA";

    const transContainer = document.getElementById("reader-transcription-container");
    const transEl = document.getElementById("reader-transcription");
    if (transContainer && transEl) {
        if (art.transcription) {
            transEl.textContent = art.transcription;
            transContainer.classList.remove("hidden");
        } else {
            transContainer.classList.add("hidden");
        }
    }

    document.getElementById("reader-date").textContent = art.date || formatDate(art.createdAt);

    const contentColorStyle = art.contentColor ? `style="color: ${getThemeSafeTextColor(art.contentColor)};"` : 'style="color: var(--text);"';

    document.getElementById("reader-content").innerHTML = formatRichContent(art.content || art.excerpt || "", contentColorStyle);
    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
};

window.closeFullScreenReader = function() {
    const overlay = document.getElementById("fullscreen-reader-overlay");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "auto";
};

window.shareArticle = function(platform) {
    let url = "";
    if (window.currentActiveArticle) {
        url = getStoryUrl(window.currentActiveArticle);
    }
    if (!url || url === "/" || url === "#") {
        url = window.location.href;
    }
    if (url.startsWith("/")) {
        url = window.location.origin + url;
    }
    const title = document.getElementById("reader-title")?.textContent || document.title || "NUQTHA Article";
    if (platform === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}`, '_blank');
    } else if (platform === 'telegram') {
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
    } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'instagram') {
        navigator.clipboard.writeText(url).then(() => {
            const label = document.getElementById('share-copy-label');
            if (label) {
                const prev = label.textContent;
                label.textContent = 'Link Copied!';
                setTimeout(() => { label.textContent = prev; }, 2000);
            }
            window.open('https://www.instagram.com/', '_blank');
        }).catch(() => {
            window.open('https://www.instagram.com/', '_blank');
        });
    } else if (platform === 'copy') {
        navigator.clipboard.writeText(url).then(() => {
            const label = document.getElementById('share-copy-label');
            if (label) {
                label.textContent = 'Copied!';
                setTimeout(() => { label.textContent = 'Copy Link'; }, 2000);
            }
        }).catch(() => {
            const label = document.getElementById('share-copy-label');
            if (label) {
                label.textContent = 'Copy failed';
                setTimeout(() => { label.textContent = 'Copy Link'; }, 2500);
            }
        });
    }
};

function formatDate(ts) {
    if (!ts) return "";
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch { return ""; }
}



/* ═══════════ HELPER: COUNT ARTICLES BELONGING TO A BOOK ═══════════ */
function getBookArticleCount(book, articles) {
<<<<<<< HEAD
    return getBookChapters(book, articles).length;
=======
    if (typeof countBookChapters === 'function') {
        return countBookChapters(book, articles);
    }
    if (!book || !articles) return 0;
    const bId = (book.id || "").trim();
    const bName = (book.bookName || "").trim();
    const bTitle = (book.title || "").trim();
    return articles.filter(a => {
        if (!a || a.id === book.id || a.type === "BOOK" || a.isBook === true) return false;
        if (bId && a.bookId && a.bookId === bId) return true;
        if (bName && a.bookName && a.bookName === bName) return true;
        if (bTitle && a.bookName && a.bookName === bTitle) return true;
        return false;
    }).length;
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
}

/* ═══════════ 1. HOME PAGE BOOK SHOWCASE / CAROUSEL SECTION (COMPACT IN MIDDLE) ═══════════ */
function buildBookShowcaseSection(bookCovers, allArticles) {
    if (!bookCovers || bookCovers.length === 0) return '';

    return `
    <section class="category-section-block book-showcase-section mt-6 sm:mt-8 p-3.5 sm:p-5 rounded-2xl border border-[#ebdccb] dark:border-white/10 bg-white/70 dark:bg-[#12141d]/70 backdrop-blur-md shadow-xs">
        <div class="category-section-header flex items-center justify-between mb-3.5">
            <div class="flex items-center gap-2">
                <div class="category-glass-badge border-[#b4532c]/30 bg-[#b4532c]/5">
                    <span class="w-2 h-2 rounded-full inline-block flex-shrink-0 bg-[#b4532c]"></span>
                    <span class="font-english text-[11px] sm:text-xs font-black tracking-widest uppercase text-[#b4532c] dark:text-[#f87171]">BOOKS & EDITIONS</span>
                    <span class="font-['Noto_Sans_Malayalam'] text-xs font-bold text-[#1e1b18] dark:text-white">പുസ്തകങ്ങൾ</span>
                </div>
            </div>
            <button class="show-more-pill" data-category="BOOKS" title="എല്ലാ പുസ്തകങ്ങളും കാണുക" style="border-color: #b4532c40; color: #b4532c;">
                <span class="font-english text-[11px] sm:text-xs">SHOW MORE</span>
                <span class="opacity-70 text-[9px] font-['Noto_Sans_Malayalam'] hidden sm:inline">(എല്ലാം കാണുക)</span>
                <span class="text-xs">&rsaquo;</span>
            </button>
        </div>

<<<<<<< HEAD
        <!-- Horizontal Swipe Showcase (Compact sizing for future additions) -->
        <div class="flex gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory">
            ${bookCovers.map(book => {
                const cleanTitle = escapeHtml(stripMarkdown(book.title));
                const count = getBookArticleCount(book, allArticles);
                const safeId = escapeHtml(book.id);
                const safeImageUrl = escapeHtml(book.imageUrl || "");
                const safeMeta = escapeHtml(book.date || book.category || "Special Issue");
                const safeVolume = escapeHtml(book.volume ? (book.volume.toLowerCase().includes('vol') ? book.volume : 'Volume ' + book.volume) : 'Volume 36');
                const safeIssue = escapeHtml(book.issue ? (book.issue.toLowerCase().includes('issue') ? book.issue : 'Issue: ' + book.issue) : 'Issue: 27');
                return `
                <div class="book-glass-card w-32 sm:w-36 md:w-40 flex-shrink-0 snap-start group cursor-pointer bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col" data-id="${safeId}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        ${book.imageUrl ? `
                            <img src="${safeImageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
=======
    const booksHtml = bookCovers.map((book, idx) => {
        if (!book) return '';
        const cleanTitle = (typeof stripMarkdown === 'function' ? stripMarkdown(book.title || '') : (book.title || '')).trim() || 'Untitled Book';
        const count = typeof getBookArticleCount === 'function' ? getBookArticleCount(book, allArticles) : 0;
        const authorName = (book.author || book.authorName || 'നൂഖ്ത എഡിറ്റോറിയൽ').trim();
        const displayDate = book.date || book.publishDate || '';
        const isHidden = idx >= 4;

        // Premium & Pricing Check
        const isPremium = Boolean(
            book.isPremium === true ||
            book.category === 'Premium Book' ||
            (typeof book.category === 'string' && book.category.toLowerCase().includes('premium')) ||
            (Array.isArray(book.tags) && book.tags.some(t => String(t).toLowerCase().includes('premium')))
        );
        const rawPrice = Number(book.price);
        const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
        const isFree = !isPremium || price === 0;

        const bookCoverImg = book.imageUrl || book.coverImage || book.thumbnailUrl;
        const bookId = book.id || '';
        const bookHref = bookId ? getStoryUrl(book) : '#';

        return `
        <div class="premium-book-card-wrap ${isHidden ? 'hidden' : ''}">
            <a href="${bookHref}" class="premium-book-card group" data-id="${bookId}" aria-label="${cleanTitle}">
                <div class="premium-book-3d-wrap">
                    <div class="premium-book-floor-shadow" aria-hidden="true"></div>
                    <div class="premium-book-cover">
                        <div class="premium-book-spine" aria-hidden="true"></div>
                        ${isFree ? `
                            <span class="premium-book-ribbon" style="background: linear-gradient(135deg, #059669, #0d9488); color: #fff;" translate="no">₹0 FREE</span>
                        ` : `
                            <span class="premium-book-ribbon" translate="no">₹${price} • PREMIUM</span>
                        `}
                        ${bookCoverImg ? `
                            <img src="${bookCoverImg}" alt="${cleanTitle}" class="premium-book-img" width="300" height="400" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="premium-book-placeholder" style="display:none;">
                                <span class="text-3xl" aria-hidden="true">📚</span>
                                <span class="font-english font-bold text-[10px] uppercase opacity-75 mt-1" translate="no">NUQTHA EDITION</span>
                            </div>
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
                        ` : `
                            <div class="w-full h-full flex flex-col items-center justify-center text-[#b4532c] dark:text-white/40 space-y-1">
                                <span class="text-2xl">📚</span>
                                <span class="text-[9px] font-bold font-english uppercase">Edition</span>
                            </div>
                        `}
                    </div>
<<<<<<< HEAD
                    <!-- Maroon Title Banner -->
                    <div class="bg-[#b4532c] text-white py-1 px-2 text-center text-[11px] font-bold font-['Anek_Malayalam'] truncate">
                        ${cleanTitle}
                    </div>
                    <!-- Details / Count -->
                    <div class="py-1 px-1.5 text-center bg-[#fbf7ee]/40 dark:bg-white/[0.02] border-t border-[#ebdccb]/60 dark:border-white/10 space-y-0.5">
                        <p class="text-[10px] font-bold text-[#1e1b18] dark:text-white font-english truncate">
                            ${safeMeta}
                        </p>
                        <p class="text-[9px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam'] truncate">
                            ${count} ലേഖനങ്ങൾ
                        </p>
=======
                </div>
                <div class="premium-book-info">
                    <h3 class="premium-book-title">${cleanTitle}</h3>
                    <p class="premium-book-author">${authorName}</p>
                    <div class="premium-book-meta-row">
                        <span class="premium-book-chip">
                            <span aria-hidden="true">📖</span>
                            <span>${count} അധ്യായങ്ങൾ</span>
                        </span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-english ${isFree ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'}">
                            ${isFree ? '₹0 • സൗജന്യം' : `₹${price} • PREMIUM`}
                        </span>
                        ${displayDate ? `<span>${displayDate}</span>` : ''}
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    </section>
    `;
}

/* ═══════════ 2. BOOKS CATEGORY PAGE LAYOUT ═══════════ */
function renderBooksCategoryFeed(container) {
    const bookCovers = allArticles.filter(a => ((a.type || "").toUpperCase() === "BOOK" || a.isBook === true) && !isChapterEntity(a));

    let html = `
    <div class="category-filter-banner flex items-center justify-between p-4 mb-6 rounded-2xl bg-white/70 dark:bg-[#12141d]/70 backdrop-blur-md border border-[#ebdccb] dark:border-white/10 shadow-xs">
        <div class="flex items-center gap-3">
            <span class="text-2xl sm:text-3xl">📚</span>
            <div>
                <h2 class="text-base sm:text-lg font-black text-[#1e1b18] dark:text-white font-['Anek_Malayalam']">
                    പുസ്തകങ്ങളും പ്രത്യേക പതിപ്പുകളും (Books & Editions)
                </h2>
                <p class="text-xs text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                    ${bookCovers.length} പ്രസിദ്ധീകരണങ്ങൾ ലഭ്യമാണ് (Published Issues & Volumes)
                </p>
            </div>
        </div>
        <button class="show-all-home-btn text-xs font-bold text-[#b4532c] hover:text-[#923e1b] dark:text-[#f87171] dark:hover:text-white transition flex items-center gap-1 font-english cursor-pointer">
            <span>&larr; ALL STORIES</span>
        </button>
    </div>
    `;

    if (bookCovers.length === 0) {
        html += `
        <div class="p-12 text-center rounded-3xl bg-white/50 border border-dashed border-[#ebdccb] text-slate-400 text-xs">
            നിലവിൽ പുസ്തകങ്ങളൊന്നും പ്രസിദ്ധീകരിച്ചിട്ടില്ല.
        </div>
        `;
    } else {
        html += `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
            ${bookCovers.map(book => {
                const cleanTitle = escapeHtml(stripMarkdown(book.title));
                const count = getBookArticleCount(book, allArticles);
<<<<<<< HEAD
                const safeId = escapeHtml(book.id);
                const safeImageUrl = escapeHtml(book.imageUrl || "");
                const safeMeta = escapeHtml(book.date || book.category || "Special Issue");
                return `
                <div class="book-glass-card group cursor-pointer flex flex-col bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] dark:hover:border-[#f87171] shadow-2xs hover:shadow-lg transition-all duration-300" data-id="${safeId}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        ${book.imageUrl ? `
                            <img src="${safeImageUrl}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy">
=======
                const isPremium = Boolean(
                    book.type === 'premium' ||
                    book.bookType === 'premium' ||
                    book.accessType === 'premium' ||
                    book.isPremium === true ||
                    book.category === 'Premium Book' ||
                    (typeof book.category === 'string' && book.category.toLowerCase().includes('premium'))
                );
                const rawPrice = Number(book.price);
                const price = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : (isPremium ? 49 : 0);
                const isFree = !isPremium || price === 0;
                const bookCoverImg = book.imageUrl || book.coverImage || book.thumbnailUrl;

                return `
                <div class="book-glass-card group cursor-pointer flex flex-col bg-white dark:bg-[#151722] rounded-2xl overflow-hidden border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] dark:hover:border-[#f87171] shadow-2xs hover:shadow-lg transition-all duration-300 relative" data-id="${book.id}">
                    <div class="aspect-[3/4] w-full bg-[#f7eedf] dark:bg-[#0c0d12] overflow-hidden relative">
                        <span class="absolute top-2.5 right-2.5 z-10 px-2.5 py-1 rounded-full text-[10px] font-black uppercase font-english ${isFree ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700 shadow-md' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-md'}">
                            ${isFree ? 'FREE' : 'PREMIUM'}
                        </span>
                        ${bookCoverImg ? `
                            <img src="${bookCoverImg}" alt="${cleanTitle}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="w-full h-full flex flex-col items-center justify-center text-[#b4532c] dark:text-white/40 space-y-1" style="display:none;">
                                <span class="text-3xl">📚</span>
                                <span class="text-xs font-bold font-english uppercase">Book Edition</span>
                            </div>
>>>>>>> 68ff69d703bea0fbdab87eefd5fc16b4f1a78f17
                        ` : `
                            <div class="w-full h-full flex flex-col items-center justify-center text-[#b4532c] dark:text-white/40 space-y-1">
                                <span class="text-3xl">📚</span>
                                <span class="text-xs font-bold font-english uppercase">Book Edition</span>
                            </div>
                        `}
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                            <span class="text-[11px] font-bold text-white uppercase font-english tracking-wider flex items-center gap-1 bg-[#b4532c] px-3 py-1 rounded-full shadow">
                                <span>തുറക്കുക</span>
                                <span>&rarr;</span>
                            </span>
                        </div>
                    </div>
                    <!-- Maroon Title Banner -->
                    <div class="bg-[#b4532c] text-white py-1.5 px-2 text-center text-xs font-black font-['Anek_Malayalam'] truncate shadow-xs">
                        ${cleanTitle}
                    </div>
                    <!-- Details / Meta Underneath -->
                    <div class="py-2.5 px-2.5 text-center bg-[#fbf7ee]/40 dark:bg-white/[0.02] border-t border-[#ebdccb]/60 dark:border-white/10 space-y-1">
                        <p class="text-xs font-bold text-[#1e1b18] dark:text-white font-english tracking-wide truncate">
                            ${safeVolume} • ${safeIssue}
                        </p>
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-english">
                            ${escapeHtml(book.date || 'Recent Issue')}
                        </p>
                        <p class="text-[10px] text-[#8c7a6b] dark:text-[#94a3b8] font-['Noto_Sans_Malayalam']">
                            ${count} ലേഖനങ്ങൾ ഉൾക്കൊള്ളുന്നു
                        </p>
                        <div class="pt-1.5">
                            <span class="inline-block w-full text-center bg-[#A75D3A] text-white py-1 px-2.5 rounded-lg text-xs font-bold shadow-2xs hover:opacity-90 transition">
                                ${isFree ? 'Read Free' : 'Buy Now'}
                            </span>
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        `;
    }

    container.innerHTML = html;

    const showAllBtn = container.querySelector(".show-all-home-btn");
    if (showAllBtn) {
        showAllBtn.addEventListener("click", () => switchToCategory("ALL"));
    }
}

// ========================================================
// SECTION 3: APP.JS - Load Books Dynamically (Fix Delete Issue)
// ========================================================
export async function loadBooksToFrontend(database = db) {
  const container = document.getElementById('booksContainer');
  if (!container) return;
  
  try {
    const querySnapshot = await getDocs(collection(database, "books"));
    container.innerHTML = "";
    
    if (querySnapshot.empty) {
      container.innerHTML = "<p class='text-gray-500 py-6 text-center text-xs'>No books found.</p>";
      return;
    }

    querySnapshot.forEach((documentSnap) => {
      const book = documentSnap.data();
      const isPremium = book.type === 'premium' || book.isPremium === true;
      const targetUrl = book.slug ? `/book/${encodeURIComponent(book.slug)}` : `/article.html?id=${encodeURIComponent(documentSnap.id)}`;
      
      const card = document.createElement("div");
      card.className = "bg-white dark:bg-[#12141d] p-4 rounded-xl shadow border border-gray-100 dark:border-white/10 flex flex-col justify-between";
      card.innerHTML = `
        <div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded ${isPremium ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'}">
            ${isPremium ? 'PREMIUM' : 'FREE'}
          </span>
          <h3 class="font-bold text-lg mt-2 text-gray-800 dark:text-white">${book.title || 'Untitled Book'}</h3>
          <p class="text-sm text-gray-600 dark:text-slate-400">Author: ${book.author || 'Nuqtha Press'}</p>
        </div>
        <a href="${targetUrl}" class="mt-4 bg-[#A75D3A] text-white px-3 py-1.5 rounded text-sm hover:opacity-90 transition text-center inline-block font-semibold">
          ${isPremium ? 'Buy Now' : 'Read Free'}
        </a>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.warn("[Books] Dynamic load error:", err);
  }
}
window.loadBooksToFrontend = loadBooksToFrontend;
