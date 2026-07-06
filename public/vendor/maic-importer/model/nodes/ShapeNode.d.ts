/**
 * Shape node parser — handles auto-shapes, text boxes, and connectors.
 */
import { SafeXmlNode } from '../../parser/XmlParser';
import { BaseNodeData } from './BaseNode';
export interface TextRun {
    text: string;
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    properties?: SafeXmlNode;
    /**
     * OOXML <a:fld type=""> 字段类型——常见 slidenum / datetime / footer。
     * 渲染时需在拿到 slide context 后替换为动态值（slidenum → 当前页码等）。
     */
    fldType?: string;
    /**
     * Serialized OMML (`m:oMathPara`/`m:oMath`) for an INLINE formula run that sits
     * inside a normal text paragraph (公式与中文混排，如「设 N 为类别数量」)。serializer
     * 把它渲染成行内 KaTeX；`text` 同时存纯文本作为渲染失败时的兜底。
     */
    ommlXml?: string;
    /** Uniform color node of an inline math run (OMML run color the converter drops). */
    mathColorNode?: SafeXmlNode;
}
export interface TextParagraph {
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    properties?: SafeXmlNode;
    runs: TextRun[];
    level: number;
    /** @internal End-of-paragraph run properties (a:endParaRPr). Defines font size for trailing paragraph mark. */
    endParaRPr?: SafeXmlNode;
}
export interface TextBody {
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    bodyProperties?: SafeXmlNode;
    /** @internal Fallback bodyPr from layout/master placeholder (used when shape's own bodyPr is missing attrs). */
    layoutBodyProperties?: SafeXmlNode;
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    listStyle?: SafeXmlNode;
    paragraphs: TextParagraph[];
}
export interface LineEndInfo {
    type: string;
    w?: string;
    len?: string;
}
/** Text box bounds in shape-local coordinates (used by diagram shapes with txXfrm). */
export interface TextBoxBounds {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
}
export interface ShapeNodeData extends BaseNodeData {
    nodeType: 'shape';
    presetGeometry?: string;
    adjustments: Map<string, number>;
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    customGeometry?: SafeXmlNode;
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    fill?: SafeXmlNode;
    /** @internal Raw XML node — opaque to consumers. Use serializePresentation() for JSON-safe data. */
    line?: SafeXmlNode;
    headEnd?: LineEndInfo;
    tailEnd?: LineEndInfo;
    textBody?: TextBody;
    /** When set (e.g. diagram txXfrm), text is laid out in this rect instead of full shape. */
    textBoxBounds?: TextBoxBounds;
}
/**
 * Parse a text body (`p:txBody` or `a:txBody`).
 */
export declare function parseTextBody(txBody: SafeXmlNode): TextBody | undefined;
/**
 * Parse a shape XML node (`p:sp` or `p:cxnSp`) into ShapeNodeData.
 */
export declare function parseShapeNode(spNode: SafeXmlNode): ShapeNodeData;
