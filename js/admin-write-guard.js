import {
    addDoc as firestoreAddDoc,
    setDoc as firestoreSetDoc,
    updateDoc as firestoreUpdateDoc,
    deleteDoc as firestoreDeleteDoc,
    uploadImageDataUrl as firebaseUploadImageDataUrl
} from "../firebase-config.js";
import { APPROVED_ADMIN_EMAILS, loadFirebaseAuth } from "./auth-system.js";

async function requireFirebaseAdminAuth() {
    let auth;
    try {
        ({ auth } = await loadFirebaseAuth());
    } catch {
        throw new Error("Admin write requires Firebase sign-in. Sign in with an approved Google admin account and retry.");
    }

    const user = auth?.currentUser;
    const email = String(user?.email || "").trim().toLowerCase();
    const isApprovedAdmin = Boolean(user?.emailVerified && APPROVED_ADMIN_EMAILS.some(approved =>
        String(approved).trim().toLowerCase() === email
    ));
    if (!isApprovedAdmin) {
        throw new Error("Admin write blocked: a Firebase-authenticated approved admin account is required. The local admin password does not authorize Firestore writes.");
    }

    await user.getIdToken();
}

async function runAdminWrite(writeOperation, args) {
    await requireFirebaseAdminAuth();
    return writeOperation(...args);
}

export function getAdminWriteErrorMessage(error, action) {
    const message = String(error?.message || error || "");
    if (error?.code === "permission-denied" || /missing or insufficient permissions/i.test(message)) {
        return `${action} was denied by Firestore security rules. Sign in with an approved Firebase admin account and verify that the deployed rules permit this admin to write the affected collection.`;
    }
    return `${action} failed: ${message || "Unknown error."}`;
}

export function addDoc(...args) {
    return runAdminWrite(firestoreAddDoc, args);
}

export function setDoc(...args) {
    return runAdminWrite(firestoreSetDoc, args);
}

export function updateDoc(...args) {
    return runAdminWrite(firestoreUpdateDoc, args);
}

export function deleteDoc(...args) {
    return runAdminWrite(firestoreDeleteDoc, args);
}

export function uploadImageDataUrl(...args) {
    return runAdminWrite(firebaseUploadImageDataUrl, args);
}
