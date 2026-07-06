/**
 * Maps StyleResolver line style to pptxtojson Border + borderStrokeDasharray.
 */
import type { SafeXmlNode } from '../parser/XmlParser';
import type { RenderContext } from './RenderContext';
import type { Border } from '../adapter/types';
/**
 * Compute SVG-style dash array string from OOXML dash kind and stroke width (px).
 * Matches ShapeRenderer's svgDashArrayForKind logic for consistent output.
 */
export declare function dashArrayForKind(dashKind: string, strokeWidthPx: number): string;
export interface BorderResult {
    border: Border;
    borderStrokeDasharray: string;
}
/**
 * Resolve ln (a:ln) node to types.Border and borderStrokeDasharray.
 * Width from resolveLineStyle is in px; we convert to pt for output.
 */
export declare function lineStyleToBorder(ln: SafeXmlNode, ctx: RenderContext, lnRef?: SafeXmlNode): BorderResult;
