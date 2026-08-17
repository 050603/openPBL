import { describe, expect, it } from "vitest";
import {
  buildQuickClassroomArtifacts,
  combineQuickGenerationProgress,
  resolveQuickClassroomActiveArtifactId,
  type QuickClassroomGenerationSnapshot,
} from "./quick-artifacts";

function job(overrides: Partial<QuickClassroomGenerationSnapshot> = {}): QuickClassroomGenerationSnapshot {
  return {
    status: "running",
    step: "generating_scenes",
    progress: 52,
    message: "正在制作课堂页面",
    scenesGenerated: 4,
    totalScenes: 6,
    events: [],
    requestPreview: {
      courseTitle: "校园雨水花园",
      sceneOutlines: [
        { id: "1", title: "发布驱动问题", type: "slide", stageKey: "launch", estimatedDuration: 180 },
        { id: "2", title: "识别真实案例", type: "interactive", stageKey: "launch", estimatedDuration: 240 },
        { id: "3", title: "理解核心概念", type: "slide", stageKey: "ai-learning", estimatedDuration: 300 },
        { id: "4", title: "完成知识检测", type: "quiz", stageKey: "ai-learning", estimatedDuration: 180 },
        { id: "5", title: "形成项目方案", type: "pbl", stageKey: "proposal", estimatedDuration: 360 },
        { id: "6", title: "展示项目成果", type: "pbl", stageKey: "showcase", estimatedDuration: 300 },
      ],
      enableImageGeneration: true,
      enableVideoGeneration: false,
      enableTTS: true,
    },
    ...overrides,
  };
}

describe("buildQuickClassroomArtifacts", () => {
  it("continues the quick canvas with real outline titles and forward-only page batches", () => {
    const artifacts = buildQuickClassroomArtifacts(job());

    expect(artifacts.map((artifact) => artifact.id)).toEqual([
      "classroom-generation-plan",
      "classroom-pages-1",
      "classroom-pages-2",
    ]);
    expect(artifacts[1]?.items.map((item) => item.value)).toEqual([
      "发布驱动问题",
      "识别真实案例",
      "理解核心概念",
    ]);
    expect(artifacts[2]?.items[0]).toMatchObject({ value: "完成知识检测" });
  });

  it("ends with a durable-save card instead of requiring publication", () => {
    const artifacts = buildQuickClassroomArtifacts(job({
      status: "completed",
      step: "completed",
      progress: 100,
      scenesGenerated: 6,
      result: {
        id: "classroom-1",
        scenesCount: 6,
        studentSceneCount: 6,
        teacherSceneCount: 4,
        qualityReport: { summary: "结构与资源覆盖检查通过" },
      },
    }));

    expect(artifacts.at(-1)).toMatchObject({
      id: "classroom-persisting",
      title: "课程内容已经生成并保存",
    });
    expect(artifacts.at(-1)?.items.some((item) => item.value === "已自动保存")).toBe(true);
  });

  it("moves beyond the final page into routing, adaptive, media, TTS and persistence cards", () => {
    const events = [
      ["separating_classrooms", "正在拆分学生课堂与教师授课资源"],
      ["generating_adaptive_resources", "正在生成个性化学习资源"],
      ["generating_media_assets", "正在生成并插入 6 项图片与视频资源"],
      ["generating_tts_assets", "正在生成课堂讲授语音"],
      ["persisting_assets", "正在合并并保存课堂资源"],
    ].map(([step, message], index) => ({ step, message, progress: 98, scenesGenerated: 6, totalScenes: 6, ts: index }));
    const artifacts = buildQuickClassroomArtifacts(job({
      step: "persisting_assets",
      progress: 99,
      scenesGenerated: 6,
      events,
    }));

    expect(artifacts.map((artifact) => artifact.id)).toEqual(expect.arrayContaining([
      "classroom-routing",
      "classroom-adaptive-resources",
      "classroom-media-assets",
      "classroom-tts-assets",
      "classroom-persisting",
    ]));
  });

  it("maps adaptive work to its own active card and keeps unfinished progress below 100%", () => {
    const adaptiveJob = job({
      step: "generating_adaptive_resources",
      progress: 95,
      scenesGenerated: 6,
      message: "正在生成分层学习资源：如何选择合适的学习方法 · 模块拓展（已完成 8 / 12）",
      events: [{
        step: "generating_adaptive_resources",
        progress: 95,
        message: "正在生成分层学习资源：如何选择合适的学习方法 · 模块拓展（已完成 8 / 12）",
        scenesGenerated: 6,
        totalScenes: 6,
        ts: 1,
      }],
    });

    const artifacts = buildQuickClassroomArtifacts(adaptiveJob);
    expect(resolveQuickClassroomActiveArtifactId(adaptiveJob)).toBe("classroom-adaptive-resources");
    expect(artifacts.find((item) => item.id === "classroom-adaptive-resources")).toMatchObject({
      title: "诊断补缺与达标拓展",
      summary: expect.stringContaining("已完成 8 / 12"),
    });
    expect(combineQuickGenerationProgress(100, 100, false)).toBe(99);
    expect(combineQuickGenerationProgress(100, 100, true)).toBe(100);
  });

  it("gives quick course cover generation its own live card", () => {
    const coverJob = job({
      step: "generating_course_cover",
      progress: 99,
      scenesGenerated: 6,
      message: "正在生成课程封面：校园雨水花园",
      events: [{
        step: "generating_course_cover",
        progress: 99,
        message: "正在生成课程封面：校园雨水花园",
        scenesGenerated: 6,
        totalScenes: 6,
        ts: 1,
      }],
    });

    const artifacts = buildQuickClassroomArtifacts(coverJob);
    expect(resolveQuickClassroomActiveArtifactId(coverJob)).toBe("classroom-course-cover");
    expect(artifacts.find((item) => item.id === "classroom-course-cover")).toMatchObject({
      title: "正在生成课程专属封面",
      items: expect.arrayContaining([expect.objectContaining({ value: "校园雨水花园" })]),
    });
  });
});
