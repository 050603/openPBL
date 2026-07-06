/**
 * Math serializer — converts MathNodeData into a Math element with LaTeX.
 *
 * Pipeline: OMML XML → normalizeOmmlXml (surrogate-safe Unicode normalization)
 *         → omml2mathml (MathML DOM) → mathml-to-latex (LaTeX string)
 *         → postProcessLatex (clean up remaining Unicode / HTML entities)
 */
import type { MathNodeData } from '../model/nodes/MathNode';
import type { RenderContext } from './RenderContext';
import type { Math as MathElement } from '../adapter/types';
/**
 * Pre-convert a batch of OMML strings via /api/texmath and cache the results.
 * Best-effort: any failure (no endpoint, texmath error) leaves that entry
 * uncached so `ommlToLatex` falls back to the JS pipeline.
 */
export declare function prefetchTexmath(ommlList: string[]): Promise<void>;
/**
 * Convert OMML XML string to LaTeX. Prefers a cached texmath result (filled by
 * {@link prefetchTexmath}); otherwise uses the in-browser omml2mathml +
 * mathml-to-latex pipeline.
 * Exported so textSerializer can render inline `m:oMath` runs (公式与正文混排)
 * without going through the standalone Math element path.
 */
export declare function ommlToLatex(ommlXml: string): string;
/**
 * Serialize a math node to a Math element.
 */
export declare function mathToElement(node: MathNodeData, ctx: RenderContext, _order: number): Promise<MathElement>;
