export const DEFAULT_FIREBASE_PROJECT_ID = "nuqtha-c0900";

export function resolveFirebaseProjectId(...projectIds) {
    const configuredProjectId = projectIds.find(
        projectId => typeof projectId === "string" && projectId.trim()
    );
    return configuredProjectId ? configuredProjectId.trim() : DEFAULT_FIREBASE_PROJECT_ID;
}
