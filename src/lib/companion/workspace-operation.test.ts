import { describe, expect, it } from "vitest";
import {
  buildWorkspaceEditInstruction,
  appendCompanionContribution,
  extractWorkspacePatch,
  requestsWorkspaceEdit,
} from "./workspace-operation";

describe("companion workspace operations", () => {
  it("recognizes local document edits but not ordinary questions", () => {
    expect(requestsWorkspaceEdit("请知知在项目文档里补充两个概念解释")).toBe(true);
    expect(requestsWorkspaceEdit("这个概念是什么意思")).toBe(false);
  });

  it("refuses to enable document tools for cognitive outsourcing requests", () => {
    expect(buildWorkspaceEditInstruction("proposal", "帮我直接写一份完整方案到项目文档"))
      .toBeUndefined();
    expect(buildWorkspaceEditInstruction("make", "请在项目文档中补充这条基础定义"))
      .toContain("只能追加基础信息");
  });

  it("separates safe patch data from spoken feedback", () => {
    const result = extractWorkspacePatch(
      '我补充了一条定义，请到项目工作台查看。<workspace_patch>{"mode":"append","title":"概念定义","content":"<b>阈值分割</b>是按像素值划分类别。","reviewInstruction":"核对它是否符合你的实际方法"}</workspace_patch>',
    );
    expect(result.speech).toBe("我补充了一条定义，请到项目工作台查看。");
    expect(result.patch).toEqual({
      mode: "append",
      title: "概念定义",
      content: "阈值分割是按像素值划分类别。",
      reviewInstruction: "核对它是否符合你的实际方法",
    });
  });

  it("drops malformed or unsupported patches", () => {
    expect(extractWorkspacePatch('<workspace_patch>{"mode":"replace"}</workspace_patch>').patch)
      .toBeUndefined();
  });

  it("appends an attributed contribution without allowing injected HTML", () => {
    const content = appendCompanionContribution({
      existingContent: "<p>学生原文</p>",
      patch: { mode: "append", title: "定义<script>", content: "A < B", reviewInstruction: "核对来源" },
      companionId: "knowledge",
      companionName: "知知",
      taskId: "task-1",
    });
    expect(content).toContain("<p>学生原文</p>");
    expect(content).toContain("定义&lt;script&gt;");
    expect(content).toContain("A &lt; B");
    expect(content).not.toContain("<script>");
  });
});
