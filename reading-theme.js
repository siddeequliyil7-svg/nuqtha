import { db, doc, getDoc } from "./firebase-config.js";

const KEY = "nuqtha:reading-bg";
const OPTIONS = ["cream", "soft", "white"];

export async function syncReadingBg() {
    try {
        const snapshot = await getDoc(doc(db, "settings", "site"));
        const value = snapshot.exists() ? snapshot.data().readingBg : null;
        if (!OPTIONS.includes(value)) return;

        document.documentElement.dataset.reading = value;
        try {
            localStorage.setItem(KEY, value);
        } catch (error) {
            console.warn("[Reading theme] Could not cache the reading background preference.", error);
        }
    } catch (error) {
        console.warn("[Reading theme] Could not sync the reading background preference.", error);
    }
}
