/**
 * High-level entry: parsed pptxtojson(-pro) JSON → OpenMAIC canvas `Slide[]`.
 *
 * `parsedToSlides` is the transform-only path: it never touches the parser
 * source under `../src`, which keeps `pdfjs-dist`'s dynamic `require()` out
 * of the consumer's bundle. Callers running in bundlers that can't tolerate
 * those patterns (Turbopack, today) load `parse` via a runtime URL and pass
 * the JSON in.
 *
 * `importPptx` bundles parse + transform for environments without that
 * bundler constraint (Node scripts, plain Vite, etc.).
 *
 * Failure policy: every upload site inside `transformParsedToSlides` already
 * swallows individual errors and leaves the original base64 in place; we use
 * `Promise.allSettled` here so a missing inner `.catch` cannot fail the
 * whole import either.
 */
import type { Slide } from '@openmaic/dsl';
import type { Output } from '../adapter/types';
export type OssUpload = (blob: Blob, filename: string, dir?: string) => Promise<string>;
export interface ImportPptxOptions {
    /**
     * Upload media (images, audio, video) to remote storage and return the
     * public URL. If omitted, images keep their base64 data URLs and media
     * keeps an in-memory `blob:` URL (valid only for the current tab).
     */
    upload?: OssUpload;
}
/**
 * Convert a pre-parsed pptxtojson(-pro) `Output` JSON into OpenMAIC slides.
 *
 * Resolves after every queued upload has settled, so `Slide` elements
 * either hold the uploaded URL or fall back to the original base64.
 *
 * Bundler-safe: this entry has no transitive dependency on
 * `pptxtojson-pro/src` and therefore no `pdfjs-dist` dynamic-require trap.
 */
export declare function parsedToSlides(json: Output, options?: ImportPptxOptions): Promise<Slide[]>;
/**
 * Parse a .pptx file and convert it into OpenMAIC canvas slides.
 *
 * Convenience wrapper for environments that can bundle `pptxtojson-pro/src`
 * (Node, Vite, etc.). Inside Next/Turbopack, prefer URL-loading `parse`
 * yourself and calling {@link parsedToSlides} with the result.
 */
export declare function importPptx(input: File | Blob | ArrayBuffer, options?: ImportPptxOptions): Promise<Slide[]>;
export type { ImportContext, TransformResult } from './types';
export { transformParsedToSlides } from './transformParsedToSlides';
export { createMockImportContext } from './mockContext';
export type { Output } from '../adapter/types';
