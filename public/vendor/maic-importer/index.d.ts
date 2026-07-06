/**
 * pptxtojson — Parse .pptx to JSON for PPTist
 * New TypeScript implementation; src1 is reference for data format.
 */
import { parseZip } from './parser/ZipParser';
import { buildPresentation } from './model/Presentation';
import { toPptxtojsonFormat } from './adapter/toPptxtojson';
import type { Output } from './adapter/types';
import type { MediaMode } from './serializer/RenderContext';
export interface ParseOptions {
    /**
     * 'base64' — embed media as data:… URLs (default, portable, large JSON).
     * 'blob'   — use blob: URLs (compact JSON, browser-only, good for development).
     */
    mediaMode?: MediaMode;
}
/**
 * Parse a .pptx file (ArrayBuffer) and return pptxtojson/PPTist format.
 * All dimensions in output are in pt.
 */
export declare function parse(buffer: ArrayBuffer, options?: ParseOptions): Promise<Output>;
export { parseZip, buildPresentation, toPptxtojsonFormat };
export type { Output, Slide, Element } from './adapter/types';
export type { PptxFiles } from './parser/ZipParser';
export type { PresentationData } from './model/Presentation';
export type { MediaMode } from './serializer/RenderContext';
export { importPptx, parsedToSlides, transformParsedToSlides, createMockImportContext, } from './import-pipeline';
export type { OssUpload, ImportPptxOptions, ImportContext, TransformResult, } from './import-pipeline';
export type { Slide as CanvasSlide } from '@openmaic/dsl';
