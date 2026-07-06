/**
 * Slide serializer — orchestrates background fill, layoutElements, and slide elements
 * using the same order as SlideRenderer: fill → master template shapes → layout template shapes → slide nodes.
 */
import type { SlideData } from '../model/Slide';
import type { SlideNode } from '../model/Slide';
import type { PresentationData } from '../model/Presentation';
import type { PptxFiles } from '../parser/ZipParser';
import { createRenderContext, type MediaMode } from './RenderContext';
import type { Slide, Element } from '../adapter/types';
/**
 * Dispatch a slide node to the appropriate serializer and return Element.
 */
declare function nodeToElement(node: SlideNode, ctx: ReturnType<typeof createRenderContext>, order: number, files?: PptxFiles): Promise<Element>;
/**
 * Serialize one slide to pptxtojson Slide (fill, layoutElements, elements, note, transition).
 *
 * Order:
 * 1. Background (slide → layout → master inheritance)
 * 2. Master non-placeholder shapes (behind everything)
 * 3. Layout non-placeholder shapes
 * 4. Slide shapes (on top)
 */
export declare function slideToSlide(presentation: PresentationData, slide: SlideData, files: PptxFiles, mediaMode?: MediaMode): Promise<Slide>;
export { nodeToElement };
