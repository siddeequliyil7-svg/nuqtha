import {
    addDoc as firestoreAddDoc,
    setDoc as firestoreSetDoc,
    updateDoc as firestoreUpdateDoc,
    deleteDoc as firestoreDeleteDoc,
    uploadImageDataUrl as firebaseUploadImageDataUrl,
    uploadFile as firebaseUploadFile
} from "../firebase-config.js";
import { assertApprovedAdmin, runAction } from "./admin-actions.js";

async function requireFirebaseAdminAuth() {
    const user = await assertApprovedAdmin();
    await user.getIdToken();
}

function runAdminWrite(writeOperation, args, options = {}) {
    return runAction(null, async ({ reportProgress }) => {
        await requireFirebaseAdminAuth();
        const writeArgs = [...args];
        if (options.progressArgumentIndex !== undefined) {
            const index = options.progressArgumentIndex;
            const existingProgress = writeArgs[index]?.onProgress;
            writeArgs[index] = {
                ...(writeArgs[index] || {}),
                onProgress(progress) {
                    reportProgress(progress);
                    existingProgress?.(progress);
                }
            };
        }
        return writeOperation(...writeArgs);
    }, {
        loadingText: options.loadingText || "Saving...",
        successMsg: options.successMsg || "Saved successfully.",
        nested: true,
        logError: options.logError,
        rethrow: true
    }).then(result => {
        if (result?.skipped) throw new Error("Another admin action is in progress. Please retry.");
        return result && result.ok ? result.value : result;
    });
}

export function getAdminWriteErrorMessage(error, action) {
    const message = String(error?.message || error || "");
    if (error?.code === "admin/not-authenticated") {
        return "Please sign in as admin.";
    }
    if (error?.code === "admin/permission-denied") {
        return `${action} was blocked. Sign in with an approved, verified admin email.`;
    }
    if (error?.code === "permission-denied" || /missing or insufficient permissions/i.test(message)) {
        return `${action} was denied by Firebase security rules (${error?.code || "permission-denied"}): ${message}`;
    }
    return `${action} failed: ${message || "Unknown error."}`;
}

export function addDoc(...args) {
    return runAdminWrite(firestoreAddDoc, args, { successMsg: "Saved successfully." });
}

export function setDoc(...args) {
    return runAdminWrite(firestoreSetDoc, args, { successMsg: "Saved successfully." });
}

export function updateDoc(...args) {
    return runAdminWrite(firestoreUpdateDoc, args, { successMsg: "Changes saved successfully." });
}

export function deleteDoc(...args) {
    return runAdminWrite(firestoreDeleteDoc, args, { loadingText: "Deleting...", successMsg: "Deleted successfully." });
}

export function uploadImageDataUrl(image, path, options = {}) {
    return runAdminWrite(firebaseUploadImageDataUrl, [image, path, options], {
        loadingText: "Uploading...",
        successMsg: "Upload complete.",
        progressArgumentIndex: 2,
        logError: false
    });
}

export function uploadFile(file, path, options = {}) {
    return runAdminWrite(firebaseUploadFile, [file, path, options], {
        loadingText: "Uploading...",
        successMsg: "Upload complete.",
        progressArgumentIndex: 2,
        logError: false
    });
}
