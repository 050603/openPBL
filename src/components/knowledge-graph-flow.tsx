"use client";

/**
 * KnowledgeGraphFlow — 基于 @xyflow/react (React Flow v12) 的知识图谱可视化组件
 *
 * 特性：
 * - 节点拖拽、画布平移、滚轮缩放
 * - 路径高亮：选中节点时高亮其相邻节点与连边，其余节点淡化
 * - 外部联动：通过 activeNodeId 高亮当前讲解的知识点（与 OpenMAIC 场景联动）
 * - 层级布局：foundation → core → application → extension 自上而下分层
 * - 全屏模式：支持 isFullscreen 切换
 * - 节点选中回调：onNodeSelect 返回选中节点 ID
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
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Handle } from "@xyflow/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeGraph, KnowledgeGraphNode, KnowledgePoint } from "@/lib/session/types";
import { normalizeKnowledgeGraphForDisplay } from "@/components/knowledge-graph";
import { cn } from "@/lib/utils";

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
type GraphAppearance = "default" | "teaching-rail";

// ===== 自定义节点 =====
type KgNodeData = {
  label: string;
  level: Level;
  description?: string;
  keyInfo?: string;
  isActive?: boolean;
  isDimmed?: boolean;
  appearance?: GraphAppearance;
};

function KnowledgeNode({ data }: NodeProps) {
  const d = data as KgNodeData;
  const style = LEVEL_STYLE[d.level];
  const isTeachingRail = d.appearance === "teaching-rail";
  return (
    <div
      className={cn(
        "flex min-w-[140px] max-w-[200px] flex-col gap-1 px-3 py-2 transition-all duration-500",
        isTeachingRail ? "rounded-[14px] border" : "rounded-[10px] border-2 shadow-sm",
      )}
      style={{
        background: isTeachingRail
          ? d.isActive ? "rgba(237, 247, 243, 0.98)" : "rgba(255, 255, 255, 0.9)"
          : d.isActive ? "#fffbeb" : style.bg,
        borderColor: isTeachingRail
          ? d.isActive ? "#4f8f82" : "rgba(148, 163, 184, 0.38)"
          : d.isActive ? "#f59e0b" : style.border,
        color: isTeachingRail ? (d.isActive ? "#17473f" : "#52645f") : style.text,
        opacity: d.isDimmed ? (isTeachingRail ? 0.28 : 0.35) : 1,
        boxShadow: isTeachingRail
          ? d.isActive
            ? "0 8px 24px rgba(39, 99, 86, 0.14), 0 0 0 3px rgba(79, 143, 130, 0.1)"
            : "0 3px 12px rgba(15, 23, 42, 0.055)"
          : d.isActive
            ? "0 0 0 4px rgba(245, 158, 11, 0.25), 0 4px 12px rgba(0,0,0,0.08)"
            : "0 1px 3px rgba(0,0,0,0.06)",
        transform: d.isActive ? `scale(${isTeachingRail ? 1.03 : 1.06})` : "scale(1)",
      }}
    >
      <Handle position={Position.Top} type="target" style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: isTeachingRail ? (d.isActive ? "#3f8174" : "#9fb5af") : d.isActive ? "#f59e0b" : style.dot }}
        />
        <span className="truncate text-[13px] font-bold leading-tight">{d.label}</span>
      </div>
      <span className="text-[10px] font-semibold opacity-70">
        {LEVEL_LABEL[d.level]}
      </span>
      <Handle position={Position.Bottom} type="source" style={{ opacity: 0 }} />
    </div>
  );
}

// ===== 自定义边 =====
type KgEdgeData = {
  label?: string;
  isActive?: boolean;
  isDimmed?: boolean;
  appearance?: GraphAppearance;
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
  const isTeachingRail = d.appearance === "teaching-rail";
  const stroke = isTeachingRail
    ? d.isActive ? "#5b9a8d" : d.isDimmed ? "#e4ece9" : "#c5d5d1"
    : d.isActive ? "#f59e0b" : d.isDimmed ? "#cbd5e1" : "#94a3b8";
  const strokeWidth = d.isActive ? (isTeachingRail ? 2 : 2.5) : 1.5;

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
      {d.label && !isTeachingRail ? (
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

function ActiveNodeFocus({ nodeId, zoom }: { nodeId?: string | null; zoom: number }) {
  const { getInternalNode, getViewport, setCenter, setViewport } = useReactFlow();
  const previousNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    const prepareTimer = setTimeout(() => {
      const node = getInternalNode(nodeId);
      if (!node) return;
      const width = node.measured?.width ?? node.width ?? 140;
      const height = node.measured?.height ?? node.height ?? 56;
      const position = node.internals.positionAbsolute;
      const centerX = position.x + width / 2;
      const centerY = position.y + height / 2;

      if (previousNodeRef.current && previousNodeRef.current !== nodeId) {
        const viewport = getViewport();
        void setViewport(
          { ...viewport, zoom: Math.max(0.42, viewport.zoom * 0.76) },
          { duration: 420 },
        );
        focusTimer = setTimeout(() => {
          void setCenter(centerX, centerY, { duration: 900, zoom });
        }, 420);
      } else {
        void setCenter(centerX, centerY, { duration: 700, zoom });
      }
      previousNodeRef.current = nodeId;
    }, 80);

    return () => {
      clearTimeout(prepareTimer);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [getInternalNode, getViewport, nodeId, setCenter, setViewport, zoom]);

  return null;
}

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
  showControls = true,
  focusActiveNode = false,
  activeZoom = 0.72,
  appearance = "default",
  isFullscreen = false,
  onToggleFullscreen,
  onNodeSelect,
  onNodePositionChange,
}: {
  graph?: KnowledgeGraph;
  points?: KnowledgePoint[];
  activeNodeId?: string | null;
  height?: number;
  showMiniMap?: boolean;
  showControls?: boolean;
  /** Keep the externally active node centered; intended for compact previews. */
  focusActiveNode?: boolean;
  activeZoom?: number;
  appearance?: GraphAppearance;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** 节点选中回调，返回选中的节点 ID（再次点击同一节点返回 null） */
  onNodeSelect?: (nodeId: string | null) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
}) {
  const normalized = useMemo(
    () => normalizeKnowledgeGraphForDisplay(graph, points),
    [graph, points],
  );

  const layout = useMemo(() => layoutNodes(normalized.nodes), [normalized.nodes]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const highlightId = activeNodeId ?? selectedId;
  // ref 暂存待通知的 nodeId，在 effect 中回调 onNodeSelect，
  // 避免在 setState updater 中触发父组件渲染
  const pendingSelectRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (pendingSelectRef.current !== undefined) {
      onNodeSelect?.(pendingSelectRef.current);
      pendingSelectRef.current = undefined;
    }
  });

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
          appearance,
        } as KgNodeData,
      };
    });
  }, [normalized.nodes, layout, appearance]);

  const baseEdges: Edge[] = useMemo(() => {
    return normalized.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "kgEdge",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: appearance === "teaching-rail" ? "#b7cbc5" : "#94a3b8",
      },
      data: {
        label: edge.label,
        isActive: false,
        isDimmed: false,
        appearance,
      } as KgEdgeData,
    }));
  }, [normalized.edges, appearance]);

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
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: appearance === "teaching-rail"
              ? isActive ? "#5b9a8d" : "#b7cbc5"
              : isActive ? "#f59e0b" : "#94a3b8",
          },
          data: { ...(edge.data as KgEdgeData), isActive, isDimmed },
        };
      }),
    );
  }, [appearance, highlightId, normalized.edges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId((prev) => {
      const next = prev === node.id ? null : node.id;
      pendingSelectRef.current = next;
      return next;
    });
  }, []);

  if (normalized.nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-[8px] border border-dashed border-stone-200 bg-stone-50 p-5 text-sm text-stone-500">
        暂无知识图谱。请先生成或添加知识点。
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-full w-full",
        isFullscreen && "fixed inset-0 z-50 bg-white",
      )}
      style={isFullscreen ? { minHeight: "100vh" } : { minHeight: height }}
    >
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
          defaultEdgeOptions={{
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: appearance === "teaching-rail" ? "#b7cbc5" : "#94a3b8",
            },
          }}
        >
          {focusActiveNode ? <ActiveNodeFocus nodeId={activeNodeId} zoom={activeZoom} /> : null}
          <Background
            color={appearance === "teaching-rail" ? "#cfe0db" : "#e2e8f0"}
            gap={appearance === "teaching-rail" ? 24 : 20}
            size={appearance === "teaching-rail" ? 1 : 1.4}
          />
          {showControls ? <Controls position="bottom-right" showInteractive={false} /> : null}
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
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-md border border-stone-200 bg-white text-stone-500 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-700"
          title={isFullscreen ? "退出全屏" : "全屏显示"}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      )}
    </div>
  );
}
