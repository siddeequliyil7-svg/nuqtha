const THEMES = ["light", "dark", "sepia"];

export function applyTheme(theme) {
    const activeTheme = THEMES.includes(theme) ? theme : "light";
    document.documentElement.classList.toggle("dark", activeTheme === "dark");
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.style.colorScheme = activeTheme === "dark" ? "dark" : "light";
    document.body.classList.toggle("dark-mode", activeTheme === "dark");
    document.body.classList.toggle("sepia-mode", activeTheme === "sepia");
    return activeTheme;
}

export function applySavedTheme() {
    return applyTheme(localStorage.getItem("nuqtha_theme") || "light");
}

export function initializeThemeToggle(button, sunIcon, moonIcon) {
    let theme = applySavedTheme();
    const updateButton = () => {
        if (sunIcon) sunIcon.classList.toggle("hidden", theme !== "dark");
        if (moonIcon) moonIcon.classList.toggle("hidden", theme === "dark");
        if (button) button.setAttribute("aria-label", `Switch to ${THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]} theme`);
    };

    updateButton();
    if (!button) return;

    button.addEventListener("click", () => {
        theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
        localStorage.setItem("nuqtha_theme", theme);
        theme = applyTheme(theme);
        updateButton();
    });
}

export function getThemeSafeTextColor(candidate) {
    if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(candidate || "")) return "var(--text)";
    const expanded = candidate.length === 4 ? candidate.slice(1).split("").map(character => character + character).join("") : candidate.slice(1);
    const channels = expanded.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255);
    const luminance = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const surface = getComputedStyle(document.body).getPropertyValue("--surface").trim();
    const surfaceChannels = surface.match(/[\da-f]{2}/gi)?.slice(0, 3).map(value => parseInt(value, 16) / 255);
    if (!surfaceChannels || surfaceChannels.length !== 3) return "var(--text)";
    const surfaceLuminance = surfaceChannels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (Math.max(luminance, surfaceLuminance) + 0.05) / (Math.min(luminance, surfaceLuminance) + 0.05);
    return contrast >= 4.5 ? candidate : "var(--text)";
}
