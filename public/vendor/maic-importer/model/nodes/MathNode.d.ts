/**
 * Math node — represents a math formula embedded via mc:AlternateContent.
 *
 * PPTX stores math formulas as:
 *   mc:AlternateContent
 *     mc:Choice (Requires="a14") → p:sp with m:oMathPara in txBody
 *     mc:Fallback → p:sp with blipFill (static image preview)
 */
import { SafeXmlNode } from '../../parser/XmlParser';
import { BaseNodeData } from './BaseNode';
export interface MathNodeData extends BaseNodeData {
    nodeType: 'math';
    /**
     * When every math run shares one explicit color (a:rPr>solidFill), this is
     * that color node — OMML→LaTeX converters drop drawingML run color, so the
     * serializer resolves this and applies it to the whole formula (e.g. 蓝色
     * 权重 W=(w₁,…,wₙ)). Mixed-color formulas leave it undefined (default color).
     */
    colorNode?: SafeXmlNode;
    /** Serialized OMML XML string (first m:oMathPara or m:oMath element). */
    ommlXml: string;
    /**
     * One serialized OMML string per paragraph-level formula in the box. A
     * PPTX 公式文本框 often holds several `<a:p>`, each with its own
     * `m:oMathPara` (e.g. slide 29 的输入框 4 行算式)。Older code only kept the
     * first (`ommlXml`); keep them all so the serializer can emit every line.
     */
    ommlXmls?: string[];
    /** r:embed of fallback image from mc:Fallback branch. */
    fallbackBlipEmbed?: string;
    /** Plain text extracted from m:t elements inside the OMML. */
    plainText: string;
    /** rId of embedded .docx package (Word.Document OLE — contains EQ field math). */
    oleDocxRId?: string;
}
/**
 * If every math run (`m:r`) carries the same explicit color
 * (`a:rPr > a:solidFill > a:srgbClr|a:schemeClr`), return that color node so
 * the serializer can resolve + apply it. Returns undefined when there's no
 * explicit color or the runs use mixed colors (then the formula keeps the
 * default color — partial per-run coloring isn't reconstructed).
 */
export declare function uniformMathColorNode(ommlNode: SafeXmlNode): SafeXmlNode | undefined;
/**
 * Detect whether an mc:AlternateContent node contains a math formula.
 * Math formulas have mc:Choice with p:sp > p:txBody containing m:oMathPara/m:oMath.
 */
export declare function isMathAlternateContent(altContent: SafeXmlNode): boolean;
/**
 * Parse a graphicFrame whose oleObj has progId starting with "Word.Document".
 * These OLE objects contain embedded .docx with EQ field math (legacy Word formula).
 * The actual docx parsing is deferred to the serializer (needs zip decompression);
 * here we just capture the rIds.
 */
export declare function parseOleDocxMathNode(graphicFrame: SafeXmlNode): MathNodeData | undefined;
/**
 * Parse an mc:AlternateContent node containing a math formula into MathNodeData.
 */
export declare function parseMathNode(altContent: SafeXmlNode): MathNodeData | undefined;
