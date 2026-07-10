"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Network,
  Loader2,
  RotateCw,
  Save,
  Wand2,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { normalizeKnowledgeGraphForDisplay } from "@/components/knowledge-graph";
import { KnowledgeGraphFlow } from "@/components/knowledge-graph-flow";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import type {
  CourseContent,
  KnowledgeGraph,
  LessonOutlineSection,
  OpenMaicSceneOutlineSnapshot,
  TeachingOutlineSection,
} from "@/lib/session/types";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import type { AgentInfo } from "@/lib/openmaic/generation/generation-pipeline";
import { I18nProvider } from "@/lib/openmaic/hooks/use-i18n";
import { OutlinesEditor } from "@/components/openmaic/generation/outlines-editor";
import { cn } from "@/lib/utils";

// ===== SceneOutline ↔ LessonOutlineSection 转换 =====
function sceneOutlineToLessonSection(
  outline: SceneOutline,
  index: number,
  stageKeys: string[],
): LessonOutlineSection {
  return {
    id: outline.id,
    stageKey: stageKeys[Math.min(index, stageKeys.length - 1)] ?? "ai-learning",
    title: outline.title,
    objectives: outline.keyPoints ?? [],
    activities: outline.description ? [outline.description] : [],
    durationMin: Math.max(5, Math.round((outline.estimatedDuration ?? 300) / 60)),
  };
}

function lessonSectionToSceneOutline(
  section: LessonOutlineSection,
  index: number,
): SceneOutline {
  return {
    id: section.id,
    type: "slide",
    title: section.title,
    description: section.activities.join("；") || section.title,
    keyPoints: section.objectives,
    estimatedDuration: section.durationMin * 60,
    order: index,
  };
}

const SCENE_OUTLINE_TYPES = new Set(["slide", "quiz", "interactive", "pbl"]);

function normalizeSceneOutlineSnapshot(outline: unknown, index: number): SceneOutline {
  const raw = outline && typeof outline === "object" ? outline as Record<string, unknown> : {};
  const type = typeof raw.type === "string" && SCENE_OUTLINE_TYPES.has(raw.type)
    ? raw.type
    : "slide";
  return {
    ...raw,
    id: typeof raw.id === "string" && raw.id ? raw.id : `scene-${index + 1}`,
    type: type as SceneOutline["type"],
    title: typeof raw.title === "string" && raw.title ? raw.title : `Scene ${index + 1}`,
    description:
      typeof raw.description === "string" && raw.description
        ? raw.description
        : typeof raw.title === "string"
          ? raw.title
          : `Scene ${index + 1}`,
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.filter((x): x is string => typeof x === "string")
      : [],
    estimatedDuration:
      typeof raw.estimatedDuration === "number" ? raw.estimatedDuration : 300,
    order: index,
  } as SceneOutline;
}

function cloneSceneOutlinesForSession(
  outlines: SceneOutline[],
): OpenMaicSceneOutlineSnapshot[] {
  return outlines.map((outline, index) => {
    const normalized = normalizeSceneOutlineSnapshot(JSON.parse(JSON.stringify(outline)), index);
    return normalized as unknown as OpenMaicSceneOutlineSnapshot;
  });
}

function contentToSceneOutlines(content?: CourseContent): SceneOutline[] {
  if (content?._openmaicSceneOutlines?.length) {
    return content._openmaicSceneOutlines.map((outline, index) =>
      normalizeSceneOutlineSnapshot(outline, index),
    );
  }
  return (content?.lessonOutline ?? []).map((section, index) =>
    lessonSectionToSceneOutline(section, index),
  );
}

function ensureKnowledgeGraph(content: CourseContent): KnowledgeGraph {
  return normalizeKnowledgeGraphForDisplay(content.knowledgeGraph, content.knowledgePoints);
}

function syncGraphNodeFromPoint(content: CourseContent, pointId: string): CourseContent {
  const graph = ensureKnowledgeGraph(content);
  const point = content.knowledgePoints.find((item) => item.id === pointId);
  if (!point) return content;
  return {
    ...content,
    knowledgeGraph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === pointId
          ? {
              ...node,
              label: point.name,
              description: point.description,
              keyInfo: point.keyInfo,
            }
          : node,
      ),
    },
  };
}

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

type Section = "knowledgePoints" | "teachingOutline" | "lessonOutline" | "evaluationPlan";

const SECTION_LABEL: Record<Section, string> = {
  knowledgePoints: "知识图谱",
  teachingOutline: "课程授课大纲",
  lessonOutline: "AI 授知大纲",
  evaluationPlan: "评价方案",
};

const SECTION_DESC: Record<Section, string> = {
  knowledgePoints: "学生需掌握的核心概念、关键信息与节点关系",
  teachingOutline: "教案级活动编排，明确教师、平台、AI 与学生各自任务",
  lessonOutline: "AI 授知场景，聚焦核心知识点学习与测验",
  evaluationPlan: "项目各维度的评价指标与权重",
};

const FLOW_STEPS: { key: "base" | Section; label: string; desc: string }[] = [
  { key: "base", label: "基础信息", desc: "确认课程名称、学科、年级、课时与驱动问题" },
  { key: "knowledgePoints", label: "知识图谱", desc: "确认本课知识节点和节点间关系" },
  { key: "teachingOutline", label: "课程大纲", desc: "确认整节课教学活动与人机分工" },
  { key: "lessonOutline", label: "AI 授知大纲", desc: "确认 AI 授知核心知识点场景" },
  { key: "evaluationPlan", label: "评价方案", desc: "基于知识图谱与项目目标生成评价维度" },
];

export default function VerifyCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, setCourseContent, updateCourse } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();

  const [content, setContent] = useState<CourseContent | undefined>();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    knowledgePoints: true,
    teachingOutline: true,
    lessonOutline: false,
    evaluationPlan: false,
  });
  const [busy, setBusy] = useState<Section | "all" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [flowStep, setFlowStep] = useState(0);
  // OpenMAIC outline 流式生成状态
  const [outlineStreaming, setOutlineStreaming] = useState(false);
  const [streamingCount, setStreamingCount] = useState(0);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // OpenMAIC SceneOutline[] 状态：OutlinesEditor 直接编辑此数组
  const [sceneOutlines, setSceneOutlines] = useState<SceneOutline[]>([]);
  const stageKeys = useMemo(
    () => (course?.stages ?? []).map((s) => s.key),
    [course?.stages],
  );

  // sceneOutlines → content.lessonOutline 同步
  const syncLessonOutline = useCallback(
    (outlines: SceneOutline[]) => {
      setContent((c) =>
        c
          ? {
              ...c,
              lessonOutline: outlines.map((o, i) =>
                sceneOutlineToLessonSection(o, i, stageKeys),
              ),
              _openmaicSceneOutlines: cloneSceneOutlinesForSession(outlines),
            }
          : c,
      );
    },
    [stageKeys],
  );

  // Initialize content from course when loaded
  useEffect(() => {
    if (!course || content) return;
    const initialContent: CourseContent = {
      ...course.content,
      teachingOutline: course.content.teachingOutline ?? [],
    };
    setContent(initialContent);
    setSceneOutlines(contentToSceneOutlines(initialContent));
  }, [course, content]);

  const canGenerate = useMemo(() => {
    if (!course) return false;
    return Boolean(course.name);
  }, [course]);

  const generateSection = useCallback(
    async (section: Section) => {
      if (!course) return;
      setBusy(section);
      setError(undefined);
      setInfo(undefined);
      try {
        const action =
          section === "knowledgePoints"
            ? "knowledgeGraph"
            : section === "teachingOutline"
              ? "teachingOutline"
              : section === "lessonOutline"
                ? "lessonOutline"
                : "evaluationPlan";
        const res = await fetch("/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            input: {
              name: course.name,
              subject: course.subject,
              grade: course.grade,
              hours: course.hours,
              summary: course.summary,
              drivingQuestion: course.drivingQuestion,
              stages: course.stages.map((s) => ({
                key: s.key,
                label: s.label,
                description: s.description,
              })),
            },
            context: content
              ? {
                  pblOutline: content.pblOutline,
                  knowledgePoints: content.knowledgePoints,
                  knowledgeGraph: content.knowledgeGraph,
                  teachingOutline: content.teachingOutline,
                  lessonOutline: content.lessonOutline,
                }
              : undefined,
          }),
        });
        if (!res.ok) {
          let detail = `生成失败（HTTP ${res.status}）`;
          try {
            const errBody = (await res.json()) as { detail?: string; error?: string };
            if (errBody?.detail) detail = errBody.detail;
            else if (errBody?.error) detail = errBody.error;
          } catch {
            // 响应非 JSON，保留默认错误
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as {
          content: CourseContent;
          source: "llm";
        };
        setContent((prev) => ({
          ...(prev ?? course.content),
          ...(section === "knowledgePoints"
            ? {
                knowledgePoints: data.content.knowledgePoints,
                knowledgeGraph: data.content.knowledgeGraph,
              }
            : {}),
          ...(section === "teachingOutline"
            ? {
                pblOutline: data.content.pblOutline || (prev ?? course.content).pblOutline,
                teachingOutline: data.content.teachingOutline ?? [],
              }
            : {}),
          ...(section === "lessonOutline"
            ? { lessonOutline: data.content.lessonOutline }
            : {}),
          ...(section === "evaluationPlan"
            ? { evaluationPlan: data.content.evaluationPlan }
            : {}),
        }));
        setInfo("已使用 AI 生成内容");
      } catch (e) {
        setError((e as Error).message || "生成失败");
      } finally {
        setBusy(null);
      }
    },
    [course, content],
  );

  // ===== OpenMAIC outline 流式生成（AI 授知大纲） =====
  // 调用 /api/openmaic/generate/scene-outlines-stream，SSE 逐条推送 SceneOutline，
  // 直接使用 OpenMAIC 的 OutlinesEditor 呈现，与 OpenMAIC 完全一致。
  const generateLessonOutlineOpenMAIC = useCallback(async () => {
    if (!course) return;
    // 中止上一次流式生成
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutlineStreaming(true);
    setStreamingCount(0);
    setError(undefined);
    setInfo(undefined);
    setBusy("lessonOutline");
    setOpen((o) => ({ ...o, lessonOutline: true }));

    // 构建需求字符串
    // 关键：OpenMAIC prompt 模板期望 requirement 是"用户学习需求"自由文本，
    // 模板根据 requirement 中可推断的"时长（分钟）"决定场景数（1-2 场景/分钟）。
    // 必须明确：1) 这是 PBL 课程需多场景教学大纲 2) 时长（分钟）3) 期望场景数 4) 场景类型分布。
    const stages = (course.stages ?? [])
      .map((s) => `${s.label}(${s.key})`)
      .filter(Boolean)
      .join("、");
    const teacherResourceActivities = (
      content?.teachingOutline ?? course.content.teachingOutline ?? []
    ).filter((activity) => activity.openMaicUse === "teacher-resource");
    const launchStageKey =
      course.stages.find((stage) => stage.view === "project-launch")?.key ??
      course.stages[0]?.key ??
      "launch";
    // 课时 → 分钟：1 课时 = 40 分钟（基础教育标准课时）
    const totalMinutes = Math.max(15, (course.hours || 1) * 40);
    // 推导目标场景数：每 3-4 分钟一个场景，下限 8，上限 30
    const targetSceneCount = Math.min(
      36,
      Math.max(8, Math.round(totalMinutes / 3) + teacherResourceActivities.length),
    );

    // 根据 interactiveMode 分支构造 requirement：
    // - true：走 INTERACTIVE_OUTLINES 模板，模板自带 70% interactive / 30% slide 强制分布约束，
    //         requirement 只提供课程信息，不强制场景分布，让模板约束自然生效
    // - false：走 REQUIREMENTS_TO_OUTLINES 模板，需在 requirement 中显式声明场景分布
    const commonHeader = [
      `请用中文为以下PBL课程生成多场景教学大纲（共约 ${targetSceneCount} 个场景，时长约 ${totalMinutes} 分钟）。`,
      "",
      "【课程信息】",
      `课程名称：${course.name}`,
      course.summary ? `课程摘要：${course.summary}` : "",
      course.drivingQuestion ? `驱动问题：${course.drivingQuestion}` : "",
      stages ? `课程阶段：${stages}` : "",
      `总课时：${course.hours} 课时（约 ${totalMinutes} 分钟）`,
      "",
      "【已确认知识图谱】",
      JSON.stringify({
        knowledgePoints: content?.knowledgePoints ?? course.content.knowledgePoints,
        knowledgeGraph: content?.knowledgeGraph ?? course.content.knowledgeGraph ?? null,
      }),
      "",
      "【已确认整课授课大纲】",
      JSON.stringify(content?.teachingOutline ?? course.content.teachingOutline ?? []),
      "",
      "【内容拆分规则】",
      "AI 生成链路可以为教师资源和学生 AI 授知生成素材，但最终学生 AI 授知课堂只保留核心知识点学习、互动和测验场景。",
      "整课授课大纲中每个 openMaicUse=teacher-resource 的活动至少生成 1 个教师资源场景；resourceTypes 含 ppt 时生成 slide，适合演示操作时可生成 interactive，项目布置生成 pbl。",
      "每个教师资源场景标题必须同时带用途标记与阶段标记，格式为【教师资源-用途】【阶段:stageKey】标题，例如【教师资源-课程引入】【阶段:launch】情境导入。stageKey 必须使用课程阶段括号中的真实 key。",
      `PBL 项目布置默认阶段为 ${launchStageKey}，除非整课授课大纲明确指定其他 stageKey。`,
      teacherResourceActivities.length
        ? `必须覆盖以下教师资源活动：${JSON.stringify(teacherResourceActivities)}`
        : "如生成课程引入或 PBL 项目布置，也必须按教师资源格式标记。",
      "学生 AI 授知场景标题不要使用【教师资源】标记，应聚焦知识图谱中的核心知识点讲授、练习和测验。",
      "请严格参考上述知识图谱：先覆盖基础/核心节点，再设计应用/拓展节点；每个学生 AI 授知场景需在 keyPoints 中体现对应知识节点。",
    ].filter(Boolean);

    const requirement = interactiveMode
      ? [
          ...commonHeader,
          "",
          "【互动模式要求】",
          "请按互动优先（Interactive-First）模式生成：",
          "- 约 70% 的场景为 interactive 类型（含 widgetType 和 widgetOutline）",
          "- 约 30% 的场景为 slide 类型（用于导入、概念框架、总结）",
          "- 每个 interactive 场景必须指定 widgetType（simulation/diagram/code/game/visualization3d）",
          "- 每个 interactive 场景必须指定 widgetOutline（根据 widgetType 填充对应字段）",
          "- simulation 类场景至少 2 个，game 类场景至少 1 个，diagram 类至多 1 个",
          `- 如生成 pbl 场景，标题必须使用【教师资源-PBL项目布置】【阶段:${launchStageKey}】用于教师布置项目，不进入学生 AI 授知课堂`,
          "",
          "【输出要求】",
          `- 必须返回 ${targetSceneCount} 个左右的 scene outlines，不能只返回 1 个总览页`,
          "- 每个 scene 必须有清晰的 title、description、3-5 个 keyPoints",
          "- interactive 场景缺失 widgetType/widgetOutline 会被视为无效",
        ].join("\n")
      : (() => {
          // 默认模式：显式声明场景分布
          const quizCount = Math.max(2, Math.round(targetSceneCount / 5));
          const interactiveCount = course.subject && /物理|化学|生物|数学|地理|信息|编程|计算/i.test(course.subject) ? 2 : 1;
          const pblCount = 1;
          const slideCount = Math.max(3, targetSceneCount - quizCount - interactiveCount - pblCount);
          return [
            ...commonHeader,
            "",
            "【场景结构要求】",
            `请生成 ${targetSceneCount} 个左右的教学场景，按教学逻辑顺序排列，覆盖从导入、新知讲解、互动探究到总结评估的完整流程：`,
            `- ${slideCount} 个 slide 场景：用于概念讲解、知识点阐述、案例展示、总结回顾`,
            `- ${quizCount} 个 quiz 场景：每 3-5 个 slide 后插入 1 个测验（含单选/多选/简答），用于过程性评估`,
            `- ${interactiveCount} 个 interactive 场景：针对抽象或需要可视化探究的概念（如流程图、模拟、3D 模型），每个 interactive 场景需指定 widgetType 和 widgetOutline`,
            `- ${pblCount} 个 pbl 场景：标题必须带【教师资源-PBL项目布置】【阶段:${launchStageKey}】，包含 projectTopic、projectDescription、targetSkills、issueCount 等配置，后续只供教师授课展示`,
            "",
            "【教学目标】",
            "- 学生能够理解课程核心概念并应用于真实情境",
            "- 通过驱动问题激发探究与协作",
            "- 在 PBL 环节中完成阶段性项目作品",
            "- 通过测验检验知识掌握程度",
            "",
            "【输出要求】",
            `- 必须返回 ${targetSceneCount} 个左右的 scene outlines，不能只返回 1 个总览页`,
            "- 每个 scene 必须有清晰的 title、description、3-5 个 keyPoints",
            "- quiz 场景需包含 quizConfig（questionCount、difficulty、questionTypes）",
            "- interactive 场景需包含 widgetType 和 widgetOutline",
      "- pbl 场景需包含完整 pblConfig，且必须明确是教师资源",
      `- order 字段从 1 递增到 ${targetSceneCount}`,
    ]
      .filter(Boolean)
      .join("\n");
        })();

    // P0 优化：注入教师上下文（与 OpenMAIC 一致）
    // formatTeacherPersonaForPrompt 会从 agents 中提取 teacher 角色的人设，
    // 注入到生成 prompt 中，引导 LLM 适配教师的教学风格与语气。
    // 注：prompt 模板使用英文，persona 也用英文以避免翻译歧义。
    const teacherName = user?.name || "教师";
    const teacherPersona = [
      "Teaching style: PBL facilitator who drives inquiry and collaboration through driving questions.",
      `Subject expertise: ${course.subject || "Interdisciplinary"}.`,
      `Target audience: ${course.grade || "students"}.`,
      "Pedagogy: student-centered, emphasizes real-world inquiry and practice, encourages cross-disciplinary thinking and progressive scaffolding.",
    ].join("\n");
    const agents: AgentInfo[] = [
      {
        id: "teacher",
        name: teacherName,
        role: "teacher",
        persona: teacherPersona,
      },
    ];

    // P0 优化：注入学生画像（与 OpenMAIC 一致）
    // OpenMAIC 的 scene-outlines-stream 路由会从 requirements.userNickname/userBio
    // 构建 "## Student Profile" 文本块，引导 LLM 根据学生背景调整难度与示例。
    // OpenPBL 中由教师代为生成课程，因此从课程信息推导目标学生受众的画像。
    const userNickname = `${course.grade || ""}学生`.trim() || undefined;
    const userBioParts: string[] = [];
    if (course.subject) userBioParts.push(`${course.subject}学科学生`);
    if (course.name) userBioParts.push(`正在学习"${course.name}"课程`);
    if (course.drivingQuestion)
      userBioParts.push(`项目驱动问题：${course.drivingQuestion}`);
    const userBio = userBioParts.join("；") || undefined;

    try {
      const res = await fetch("/api/openmaic/generate/scene-outlines-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements: {
            requirement,
            userNickname,
            userBio,
            webSearch: false,
            interactiveMode,
            taskEngineMode: false,
          },
          agents,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ||
            `AI 授知大纲生成失败（HTTP ${res.status}）`,
        );
      }

      if (!res.body) throw new Error("未收到生成流");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const collected: SceneOutline[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (evt.type === "outline" && evt.data) {
            // 直接收集 SceneOutline，保留 type/keyPoints/quizConfig 等完整字段
            const outline = evt.data as SceneOutline;
            outline.order = collected.length;
            collected.push(outline);
            setStreamingCount(collected.length);
            // 实时更新 OutlinesEditor
            setSceneOutlines([...collected]);
            // 同步到 content.lessonOutline
            syncLessonOutline(collected);
          } else if (evt.type === "done") {
            // 若流式未推送单条事件，从 done 批量加载
            const outlines = (evt.outlines as SceneOutline[]) ?? [];
            if (outlines.length > 0 && collected.length === 0) {
              for (let i = 0; i < outlines.length; i++) {
                outlines[i].order = i;
                collected.push(outlines[i]);
              }
              setSceneOutlines([...collected]);
              syncLessonOutline(collected);
            }
            setInfo(`AI 授知大纲已生成（共 ${collected.length} 节）`);
          } else if (evt.type === "error") {
            throw new Error((evt.error as string) ?? "AI 授知大纲生成失败");
          }
        }
      }

      if (collected.length === 0) {
        setInfo("AI 未返回大纲，请检查 LLM 配置后重试");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setInfo("已取消生成");
      } else {
        setError((e as Error).message || "AI 授知大纲生成失败");
      }
    } finally {
      setOutlineStreaming(false);
      setStreamingCount(0);
      setBusy(null);
      abortRef.current = null;
    }
  }, [course, user, syncLessonOutline, interactiveMode, content]);

  const currentStepKey = FLOW_STEPS[flowStep]?.key;
  const currentSection = currentStepKey === "base" ? null : currentStepKey;

  const generateCurrentStep = useCallback(() => {
    if (!currentSection) {
      setInfo("基础信息已确认，请进入下一步生成知识图谱。");
      return;
    }
    if (currentSection === "lessonOutline") {
      void generateLessonOutlineOpenMAIC();
      return;
    }
    void generateSection(currentSection);
  }, [currentSection, generateSection, generateLessonOutlineOpenMAIC]);

  // 组件卸载时中止流式生成
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 当 content.lessonOutline 被 legacy generate("all") 更新后，
  // 且 sceneOutlines 为空时，从 LessonOutlineSection 反向同步到 SceneOutline
  useEffect(() => {
    if (outlineStreaming) return; // 流式生成中不反向同步
    if (sceneOutlines.length > 0) return; // 已有 OpenMAIC 数据，不覆盖
    const outlines = contentToSceneOutlines(content);
    if (outlines.length === 0) return;
    setSceneOutlines(outlines);
  }, [content, outlineStreaming, sceneOutlines.length]);

  function buildPersistableContent(): CourseContent | null {
    if (!content) return null;
    return sceneOutlines.length > 0
      ? {
          ...content,
          teachingOutline: content.teachingOutline ?? [],
          lessonOutline: sceneOutlines.map((outline, index) =>
            sceneOutlineToLessonSection(outline, index, stageKeys),
          ),
          _openmaicSceneOutlines: cloneSceneOutlinesForSession(sceneOutlines),
        }
      : {
          ...content,
          teachingOutline: content.teachingOutline ?? [],
        };
  }

  function saveDraft(showMessage = true): CourseContent | null {
    if (!course) return null;
    const nextContent = buildPersistableContent();
    if (!nextContent) return null;
    setCourseContent(course.id, nextContent);
    updateCourse(course.id, {});
    if (showMessage) {
      setInfo("已保存当前备课草稿，后续生成将使用最新版内容。");
      window.setTimeout(() => setInfo(undefined), 2500);
    }
    return nextContent;
  }

  function isStepReady(section: Section | null): boolean {
    if (!content) return false;
    if (!section) return true;
    if (section === "knowledgePoints") return content.knowledgePoints.length > 0;
    if (section === "teachingOutline") return (content.teachingOutline?.length ?? 0) > 0;
    if (section === "lessonOutline") return sceneOutlines.length > 0 || content.lessonOutline.length > 0;
    return content.evaluationPlan.dimensions.length > 0;
  }

  function confirmStepAndNext() {
    if (!isStepReady(currentSection)) {
      const message = currentSection
        ? `请先生成或补充${SECTION_LABEL[currentSection]}，再确认进入下一步。`
        : "请先确认基础信息。";
      setError(message);
      window.alert(message);
      return;
    }
    saveDraft(false);
    setError(undefined);
    setInfo("已确认并保存当前内容，下一步将基于最新版内容生成。");
    window.setTimeout(() => setInfo(undefined), 2500);
    setFlowStep((step) => Math.min(FLOW_STEPS.length - 1, step + 1));
  }

  function persistAndNext() {
    if (!course) return;
    const requiredSections: Section[] = [
      "knowledgePoints",
      "teachingOutline",
      "lessonOutline",
      "evaluationPlan",
    ];
    const missing = requiredSections.find((section) => !isStepReady(section));
    if (missing) {
      const message = `请先完成并保存${SECTION_LABEL[missing]}，再进入课程生成。`;
      setError(message);
      window.alert(message);
      return;
    }
    const nextContent = buildPersistableContent();
    if (!nextContent) return;
    setCourseContent(course.id, nextContent);
    updateCourse(course.id, {});
    router.push(`/teacher/prepare/${course.id}/generate`);
  }

  function toggle(s: Section) {
    setOpen((o) => ({ ...o, [s]: !o[s] }));
  }

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">
          未找到课程。
          <Link className="mt-4 text-blue-700 hover:underline" href="/teacher">
            返回课程列表
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const sections: { key: Section; node: React.ReactNode }[] = [
    {
      key: "teachingOutline",
      node: (
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-black text-slate-800">PBL 项目主线说明</div>
            <textarea
              className="min-h-[100px] w-full rounded-[6px] border border-slate-300 px-4 py-3 text-[15px] leading-7 outline-none focus:border-blue-500"
              onChange={(e) =>
                setContent((c) =>
                  c ? { ...c, pblOutline: e.target.value } : c,
                )
              }
              placeholder="用于概括驱动问题、项目主线、成果产出和课堂组织方式。"
              value={content?.pblOutline ?? ""}
            />
          </div>

          <div className="grid gap-3">
            {(content?.teachingOutline ?? []).map((section, index) => (
              <div
                className="rounded-[8px] border border-slate-200 bg-white p-4"
                key={section.id}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                    {index + 1}
                  </span>
                  <input
                    className="h-9 min-w-[220px] flex-1 rounded-[6px] border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500"
                    onChange={(e) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        title: e.target.value,
                      })
                    }
                    value={section.title}
                  />
                  <input
                    className="h-9 w-20 rounded-[6px] border border-slate-300 px-2 text-right text-sm outline-none focus:border-blue-500"
                    min={1}
                    onChange={(e) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        durationMin: Number(e.target.value) || 1,
                      })
                    }
                    type="number"
                    value={section.durationMin}
                  />
                  <span className="text-xs text-slate-500">分钟</span>
                  <select
                    className="h-9 rounded-[6px] border border-slate-300 px-2 text-sm outline-none focus:border-blue-500"
                    onChange={(e) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        openMaicUse: e.target.value as TeachingOutlineSection["openMaicUse"],
                      })
                    }
                    value={section.openMaicUse ?? "none"}
                  >
                    <option value="none">普通课堂活动</option>
                    <option value="student-ai-learning">学生 AI 授知</option>
                    <option value="teacher-resource">教师资源</option>
                  </select>
                  <button
                    className="text-sm font-semibold text-slate-400 hover:text-red-600"
                    onClick={() =>
                      setContent((c) =>
                        c
                          ? {
                              ...c,
                              teachingOutline: (c.teachingOutline ?? []).filter(
                                (item) => item.id !== section.id,
                              ),
                            }
                          : c,
                      )
                    }
                    type="button"
                  >
                    删除
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <OutlineTextarea
                    label="教学目标"
                    value={section.teachingGoal}
                    onChange={(value) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        teachingGoal: value,
                      })
                    }
                  />
                  <OutlineTextarea
                    label="学生活动"
                    value={section.studentActivity}
                    onChange={(value) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        studentActivity: value,
                      })
                    }
                  />
                  <OutlineTextarea
                    label="教师负责"
                    value={section.teacherRole}
                    onChange={(value) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        teacherRole: value,
                      })
                    }
                  />
                  <OutlineTextarea
                    label="平台与 AI 负责"
                    value={`平台：${section.platformRole}\nAI：${section.aiRole}`}
                    onChange={(value) => {
                      const [platformLine, aiLine] = value.split(/\n/);
                      updateTeachingOutlineItem(setContent, section.id, {
                        platformRole: (platformLine ?? "").replace(/^平台[:：]\s*/, ""),
                        aiRole: (aiLine ?? "").replace(/^AI[:：]\s*/, ""),
                      });
                    }}
                  />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      关联知识点 ID（逗号分隔）
                    </span>
                    <input
                      className="h-9 w-full rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        updateTeachingOutlineItem(setContent, section.id, {
                          knowledgePointIds: e.target.value
                            .split(/[,，]/)
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="kp-1, kp-2"
                      value={(section.knowledgePointIds ?? []).join(", ")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      可生成资源类型（逗号分隔）
                    </span>
                    <input
                      className="h-9 w-full rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        updateTeachingOutlineItem(setContent, section.id, {
                          resourceTypes: e.target.value
                            .split(/[,，]/)
                            .map((item) => item.trim())
                            .filter(Boolean) as TeachingOutlineSection["resourceTypes"],
                        })
                      }
                      placeholder="ppt, interactive-demo, script, project-brief"
                      value={(section.resourceTypes ?? []).join(", ")}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() =>
              setContent((c) =>
                c
                  ? {
                      ...c,
                      teachingOutline: [
                        ...(c.teachingOutline ?? []),
                        createEmptyTeachingOutlineItem(c.teachingOutline?.length ?? 0),
                      ],
                    }
                  : c,
              )
            }
            type="button"
          >
            + 添加授课活动
          </button>
        </div>
      ),
    },
    {
      key: "knowledgePoints",
      node: (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="space-y-5 xl:order-2">
            <div>
              <div className="mb-2 text-sm font-black text-slate-800">知识节点</div>
              <div className="space-y-2">
                {(content?.knowledgePoints ?? []).map((kp) => (
                  <div
                    className="grid gap-2 rounded-[8px] border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_1.5fr_1.5fr_auto]"
                    key={kp.id}
                  >
                    <input
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) => {
                          if (!c) return c;
                          const next = {
                            ...c,
                            knowledgePoints: c.knowledgePoints.map((x) =>
                              x.id === kp.id ? { ...x, name: e.target.value } : x,
                            ),
                          };
                          return syncGraphNodeFromPoint(next, kp.id);
                        })
                      }
                      value={kp.name}
                    />
                    <input
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) => {
                          if (!c) return c;
                          const next = {
                            ...c,
                            knowledgePoints: c.knowledgePoints.map((x) =>
                              x.id === kp.id ? { ...x, description: e.target.value } : x,
                            ),
                          };
                          return syncGraphNodeFromPoint(next, kp.id);
                        })
                      }
                      placeholder="节点说明"
                      value={kp.description}
                    />
                    <input
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) => {
                          if (!c) return c;
                          const next = {
                            ...c,
                            knowledgePoints: c.knowledgePoints.map((x) =>
                              x.id === kp.id ? { ...x, keyInfo: e.target.value } : x,
                            ),
                          };
                          return syncGraphNodeFromPoint(next, kp.id);
                        })
                      }
                      placeholder="本课关键信息"
                      value={kp.keyInfo ?? ""}
                    />
                    <button
                      className="text-sm font-semibold text-slate-400 hover:text-red-600"
                      onClick={() =>
                        setContent((c) => {
                          if (!c) return c;
                          const graph = ensureKnowledgeGraph(c);
                          return {
                            ...c,
                            knowledgePoints: c.knowledgePoints.filter((x) => x.id !== kp.id),
                            knowledgeGraph: {
                              nodes: graph.nodes.filter((node) => node.id !== kp.id),
                              edges: graph.edges.filter((edge) => edge.source !== kp.id && edge.target !== kp.id),
                            },
                          };
                        })
                      }
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() =>
                  setContent((c) => {
                    if (!c) return c;
                    const id = "kp-" + (c.knowledgePoints.length + 1);
                    const point = {
                      id,
                      name: "新知识点",
                      description: "",
                      keyInfo: "",
                    };
                    const graph = ensureKnowledgeGraph(c);
                    return {
                      ...c,
                      knowledgePoints: [...c.knowledgePoints, point],
                      knowledgeGraph: {
                        ...graph,
                        nodes: [
                          ...graph.nodes,
                          { id, label: point.name, description: "", keyInfo: "", level: "core" },
                        ],
                      },
                    };
                  })
                }
                type="button"
              >
                + 添加知识节点
              </button>
            </div>

            <div>
              <div className="mb-2 text-sm font-black text-slate-800">节点关系</div>
              <div className="space-y-2">
                {(content ? ensureKnowledgeGraph(content).edges : []).map((edge) => (
                  <div
                    className="grid gap-2 rounded-[8px] border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
                    key={edge.id}
                  >
                    <select
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) =>
                          c
                            ? {
                                ...c,
                                knowledgeGraph: {
                                  ...ensureKnowledgeGraph(c),
                                  edges: ensureKnowledgeGraph(c).edges.map((item) =>
                                    item.id === edge.id ? { ...item, source: e.target.value } : item,
                                  ),
                                },
                              }
                            : c,
                        )
                      }
                      value={edge.source}
                    >
                      {(content?.knowledgePoints ?? []).map((point) => (
                        <option key={point.id} value={point.id}>{point.name}</option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) =>
                          c
                            ? {
                                ...c,
                                knowledgeGraph: {
                                  ...ensureKnowledgeGraph(c),
                                  edges: ensureKnowledgeGraph(c).edges.map((item) =>
                                    item.id === edge.id ? { ...item, target: e.target.value } : item,
                                  ),
                                },
                              }
                            : c,
                        )
                      }
                      value={edge.target}
                    >
                      {(content?.knowledgePoints ?? []).map((point) => (
                        <option key={point.id} value={point.id}>{point.name}</option>
                      ))}
                    </select>
                    <input
                      className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                      onChange={(e) =>
                        setContent((c) =>
                          c
                            ? {
                                ...c,
                                knowledgeGraph: {
                                  ...ensureKnowledgeGraph(c),
                                  edges: ensureKnowledgeGraph(c).edges.map((item) =>
                                    item.id === edge.id ? { ...item, label: e.target.value } : item,
                                  ),
                                },
                              }
                            : c,
                        )
                      }
                      placeholder="关系说明"
                      value={edge.label}
                    />
                    <button
                      className="text-sm font-semibold text-slate-400 hover:text-red-600"
                      onClick={() =>
                        setContent((c) =>
                          c
                            ? {
                                ...c,
                                knowledgeGraph: {
                                  ...ensureKnowledgeGraph(c),
                                  edges: ensureKnowledgeGraph(c).edges.filter((item) => item.id !== edge.id),
                                },
                              }
                            : c,
                        )
                      }
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                disabled={(content?.knowledgePoints.length ?? 0) < 2}
                onClick={() =>
                  setContent((c) => {
                    if (!c || c.knowledgePoints.length < 2) return c;
                    const graph = ensureKnowledgeGraph(c);
                    return {
                      ...c,
                      knowledgeGraph: {
                        ...graph,
                        edges: [
                          ...graph.edges,
                          {
                            id: "edge-" + (graph.edges.length + 1),
                            source: c.knowledgePoints[0].id,
                            target: c.knowledgePoints[1].id,
                            label: "支撑",
                          },
                        ],
                      },
                    };
                  })
                }
                type="button"
              >
                + 添加关系
              </button>
            </div>
          </div>

          <div className="min-h-[620px] overflow-hidden rounded-[8px] border border-slate-200 bg-white xl:order-1">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 font-black text-slate-900">
                <Network size={18} className="text-blue-700" />
                知识图谱编辑预览
              </div>
              <div className="text-xs font-semibold text-slate-400">
                可拖拽、缩放、点击节点高亮路径
              </div>
            </div>
            <div className="h-[620px]">
              <KnowledgeGraphFlow
                graph={content?.knowledgeGraph}
                points={content?.knowledgePoints ?? []}
                height={620}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "lessonOutline",
      node: (
        <div className="space-y-4">
          {sceneOutlines.length > 0 || outlineStreaming ? (
            <I18nProvider>
            <OutlinesEditor
              outlines={sceneOutlines}
              onChange={(outlines) => {
                setSceneOutlines(outlines);
                syncLessonOutline(outlines);
              }}
              onConfirm={() => {
                syncLessonOutline(sceneOutlines);
                setInfo("AI 授知大纲已保存");
                window.setTimeout(() => setInfo(undefined), 2500);
              }}
              onBack={() => {
                setOpen((o) => ({ ...o, lessonOutline: false }));
              }}
              isStreaming={outlineStreaming}
            />
            </I18nProvider>
          ) : (
            <div className="rounded-[8px] border border-dashed border-slate-200 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                暂无 AI 授知章节。点击上方「AI 生成」按钮，生成 AI 授知大纲。
              </p>
              <p className="mt-2 text-xs text-slate-400">
                支持场景类型（幻灯片 / 测验 / 互动 / PBL）、关键知识点、教学目标等结构化编辑。
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "evaluationPlan",
      node: (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-[6px] border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3">维度</th>
                  <th className="p-3 w-24">权重</th>
                  <th className="p-3">描述</th>
                  <th className="p-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {(content?.evaluationPlan.dimensions ?? []).map((d) => {
                  return (
                    <tr className="border-b border-slate-100" key={d.id}>
                      <td className="p-3">
                        <input
                          className="h-9 w-full rounded-[6px] border border-slate-200 px-2 text-sm outline-none focus:border-blue-500"
                          onChange={(e) =>
                            setContent((c) =>
                              c
                                ? {
                                    ...c,
                                    evaluationPlan: {
                                      ...c.evaluationPlan,
                                      dimensions: c.evaluationPlan.dimensions.map(
                                        (x) =>
                                          x.id === d.id
                                            ? { ...x, name: e.target.value }
                                            : x,
                                      ),
                                    },
                                  }
                                : c,
                            )
                          }
                          value={d.name}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input
                            className="h-9 w-16 rounded-[6px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-blue-500"
                            max={100}
                            min={0}
                            onChange={(e) =>
                              setContent((c) =>
                                c
                                  ? {
                                      ...c,
                                      evaluationPlan: {
                                        ...c.evaluationPlan,
                                        dimensions: c.evaluationPlan.dimensions.map(
                                          (x) =>
                                            x.id === d.id
                                              ? {
                                                  ...x,
                                                  weight: Number(e.target.value) || 0,
                                                }
                                              : x,
                                        ),
                                      },
                                    }
                                  : c,
                            )
                          }
                          type="number"
                          value={d.weight}
                          />
                          <span className="text-xs text-slate-500">%</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <input
                          className="h-9 w-full rounded-[6px] border border-slate-200 px-2 text-sm outline-none focus:border-blue-500"
                          onChange={(e) =>
                            setContent((c) =>
                              c
                                ? {
                                    ...c,
                                    evaluationPlan: {
                                      ...c.evaluationPlan,
                                      dimensions: c.evaluationPlan.dimensions.map(
                                        (x) =>
                                          x.id === d.id
                                            ? { ...x, description: e.target.value }
                                            : x,
                                      ),
                                    },
                                  }
                                : c,
                            )
                          }
                          value={d.description}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <button
                          className="text-sm font-semibold text-slate-400 hover:text-red-600"
                          onClick={() =>
                            setContent((c) =>
                              c
                                ? {
                                    ...c,
                                    evaluationPlan: {
                                      ...c.evaluationPlan,
                                      dimensions:
                                        c.evaluationPlan.dimensions.filter(
                                          (x) => x.id !== d.id,
                                        ),
                                    },
                                  }
                                : c,
                            )
                          }
                          type="button"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="p-3 font-semibold" colSpan={1}>
                    合计
                  </td>
                  <td className="p-3 font-semibold">
                    {(content?.evaluationPlan.dimensions ?? []).reduce(
                      (s, x) => s + (Number(x.weight) || 0),
                      0,
                    )}
                    %
                  </td>
                  <td className="p-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() =>
                setContent((c) =>
                  c
                    ? {
                        ...c,
                        evaluationPlan: {
                          ...c.evaluationPlan,
                          dimensions: [
                            ...c.evaluationPlan.dimensions,
                            {
                              id: "ev-" + (c.evaluationPlan.dimensions.length + 1),
                              name: "新维度",
                              weight: 10,
                              description: "",
                            },
                          ],
                        },
                      }
                    : c,
                )
              }
              type="button"
            >
              + 添加评价维度
            </button>
            <textarea
              className="min-h-[60px] flex-1 ml-3 rounded-[6px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              onChange={(e) =>
                setContent((c) =>
                  c
                    ? {
                        ...c,
                        evaluationPlan: {
                          ...c.evaluationPlan,
                          overallRubric: e.target.value,
                        },
                      }
                    : c,
                )
              }
              placeholder="整体评价说明（可选）"
              value={content?.evaluationPlan.overallRubric ?? ""}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={1} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          href="/teacher/prepare/new"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-black">课程核查</h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.name} · {course.subject} · {course.grade} · {course.hours} 课时
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            disabled={!currentSection || !!busy || outlineStreaming}
            onClick={generateCurrentStep}
            type="button"
          >
            {busy || outlineStreaming ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Wand2 size={16} />
            )}
            {currentSection ? `生成${SECTION_LABEL[currentSection]}` : "确认基础信息后生成"}
          </button>
        </div>
      </div>

      {info ? (
        <div className="mb-4 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {info}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-2 md:grid-cols-5">
        {FLOW_STEPS.map((step, index) => (
          <button
            key={step.key}
            type="button"
            onClick={() => setFlowStep(index)}
            className={cn(
              "rounded-[8px] border px-3 py-2 text-left transition",
              flowStep === index
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-200",
            )}
          >
            <div className="text-xs font-black">第 {index + 1} 步</div>
            <div className="mt-0.5 text-sm font-bold">{step.label}</div>
            <div className="mt-1 line-clamp-2 text-xs opacity-75">{step.desc}</div>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {FLOW_STEPS[flowStep]?.key === "base" ? (
          <Card>
            <h2 className="text-lg font-black">确认课程基础信息</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["课程名称", course.name],
                ["学科", course.subject],
                ["年级", course.grade],
                ["课时", `${course.hours} 课时`],
                ["驱动问题", course.drivingQuestion || "未填写"],
                ["课程简介", course.summary || "未填写"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-bold text-slate-400">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <PrimaryButton type="button" onClick={() => setFlowStep(1)}>
                确认基础信息，进入知识图谱 →
              </PrimaryButton>
            </div>
          </Card>
        ) : (
          sections
            .filter(({ key }) => key === FLOW_STEPS[flowStep]?.key)
            .map(({ key, node }) => (
          <Card className="p-0" key={key}>
            <button
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              onClick={() => toggle(key)}
              type="button"
            >
              <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black">{SECTION_LABEL[key]}</h2>
                    {key === "knowledgePoints" &&
                    (content?.knowledgePoints.length ?? 0) > 0 ? (
                      <Pill tone="green">
                        {content!.knowledgePoints.length} 项
                      </Pill>
                    ) : null}
                    {key === "teachingOutline" &&
                    (content?.teachingOutline?.length ?? 0) > 0 ? (
                      <Pill tone="green">
                        {content!.teachingOutline!.length} 个活动
                      </Pill>
                    ) : null}
                    {key === "lessonOutline" ? (
                      outlineStreaming ? (
                        <Pill tone="blue">
                          <Loader2 className="mr-1 inline animate-spin" size={11} />
                          流式生成中 {streamingCount} 节
                        </Pill>
                      ) : (content?.lessonOutline.length ?? 0) > 0 ? (
                        <Pill tone="green">
                          {content!.lessonOutline.length} 节 · AI
                        </Pill>
                      ) : (
                        <Pill tone="blue">AI 驱动</Pill>
                      )
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {SECTION_DESC[key]}
                  </p>
                </div>
              <div className="flex items-center gap-3">
                {key === "lessonOutline" ? (
                  <>
                    <label
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[6px] border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      title="开启后生成约 70% 互动场景（simulation/diagram/code/game/3D），符合互动优先模式"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer accent-amber-600"
                        checked={interactiveMode}
                        onChange={(e) => setInteractiveMode(e.target.checked)}
                        disabled={outlineStreaming}
                      />
                      互动模式
                    </label>
                    <span
                      className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        void generateLessonOutlineOpenMAIC();
                      }}
                    >
                      {outlineStreaming ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          生成中 {streamingCount} 节
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          AI 生成
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      void generateSection(key);
                    }}
                  >
                    {busy === key ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <RotateCw size={14} />
                    )}
                    重新生成
                  </button>
                )}
                {open[key] ? (
                  <ChevronUp className="text-slate-400" size={20} />
                ) : (
                  <ChevronDown className="text-slate-400" size={20} />
                )}
              </div>
            </button>
            {open[key] ? <div className="border-t border-slate-100 p-5">{node}</div> : null}
            <div className="border-t border-slate-100 px-5 py-3">
              <div className="flex justify-between gap-3">
                <button
                  className="text-sm font-semibold text-slate-500 hover:text-blue-600"
                  onClick={() => setFlowStep((step) => Math.max(0, step - 1))}
                  type="button"
                >
                  ← 上一步
                </button>
                <PrimaryButton
                  className="h-9 px-4 text-sm"
                  onClick={confirmStepAndNext}
                  type="button"
                >
                  {flowStep >= FLOW_STEPS.length - 1 ? "已到最后一步" : "确认并进入下一步 →"}
                </PrimaryButton>
              </div>
            </div>
          </Card>
            ))
        )}
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Link
          className="text-sm font-semibold text-slate-500 hover:text-blue-600"
          href="/teacher"
        >
          ← 返回课程列表
        </Link>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-11 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600"
            onClick={() => saveDraft(true)}
            type="button"
          >
            <Save size={16} /> 保存草稿
          </button>
          <PrimaryButton
            className="h-12 px-7"
            disabled={
              !content ||
              !isStepReady("knowledgePoints") ||
              !isStepReady("teachingOutline") ||
              !isStepReady("lessonOutline") ||
              !isStepReady("evaluationPlan")
            }
            onClick={persistAndNext}
            type="button"
          >
            确认并继续 →
          </PrimaryButton>
        </div>
      </div>
    </DashboardShell>
  );
}

function createEmptyTeachingOutlineItem(index: number): TeachingOutlineSection {
  return {
    id: `to-${index + 1}`,
    stageKey: "project-launch",
    title: "新授课活动",
    durationMin: 10,
    teachingGoal: "",
    teacherRole: "",
    platformRole: "",
    aiRole: "无",
    studentActivity: "",
    knowledgePointIds: [],
    openMaicUse: "none",
    resourceTypes: [],
    notes: "",
  };
}

function updateTeachingOutlineItem(
  setContent: React.Dispatch<React.SetStateAction<CourseContent | undefined>>,
  id: string,
  patch: Partial<TeachingOutlineSection>,
) {
  setContent((content) =>
    content
      ? {
          ...content,
          teachingOutline: (content.teachingOutline ?? []).map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        }
      : content,
  );
}

function OutlineTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
      <textarea
        className="min-h-[84px] w-full rounded-[6px] border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      />
    </label>
  );
}
