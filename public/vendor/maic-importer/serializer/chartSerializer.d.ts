/**
 * Serializes ChartNodeData to pptxtojson CommonChart or ScatterChart.
 * Reads chart XML from presentation.charts; extracts chartType, series data,
 * colors, and chart-type-specific properties (barDir, marker, holeSize, etc.).
 */
import type { ChartNodeData } from '../model/nodes/ChartNode';
import type { RenderContext } from './RenderContext';
import type { CommonChart, ScatterChart } from '../adapter/types';
export declare function chartToElement(node: ChartNodeData, ctx: RenderContext, _order: number): CommonChart | ScatterChart;
