/**
 * NUQTHA Modern Auth Modal & Header UI Manager
 * Risala Update Style SIGN IN pill, 3-tab Modal (Google, Phone OTP, Email), and Reader Profile
 */

import {
    initAuthStateListener,
    signInWithGoogle,
    signInWithEmailPassword,
    registerWithEmailPassword,
    sendPhoneOtp,
    verifyPhoneOtp,
    signOutUser,
    getCachedAuthUser,
    cleanupRecaptcha
} from "./auth-system.js";

let resendTimerInterval = null;
let resendSecondsRemaining = 0;
let pendingPhoneNumber = "";

/**
 * Injects modal HTML into DOM if not present
 */
export function ensureAuthModalDOM() {
    if (document.getElementById("nuqtha-auth-modal")) return;

    const modalHTML = `
    <!-- ═══════════ NUQTHA UNIVERSAL AUTH MODAL ═══════════ -->
    <div id="nuqtha-auth-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm hidden opacity-0 transition-opacity duration-200" aria-modal="true" role="dialog">
        
        <div class="relative w-full max-w-md bg-[#fbf7ee] dark:bg-[#12151f] text-[#1e1b18] dark:text-[#f8fafc] rounded-3xl shadow-2xl border border-[#ebdccb] dark:border-white/10 overflow-hidden transform scale-95 transition-transform duration-200" id="nuqtha-auth-modal-card">
            
            <!-- Close Button -->
            <button type="button" id="auth-modal-close-btn" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition cursor-pointer z-10" aria-label="Close Modal">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>

            <div class="p-6 sm:p-7 space-y-5">
                
                <!-- Modal Brand Header -->
                <div class="text-center space-y-1.5 pt-1">
                    <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1d4ed8] to-[#3b82f6] text-white shadow-md shadow-blue-500/20 mb-1">
                        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z"/></svg>
                    </div>
                    <h3 class="text-xl sm:text-2xl font-black font-english tracking-tight">NUQTHA <span class="font-['Anek_Malayalam'] font-bold text-lg text-[#b4532c]">പ്രവേശനം</span></h3>
                    <p class="text-xs text-[#8c7a6b] dark:text-slate-400 font-['Anek_Malayalam']">വായനക്കാർക്കും എഴുത്തുകാർക്കും സ്വാഗതം</p>
                </div>

                <!-- Auth Navigation Tabs (Google, Phone OTP, Email) -->
                <div class="grid grid-cols-3 gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl text-xs font-bold font-english">
                    <button type="button" class="auth-tab-btn py-2 rounded-xl transition active bg-white dark:bg-[#1a1e2e] shadow-xs text-[#b4532c] dark:text-amber-400" data-auth-tab="google">
                        Google
                    </button>
                    <button type="button" class="auth-tab-btn py-2 rounded-xl transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" data-auth-tab="phone">
                        Phone OTP
                    </button>
                    <button type="button" class="auth-tab-btn py-2 rounded-xl transition text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" data-auth-tab="email">
                        Email
                    </button>
                </div>

                <!-- Error Notification Box -->
                <div id="auth-modal-error" class="hidden p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs"></div>

                <!-- ════ TAB 1: GOOGLE SIGN IN ════ -->
                <div id="auth-pane-google" class="auth-pane space-y-4">
                    <p class="text-xs text-center text-[#705e50] dark:text-slate-400 font-['Anek_Malayalam']">
                        ഒരു ക്ലിക്കിൽ നിങ്ങളുടെ Google അക്കൗണ്ട് വഴി നേരിട്ട് പ്രവേശിക്കുക.
                    </p>
                    <button type="button" id="modal-google-signin-btn" class="w-full py-3.5 px-4 rounded-2xl bg-white dark:bg-[#1c2132] border border-[#ebdccb] dark:border-white/10 hover:border-[#b4532c] dark:hover:border-amber-400 font-bold text-xs sm:text-sm text-[#1e1b18] dark:text-white flex items-center justify-center gap-3 shadow-xs hover:shadow-md transition cursor-pointer">
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        <span>Google വഴി തുടരുക</span>
                    </button>
                </div>

                <!-- ════ TAB 2: PHONE OTP AUTH ════ -->
                <div id="auth-pane-phone" class="auth-pane hidden space-y-4">
                    <!-- Step 1: Input Phone -->
                    <div id="phone-step-send" class="space-y-3">
                        <label class="block text-xs font-bold text-[#5a4b41] dark:text-slate-300 font-english">
                            MOBILE NUMBER (ഫോൺ നമ്പർ)
                        </label>
                        <div class="flex gap-2">
                            <span class="inline-flex items-center px-3.5 rounded-2xl border border-[#ebdccb] dark:border-white/10 bg-black/5 dark:bg-white/5 text-xs font-bold font-english text-[#5a4b41] dark:text-slate-300">
                                +91
                            </span>
                            <input type="tel" id="phone-number-input" placeholder="10-digit mobile number" maxlength="10" class="flex-1 px-4 py-3 rounded-2xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#1a1e2e] text-xs font-bold outline-none focus:border-[#b4532c] dark:focus:border-amber-400 transition">
                        </div>
                        <button type="button" id="phone-send-otp-btn" class="w-full py-3 rounded-2xl bg-[#b4532c] hover:bg-[#923e1b] dark:bg-amber-600 dark:hover:bg-amber-500 text-white font-bold text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer">
                            <span>OTP അയക്കുക (Send OTP)</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                        </button>
                    </div>

                    <!-- Step 2: Verify OTP -->
                    <div id="phone-step-verify" class="hidden space-y-3">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-[#705e50] dark:text-slate-400 font-['Anek_Malayalam']">
                                OTP നൽകുക: <strong id="phone-display-target" class="font-english"></strong>
                            </span>
                            <button type="button" id="phone-change-btn" class="text-[#b4532c] dark:text-amber-400 font-bold hover:underline">
                                മാറ്റുക
                            </button>
                        </div>
                        <input type="text" id="phone-otp-input" placeholder="6-digit OTP code" maxlength="6" inputmode="numeric" class="w-full px-4 py-3 rounded-2xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#1a1e2e] text-center text-lg font-black tracking-widest font-mono outline-none focus:border-[#b4532c] dark:focus:border-amber-400 transition">
                        <button type="button" id="phone-verify-otp-btn" class="w-full py-3 rounded-2xl bg-[#1d4ed8] hover:bg-blue-800 text-white font-bold text-xs shadow transition flex items-center justify-center gap-2 cursor-pointer">
                            <span>സ്ഥിരീകരിക്കുക (Verify & Sign In)</span>
                        </button>
                        <div class="text-center pt-1">
                            <button type="button" id="phone-resend-otp-btn" class="text-xs text-[#8c7a6b] dark:text-slate-400 font-bold hover:text-[#b4532c] disabled:opacity-50" disabled>
                                വീണ്ടും അയക്കുക (Resend in <span id="resend-countdown">30</span>s)
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ════ TAB 3: EMAIL & PASSWORD ════ -->
                <div id="auth-pane-email" class="auth-pane hidden space-y-3">
                    <div class="flex items-center justify-between border-b border-[#ebdccb]/60 dark:border-white/10 pb-2">
                        <span id="email-mode-title" class="text-xs font-bold font-english text-[#b4532c] dark:text-amber-400">SIGN IN</span>
                        <button type="button" id="email-toggle-mode-btn" class="text-xs text-[#705e50] dark:text-slate-400 hover:text-[#b4532c] dark:hover:text-amber-400 font-bold transition">
                            പുതിയ അക്കൗണ്ട്? രജിസ്റ്റർ ചെയ്യുക
                        </button>
                    </div>

                    <form id="email-auth-form" class="space-y-3">
                        <div id="email-name-field" class="hidden space-y-1">
                            <label class="block text-[11px] font-bold text-[#5a4b41] dark:text-slate-300 font-english">FULL NAME</label>
                            <input type="text" id="email-auth-name" placeholder="നിങ്ങളുടെ പേര്..." class="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#1a1e2e] text-xs outline-none focus:border-[#b4532c]">
                        </div>
                        <div class="space-y-1">
                            <label class="block text-[11px] font-bold text-[#5a4b41] dark:text-slate-300 font-english">EMAIL ADDRESS</label>
                            <input type="email" id="email-auth-email" required placeholder="name@example.com" class="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#1a1e2e] text-xs outline-none focus:border-[#b4532c]">
                        </div>
                        <div class="space-y-1">
                            <label class="block text-[11px] font-bold text-[#5a4b41] dark:text-slate-300 font-english">PASSWORD</label>
                            <div class="relative">
                                <input type="password" id="email-auth-password" required minlength="6" placeholder="പാസ്‌വേഡ് നൽകുക..." class="w-full px-4 py-2.5 rounded-xl border border-[#ebdccb] dark:border-white/10 bg-white dark:bg-[#1a1e2e] text-xs outline-none focus:border-[#b4532c] pr-10">
                                <button type="button" id="email-toggle-pw" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">👁️</button>
                            </div>
                        </div>
                        <button type="submit" id="email-submit-btn" class="w-full py-3 rounded-2xl bg-[#1e1b18] hover:bg-black dark:bg-white dark:text-[#12151f] text-white font-bold text-xs shadow transition cursor-pointer">
                            പ്രവേശിക്കുക (Sign In)
                        </button>
                    </form>
                </div>

                <!-- Invisible container for Firebase Phone reCAPTCHA -->
                <div id="recaptcha-container" class="flex justify-center"></div>

            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    setupAuthModalListeners();
}

/**
 * Opens the auth modal
 */
export function openAuthModal(defaultTab = "google") {
    ensureAuthModalDOM();
    const modal = document.getElementById("nuqtha-auth-modal");
    const card = document.getElementById("nuqtha-auth-modal-card");
    if (!modal) return;

    switchAuthTab(defaultTab);
    clearAuthModalError();

    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
        modal.classList.remove("opacity-0");
        if (card) {
            card.classList.remove("scale-95");
            card.classList.add("scale-100");
        }
    });
}

/**
 * Closes the auth modal
 */
export function closeAuthModal() {
    const modal = document.getElementById("nuqtha-auth-modal");
    const card = document.getElementById("nuqtha-auth-modal-card");
    if (!modal) return;

    if (card) {
        card.classList.remove("scale-100");
        card.classList.add("scale-95");
    }
    modal.classList.add("opacity-0");
    setTimeout(() => {
        modal.classList.add("hidden");
        clearAuthModalError();
        cleanupRecaptcha();
        if (resendTimerInterval) {
            clearInterval(resendTimerInterval);
            resendTimerInterval = null;
        }
    }, 200);
}

function clearAuthModalError() {
    const box = document.getElementById("auth-modal-error");
    if (box) {
        box.textContent = "";
        box.classList.add("hidden");
    }
}

function showAuthModalError(msg) {
    const box = document.getElementById("auth-modal-error");
    if (box) {
        box.textContent = msg;
        box.classList.remove("hidden");
    }
}

function switchAuthTab(tabName) {
    const tabButtons = document.querySelectorAll(".auth-tab-btn");
    const panes = document.querySelectorAll(".auth-pane");

    tabButtons.forEach(btn => {
        const isMatch = btn.dataset.authTab === tabName;
        btn.classList.toggle("active", isMatch);
        btn.classList.toggle("bg-white", isMatch);
        btn.classList.toggle("dark:bg-[#1a1e2e]", isMatch);
        btn.classList.toggle("shadow-xs", isMatch);
        btn.classList.toggle("text-[#b4532c]", isMatch);
        btn.classList.toggle("dark:text-amber-400", isMatch);
        btn.classList.toggle("text-slate-600", !isMatch);
        btn.classList.toggle("dark:text-slate-400", !isMatch);
    });

    panes.forEach(pane => {
        pane.classList.add("hidden");
    });

    const activePane = document.getElementById(`auth-pane-${tabName}`);
    if (activePane) {
        activePane.classList.remove("hidden");
    }
    clearAuthModalError();
}

/**
 * Configures event handlers for Auth Modal elements
 */
function setupAuthModalListeners() {
    const modal = document.getElementById("nuqtha-auth-modal");
    const closeBtn = document.getElementById("auth-modal-close-btn");
    const card = document.getElementById("nuqtha-auth-modal-card");

    if (closeBtn) {
        closeBtn.addEventListener("click", closeAuthModal);
    }

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeAuthModal();
            }
        });
    }

    // Tabs
    document.querySelectorAll(".auth-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.authTab;
            if (tab) switchAuthTab(tab);
        });
    });

    // Google Sign-In
    const googleBtn = document.getElementById("modal-google-signin-btn");
    if (googleBtn) {
        googleBtn.addEventListener("click", async () => {
            try {
                googleBtn.disabled = true;
                googleBtn.classList.add("opacity-60");
                clearAuthModalError();
                await signInWithGoogle();
                closeAuthModal();
            } catch (err) {
                console.warn("[Auth] Google sign in error:", err);
                if (err?.code !== "auth/popup-closed-by-user") {
                    showAuthModalError(err.message || "Google ലോഗിൻ പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.");
                }
            } finally {
                googleBtn.disabled = false;
                googleBtn.classList.remove("opacity-60");
            }
        });
    }

    // Phone OTP Flow
    const phoneInput = document.getElementById("phone-number-input");
    const sendOtpBtn = document.getElementById("phone-send-otp-btn");
    const verifyOtpBtn = document.getElementById("phone-verify-otp-btn");
    const otpInput = document.getElementById("phone-otp-input");
    const stepSend = document.getElementById("phone-step-send");
    const stepVerify = document.getElementById("phone-step-verify");
    const phoneDisplay = document.getElementById("phone-display-target");
    const changePhoneBtn = document.getElementById("phone-change-btn");
    const resendBtn = document.getElementById("phone-resend-otp-btn");

    if (sendOtpBtn && phoneInput) {
        sendOtpBtn.addEventListener("click", async () => {
            const raw = phoneInput.value.trim().replace(/\D/g, "");
            if (raw.length !== 10) {
                showAuthModalError("ദയവായി സാധുവായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക (Enter valid 10-digit number)");
                phoneInput.focus();
                return;
            }
            const fullPhone = `+91${raw}`;
            pendingPhoneNumber = fullPhone;

            try {
                sendOtpBtn.disabled = true;
                sendOtpBtn.innerHTML = `<span>അയക്കുന്നു...</span>`;
                clearAuthModalError();

                await sendPhoneOtp(fullPhone, "recaptcha-container");

                if (stepSend) stepSend.classList.add("hidden");
                if (stepVerify) stepVerify.classList.remove("hidden");
                if (phoneDisplay) phoneDisplay.textContent = fullPhone;
                if (otpInput) {
                    otpInput.value = "";
                    otpInput.focus();
                }
                startResendTimer();
            } catch (err) {
                console.error("[Auth] Send OTP error:", err);
                showAuthModalError(err.message || "OTP അയക്കാൻ സാധിച്ചില്ല. ദയവായി നമ്പർ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.");
                cleanupRecaptcha();
            } finally {
                sendOtpBtn.disabled = false;
                sendOtpBtn.innerHTML = `<span>OTP അയക്കുക (Send OTP)</span><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>`;
            }
        });
    }

    if (changePhoneBtn) {
        changePhoneBtn.addEventListener("click", () => {
            if (stepVerify) stepVerify.classList.add("hidden");
            if (stepSend) stepSend.classList.remove("hidden");
            if (resendTimerInterval) {
                clearInterval(resendTimerInterval);
                resendTimerInterval = null;
            }
            cleanupRecaptcha();
        });
    }

    if (resendBtn) {
        resendBtn.addEventListener("click", async () => {
            if (!pendingPhoneNumber) return;
            try {
                resendBtn.disabled = true;
                clearAuthModalError();
                await sendPhoneOtp(pendingPhoneNumber, "recaptcha-container");
                startResendTimer();
            } catch (err) {
                showAuthModalError(err.message || "OTP വീണ്ടും അയക്കാൻ സാധിച്ചില്ല.");
                cleanupRecaptcha();
            }
        });
    }

    if (verifyOtpBtn && otpInput) {
        verifyOtpBtn.addEventListener("click", async () => {
            const code = otpInput.value.trim();
            if (code.length !== 6) {
                showAuthModalError("ദയവായി 6 അക്ക OTP കോഡ് നൽകുക (Enter 6-digit code)");
                otpInput.focus();
                return;
            }
            try {
                verifyOtpBtn.disabled = true;
                verifyOtpBtn.textContent = "പരിശോധിക്കുന്നു...";
                clearAuthModalError();

                await verifyPhoneOtp(code);
                closeAuthModal();
            } catch (err) {
                console.warn("[Auth] OTP verification error:", err);
                showAuthModalError("തെറ്റായ OTP കോഡ് അല്ലെങ്കിൽ കാലാവധി കഴിഞ്ഞു (Invalid or expired code)");
            } finally {
                verifyOtpBtn.disabled = false;
                verifyOtpBtn.textContent = "സ്ഥിരീകരിക്കുക (Verify & Sign In)";
            }
        });
    }

    // Email/Password Toggle & Submit
    let isRegisterMode = false;
    const toggleModeBtn = document.getElementById("email-toggle-mode-btn");
    const modeTitle = document.getElementById("email-mode-title");
    const nameField = document.getElementById("email-name-field");
    const emailForm = document.getElementById("email-auth-form");
    const emailSubmitBtn = document.getElementById("email-submit-btn");
    const pwInput = document.getElementById("email-auth-password");
    const pwToggle = document.getElementById("email-toggle-pw");

    if (toggleModeBtn) {
        toggleModeBtn.addEventListener("click", () => {
            isRegisterMode = !isRegisterMode;
            if (isRegisterMode) {
                if (modeTitle) modeTitle.textContent = "REGISTER";
                if (toggleModeBtn) toggleModeBtn.textContent = "അക്കൗണ്ട് ഉണ്ടോ? ലോഗിൻ ചെയ്യുക";
                if (nameField) nameField.classList.remove("hidden");
                if (emailSubmitBtn) emailSubmitBtn.textContent = "അക്കൗണ്ട് സൃഷ്ടിക്കുക (Register)";
            } else {
                if (modeTitle) modeTitle.textContent = "SIGN IN";
                if (toggleModeBtn) toggleModeBtn.textContent = "പുതിയ അക്കൗണ്ട്? രജിസ്റ്റർ ചെയ്യുക";
                if (nameField) nameField.classList.add("hidden");
                if (emailSubmitBtn) emailSubmitBtn.textContent = "പ്രവേശിക്കുക (Sign In)";
            }
            clearAuthModalError();
        });
    }

    if (pwToggle && pwInput) {
        pwToggle.addEventListener("click", () => {
            pwInput.type = pwInput.type === "password" ? "text" : "password";
        });
    }

    if (emailForm) {
        emailForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = (document.getElementById("email-auth-email")?.value || "").trim();
            const password = (document.getElementById("email-auth-password")?.value || "").trim();
            const name = (document.getElementById("email-auth-name")?.value || "").trim();

            if (!email || !password) return;

            try {
                if (emailSubmitBtn) {
                    emailSubmitBtn.disabled = true;
                    emailSubmitBtn.classList.add("opacity-60");
                }
                clearAuthModalError();

                if (isRegisterMode) {
                    await registerWithEmailPassword(email, password, name);
                } else {
                    await signInWithEmailPassword(email, password);
                }
                closeAuthModal();
            } catch (err) {
                console.warn("[Auth] Email auth error:", err);
                let message = err.message || "പ്രവേശനം പരാജയപ്പെട്ടു";
                if (err.code === "auth/email-already-in-use") {
                    message = "ഈ ഇമെയിൽ വിലാസത്തിൽ ഇതിനകം അക്കൗണ്ട് ഉണ്ട്. ലോഗിൻ ചെയ്യുക.";
                } else if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
                    message = "തെറ്റായ ഇമെയിൽ അല്ലെങ്കിൽ പാസ്‌വേഡ്.";
                } else if (err.code === "auth/weak-password") {
                    message = "പാസ്‌വേഡിൽ കുറഞ്ഞത് 6 അക്ഷരങ്ങൾ വേണം.";
                }
                showAuthModalError(message);
            } finally {
                if (emailSubmitBtn) {
                    emailSubmitBtn.disabled = false;
                    emailSubmitBtn.classList.remove("opacity-60");
                }
            }
        });
    }
}

function startResendTimer() {
    if (resendTimerInterval) clearInterval(resendTimerInterval);
    resendSecondsRemaining = 30;
    const resendBtn = document.getElementById("phone-resend-otp-btn");
    const countdownEl = document.getElementById("resend-countdown");

    if (resendBtn) resendBtn.disabled = true;
    if (countdownEl) countdownEl.textContent = resendSecondsRemaining;

    resendTimerInterval = setInterval(() => {
        resendSecondsRemaining--;
        if (countdownEl) countdownEl.textContent = resendSecondsRemaining;
        if (resendSecondsRemaining <= 0) {
            clearInterval(resendTimerInterval);
            resendTimerInterval = null;
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.textContent = "വീണ്ടും OTP അയക്കുക (Resend OTP)";
            }
        }
    }, 1000);
}

/**
 * Initializes header auth UI and binds auth state listener
 */
export function initHeaderAuthUI(options = {}) {
    ensureAuthModalDOM();

    const signinBtn = document.getElementById("header-signin-btn");
    const userBtn = document.getElementById("header-user-btn");
    const userDropdown = document.getElementById("header-user-dropdown");
    const signoutBtn = document.getElementById("dropdown-signout-btn");
    const savedBtn = document.getElementById("dropdown-saved-btn");

    if (signinBtn) {
        signinBtn.addEventListener("click", () => openAuthModal("google"));
    }

    if (userBtn && userDropdown) {
        userBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isHidden = userDropdown.classList.contains("hidden");
            userDropdown.classList.toggle("hidden", !isHidden);
            userBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
        });

        document.addEventListener("click", (e) => {
            if (!userDropdown.contains(e.target) && !userBtn.contains(e.target)) {
                userDropdown.classList.add("hidden");
                userBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

    if (signoutBtn) {
        signoutBtn.addEventListener("click", async () => {
            await signOutUser();
            if (userDropdown) userDropdown.classList.add("hidden");
        });
    }

    if (savedBtn) {
        savedBtn.addEventListener("click", () => {
            if (userDropdown) userDropdown.classList.add("hidden");
            // If on index.html, trigger saved filter or modal
            if (typeof window.filterBySavedArticles === "function") {
                window.filterBySavedArticles();
            } else {
                window.location.href = "index.html?view=saved";
            }
        });
    }

    // Auth State Listener
    initAuthStateListener((user) => {
        updateHeaderUserUI(user);
        if (typeof options.onAuthStateChanged === "function") {
            options.onAuthStateChanged(user);
        }
    });
}

/**
 * Updates header elements to reflect user login state
 */
export function updateHeaderUserUI(user) {
    const signinBtn = document.getElementById("header-signin-btn");
    const userBtn = document.getElementById("header-user-btn");
    const userName = document.getElementById("header-user-name");
    const userInitial = document.getElementById("header-user-avatar-initial");
    const userAvatarImg = document.getElementById("header-user-avatar-img");

    const dropName = document.getElementById("dropdown-user-name");
    const dropIdent = document.getElementById("dropdown-user-ident");
    const dropRole = document.getElementById("dropdown-user-role-badge");
    const dropInitial = document.getElementById("dropdown-user-avatar-initial");
    const dropAvatarImg = document.getElementById("dropdown-user-avatar-img");
    const dropAdminLink = document.getElementById("dropdown-admin-link");
    const dropSavedCount = document.getElementById("dropdown-saved-count");

    // Update saved articles count
    let savedCount = 0;
    try {
        const saved = JSON.parse(localStorage.getItem("nuqtha_saved_books") || "[]");
        savedCount = Array.isArray(saved) ? saved.length : 0;
    } catch (_) {}
    if (dropSavedCount) dropSavedCount.textContent = savedCount;

    if (user && (user.name || user.email || user.phoneNumber)) {
        if (signinBtn) signinBtn.classList.add("hidden");
        if (userBtn) {
            userBtn.classList.remove("hidden");
            userBtn.classList.add("inline-flex");
        }

        const displayName = user.name || (user.email ? user.email.split("@")[0] : "വായനക്കാരൻ");
        if (userName) userName.textContent = displayName;
        if (dropName) dropName.textContent = displayName;
        if (dropIdent) dropIdent.textContent = user.email || user.phoneNumber || "";

        const initialLetter = displayName.charAt(0).toUpperCase() || "U";
        if (userInitial) userInitial.textContent = initialLetter;
        if (dropInitial) dropInitial.textContent = initialLetter;

        if (user.avatar) {
            if (userAvatarImg) {
                userAvatarImg.src = user.avatar;
                userAvatarImg.classList.remove("hidden");
                if (userInitial) userInitial.classList.add("hidden");
            }
            if (dropAvatarImg) {
                dropAvatarImg.src = user.avatar;
                dropAvatarImg.classList.remove("hidden");
                if (dropInitial) dropInitial.classList.add("hidden");
            }
        } else {
            if (userAvatarImg) userAvatarImg.classList.add("hidden");
            if (userInitial) userInitial.classList.remove("hidden");
            if (dropAvatarImg) dropAvatarImg.classList.add("hidden");
            if (dropInitial) dropInitial.classList.remove("hidden");
        }

        // Admin badge & link
        const isAdmin = user.isAdmin || user.role === "admin";
        if (dropRole) {
            if (isAdmin) {
                dropRole.textContent = "Admin / അഡ്മിൻ";
                dropRole.className = "inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-english bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700";
            } else {
                dropRole.textContent = "Reader / വായനക്കാരൻ";
                dropRole.className = "inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-english bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
            }
        }

        if (dropAdminLink) {
            dropAdminLink.classList.toggle("hidden", !isAdmin);
            dropAdminLink.classList.toggle("flex", isAdmin);
        }

    } else {
        if (signinBtn) signinBtn.classList.remove("hidden");
        if (userBtn) {
            userBtn.classList.add("hidden");
            userBtn.classList.remove("inline-flex");
        }
        const userDropdown = document.getElementById("header-user-dropdown");
        if (userDropdown) userDropdown.classList.add("hidden");
    }
}
