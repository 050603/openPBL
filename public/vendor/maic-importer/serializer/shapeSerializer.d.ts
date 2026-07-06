/**
 * Shape serializer — mirrors `pptx-renderer-main/src/renderer/ShapeRenderer.renderShape` control flow
 * and naming, but emits pptxtojson `Shape` / `Text` objects (`adapter/types.ts`) instead of DOM.
 */
import type { ShapeNodeData } from '../model/nodes/ShapeNode';
import type { RenderContext } from './RenderContext';
import type { Shape, Text } from '../adapter/types';
/**
 * Serialize a shape node to pptxtojson `Shape` or `Text`.
 * Control flow and identifiers follow `renderShape` in `ShapeRenderer.ts`; output is JSON, not DOM.
 */
export declare function renderShape(node: ShapeNodeData, ctx: RenderContext, _order: number): Promise<Shape | Text>;
/** @deprecated Use `renderShape` — same name as `ShapeRenderer` for diff-friendly comparison. */
export declare function shapeToElement(node: ShapeNodeData, ctx: RenderContext, order: number): Promise<Shape | Text>;
