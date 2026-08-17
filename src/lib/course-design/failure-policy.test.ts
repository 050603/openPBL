import { describe, expect, it } from "vitest";
import {
  classifyCourseDesignFailure,
  createManagedRecoveryRequest,
  formatFatalCourseDesignError,
} from "./failure-policy";

describe("course design failure policy", () => {
  it("keeps model structure and quality failures inside managed recovery", () => {
    const error = new Error("主课脚本代理无法生成结构完整的数据：缺少知识点覆盖");
    expect(classifyCourseDesignFailure(error)).toBe("recoverable-generation");
    expect(createManagedRecoveryRequest({ courseId: "c", teacherBrief: "b" }, error))
      .toMatchObject({ managedRecoveryCount: 1 });
  });

  it("recovers malformed model JSON even when wrapped as a cause", () => {
    const error = new Error("个性化学习路径生成失败", { cause: new SyntaxError("Unexpected token") });
    expect(classifyCourseDesignFailure(error)).toBe("recoverable-generation");
  });

  it("does not restart the whole course after local knowledge-graph edits are exhausted", () => {
    const error = new Error(
      "目标与知识结构无法通过独立审校：边缘关系 edge-2 必要性不足，建议降级为 supports/helpful",
    );

    expect(classifyCourseDesignFailure(error)).toBe("terminal-quality");
    expect(createManagedRecoveryRequest({ courseId: "c", teacherBrief: "b" }, error)).toBeNull();
    expect(formatFatalCourseDesignError(error)).toContain("不会整项重跑");
  });

  it("does not restart the whole course after the entry-package editor exhausts its local loop", () => {
    const cause = new Error("课程入口学习包无法通过发布校验：前测题选项重复");
    const error = new Error("个性化学习路径生成失败，未写入空白降级方案", { cause });

    expect(classifyCourseDesignFailure(error)).toBe("terminal-quality");
    expect(createManagedRecoveryRequest({ courseId: "c", teacherBrief: "b" }, error)).toBeNull();
    expect(formatFatalCourseDesignError(error)).toContain("不会整项重跑");
  });

  it("does not hide network and infrastructure failures behind generation retries", () => {
    const network = new Error("fetch failed: ECONNRESET");
    expect(classifyCourseDesignFailure(network)).toBe("fatal-infrastructure");
    expect(formatFatalCourseDesignError(network)).toContain("网络或 AI 服务");
  });

  it("stops managed recovery after its bounded retry budget", () => {
    const error = new Error("课程设计代理未能补齐必要结构");
    expect(createManagedRecoveryRequest({
      courseId: "c",
      teacherBrief: "b",
      managedRecoveryCount: 2,
    }, error)).toBeNull();
    expect(formatFatalCourseDesignError(error)).not.toContain("必要结构");
  });
});
