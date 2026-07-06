/**
 * Background serializer — resolves and applies slide/layout/master backgrounds.
 */
import type { SafeXmlNode } from '../parser/XmlParser';
import type { RenderContext } from './RenderContext';
import { type GradientFillData } from './StyleResolver';
import type { RelEntry } from '../parser/RelParser';
import type { Fill, GradientFill } from '../adapter/types';
/**
 * Resolve slide fill
 *
 * Background priority: slide.background -> layout.background -> master.background.
 * The first found background is used.
 */
export declare function resolveSlideFill(ctx: RenderContext): Promise<Fill>;
/**
 * Render background from bgPr (background properties).
 * Contains direct fill definitions: solidFill, gradFill, blipFill, etc.
 */
export declare function renderBgPr(bgPr: SafeXmlNode, ctx: RenderContext, rels?: Map<string, RelEntry>): Promise<Fill>;
/**
 * Render background from bgRef (theme format scheme reference).
 * Simplified: just resolve the color from the reference.
 */
export declare function renderBgRef(bgRef: SafeXmlNode, ctx: RenderContext): Fill;
/** Convert GradientFillData to types.GradientFill.value (path, rot, colors). */
export declare function gradientFillDataToValue(data: GradientFillData): GradientFill['value'];
