"use client";

import { CoursePublishPathPreview } from "@/components/teacher/course-publish-path-preview";
import type {
  AdaptiveBranchOutline,
  AdaptiveLearningPlan,
  OpenMaicSceneOutlineSnapshot,
} from "@/lib/session/types";

const scenes: OpenMaicSceneOutlineSnapshot[] = [
  { id: "scene-1", title: "理解城市热岛效应", type: "slide", audience: "student" },
  { id: "scene-2", title: "读取城市温度分布图", type: "interactive", audience: "student" },
  { id: "quiz-1", title: "热岛效应达标检测", type: "quiz", audience: "student" },
  { id: "scene-3", title: "设计校园降温方案", type: "pbl", audience: "student" },
  { id: "quiz-2", title: "方案论证达标检测", type: "quiz", audience: "student" },
];

const branches: AdaptiveBranchOutline[] = [
  {
    id: "foundation-map",
    kind: "prerequisite",
    title: "地图图例与等值线快速回顾",
    objective: "补足读取温度分布图所需的图例、方向与等值线知识。",
    keyPoints: ["图例", "等值线"],
    anchorKnowledgePointIds: ["heat-map"],
    prerequisiteKnowledgePointIds: ["map-legend", "contour"],
    noveltyStatement: "先修回顾",
    mainCourseOverlapSceneIds: [],
    sceneType: "interactive",
    targetDurationSec: 300,
    trigger: { placement: "before-main-course", evidenceRule: "pretest-gap", minimumRemainingSec: 0 },
    preparedResource: { status: "ready", classroomId: "preview-foundation", scenesCount: 3 },
    status: "teacher-confirmed",
  },
  {
    id: "foundation-energy",
    kind: "prerequisite",
    title: "热传递基础概念回顾",
    objective: "帮助学生区分热传导、热对流与热辐射。",
    keyPoints: ["热传递"],
    anchorKnowledgePointIds: ["heat-island"],
    prerequisiteKnowledgePointIds: ["heat-transfer"],
    noveltyStatement: "先修回顾",
    mainCourseOverlapSceneIds: [],
    sceneType: "slide",
    targetDurationSec: 240,
    trigger: { placement: "before-main-course", evidenceRule: "pretest-gap", minimumRemainingSec: 0 },
    preparedResource: { status: "ready", classroomId: "preview-energy", scenesCount: 2 },
    status: "teacher-confirmed",
  },
  {
    id: "extension-case",
    kind: "worked-example",
    title: "透水铺装方案的完整推演",
    objective: "通过新案例理解材料选择、数据证据与降温效果之间的关系。",
    keyPoints: ["材料选择", "证据链"],
    anchorKnowledgePointIds: ["cooling-design"],
    prerequisiteKnowledgePointIds: [],
    noveltyStatement: "迁移到新案例",
    mainCourseOverlapSceneIds: [],
    sceneType: "slide",
    targetDurationSec: 360,
    trigger: { placement: "after-module", assessmentSceneIds: ["quiz-1"], evidenceRule: "module-mastery", scoreThreshold: 80, minimumRemainingSec: 480 },
    preparedResource: { status: "ready", classroomId: "preview-case", scenesCount: 4 },
    status: "teacher-confirmed",
  },
  {
    id: "extension-compare",
    kind: "extension",
    title: "不同气候带城市的降温策略比较",
    objective: "比较湿热、干热地区的城市降温方案，形成条件化决策。",
    keyPoints: ["气候差异", "策略迁移"],
    anchorKnowledgePointIds: ["cooling-design"],
    prerequisiteKnowledgePointIds: [],
    noveltyStatement: "跨情境迁移",
    mainCourseOverlapSceneIds: [],
    sceneType: "interactive",
    targetDurationSec: 420,
    trigger: { placement: "after-module", assessmentSceneIds: ["quiz-2"], evidenceRule: "module-mastery", scoreThreshold: 85, minimumRemainingSec: 600 },
    preparedResource: { status: "stale", classroomId: "preview-compare", scenesCount: 3 },
    status: "teacher-confirmed",
  },
];

const plan: AdaptiveLearningPlan = {
  enabled: true,
  status: "teacher-confirmed",
  updatedAt: new Date().toISOString(),
  timeBudgetMin: 45,
  thresholds: { enrichmentMasteryMin: 80 },
  pretest: {
    title: "课程入口诊断",
    introduction: "检查进入主课所需的基础知识。",
    estimatedMinutes: 4,
    questions: [
      { id: "q1", prompt: "图例的作用是什么？", options: ["说明符号含义", "计算面积"], correctOptionIndex: 0, knowledgePointIds: ["map-legend"] },
      { id: "q2", prompt: "热总是怎样传递？", options: ["由高温到低温", "由低温到高温"], correctOptionIndex: 0, knowledgePointIds: ["heat-transfer"] },
    ],
  },
  enrichmentStrategy: {
    recommendedMin: 1,
    recommendedMax: 3,
    runtimeMaxPerStudent: 1,
    summary: "根据达标证据选择最有价值的一项拓展。",
    decisions: [],
  },
  branches,
};

export default function CoursePublishVisualReviewPage() {
  return (
    <main className="min-h-screen bg-[var(--pbl-bg)] px-5 py-8 text-[var(--pbl-text)]">
      <div className="pbl-dashboard-container">
        <CoursePublishPathPreview mainScenes={scenes} onPreviewBranch={() => undefined} plan={plan} />
      </div>
    </main>
  );
}
