import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  setLogLevel,
  collection,
  getDocs,
  getDocsFromCache,
  getDoc,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  limit,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { resolveFirebaseProjectId } from "./js/firebase-project.js";

/**
 * Dynamically resolves Firebase API Key from environment variables, window global, or default.
 * Supports Vite (import.meta.env), Node/Vercel (process.env), and runtime window injection.
 */
export function getFirebaseApiKey() {
  const verifiedKey = "AIzaSyBTKoMKudzOtgv-BY5jlgs7dNl62S9e3HE";
  if (typeof window !== "undefined" && window.__FIREBASE_API_KEY__) {
    return window.__FIREBASE_API_KEY__;
  }
  if (typeof window !== "undefined" && window.FIREBASE_CONFIG?.apiKey) {
    return window.FIREBASE_CONFIG.apiKey;
  }
  return verifiedKey;
}

export const firebaseConfig = {
  apiKey: getFirebaseApiKey(),
  authDomain: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) || "nuqtha-c0900.firebaseapp.com",
  projectId: resolveFirebaseProjectId(import.meta.env?.VITE_FIREBASE_PROJECT_ID),
  storageBucket: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) || "nuqtha-c0900.firebasestorage.app",
  messagingSenderId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) || "902747954424",
  appId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID) || "1:902747954424:web:af61e4fc48033b20e1af0d",
  measurementId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) || "G-W383N5EMVT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Silence Firestore internal transient connection log messages
setLogLevel("silent");

/**
 * Initialize Firestore with persistent IndexedDB local cache and robust transport.
 * Local persistence ensures that previously fetched articles, books, and settings
 * remain available instantly in 0ms and offline even if network or Firestore Spark quota (429) fails.
 */
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: false,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn("[Firebase] Persistent Firestore cache could not be initialized; using the existing Firestore instance.", e);
  firestoreDb = getFirestore(app);
}
export const db = firestoreDb;
export const storage = getStorage(app);

export async function uploadImageDataUrl(image, path) {
  if (typeof image !== "string" || !image.startsWith("data:")) return image || "";
  const response = await fetch(image);
  const blob = await response.blob();
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(imageRef);
}

/**
 * Fetch with automatic exponential backoff retry to withstand net::ERR_QUIC_PROTOCOL_ERROR,
 * transient network drops, and HTTP 5xx status codes.
 * NOTE: If HTTP 429 (quota exceeded) is returned, it immediately returns without retrying
 * to prevent hammering the server or compounding quota exhaustion.
 */
export async function fetchWithRetry(url, options = {}, retries = 2, backoff = 350) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Immediately stop on 429 quota exhaustion - never retry
      if (!response.ok && response.status === 429) {
        return response;
      }
      if (!response.ok && response.status >= 500 && attempt < retries) {
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
        } else if (!target.dataset.nuqthaFallback) {
          target.dataset.nuqthaFallback = "true";
          target.src = "/og-cover.png";
        } else {
          target.style.visibility = "hidden";
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
  getDocsFromCache,
  getDoc,
  addDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  limit,
  orderBy,
  onSnapshot
};
