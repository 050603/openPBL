/**
 * Slide master parser — extracts color map, background, text styles,
 * and placeholder shapes from a p:sldMaster XML.
 */
import { SafeXmlNode } from '../parser/XmlParser';
import type { RelEntry } from '../parser/RelParser';
export interface MasterData {
    colorMap: Map<string, string>;
    background?: SafeXmlNode;
    textStyles: {
        titleStyle?: SafeXmlNode;
        bodyStyle?: SafeXmlNode;
        otherStyle?: SafeXmlNode;
    };
    defaultTextStyle?: SafeXmlNode;
    placeholders: SafeXmlNode[];
    spTree: SafeXmlNode;
    rels: Map<string, RelEntry>;
}
/**
 * Parse a slide master XML root (`p:sldMaster`) into MasterData.
 */
export declare function parseMaster(root: SafeXmlNode): MasterData;
