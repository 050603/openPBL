/**
 * Adapter: PresentationData + PptxFiles → pptxtojson/PPTist output format.
 * All dimensions in output are in pt (px * 0.75).
 * Delegates slide serialization to the serializer layer (slideToSlide).
 */
import type { PresentationData } from '../model/Presentation';
import type { PptxFiles } from '../parser/ZipParser';
import type { Output } from './types';
import type { MediaMode } from '../serializer/RenderContext';
export declare function toPptxtojsonFormat(presentation: PresentationData, files: PptxFiles, mediaMode?: MediaMode): Promise<Output>;
