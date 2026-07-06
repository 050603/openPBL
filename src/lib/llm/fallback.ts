// Sample content used as a UI fallback when the LLM is not configured.

import type { CourseContent, KnowledgePoint, LessonOutlineSection, EvaluationDimension } from "../session/types";
import type { GenerateInput } from "./types";

const KP: KnowledgePoint[] = [
  { id: "kp-1", name: "驱动问题分析", description: "界定问题边界、关键变量与利益相关方" },
  { id: "kp-2", name: "背景知识图谱", description: "梳理与驱动问题相关的核心概念与跨学科联系" },
  { id: "kp-3", name: "调研方法与工具", description: "问卷、访谈、文献检索与数据可视化方法" },
  { id: "kp-4", name: "方案构思与评估", description: "头脑风暴、原型设计、可行性评估" },
  { id: "kp-5", name: "协作与项目管理", description: "分工、进度跟踪、沟通与冲突管理" },
  { id: "kp-6", name: "成果表达与反思", description: "汇报展示、回应质疑、迭代改进" },
];

const DIM: EvaluationDimension[] = [
  { id: "ev-1", name: "问题识别与分析", weight: 20, description: "对驱动问题背景、范围、关键变量的把握" },
  { id: "ev-2", name: "方案创新性", weight: 20, description: "解决方案的原创性与价值" },
  { id: "ev-3", name: "可行性与实施路径", weight: 25, description: "实施步骤、资源与风险评估" },
  { id: "ev-4", name: "数据与论证充分性", weight: 15, description: "数据来源、引用与论证链" },
  { id: "ev-5", name: "展示与表达", weight: 10, description: "汇报的逻辑与表达" },
  { id: "ev-6", name: "团队协作", weight: 10, description: "分工、沟通、协作质量" },
];

export function buildSampleContent(input: GenerateInput): CourseContent {
  const stageKey = input.stages.find((s) => s.key === "ai-learning")?.key ?? input.stages[0]?.key ?? "ai-learning";
  const lessonOutline: LessonOutlineSection[] = [
    {
      id: "lo-1",
      stageKey,
      title: `${input.name} · 核心概念与背景`,
      objectives: [
        `理解 ${input.subject} 领域与"${input.drivingQuestion?.slice(0, 12) || input.name}"相关的基础概念`,
        "建立项目研究的整体框架",
      ],
      activities: ["AI 讲解视频", "案例学习", "随堂小测"],
      durationMin: 45,
    },
    {
      id: "lo-2",
      stageKey,
      title: `${input.name} · 关键方法与工具`,
      objectives: [
        "掌握与本项目相关的研究方法与工具",
        "能够将方法迁移到自己的项目问题中",
      ],
      activities: ["AI 讲解", "小组讨论", "工具演练"],
      durationMin: 45,
    },
  ];
  return {
    pblOutline:
      `本课程"${input.name}"以真实问题为驱动，结合${input.subject}学科${input.grade}的课程标准，引导学生经历"调研—分析—方案—实施—展示—反思"的完整项目周期。` +
      `核心驱动问题为："${input.drivingQuestion || "（请补充驱动问题）"}"。` +
      `学生将以小组形式开展研究，运用 AI 工具辅助知识学习与方案迭代，最终形成可展示的项目成果。`,
    knowledgePoints: KP,
    lessonOutline,
    evaluationPlan: {
      dimensions: DIM,
      overallRubric:
        "总分由六个维度加权得出，权重合计 100%。各维度按 0-100 分赋分，最终按权重折算为最终成绩。",
    },
  };
}

export function buildSamplePblOutline(input: GenerateInput): { pblOutline: string } {
  return {
    pblOutline:
      `本课程"${input.name}"以驱动问题"${input.drivingQuestion || "（请补充）"}"为核心，组织学生开展项目式学习。` +
      `课程为期 ${input.hours} 课时，分为 ${input.stages.length} 个递进阶段：` +
      input.stages.map((s) => `${s.label}`).join(" → ") +
      `，最终形成可展示的成果并进行反思评价。`,
  };
}
