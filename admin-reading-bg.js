import { db, doc, getDoc, setDoc } from "./firebase-config.js";

const OPTIONS = [
    ["cream", "Cream (old look)", "#FAF6F0"],
    ["soft", "Soft white (recommended)", "#FDFBF8"],
    ["white", "White", "#FFFFFF"]
];
const STORAGE_KEY = "nuqtha:reading-bg";

export async function initReadingBgAdmin(root) {
    if (!root || root.dataset.readingBgInited === "true") return;
    root.dataset.readingBgInited = "true";
    root.innerHTML = `
        <div class="reading-bg-admin">
            <div>
                <h2>വായനാപേജിന്റെ പശ്ചാത്തലം</h2>
                <p>ലേഖനങ്ങളും പുസ്തക വായനാപേജുകളും കാണിക്കുന്ന പശ്ചാത്തലം തിരഞ്ഞെടുക്കുക.</p>
            </div>
            <fieldset>
                <legend>Reading page background</legend>
                ${OPTIONS.map(([value, label, color]) => `
                    <label class="reading-bg-option">
                        <input type="radio" name="reading-bg" value="${value}" ${value === "soft" ? "checked" : ""} disabled>
                        <span class="reading-bg-swatch" style="--swatch:${color}" aria-hidden="true"></span>
                        <span>${label}</span>
                    </label>
                `).join("")}
            </fieldset>
            <p id="rbg-status" role="status" aria-live="polite"></p>
        </div>
    `;

    const status = root.querySelector("#rbg-status");
    const radios = [...root.querySelectorAll('input[name="reading-bg"]')];
    try {
        const snapshot = await getDoc(doc(db, "settings", "site"));
        const current = snapshot.exists() ? snapshot.data().readingBg : null;
        const selected = OPTIONS.some(([value]) => value === current) ? current : "soft";
        const radio = radios.find(input => input.value === selected);
        if (radio) radio.checked = true;
        status.textContent = "നിലവിലെ reading background തിരഞ്ഞെടുത്തിട്ടുണ്ട്.";
    } catch (error) {
        console.error("[Admin] Could not load the reading background setting.", error);
        status.textContent = "നിലവിലെ ക്രമീകരണം ലോഡ് ചെയ്യാനായില്ല. Firestore rules പരിശോധിക്കുക.";
        status.classList.add("is-error");
    } finally {
        radios.forEach(radio => { radio.disabled = false; });
    }

    root.addEventListener("change", async event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.name !== "reading-bg") return;
        if (!OPTIONS.some(([value]) => value === input.value)) {
            status.textContent = "തിരഞ്ഞെടുത്ത reading background അംഗീകരിക്കാനാവില്ല.";
            status.classList.add("is-error");
            return;
        }

        radios.forEach(radio => { radio.disabled = true; });
        status.classList.remove("is-error");
        status.textContent = "ക്രമീകരണം സേവ് ചെയ്യുന്നു...";
        try {
            await setDoc(doc(db, "settings", "site"), { readingBg: input.value }, { merge: true });
            try {
                localStorage.setItem(STORAGE_KEY, input.value);
            } catch (error) {
                console.warn("[Admin] Could not cache the reading background setting.", error);
            }
            document.documentElement.dataset.reading = input.value;
            status.textContent = "സേവ് ചെയ്തു. സന്ദർശകർക്ക് അടുത്ത പേജ് ലോഡിൽ ഈ പശ്ചാത്തലം കാണാം.";
        } catch (error) {
            console.error("[Admin] Could not save the reading background setting.", error);
            status.textContent = "സേവ് ചെയ്യാനായില്ല. Admin അനുമതിയും Firestore rules-ഉം പരിശോധിക്കുക.";
            status.classList.add("is-error");
        } finally {
            radios.forEach(radio => { radio.disabled = false; });
        }
    });
}
