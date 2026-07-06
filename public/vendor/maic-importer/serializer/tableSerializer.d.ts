/**
 * Serializes TableNodeData to pptxtojson Table element.
 *
 * Style resolution follows TableRenderer.ts architecture:
 *   getStyleSections returns an ordered array of style parts
 *   (wholeTbl → band → firstRow/lastRow/firstCol/lastCol).
 *   Later sections override earlier ones for fill, borders, and text props.
 *   Direct cell tcPr always takes highest priority.
 *
 * Aligned with src1/table.js for output format and
 * pptx-renderer-main/TableRenderer.ts for resolution logic.
 */
import type { TableNodeData } from '../model/nodes/TableNode';
import type { RenderContext } from './RenderContext';
import type { Table } from '../adapter/types';
export declare function tableToElement(node: TableNodeData, ctx: RenderContext, _order: number): Table;
