import type { KnowledgeGraph, KnowledgeGraphNode, KnowledgePoint } from "@/lib/session/types";

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
        level: (point.level ?? (index < 2 ? "foundation" : index < 4 ? "core" : "application")) as KnowledgeGraphNode["level"],
      }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (graph?.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target,
  );
  return { ...(graph ?? {}), nodes, edges };
}
