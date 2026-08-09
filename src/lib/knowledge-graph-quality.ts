import type { KnowledgeGraph, KnowledgePoint } from "@/lib/session/types";

export type KnowledgeGraphQuality = {
  ok: boolean;
  issues: string[];
  stats: {
    nodes: number;
    edges: number;
    required: number;
  };
};

export function normalizeKnowledgePointName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function assessKnowledgeGraphQuality(
  graph: KnowledgeGraph | undefined,
  points: readonly KnowledgePoint[],
  requiredPoints: readonly string[] = [],
): KnowledgeGraphQuality {
  const issues: string[] = [];
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const pointIds = new Set(points.map((point) => point.id));
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (points.length === 0) issues.push("尚未生成知识点");
  if (new Set(points.map((point) => point.id)).size !== points.length) issues.push("知识点 ID 存在重复");
  if (new Set(points.map((point) => normalizeKnowledgePointName(point.name))).size !== points.length) {
    issues.push("知识点名称存在重复或同义重复");
  }
  if (nodes.length !== points.length || points.some((point) => !nodeIds.has(point.id))) {
    issues.push("知识点与图谱节点没有一一对应");
  }
  if (nodes.some((node) => !pointIds.has(node.id))) issues.push("图谱包含未定义的节点");
  if (points.some((point) => {
    const node = nodes.find((item) => item.id === point.id);
    return node && normalizeKnowledgePointName(node.label) !== normalizeKnowledgePointName(point.name);
  })) {
    issues.push("图谱节点名称与知识点名称不一致");
  }
  if (points.some((point) => !point.description.trim() || !point.keyInfo?.trim())) {
    issues.push("每个知识点都需要完整说明和本课关键信息");
  }
  if (points.some((point) => !point.level)) issues.push("每个知识点都需要明确教学层级");

  const pointNames = new Set(points.map((point) => normalizeKnowledgePointName(point.name)));
  const missingRequired = requiredPoints.filter(
    (point) => !pointNames.has(normalizeKnowledgePointName(point)),
  );
  if (missingRequired.length > 0) {
    issues.push(`教师指定知识点未被保留：${missingRequired.join("、")}`);
  }

  const validEdges = edges.filter(
    (edge) => pointIds.has(edge.source) && pointIds.has(edge.target) && edge.source !== edge.target,
  );
  if (validEdges.length !== edges.length) issues.push("图谱包含无效引用或自环关系");
  const edgeKeys = validEdges.map((edge) => `${edge.source}\u0000${edge.target}\u0000${edge.label.trim()}`);
  if (new Set(edgeKeys).size !== edgeKeys.length) issues.push("图谱包含重复关系");
  if (validEdges.some((edge) => !edge.label.trim() || /^(关联|相关|关系)$/.test(edge.label.trim()))) {
    issues.push("关系必须说明具体语义，不能只写“关联”或“相关”");
  }

  if (points.length > 1) {
    const adjacent = new Map(points.map((point) => [point.id, new Set<string>()]));
    validEdges.forEach((edge) => {
      adjacent.get(edge.source)?.add(edge.target);
      adjacent.get(edge.target)?.add(edge.source);
    });
    const visited = new Set<string>();
    const queue = points[0] ? [points[0].id] : [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      adjacent.get(current)?.forEach((next) => {
        if (!visited.has(next)) queue.push(next);
      });
    }
    if (visited.size !== points.length) issues.push("图谱存在孤立节点或不相连的知识分支");
    if (hasDirectedCycle(points.map((point) => point.id), validEdges)) {
      issues.push("图谱关系形成循环，无法作为清晰的教学进阶路径");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    stats: { nodes: nodes.length, edges: edges.length, required: requiredPoints.length },
  };
}

function hasDirectedCycle(
  nodeIds: readonly string[],
  edges: ReadonlyArray<KnowledgeGraph["edges"][number]>,
): boolean {
  const outgoing = new Map(nodeIds.map((id) => [id, [] as string[]]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  edges.forEach((edge) => {
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  });
  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;
    outgoing.get(current)?.forEach((target) => {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    });
  }
  return visited !== nodeIds.length;
}
