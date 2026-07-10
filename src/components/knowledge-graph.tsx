"use client";

import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import type { KnowledgeGraph, KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgePoint } from "@/lib/session/types";

type GraphNode = KnowledgeGraphNode & { x: number; y: number };

const LEVEL_LABEL: Record<NonNullable<KnowledgeGraphNode["level"]>, string> = {
  foundation: "基础",
  core: "核心",
  application: "应用",
  extension: "拓展",
};

const LEVEL_CLASS: Record<NonNullable<KnowledgeGraphNode["level"]>, string> = {
  foundation: "border-sky-200 bg-sky-50 text-sky-800",
  core: "border-blue-200 bg-blue-50 text-blue-800",
  application: "border-emerald-200 bg-emerald-50 text-emerald-800",
  extension: "border-violet-200 bg-violet-50 text-violet-800",
};

export function normalizeKnowledgeGraphForDisplay(
  graph: KnowledgeGraph | undefined,
  points: KnowledgePoint[],
): KnowledgeGraph {
  const nodes: KnowledgeGraphNode[] = graph?.nodes?.length
    ? graph.nodes
    : points.map((point, index) => ({
        id: point.id,
        label: point.name,
        description: point.description,
        keyInfo: point.keyInfo,
        level: (index < 2 ? "foundation" : index < 4 ? "core" : "application") as KnowledgeGraphNode["level"],
      }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph?.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target,
  );
  return { nodes, edges };
}

export function KnowledgeGraphView({
  graph,
  points = [],
  title = "知识图谱",
  height = 360,
  showDetails = true,
}: {
  graph?: KnowledgeGraph;
  points?: KnowledgePoint[];
  title?: string;
  height?: number;
  showDetails?: boolean;
}) {
  const normalized = useMemo(
    () => normalizeKnowledgeGraphForDisplay(graph, points),
    [graph, points],
  );
  const [selectedId, setSelectedId] = useState(normalized.nodes[0]?.id ?? "");
  const layout = useMemo(() => layoutGraph(normalized.nodes), [normalized.nodes]);
  const selected = layout.find((node) => node.id === selectedId) ?? layout[0];

  if (layout.length === 0) {
    return (
      <div className="rounded-[8px] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
        暂无知识图谱。请先生成或添加知识点。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Network size={18} className="text-blue-700" />
          {title}
        </div>
        <div className="text-xs font-semibold text-slate-400">
          {layout.length} 节点 · {normalized.edges.length} 关系
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative bg-slate-50" style={{ height }}>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id="kg-arrow" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {normalized.edges.map((edge) => {
              const source = layout.find((node) => node.id === edge.source);
              const target = layout.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#94a3b8"
                  strokeWidth="0.55"
                  markerEnd="url(#kg-arrow)"
                />
              );
            })}
          </svg>
          {normalized.edges.map((edge) => {
            const source = layout.find((node) => node.id === edge.source);
            const target = layout.find((node) => node.id === edge.target);
            if (!source || !target) return null;
            return (
              <span
                key={edge.id}
                className="pointer-events-none absolute rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200"
                style={{
                  left: `${(source.x + target.x) / 2}%`,
                  top: `${(source.y + target.y) / 2}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {edge.label}
              </span>
            );
          })}
          {layout.map((node) => {
            const level = node.level ?? "core";
            const active = selected?.id === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={`absolute max-w-[150px] rounded-[8px] border px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${LEVEL_CLASS[level]} ${
                  active ? "ring-2 ring-blue-400 ring-offset-2" : ""
                }`}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <span className="block truncate font-bold">{node.label}</span>
                <span className="mt-0.5 block text-[10px] opacity-70">{LEVEL_LABEL[level]}</span>
              </button>
            );
          })}
        </div>
        {showDetails ? (
          <div className="border-t border-slate-100 p-4 lg:border-l lg:border-t-0">
            {selected ? (
              <div>
                <div className="text-xs font-bold text-slate-400">当前知识节点</div>
                <h3 className="mt-1 text-base font-bold text-slate-950">{selected.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selected.description || "暂无描述"}</p>
                {selected.keyInfo ? (
                  <div className="mt-3 rounded-[6px] border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                    <span className="font-bold">本课关键：</span>
                    {selected.keyInfo}
                  </div>
                ) : null}
                <RelatedEdges nodeId={selected.id} edges={normalized.edges} nodes={normalized.nodes} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RelatedEdges({
  nodeId,
  edges,
  nodes,
}: {
  nodeId: string;
  edges: KnowledgeGraphEdge[];
  nodes: KnowledgeGraphNode[];
}) {
  const related = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  if (related.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-bold text-slate-400">关联关系</div>
      <ul className="space-y-1.5">
        {related.map((edge) => {
          const otherId = edge.source === nodeId ? edge.target : edge.source;
          const other = nodes.find((node) => node.id === otherId);
          return (
            <li key={edge.id} className="rounded-[6px] bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              <span className="font-bold text-slate-800">{edge.label}</span>
              <span className="mx-1 text-slate-300">→</span>
              {other?.label ?? otherId}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function layoutGraph(nodes: KnowledgeGraphNode[]): GraphNode[] {
  if (nodes.length === 1) return [{ ...nodes[0], x: 50, y: 50 }];
  return nodes.map((node, index) => {
    const angle = (-90 + (360 / nodes.length) * index) * (Math.PI / 180);
    const radiusX = nodes.length > 6 ? 35 : 31;
    const radiusY = nodes.length > 6 ? 32 : 28;
    const level = node.level ?? "core";
    const levelPull = level === "core" ? 0.72 : level === "foundation" ? 0.88 : 1;
    return {
      ...node,
      x: 50 + Math.cos(angle) * radiusX * levelPull,
      y: 50 + Math.sin(angle) * radiusY * levelPull,
    };
  });
}
