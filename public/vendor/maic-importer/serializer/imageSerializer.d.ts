/**
 * Image serializer — converts PicNodeData into positioned HTML image/video/audio elements.
 */
import type { PicNodeData } from '../model/nodes/PicNode';
import type { RenderContext } from './RenderContext';
import type { Image, Video, Audio } from '../adapter/types';
/**
 * Serialize picture node to Image, Video, or Audio element.
 *
 * Handles:
 * - Standard images (png, jpg, gif, svg, bmp)
 * - Unsupported formats (wmf) with placeholder
 * - Video elements with controls
 * - Audio elements with controls
 * - Crop via `rect` (fractions)
 * - Rotation and flip on Image
 */
export declare function pictureToElement(node: PicNodeData, ctx: RenderContext, _order: number): Promise<Image | Video | Audio>;
