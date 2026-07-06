/**
 * PPTX zip archive parser.
 * Extracts and categorizes all files from a .pptx (which is a zip archive).
 */
export interface PptxFiles {
    contentTypes: string;
    presentation: string;
    presentationRels: string;
    slides: Map<string, string>;
    slideRels: Map<string, string>;
    slideLayouts: Map<string, string>;
    slideLayoutRels: Map<string, string>;
    slideMasters: Map<string, string>;
    slideMasterRels: Map<string, string>;
    themes: Map<string, string>;
    media: Map<string, Uint8Array>;
    tableStyles?: string;
    charts: Map<string, string>;
    chartStyles: Map<string, string>;
    chartColors: Map<string, string>;
    diagramDrawings: Map<string, string>;
    notesSlides: Map<string, string>;
    embeddings: Map<string, Uint8Array>;
}
export interface ZipParseLimits {
    /** Maximum number of non-directory entries in the zip archive. */
    maxEntries?: number;
    /** Maximum uncompressed size for any single entry (bytes). */
    maxEntryUncompressedBytes?: number;
    /** Maximum total uncompressed size across all entries (bytes). */
    maxTotalUncompressedBytes?: number;
    /** Maximum uncompressed size across media entries under `ppt/media/` (bytes). */
    maxMediaBytes?: number;
    /** Maximum concurrent zip entry reads during parsing. */
    maxConcurrency?: number;
}
/**
 * Parse a .pptx file buffer and extract all relevant files, categorized by type.
 */
export declare function parseZip(buffer: ArrayBuffer, limits?: ZipParseLimits): Promise<PptxFiles>;
