import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
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
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { resolveFirebaseProjectId } from "./js/firebase-project.js";
import {
  PRIORITY_FOREGROUND,
  PRIORITY_NORMAL,
  checkIsRateLimited,
  markFirestoreRateLimited,
  queuedFirestoreFetch
} from "./js/firestore-cache.js";

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
      cacheSizeBytes: 20 * 1024 * 1024,
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn("[Firebase] Persistent Firestore cache could not be initialized; falling back to memory cache.", e);
  try {
    firestoreDb = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
      localCache: memoryLocalCache()
    });
  } catch (memoryError) {
    console.warn("[Firebase] Memory-cache initialization also failed; using the existing Firestore instance.", memoryError);
    firestoreDb = getFirestore(app);
  }
}
export const db = firestoreDb;
export const storage = getStorage(app);
const MAX_STORAGE_UPLOAD_TIMEOUT_MS = 14000;

function createStoragePath(path) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath || cleanPath.startsWith("/") || cleanPath.includes("..")) {
    throw new Error("A valid Firebase Storage path is required.");
  }
  return `${cleanPath}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function uploadBlobToStorage(blob, path, options = {}) {
  if (blob.size > (options.maxBytes || 25 * 1024 * 1024)) {
    throw new Error("The selected file exceeds the upload size limit.");
  }
  const contentType = options.contentType || blob.type || "application/octet-stream";
  if (Array.isArray(options.allowedTypes) && !options.allowedTypes.includes(contentType)) {
    throw new Error(`Unsupported file type: ${contentType || "unknown"}.`);
  }

  const imageRef = ref(storage, createStoragePath(path));
  const task = uploadBytesResumable(imageRef, blob, {
    contentType,
    cacheControl: options.cacheControl || "public, max-age=31536000, immutable"
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback(value);
    };
    const requestedTimeout = Number(options.timeoutMs);
    const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
      ? Math.min(requestedTimeout, MAX_STORAGE_UPLOAD_TIMEOUT_MS)
      : MAX_STORAGE_UPLOAD_TIMEOUT_MS;

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new Error(
        `Firebase Storage upload timed out after ${Math.round(timeoutMs / 1000)} seconds. This may be a network/CORS issue.`
      );
      error.code = "storage/upload-timeout";
      try {
        task.cancel();
      } catch (cancelError) {
        console.warn("[Firebase Storage] Could not cancel timed-out upload:", cancelError);
      }
      reject(error);
    }, timeoutMs);

    task.on("state_changed", snapshot => {
      if (typeof options.onProgress === "function") {
        options.onProgress({
          percent: snapshot.totalBytes ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 : 0,
          message: "Uploading..."
        });
      }
    }, error => finish(reject, error), async () => {
      try {
        finish(resolve, await getDownloadURL(task.snapshot.ref));
      } catch (error) {
        finish(reject, error);
      }
    });
  });
}

export async function uploadFile(file, path, options = {}) {
  if (!file || typeof file.size !== "number" || typeof file.type !== "string") {
    throw new Error("Choose a valid file before uploading.");
  }
  return uploadBlobToStorage(file, path, options);
}

export async function uploadImageDataUrl(image, path, options = {}) {
  if (typeof image !== "string" || !image.trim()) return "";
  const imageUrl = image.trim();
  if (/^(blob:|file:)/i.test(imageUrl)) {
    throw new Error("Temporary blob and local file URLs cannot be saved as cover images.");
  }
  if (!imageUrl.startsWith("data:")) {
    if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("/")) return imageUrl;
    throw new Error("Cover image must be an uploaded image, HTTPS URL, or site-relative asset.");
  }
  if (!/^data:image\/(?:jpeg|png|webp|gif|avif);base64,/i.test(imageUrl)) {
    throw new Error("The cover image data is not a supported image format.");
  }
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not prepare image for upload (HTTP ${response.status}).`);
  const blob = await response.blob();
  return uploadBlobToStorage(blob, path, {
    ...options,
    maxBytes: options.maxBytes || 12 * 1024 * 1024,
    allowedTypes: options.allowedTypes || ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    contentType: blob.type || imageUrl.slice(5, imageUrl.indexOf(";"))
  });
}

/**
 * Fetch with automatic exponential backoff retry to withstand net::ERR_QUIC_PROTOCOL_ERROR,
 * transient network drops, and HTTP 5xx status codes.
 * NOTE: If HTTP 429 (quota exceeded) is returned, it immediately returns without retrying
 * to prevent hammering the server or compounding quota exhaustion.
 */
export async function fetchWithRetry(url, options = {}, retries = 2, backoff = 350) {
  const priority = options?.priority ?? (options?.retryOn429 ? PRIORITY_FOREGROUND : PRIORITY_NORMAL);
  const max429Retries = options?.retryOn429 ? Math.min(2, retries) : 0;
  const max5xxRetries = Math.max(0, Math.min(3, retries));

  if (!options?.retryOn429 && checkIsRateLimited({ scope: "background" }) && String(url).includes("firestore.googleapis.com")) {
    return new Response(JSON.stringify({ error: { code: 429, message: "Firestore rate-limit cooldown active." } }), {
      status: 429,
      statusText: "Too Many Requests",
      headers: { "Content-Type": "application/json" }
    });
  }

  const response = await queuedFirestoreFetch(url, options, {
    priority,
    dedupeKey: options?.dedupeKey || "",
    max429Retries,
    max5xxRetries,
    baseBackoffMs: backoff,
    bypassRateLimit: Boolean(options?.bypassRateLimit)
  });

  if (response && !response.ok && response.status === 429) {
    markFirestoreRateLimited(30000, { scope: options?.retryOn429 ? "foreground" : "background" });
    return response;
  }
  return response;
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
        const isCoverImage = target.dataset.nuqthaCover === "true";
        if (isCoverImage || target.dataset.nuqthaImageDoc) return;
        if (typeof target.onerror === "function") return;
        const src = target.currentSrc || target.src;
        if (target.dataset.nuqthaFallback) {
          target.hidden = true;
        } else if (src && /^https?:/i.test(src) && !target.dataset.nuqthaRetried) {
          target.dataset.nuqthaRetried = "true";
          const separator = src.includes("?") ? "&" : "?";
          setTimeout(() => {
            if (target.isConnected) target.src = `${src}${separator}_retry=${Date.now()}`;
          }, 450);
        } else {
          target.dataset.nuqthaFallback = "true";
          target.removeAttribute("srcset");
          const siblingPlaceholder = target.parentElement?.querySelector("[data-nuqtha-image-placeholder]");
          const isBookImage = target.dataset.nuqthaEntity === "book" || target.dataset.nuqthaImageCollection === "books";
          if (siblingPlaceholder && !isBookImage) {
            siblingPlaceholder.hidden = false;
            siblingPlaceholder.style.removeProperty("display");
            siblingPlaceholder.classList.remove("hidden");
            target.style.opacity = "0";
            target.hidden = true;
          } else {
            target.src = isBookImage ? "/cover-placeholder.svg" : "/article-placeholder.svg";
          }
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
