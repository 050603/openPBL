/**
 * Top-level presentation builder — assembles all parsed components
 * (themes, masters, layouts, slides) into a single PresentationData structure.
 */
import { PptxFiles } from '../parser/ZipParser';
import { SafeXmlNode } from '../parser/XmlParser';
import { ThemeData } from './Theme';
import { MasterData } from './Master';
import { LayoutData } from './Layout';
import { SlideData } from './Slide';
export interface PresentationData {
    width: number;
    height: number;
    slides: SlideData[];
    layouts: Map<string, LayoutData>;
    masters: Map<string, MasterData>;
    themes: Map<string, ThemeData>;
    slideToLayout: Map<number, string>;
    layoutToMaster: Map<string, string>;
    masterToTheme: Map<string, string>;
    media: Map<string, Uint8Array>;
    embeddings: Map<string, Uint8Array>;
    tableStyles?: SafeXmlNode;
    charts: Map<string, SafeXmlNode>;
    isWps: boolean;
}
/**
 * Build the complete PresentationData from extracted PPTX files.
 *
 * This is the main factory function that wires together all parsed components:
 * 1. Parses presentation.xml for slide ordering and size
 * 2. Resolves the full relationship chain: slide → layout → master → theme
 * 3. Parses each component and assembles the final structure
 */
export declare function buildPresentation(files: PptxFiles): PresentationData;
