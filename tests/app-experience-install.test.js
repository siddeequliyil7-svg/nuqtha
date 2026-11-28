import { initAppExperience, requestNotificationPermission } from "../src/app-experience.js";
import { initInstall, syncInstallItems } from "../src/install.js";

const { describe, it } = window;
const { expect } = window.chai;
const NOTIFICATION_PROMPT_KEY = "nuqtha:notification-prompted";
const INSTALLED_KEYS = ["nuqtha:installed", "nuqtha_app_installed", "nuqtha_installed_platform"];

function installNotificationMock(permission, requestPermission = () => Promise.resolve(permission)) {
    const descriptor = Object.getOwnPropertyDescriptor(window, "Notification");
    const notification = { permission, requestPermission };
    Object.defineProperty(window, "Notification", {
        configurable: true,
        value: notification
    });
    return () => {
        if (descriptor) Object.defineProperty(window, "Notification", descriptor);
        else delete window.Notification;
    };
}

describe("PWA install and notification prompts", () => {
    it("stores granted, denied, and dismissed notification states without repeating the banner", async () => {
        const restoreNotification = installNotificationMock("granted");
        const originalSetTimeout = window.setTimeout;
        try {
            localStorage.removeItem(NOTIFICATION_PROMPT_KEY);
            expect(await requestNotificationPermission()).to.equal("granted");
            initAppExperience();
            expect(localStorage.getItem(NOTIFICATION_PROMPT_KEY)).to.equal("granted");

            window.Notification.permission = "denied";
            localStorage.removeItem(NOTIFICATION_PROMPT_KEY);
            initAppExperience();
            expect(localStorage.getItem(NOTIFICATION_PROMPT_KEY)).to.equal("denied");

            window.Notification.permission = "default";
            localStorage.removeItem(NOTIFICATION_PROMPT_KEY);
            window.setTimeout = (callback, delay, ...args) =>
                delay === 8000 ? (callback(...args), 0) : originalSetTimeout(callback, delay, ...args);
            initAppExperience();
            const banner = document.getElementById("nuqtha-notification-banner");
            expect(banner).to.exist;
            banner.querySelector(".nuqtha-app-notice-close").click();
            expect(localStorage.getItem(NOTIFICATION_PROMPT_KEY)).to.equal("dismissed");

            const nextVisit = await import("../src/app-experience.js?dismissed-test");
            nextVisit.initAppExperience();
            expect(document.getElementById("nuqtha-notification-banner")).to.equal(null);
        } finally {
            window.setTimeout = originalSetTimeout;
            restoreNotification();
            document.querySelectorAll("#nuqtha-notification-banner, #nuqtha-offline-status").forEach(element => element.remove());
            localStorage.removeItem(NOTIFICATION_PROMPT_KEY);
        }
    });

    it("hides install controls in standalone mode or after app installation", () => {
        const originalMatchMedia = window.matchMedia;
        const button = document.createElement("button");
        button.dataset.install = "";
        document.body.append(button);
        try {
            localStorage.removeItem("nuqtha:installed");
            localStorage.removeItem("nuqtha_app_installed");
            window.matchMedia = query => ({ matches: query === "(display-mode: standalone)" });
            syncInstallItems();
            expect(button.classList.contains("hidden")).to.equal(true);

            window.matchMedia = () => ({ matches: false });
            localStorage.setItem("nuqtha_app_installed", "true");
            syncInstallItems();
            expect(button.classList.contains("hidden")).to.equal(true);
        } finally {
            window.matchMedia = originalMatchMedia;
            button.remove();
            localStorage.removeItem("nuqtha:installed");
            localStorage.removeItem("nuqtha_app_installed");
            syncInstallItems();
        }
    });

    it("opens the captured native install prompt directly from the install button", async () => {
        const originalMatchMedia = window.matchMedia;
        const button = document.createElement("button");
        button.dataset.install = "";
        document.body.append(button);
        let promptCalls = 0;
        try {
            INSTALLED_KEYS.forEach(key => localStorage.removeItem(key));
            sessionStorage.setItem("nuqtha:install-toast-shown", "1");
            window.matchMedia = () => ({ matches: false });
            const promptEvent = new Event("beforeinstallprompt", { cancelable: true });
            Object.defineProperties(promptEvent, {
                prompt: { value: () => { promptCalls += 1; } },
                userChoice: { value: Promise.resolve({ outcome: "accepted" }) }
            });
            window.dispatchEvent(promptEvent);
            initInstall();
            button.click();
            expect(promptCalls).to.equal(1);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(button.classList.contains("hidden")).to.equal(true);
            expect(window.deferredPrompt).to.equal(null);
            expect(document.querySelector(".pwa-card")).to.equal(null);
            window.dispatchEvent(new Event("appinstalled"));
            expect(localStorage.getItem("nuqtha_app_installed")).to.equal("true");
        } finally {
            window.matchMedia = originalMatchMedia;
            button.remove();
            INSTALLED_KEYS.forEach(key => localStorage.removeItem(key));
            sessionStorage.removeItem("nuqtha:install-toast-shown");
            delete window.deferredPrompt;
            delete window.NUQTHA_INSTALL;
            syncInstallItems();
        }
    });
});
