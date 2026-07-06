/**
 * Theme parser — extracts color scheme and font definitions from a:theme XML.
 */
import { SafeXmlNode } from '../parser/XmlParser';
export interface ThemeData {
    colorScheme: Map<string, string>;
    majorFont: {
        latin: string;
        ea: string;
        cs: string;
        hans: string;
    };
    minorFont: {
        latin: string;
        ea: string;
        cs: string;
        hans: string;
    };
    fillStyles: SafeXmlNode[];
    lineStyles: SafeXmlNode[];
    effectStyles: SafeXmlNode[];
}
/**
 * Parse a theme XML root (`a:theme`) into ThemeData.
 */
export declare function parseTheme(root: SafeXmlNode): ThemeData;
