import { TFile } from "obsidian";

/**
 * Extension to MIME type mapping for common image formats.
 * Used to correct MIME types when the server/resource provides incorrect ones.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
};

/**
 * Get the correct MIME type based on file extension.
 * Falls back to the provided MIME type if extension is not recognized.
 */
export function getMimeTypeFromExtension(extension: string, fallback?: string): string {
    const ext = extension.toLowerCase().replace(/^\./, '');
    return EXTENSION_TO_MIME[ext] ?? fallback ?? 'application/octet-stream';
}

/**
 * Helper method which gets the contents of a vault file as a blob, including the proper mime-type.
 * Ensures correct MIME type based on file extension.
 */
export async function vaultFileToBlob(tFile: TFile): Promise<Blob> {
    const resource = tFile.vault.getResourcePath(tFile);
    const response = await fetch(resource);
    const originalBlob = await response.blob();

    // Correct the MIME type based on file extension if needed
    const expectedMimeType = getMimeTypeFromExtension(tFile.extension, originalBlob.type);

    if (originalBlob.type !== expectedMimeType) {
        // Create a new blob with the correct MIME type
        return new Blob([originalBlob], { type: expectedMimeType });
    }

    return originalBlob;
}