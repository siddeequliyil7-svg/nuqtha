import { sanitizeImageUrl } from "../schema-validator.js";

export const MAX_SAFE_FIRESTORE_DOCUMENT_BYTES = 800 * 1024;

const ARTICLE_IMAGE_ALIAS_FIELDS = [
    "imageUrl", "coverImage", "coverUrl", "cover", "image",
    "thumbnailUrl", "thumbnail", "thumbUrl", "thumb", "ogImage"
];

export function isPlaceholderImageUrl(url) {
    return /(?:^|\/)(?:cover|article|og)-placeholder(?:\.[a-z0-9]+)?(?:$|[?#])|\/og-cover\.(?:svg|png)(?:$|[?#])/i.test(String(url || "").trim());
}

function isCompactInlineOrLongUri(value) {
    const str = String(value || "");
    return /^data:/i.test(str) || str.length > 2048;
}

export function getAdminImageFields(coverImage, thumbnailImage = coverImage) {
    const rawCover = sanitizeImageUrl(coverImage);
    const rawThumbnail = sanitizeImageUrl(thumbnailImage);
    const safeCoverImage = isPlaceholderImageUrl(rawCover) ? "" : rawCover;
    const safeThumbnailImage = isPlaceholderImageUrl(rawThumbnail) ? "" : rawThumbnail;

    const inlineCover = isCompactInlineOrLongUri(safeCoverImage);
    const inlineThumb = isCompactInlineOrLongUri(safeThumbnailImage);

    return {
        imageUrl: safeCoverImage,
        coverImage: inlineCover ? "" : safeCoverImage,
        coverUrl: inlineCover ? "" : safeCoverImage,
        cover: inlineCover ? "" : safeCoverImage,
        image: inlineCover ? "" : safeCoverImage,
        thumbnailUrl: inlineThumb
            ? (safeThumbnailImage === safeCoverImage ? "" : safeThumbnailImage)
            : (inlineCover && safeThumbnailImage === safeCoverImage ? "" : safeThumbnailImage),
        thumbnail: (inlineThumb || inlineCover) ? "" : safeThumbnailImage,
        thumbUrl: (inlineThumb || inlineCover) ? "" : safeThumbnailImage,
        thumb: (inlineThumb || inlineCover) ? "" : safeThumbnailImage,
        ogImage: (inlineThumb || inlineCover) ? "" : safeThumbnailImage
    };
}

function buildCompactDocumentForSizeCheck(documentData, testedImage, imageFields = []) {
    const candidateDoc = { ...(documentData || {}) };
    const usesArticleAliases = !Array.isArray(imageFields) || imageFields.length === 0 ||
        imageFields.some(field => ARTICLE_IMAGE_ALIAS_FIELDS.includes(field));

    if (usesArticleAliases) {
        const currentThumb = sanitizeImageUrl(
            candidateDoc.thumbnailUrl || candidateDoc.thumbnail || candidateDoc.thumbUrl || candidateDoc.thumb || candidateDoc.ogImage || ""
        );
        const distinctThumb = currentThumb && currentThumb !== testedImage && !isPlaceholderImageUrl(currentThumb)
            ? currentThumb
            : "";
        Object.assign(candidateDoc, getAdminImageFields(testedImage, distinctThumb || testedImage));
        ["imageBase64", "coverBase64", "base64", "coverPhoto", "featuredImage"].forEach(extraField => {
            if (typeof candidateDoc[extraField] === "string" && /^data:/i.test(candidateDoc[extraField])) {
                candidateDoc[extraField] = "";
            }
        });
    } else {
        const primaryField = imageFields[0];
        imageFields.forEach((field, idx) => {
            candidateDoc[field] = idx === 0 || !isCompactInlineOrLongUri(testedImage) ? testedImage : "";
        });
        if (primaryField && !candidateDoc[primaryField]) {
            candidateDoc[primaryField] = testedImage;
        }
    }
    return candidateDoc;
}

export function estimateFirestoreDocumentBytes(documentData) {
    if (!documentData || typeof documentData !== "object") return 0;
    try {
        const serialized = JSON.stringify(documentData);
        return serialized ? new Blob([serialized]).size : 0;
    } catch (error) {
        console.warn("[Admin Images] Could not estimate document size.", error);
        return Number.POSITIVE_INFINITY;
    }
}

function isSafeInlineImage(imageUrl, documentData, imageFields = []) {
    if (!/^data:image\/(?:jpeg|jpg|png|webp|gif|avif);base64,/i.test(imageUrl || "") || !documentData) {
        return false;
    }

    const compactDoc = buildCompactDocumentForSizeCheck(documentData, imageUrl, imageFields);
    const bytes = estimateFirestoreDocumentBytes(compactDoc);
    return Number.isFinite(bytes) && bytes <= MAX_SAFE_FIRESTORE_DOCUMENT_BYTES;
}

export function resolveAdminImageFallback(selectedImage, existingImage, documentData, imageFields = []) {
    const rawSelection = sanitizeImageUrl(selectedImage);
    const safeSelection = isPlaceholderImageUrl(rawSelection) ? "" : rawSelection;
    if (safeSelection) {
        if (!/^data:/i.test(safeSelection) && !/^blob:/i.test(safeSelection)) return safeSelection;
        if (isSafeInlineImage(safeSelection, documentData, imageFields)) return safeSelection;
    }

    const rawExistingImage = sanitizeImageUrl(existingImage);
    const safeExistingImage = isPlaceholderImageUrl(rawExistingImage) ? "" : rawExistingImage;
    if (!safeExistingImage) return "/cover-placeholder.svg";
    if (!/^data:/i.test(safeExistingImage)) return safeExistingImage;

    return isSafeInlineImage(safeExistingImage, documentData, imageFields)
        ? safeExistingImage
        : "/cover-placeholder.svg";
}

