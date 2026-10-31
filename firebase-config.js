import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  initializeFirestore,
  getFirestore, 
  setLogLevel,
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Dynamically resolves Firebase API Key from environment variables, window global, or default.
 * Supports Vite (import.meta.env), Node/Vercel (process.env), and runtime window injection.
 */
export function getFirebaseApiKey() {
  if (typeof window !== "undefined" && window.__FIREBASE_API_KEY__) {
    return window.__FIREBASE_API_KEY__;
  }
  if (typeof window !== "undefined" && window.FIREBASE_CONFIG?.apiKey) {
    return window.FIREBASE_CONFIG.apiKey;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) {
      return import.meta.env.VITE_FIREBASE_API_KEY;
    }
  } catch (e) {}
  try {
    if (typeof process !== "undefined" && process.env?.VITE_FIREBASE_API_KEY) {
      return process.env.VITE_FIREBASE_API_KEY;
    }
  } catch (e) {}
  return "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e";
}

export const firebaseConfig = {
  apiKey: getFirebaseApiKey(),
  authDomain: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || "nuqtha-c0900.firebaseapp.com",
  projectId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_PROJECT_ID) || "nuqtha-c0900",
  storageBucket: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || "nuqtha-c0900.firebasestorage.app",
  messagingSenderId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || "902747954424",
  appId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID) || "1:902747954424:web:af61e4fc48033b20e1",
  measurementId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) || "G-W383N5EMVT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Silence Firestore internal transient connection log messages
setLogLevel("silent");

/**
 * Initialize Firestore with experimentalForceLongPolling and experimentalAutoDetectLongPolling: false.
 * This completely avoids QUIC / HTTP/3 UDP stream failures (net::ERR_QUIC_PROTOCOL_ERROR)
 * across proxies, corporate networks, and mobile browsers.
 */
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
});

/**
 * Fetch with automatic exponential backoff retry to withstand net::ERR_QUIC_PROTOCOL_ERROR,
 * transient network drops, and HTTP 429/5xx status codes.
 * On protocol error, the browser gracefully downgrades to TCP HTTPS on subsequent attempts.
 */
export async function fetchWithRetry(url, options = {}, retries = 3, backoff = 350) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && (response.status === 429 || response.status >= 500) && attempt < retries) {
        const delay = backoff * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = backoff * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

/**
 * Global image load retry listener to protect against transient QUIC stream drops on images.
 * Retries image once with cache-buster parameter if the initial network request drops.
 */
if (typeof window !== "undefined" && !window.__NUQTHA_IMG_RETRY_INSTALLED__) {
  window.__NUQTHA_IMG_RETRY_INSTALLED__ = true;
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target && target.tagName === "IMG") {
        const src = target.currentSrc || target.src;
        if (src && !src.startsWith("data:") && !src.startsWith("blob:") && !target.dataset.nuqthaRetried) {
          target.dataset.nuqthaRetried = "true";
          const separator = src.includes("?") ? "&" : "?";
          setTimeout(() => {
            target.src = `${src}${separator}_retry=${Date.now()}`;
          }, 450);
        }
      }
    },
    true // capture phase
  );
}

export { 
  app,
  collection, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc,
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot 
};
