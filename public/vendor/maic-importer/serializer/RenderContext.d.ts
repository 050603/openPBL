/**
 * Render context — provides resolved theme/master/layout chain for a given slide.
 */
import { PresentationData } from '../model/Presentation';
import { SlideData } from '../model/Slide';
import { ThemeData } from '../model/Theme';
import { MasterData } from '../model/Master';
import { LayoutData } from '../model/Layout';
import { SafeXmlNode } from '../parser/XmlParser';
export type MediaMode = 'base64' | 'blob';
export interface RenderContext {
    presentation: PresentationData;
    slide: SlideData;
    theme: ThemeData;
    master: MasterData;
    layout: LayoutData;
    /** Package path to current slide layout XML, e.g. `ppt/slideLayouts/slideLayout3.xml`. Used for placeholder fill inheritance. */
    layoutPath: string;
    /** Package path to slide master XML, e.g. `ppt/slideMasters/slideMaster1.xml`. */
    masterPath: string;
    mediaUrlCache: Map<string, string>;
    colorCache: Map<string, {
        color: string;
        alpha: number;
    }>;
    /** Fill node from parent group's grpSpPr, used to resolve `a:grpFill` in children. */
    groupFillNode?: SafeXmlNode;
    /**
     * 'base64' — embed media as data URLs (default, portable JSON).
     * 'blob'   — use blob URLs (shorter JSON, browser-only, good for development).
     */
    mediaMode: MediaMode;
    /**
     * Navigation callback for shape-level hyperlink actions (action buttons, clickable shapes).
     * Called with target slide index (0-based) for `ppaction://hlinksldjump`,
     * or with a URL string for external links.
     */
    onNavigate?: (target: {
        slideIndex?: number;
        url?: string;
    }) => void;
}
export declare function createRenderContext(presentation: PresentationData, slide: SlideData, mediaUrlCache?: Map<string, string>, mediaMode?: MediaMode): RenderContext;
