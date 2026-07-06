/**
 * Media utilities — MIME type detection, path resolution, and blob URL management.
 */
/**
 * Determine MIME type from file extension.
 * Covers images, video, and audio formats used in PPTX files.
 */
export declare function getMimeType(path: string): string;
/**
 * Resolve a relative media path (from rels) to its canonical path in PptxFiles.media.
 * Rels targets are relative like "../media/image1.png".
 * Media paths in PptxFiles are like "ppt/media/image1.png".
 */
export declare function resolveMediaPath(target: string): string;
/**
 * Get or create a blob URL for a media file, using a cache to avoid duplicates.
 *
 * @param mediaPath - Canonical path (e.g. "ppt/media/image1.png")
 * @param data - Raw media data (Uint8Array or ArrayBuffer)
 * @param cache - Map to store/retrieve cached blob URLs
 * @returns The blob URL string
 */
export declare function getOrCreateBlobUrl(mediaPath: string, data: Uint8Array | ArrayBuffer, cache: Map<string, string>): string;
/**
 * Build a data URL string from raw base64 and MIME.
 */
export declare function toDataUrl(base64: string, mime: string): string;
