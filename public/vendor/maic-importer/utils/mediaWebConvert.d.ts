/**
 * Convert legacy / non-web-safe image bytes to PNG data URLs
 * so JSON output works in browsers (PPTist).
 *
 * Supported conversions:
 * - TIFF/TIF  → PNG  (sync, via UTIF)
 * - EMF bitmap (STRETCHDIBITS) → PNG  (sync, DIB extraction)
 * - EMF vector (embedded PDF)  → PNG  (async, pdfjs-dist + canvas)
 * - WDP/JXR/HDP (JPEG XR)     → PNG  (async, jpegxr WASM decoder)
 * - WMF → transparent placeholder (unsupported)
 * - PNG/JPEG/GIF/WebP/BMP/SVG  → pass-through with correct MIME
 */
/**
 * Convert media bytes to a data URL suitable for web display.
 *
 * Async because WDP decoding (jpegxr WASM) and EMF-PDF rendering
 * (pdfjs-dist) require async initialization; all other formats
 * resolve immediately.
 */
export declare function encodeMediaForWebDisplay(mediaPath: string, data: Uint8Array): Promise<string>;
/**
 * Resolve media bytes to a URL string according to the given mode.
 */
export declare function resolveMediaToUrl(mediaPath: string, data: Uint8Array | ArrayBuffer, mode: 'base64' | 'blob', cache: Map<string, string>): Promise<string>;
