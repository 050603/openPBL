/**
 * Slide parser — converts a slide XML into a structured SlideData
 * with typed node objects for each shape on the slide.
 */
import { SafeXmlNode } from '../parser/XmlParser';
import { RelEntry } from '../parser/RelParser';
import { ShapeNodeData } from './nodes/ShapeNode';
import { PicNodeData } from './nodes/PicNode';
import { TableNodeData } from './nodes/TableNode';
import { GroupNodeData } from './nodes/GroupNode';
import { ChartNodeData } from './nodes/ChartNode';
import { MathNodeData } from './nodes/MathNode';
export type SlideNode = ShapeNodeData | PicNodeData | TableNodeData | GroupNodeData | ChartNodeData | MathNodeData;
export interface SlideData {
    index: number;
    nodes: SlideNode[];
    background?: SafeXmlNode;
    layoutIndex: string;
    rels: Map<string, RelEntry>;
    /** Full path to the slide file (e.g. "ppt/slides/slide3.xml"). */
    slidePath: string;
    /** When false, shapes from the layout and master should NOT be rendered on this slide. */
    showMasterSp: boolean;
}
/**
 * Parse a graphicFrame that contains an OLE object with a fallback picture (preview image).
 * Uses the frame's position/size and the inner pic's blip embed.
 * Exported for use in GroupRenderer when parsing group children.
 */
export declare function parseOleFrameAsPicture(graphicFrame: SafeXmlNode): PicNodeData | undefined;
/**
 * Parse a single child node from spTree, dispatching to the appropriate parser.
 */
export declare function parseChildNode(child: SafeXmlNode, rels: Map<string, RelEntry>, slidePath: string, diagramDrawings?: Map<string, string>): SlideNode | undefined;
/**
 * Parse a slide XML root (`p:sld`) into SlideData.
 *
 * @param root      Parsed XML root of the slide
 * @param index     Zero-based slide index
 * @param rels      Relationship entries for this slide
 * @param slidePath Full path to the slide file (e.g. "ppt/slides/slide1.xml")
 */
export declare function parseSlide(root: SafeXmlNode, index: number, rels: Map<string, RelEntry>, slidePath?: string, diagramDrawings?: Map<string, string>): SlideData;
