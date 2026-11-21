import { sanitizeImageUrl } from "../schema-validator.js";

const MAX_SAFE_FIRESTORE_DOCUMENT_BYTES = 800 * 1024;

export function getAdminImageFields(coverImage, thumbnailImage = coverImage) {
    const safeCoverImage = sanitizeImageUrl(coverImage);
    const safeThumbnailImage = sanitizeImageUrl(thumbnailImage);
    return {
        imageUrl: safeCoverImage,
        coverImage: safeCoverImage,
        coverUrl: safeCoverImage,
        cover: safeCoverImage,
        image: safeCoverImage,
        thumbnailUrl: safeThumbnailImage,
        thumbnail: safeThumbnailImage,
        ogImage: safeThumbnailImage
    };
}

function isSafeInlineImage(imageUrl, documentData) {
    if (!/^data:image\/(?:jpeg|jpg|png|webp|gif|avif);base64,/i.test(imageUrl || "") || !documentData) {
        return false;
    }

    try {
        const serialized = JSON.stringify(documentData);
        return Boolean(serialized) && new Blob([serialized]).size <= MAX_SAFE_FIRESTORE_DOCUMENT_BYTES;
    } catch (error) {
        console.warn("[Admin Images] Could not estimate inline image document size.", error);
        return false;
    }
}

export function resolveAdminImageFallback(selectedImage, existingImage, documentData, imageFields = []) {
    const safeSelection = sanitizeImageUrl(selectedImage);
    if (safeSelection && isSafeInlineImage(safeSelection, documentData)) return safeSelection;

    const safeExistingImage = sanitizeImageUrl(existingImage);
    if (!safeExistingImage) return "/cover-placeholder.svg";
    if (!/^data:/i.test(safeExistingImage)) return safeExistingImage;

    const fallbackDocument = { ...documentData };
    imageFields.forEach(field => {
        fallbackDocument[field] = safeExistingImage;
    });
    return isSafeInlineImage(safeExistingImage, fallbackDocument)
        ? safeExistingImage
        : "/cover-placeholder.svg";
}
