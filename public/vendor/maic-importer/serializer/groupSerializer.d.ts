/**
 * Serializes GroupNodeData to pptxtojson Group element.
 * Recursively serializes children via nodeToElement; flattens nested groups into elements.
 *
 * Child positions are output relative to the group (consistent with pptxtojson).
 * Applies chOff/chExt coordinate space transformation and scaling.
 */
import type { GroupNodeData } from '../model/nodes/GroupNode';
import type { SlideNode } from '../model/Slide';
import type { RenderContext } from './RenderContext';
import type { PptxFiles } from '../parser/ZipParser';
import type { Group, Element } from '../adapter/types';
export type NodeToElement = (node: SlideNode, ctx: RenderContext, order: number, files?: PptxFiles) => Promise<Element>;
export declare function groupToElement(node: GroupNodeData, ctx: RenderContext, _order: number, files: PptxFiles | undefined, nodeToElement: NodeToElement): Promise<Group>;
