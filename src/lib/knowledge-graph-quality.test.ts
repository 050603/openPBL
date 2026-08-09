import { describe, expect, it } from "vitest";
import { assessKnowledgeGraphQuality } from "./knowledge-graph-quality";

const points = [
  { id: "kp-1", name: "数据特征", description: "用于描述样本", keyInfo: "特征来自可观察数据", level: "foundation" as const },
  { id: "kp-2", name: "分类规则", description: "依据特征作出判断", keyInfo: "规则需要可解释", level: "core" as const },
  { id: "kp-3", name: "模型验证", description: "使用新样本检验规则", keyInfo: "验证关注未见样本", level: "application" as const },
];

describe("knowledge graph quality", () => {
  it("accepts a connected, acyclic graph that preserves teacher requirements", () => {
    const graph = {
      nodes: points.map((point) => ({ id: point.id, label: point.name, description: point.description, keyInfo: point.keyInfo, level: point.level })),
      edges: [
        { id: "e-1", source: "kp-1", target: "kp-2", label: "是构建的前提" },
        { id: "e-2", source: "kp-2", target: "kp-3", label: "用于" },
      ],
    };

    expect(assessKnowledgeGraphQuality(graph, points, ["分类规则"]).ok).toBe(true);
  });

  it("rejects omitted teacher points, vague edges, isolated nodes and cycles", () => {
    const graph = {
      nodes: points.map((point) => ({ id: point.id, label: point.name, description: point.description, keyInfo: point.keyInfo, level: point.level })),
      edges: [
        { id: "e-1", source: "kp-1", target: "kp-2", label: "关联" },
        { id: "e-2", source: "kp-2", target: "kp-1", label: "支撑" },
      ],
    };
    const result = assessKnowledgeGraphQuality(graph, points, ["混淆矩阵"]);

    expect(result.ok).toBe(false);
    expect(result.issues.join("；")).toContain("教师指定知识点未被保留");
    expect(result.issues.join("；")).toContain("不能只写");
    expect(result.issues.join("；")).toContain("孤立节点");
    expect(result.issues.join("；")).toContain("循环");
  });
});
