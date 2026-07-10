"use client";

/**
 * KnowledgeGraphFlow — 基于 @xyflow/react (React Flow v12) 的知识图谱可视化组件
 *
 * 特性：
 * - 节点拖拽、画布平移、滚轮缩放
 * - 路径高亮：选中节点时高亮其相邻节点与连边，其余节点淡化
 * - 外部联动：通过 activeNodeId 高亮当前讲解的知识点（与 OpenMAIC 场景联动）
 * - 层级布局：foundation → core → application → extension 自上而下分层
 */

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Handle } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KnowledgeGraph, KnowledgeGraphNode, KnowledgePoint } from "@/lib/session/types";
import { normalizeKnowledgeGraphForDisplay } from "@/components/knowledge-graph";

// ===== 层级配色 =====
type Level = NonNullable<KnowledgeGraphNode["level"]>;

const LEVEL_LABEL: Record<Level, string> = {
  foundation: "基础",
  core: "核心",
  application: "应用",
  extension: "拓展",
};

const LEVEL_STYLE: Record<Level, { bg: string; border: string; text: string; dot: string }> = {
  foundation: { bg: "#f0f9ff", border: "#7dd3fc", text: "#075985", dot: "#0ea5e9" },
  core: { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af", dot: "#3b82f6" },
  application: { bg: "#ecfdf5", border: "#6ee7b7", text: "#065f46", dot: "#10b981" },
  extension: { bg: "#f5f3ff", border: "#c4b5fd", text: "#5b21b6", dot: "#8b5cf6" },
};

const LEVEL_ORDER: Level[] = ["foundation", "core", "application", "extension"];
const ZERO_POSITION = { x: 0, y: 0 };

// ===== 自定义节点 =====
type KgNodeData = {
  label: string;
  level: Level;
  description?: string;
  keyInfo?: string;
  isActive?: boolean;
  isDimmed?: boolean;
};

function KnowledgeNode({ data }: NodeProps) {
  const d = data as KgNodeData;
  const style = LEVEL_STYLE[d.level];
  return (
    <div
      className="flex min-w-[140px] max-w-[200px] flex-col gap-1 rounded-[10px] border-2 px-3 py-2 shadow-sm transition-all"
      style={{
        background: d.isActive ? "#fffbeb" : style.bg,
        borderColor: d.isActive ? "#f59e0b" : style.border,
        color: style.text,
        opacity: d.isDimmed ? 0.35 : 1,
        boxShadow: d.isActive
          ? "0 0 0 4px rgba(245, 158, 11, 0.25), 0 4px 12px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        transform: d.isActive ? "scale(1.06)" : "scale(1)",
      }}
    >
      <Handle position={Position.Top} type="target" style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: d.isActive ? "#f59e0b" : style.dot }}
        />
        <span className="truncate text-[13px] font-bold leading-tight">{d.label}</span>
      </div>
      <span className="text-[10px] font-semibold opacity-70">{LEVEL_LABEL[d.level]}</span>
      <Handle position={Position.Bottom} type="source" style={{ opacity: 0 }} />
    </div>
  );
}

// ===== 自定义边 =====
type KgEdgeData = {
  label?: string;
  isActive?: boolean;
  isDimmed?: boolean;
};

function KnowledgeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps) {
  const d = (data ?? {}) as KgEdgeData;
  const stroke = d.isActive ? "#f59e0b" : d.isDimmed ? "#cbd5e1" : "#94a3b8";
  const strokeWidth = d.isActive ? 2.5 : 1.5;

  const midY = (sourceY + targetY) / 2;
  const path = `M ${sourceX},${sourceY} C ${sourceX},${midY} ${targetX},${midY} ${targetX},${targetY}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        id={id}
        stroke={stroke}
        strokeWidth={strokeWidth}
        markerEnd={markerEnd}
        style={{ transition: "stroke 0.2s, stroke-width 0.2s" }}
      />
      {d.label ? (
        <text
          x={(sourceX + targetX) / 2}
          y={(sourceY + targetY) / 2}
          dy={-4}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={d.isActive ? "#b45309" : "#64748b"}
          style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}
        >
          {d.label}
        </text>
      ) : null}
    </g>
  );
}

const nodeTypes = { kgNode: KnowledgeNode };
const edgeTypes = { kgEdge: KnowledgeEdge };

// ===== 布局：按层级自上而下分层 =====
function layoutNodes(nodes: KnowledgeGraphNode[]): { id: string; position: { x: number; y: number } }[] {
  const groups: Record<Level, KnowledgeGraphNode[]> = {
    foundation: [],
    core: [],
    application: [],
    extension: [],
  };
  for (const node of nodes) {
    const level = (node.level ?? "core") as Level;
    (groups[level] ?? groups.core).push(node);
  }

  const TIER_HEIGHT = 180;
  const NODE_GAP = 230;
  const results: { id: string; position: { x: number; y: number } }[] = [];

  LEVEL_ORDER.forEach((level, tierIndex) => {
    const tierNodes = groups[level];
    if (tierNodes.length === 0) return;
    const totalWidth = (tierNodes.length - 1) * NODE_GAP;
    tierNodes.forEach((node, idx) => {
      results.push({
        id: node.id,
        position: node.position ?? {
          x: -totalWidth / 2 + idx * NODE_GAP,
          y: tierIndex * TIER_HEIGHT,
        },
      });
    });
  });

  return results;
}

// ===== 工具：判断节点是否为高亮节点的邻居 =====
function isNeighbor(
  nodeId: string,
  highlightId: string,
  edges: { source: string; target: string }[],
): boolean {
  return edges.some(
    (e) =>
      (e.source === nodeId && e.target === highlightId) ||
      (e.target === nodeId && e.source === highlightId),
  );
}

// ===== 主组件 =====
export function KnowledgeGraphFlow({
  graph,
  points = [],
  activeNodeId,
  height = 360,
  showMiniMap = true,
  onNodePositionChange,
}: {
  graph?: KnowledgeGraph;
  points?: KnowledgePoint[];
  activeNodeId?: string | null;
  height?: number;
  showMiniMap?: boolean;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const normalized = useMemo(
    () => normalizeKnowledgeGraphForDisplay(graph, points),
    [graph, points],
  );

  const layout = useMemo(() => layoutNodes(normalized.nodes), [normalized.nodes]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const highlightId = activeNodeId ?? selectedId;

  const baseNodes: Node[] = useMemo(() => {
    return normalized.nodes.map((node) => {
      const position = layout.find((p) => p.id === node.id)?.position ?? ZERO_POSITION;
      const level = (node.level ?? "core") as Level;
      return {
        id: node.id,
        type: "kgNode",
        position,
        data: {
          label: node.label,
          level,
          description: node.description,
          keyInfo: node.keyInfo,
          isActive: false,
          isDimmed: false,
        } as KgNodeData,
      };
    });
  }, [normalized.nodes, layout]);

  const baseEdges: Edge[] = useMemo(() => {
    return normalized.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "kgEdge",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      data: {
        label: edge.label,
        isActive: false,
        isDimmed: false,
      } as KgEdgeData,
    }));
  }, [normalized.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges);

  useEffect(() => {
    setNodes(baseNodes);
    setEdges(baseEdges);
  }, [baseNodes, baseEdges, setNodes, setEdges]);

  // 外部 activeNodeId 或数据变化时同步节点/边的样式
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const isActive = highlightId === node.id;
        const isDimmed =
          highlightId && highlightId !== node.id
            ? !isNeighbor(node.id, highlightId, normalized.edges)
            : false;
        return {
          ...node,
          data: { ...(node.data as KgNodeData), isActive, isDimmed },
        };
      }),
    );
    setEdges((prev) =>
      prev.map((edge) => {
        const isActive =
          highlightId && (edge.source === highlightId || edge.target === highlightId)
            ? true
            : false;
        const isDimmed =
          highlightId && edge.source !== highlightId && edge.target !== highlightId ? true : false;
        return {
          ...edge,
          markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? "#f59e0b" : "#94a3b8" },
          data: { ...(edge.data as KgEdgeData), isActive, isDimmed },
        };
      }),
    );
  }, [highlightId, normalized.edges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  if (normalized.nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-[8px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        暂无知识图谱。请先生成或添加知识点。
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ minHeight: height }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={(_, node) => onNodePositionChange?.(node.id, node.position)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" } }}
        >
          <Background color="#e2e8f0" gap={20} size={1.4} />
          <Controls position="bottom-right" showInteractive={false} />
          {showMiniMap && normalized.nodes.length > 4 ? (
            <MiniMap
              position="top-right"
              pannable
              zoomable
              nodeColor={(node) => {
                const data = node.data as KgNodeData;
                return data.isActive ? "#f59e0b" : LEVEL_STYLE[data.level]?.dot ?? "#94a3b8";
              }}
              maskColor="rgba(241, 245, 249, 0.6)"
            />
          ) : null}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
