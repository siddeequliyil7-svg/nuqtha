import { db, doc, getDoc } from "./firebase-config.js";
import { checkIsRateLimited, markFirestoreRateLimited } from "./js/firestore-cache.js";

const KEY = "nuqtha:reading-bg";
const SYNCED_AT_KEY = "nuqtha:reading-bg:syncedAt";
const SYNC_TTL_MS = 10 * 60 * 1000;
const OPTIONS = ["cream", "soft", "white"];

export async function syncReadingBg() {
    try {
        try {
            const lastSync = Number(sessionStorage.getItem(SYNCED_AT_KEY) || "0");
            if (lastSync > 0 && Date.now() - lastSync < SYNC_TTL_MS) {
                return;
            }
        } catch (_) {}

        if (checkIsRateLimited({ scope: "background" })) return;

        const snapshot = await getDoc(doc(db, "settings", "site"));
        try {
            sessionStorage.setItem(SYNCED_AT_KEY, String(Date.now()));
        } catch (_) {}
        const value = snapshot.exists() ? snapshot.data().readingBg : null;
        if (!OPTIONS.includes(value)) return;

        document.documentElement.dataset.reading = value;
        try {
            localStorage.setItem(KEY, value);
        } catch (error) {
            console.warn("[Reading theme] Could not cache the reading background preference.", error);
        }
    } catch (error) {
        const msg = String(error?.code || error?.message || "").toLowerCase();
        if (msg.includes("429") || msg.includes("resource-exhausted") || msg.includes("quota")) {
            markFirestoreRateLimited(30000, { scope: "background" });
            return;
        }
        console.warn("[Reading theme] Could not sync the reading background preference.", error);
    }
}
