/**
 * Text serializer — maps TextBody to HTML for pptxtojson `content` (Shape.content / Text.content).
 * Migration of pptx-renderer `TextRenderer.renderTextBody`: same inheritance and merge logic;
 * output is an HTML string instead of a DOM container. See textSerializer.md (this folder).
 */
import type { RenderContext } from './RenderContext';
import type { TextBody } from '../model/nodes/ShapeNode';
import type { PlaceholderInfo } from '../model/nodes/BaseNode';
import { SafeXmlNode } from '../parser/XmlParser';
/**
 * Find a placeholder node in a list by matching type and/or idx.
 */
export declare function findPlaceholderNode(placeholders: SafeXmlNode[], info: PlaceholderInfo): SafeXmlNode | undefined;
/**
 * Render a text body into the provided container element.
 *
 * Implements 7-level style inheritance:
 * 1. master.defaultTextStyle
 * 2. master.textStyles[category] (titleStyle / bodyStyle / otherStyle)
 * 3. master placeholder lstStyle
 * 4. layout placeholder lstStyle
 * 5. shape lstStyle
 * 6. paragraph pPr
 * 7. run rPr
 */
/** Optional overrides when rendering text (e.g. table cell style text properties from tcTxStyle). */
export interface RenderTextBodyOptions {
    /** When set, used as text color when the run has no explicit color (e.g. table style tcTxStyle). */
    cellTextColor?: string;
    /** When set, applies bold from table style tcTxStyle (overrides inherited, yields to explicit run rPr). */
    cellTextBold?: boolean;
    /** When set, applies italic from table style tcTxStyle (overrides inherited, yields to explicit run rPr). */
    cellTextItalic?: boolean;
    /** When set, applies font family from table style tcTxStyle (overrides inherited, yields to explicit run rPr). */
    cellTextFontFamily?: string;
    /** fontRef color from shape style (e.g. SmartArt). Overrides inherited styles but yields to explicit run rPr color. */
    fontRefColor?: string;
    /**
     * When set, used as text insets (EMU) for table cells. tcPr cell margins
     * (marL/marR/marT/marB) override the bodyPr defaults — in PowerPoint table
     * cells, the tcPr margins are the source of truth for cell padding, not
     * the OOXML shape bodyPr defaults (91440/45720 EMU).
     */
    cellMargins?: {
        lIns: number;
        rIns: number;
        tIns: number;
        bIns: number;
    };
    /**
     * Text frame width in px (shape width). Used to clamp the leading tab-fold
     * indent: a custom tab stop (a:tabLst) is an absolute column that can exceed
     * a narrow box. Without a clamp the folded `margin-left` swallows the whole
     * frame and CJK text wraps one char per line (slide 14 的三张窄卡片). When the
     * stop overshoots the box we cap the indent so a usable text column remains.
     */
    frameWidthPx?: number;
    /** Text frame height in output CSS coordinates. Used by preset text-warp layouts. */
    frameHeightPx?: number;
    /** Force paragraph text to stay on one line when PPT will grow/rotate the box instead of wrapping. */
    forceNoWrap?: boolean;
}
/**
 * Same contract as `TextRenderer.renderTextBody`, but returns an HTML string for `Shape.content` / `Text.content`
 * (types.ts / README) instead of mutating a DOM `container`.
 */
export declare function renderTextBody(textBody: TextBody | undefined, placeholder: PlaceholderInfo | undefined, ctx: RenderContext, options?: RenderTextBodyOptions): string;
