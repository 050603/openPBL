"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCw,
  Save,
  Sparkles,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import type {
  CourseContent,
  LessonOutlineSection,
  OpenMaicSceneOutlineSnapshot,
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

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

type Section = "pblOutline" | "knowledgePoints" | "lessonOutline" | "evaluationPlan";

const SECTION_LABEL: Record<Section, string> = {
  pblOutline: "PBL 大纲",
  knowledgePoints: "知识点",
  lessonOutline: "AI 授知大纲",
  evaluationPlan: "评价方案",
};

const SECTION_DESC: Record<Section, string> = {
  pblOutline: "项目整体框架、目标与核心驱动问题",
  knowledgePoints: "学生需掌握的核心概念与跨学科联系",
  lessonOutline: "AI 辅助授课的章节安排（目标 / 活动 / 时长）",
  evaluationPlan: "项目各维度的评价指标与权重",
};

export default function VerifyCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, setCourseContent, updateCourse } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();

  const [content, setContent] = useState<CourseContent | undefined>();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    pblOutline: true,
    knowledgePoints: true,
    lessonOutline: false,
    evaluationPlan: false,
  });
  const [busy, setBusy] = useState<Section | "all" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  // OpenMAIC outline 流式生成状态
  const [outlineStreaming, setOutlineStreaming] = useState(false);
  const [streamingCount, setStreamingCount] = useState(0);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingOpenMaicOutlineGenerationRef = useRef(false);
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
    if (
      course.content.pblOutline ||
      course.content.knowledgePoints.length > 0 ||
      course.content.lessonOutline.length > 0 ||
      course.content.evaluationPlan.dimensions.length > 0
    ) {
      setContent(course.content);
      setSceneOutlines(contentToSceneOutlines(course.content));
    }
  }, [course, content]);

  const canGenerate = useMemo(() => {
    if (!course) return false;
    return Boolean(course.name);
  }, [course]);

  const generate = useCallback(
    async (section: Section | "all") => {
      if (!course) return;
      setBusy(section);
      setError(undefined);
      setInfo(undefined);
      try {
        const action =
          section === "all"
            ? "fullCourse"
            : section === "pblOutline"
              ? "pblOutline"
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
          source: "llm" | "sample";
          llmConfigured: boolean;
        };
        if (section === "all") {
          // 生成全部时：除 lessonOutline 外直接应用 legacy 结果；
          // lessonOutline 交由 OpenMAIC 流式生成，确保多场景结构（slide/quiz/interactive/pbl）
          // 与 OpenMAIC 网页版一致。
          setContent((prev) => ({
            ...data.content,
            // 保留已有 lessonOutline（若有），将由 OpenMAIC 流式覆盖
            lessonOutline: prev?.lessonOutline ?? data.content.lessonOutline,
            _openmaicSceneOutlines:
              prev?._openmaicSceneOutlines ?? data.content._openmaicSceneOutlines,
          }));
          setInfo(
            data.source === "llm"
              ? "已使用 LLM 生成 PBL 大纲、知识点、评价方案；正在调用 OpenMAIC 生成 AI 授知大纲…"
              : data.llmConfigured
                ? "LLM 返回已采用；正在调用 OpenMAIC 生成 AI 授知大纲…"
                : "当前未配置 LLM，已使用示例内容。请在「设置」页配置 API Key 和默认模型后重试。",
          );
          // 异步触发 OpenMAIC 流式生成 lessonOutline
          // 使用 setTimeout 确保 generate 的 finally 先执行（避免 busy 状态被覆盖）
          pendingOpenMaicOutlineGenerationRef.current = true;
        } else {
          setContent((prev) => ({
            ...(prev ?? course.content),
            ...(section === "pblOutline" ? { pblOutline: data.content.pblOutline } : {}),
            ...(section === "knowledgePoints"
              ? { knowledgePoints: data.content.knowledgePoints }
              : {}),
            ...(section === "lessonOutline"
              ? { lessonOutline: data.content.lessonOutline }
              : {}),
            ...(section === "evaluationPlan"
              ? { evaluationPlan: data.content.evaluationPlan }
              : {}),
          }));
        }
        setInfo(
          data.source === "llm"
            ? "已使用 LLM 生成内容"
            : data.llmConfigured
              ? "LLM 返回已采用"
              : "当前未配置 LLM，已使用示例内容。请在「设置」页配置 API Key 和默认模型后重试。",
        );
      } catch (e) {
        setError((e as Error).message || "生成失败");
      } finally {
        setBusy(null);
      }
    },
    [course],
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
      .map((s) => s.label)
      .filter(Boolean)
      .join("、");
    // 课时 → 分钟：1 课时 = 40 分钟（基础教育标准课时）
    const totalMinutes = Math.max(15, (course.hours || 1) * 40);
    // 推导目标场景数：每 3-4 分钟一个场景，下限 8，上限 30
    const targetSceneCount = Math.min(30, Math.max(8, Math.round(totalMinutes / 3)));

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
    ].filter(Boolean);

    const requirement = interactiveMode
      ? [
          ...commonHeader,
          "",
          "【互动模式要求】",
          "请按 OpenMAIC 互动优先（Interactive-First）模式生成：",
          "- 约 70% 的场景为 interactive 类型（含 widgetType 和 widgetOutline）",
          "- 约 30% 的场景为 slide 类型（用于导入、概念框架、总结）",
          "- 每个 interactive 场景必须指定 widgetType（simulation/diagram/code/game/visualization3d）",
          "- 每个 interactive 场景必须指定 widgetOutline（根据 widgetType 填充对应字段）",
          "- simulation 类场景至少 2 个，game 类场景至少 1 个，diagram 类至多 1 个",
          "- 仍需包含 1 个 pbl 场景作为项目实践环节",
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
            `- ${pblCount} 个 pbl 场景：作为课程核心项目实践环节，包含 projectTopic、projectDescription、targetSkills、issueCount 等配置`,
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
      "- pbl 场景需包含完整 pblConfig",
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
            `OpenMAIC outline 生成失败（HTTP ${res.status}）`,
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
            setInfo(`AI 授知大纲已生成（共 ${collected.length} 节），由 OpenMAIC 驱动`);
          } else if (evt.type === "error") {
            throw new Error((evt.error as string) ?? "OpenMAIC outline 生成失败");
          }
        }
      }

      if (collected.length === 0) {
        setInfo("OpenMAIC 未返回大纲，请检查 LLM 配置后重试");
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
  }, [course, user, syncLessonOutline, interactiveMode]);

  useEffect(() => {
    if (!pendingOpenMaicOutlineGenerationRef.current) return;
    pendingOpenMaicOutlineGenerationRef.current = false;
    const timer = window.setTimeout(() => void generateLessonOutlineOpenMAIC(), 0);
    return () => window.clearTimeout(timer);
  }, [generateLessonOutlineOpenMAIC]);

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

  // Auto-trigger initial generation once the page is hydrated and the course is empty
  useEffect(() => {
    if (!hydrated || !course || !canGenerate) return;
    if (content) return;
    if (
      course.content.pblOutline ||
      course.content.knowledgePoints.length > 0
    )
      return;
    generate("all");
  }, [hydrated, course, canGenerate, content, generate]);

  function persistAndNext() {
    if (!course || !content) return;
    const nextContent: CourseContent =
      sceneOutlines.length > 0
        ? {
            ...content,
            lessonOutline: sceneOutlines.map((outline, index) =>
              sceneOutlineToLessonSection(outline, index, stageKeys),
            ),
            _openmaicSceneOutlines: cloneSceneOutlinesForSession(sceneOutlines),
          }
        : content;
    setCourseContent(course.id, nextContent);
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
      key: "pblOutline",
      node: (
        <textarea
          className="min-h-[160px] w-full rounded-[6px] border border-slate-300 px-4 py-3 text-[15px] leading-7 outline-none focus:border-blue-500"
          onChange={(e) =>
            setContent((c) =>
              c ? { ...c, pblOutline: e.target.value } : c,
            )
          }
          value={content?.pblOutline ?? ""}
        />
      ),
    },
    {
      key: "knowledgePoints",
      node: (
        <div className="space-y-3">
          {(content?.knowledgePoints ?? []).map((kp, i) => (
            <div
              className="grid grid-cols-[1fr_2fr_auto] items-center gap-3"
              key={kp.id}
            >
              <input
                className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                onChange={(e) =>
                  setContent((c) =>
                    c
                      ? {
                          ...c,
                          knowledgePoints: c.knowledgePoints.map((x) =>
                            x.id === kp.id ? { ...x, name: e.target.value } : x,
                          ),
                        }
                      : c,
                  )
                }
                value={kp.name}
              />
              <input
                className="h-10 rounded-[6px] border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                onChange={(e) =>
                  setContent((c) =>
                    c
                      ? {
                          ...c,
                          knowledgePoints: c.knowledgePoints.map((x) =>
                            x.id === kp.id
                              ? { ...x, description: e.target.value }
                              : x,
                          ),
                        }
                      : c,
                  )
                }
                value={kp.description}
              />
              <button
                className="text-sm font-semibold text-slate-400 hover:text-red-600"
                onClick={() =>
                  setContent((c) =>
                    c
                      ? {
                          ...c,
                          knowledgePoints: c.knowledgePoints.filter(
                            (x) => x.id !== kp.id,
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
          ))}
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={() =>
              setContent((c) =>
                c
                  ? {
                      ...c,
                      knowledgePoints: [
                        ...c.knowledgePoints,
                        {
                          id: "kp-" + (c.knowledgePoints.length + 1),
                          name: "新知识点",
                          description: "",
                        },
                      ],
                    }
                  : c,
              )
            }
            type="button"
          >
            + 添加知识点
          </button>
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
                暂无 AI 授知章节。点击上方「OpenMAIC 生成」按钮，使用与 OpenMAIC 一致的方式生成大纲。
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
                  const total = (content?.evaluationPlan.dimensions ?? []).reduce(
                    (s, x) => s + (x.id === d.id ? Number(x.weight) || 0 : Number(x.weight) || 0),
                    0,
                  );
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
            disabled={busy === "all"}
            onClick={() => generate("all")}
            type="button"
          >
            {busy === "all" ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            重新生成全部
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

      <div className="space-y-4">
        {sections.map(({ key, node }) => (
          <Card className="p-0" key={key}>
            <button
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              onClick={() => toggle(key)}
              type="button"
            >
              <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black">{SECTION_LABEL[key]}</h2>
                    {key === "pblOutline" && content?.pblOutline ? (
                      <Pill tone="green">已生成</Pill>
                    ) : null}
                    {key === "knowledgePoints" &&
                    (content?.knowledgePoints.length ?? 0) > 0 ? (
                      <Pill tone="green">
                        {content!.knowledgePoints.length} 项
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
                          {content!.lessonOutline.length} 节 · OpenMAIC
                        </Pill>
                      ) : (
                        <Pill tone="blue">OpenMAIC 驱动</Pill>
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
                      title="开启后生成约 70% 互动场景（simulation/diagram/code/game/3D），符合 OpenMAIC 玩中学模式"
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
                          OpenMAIC 生成
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <span
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      generate(key);
                    }}
                  >
                    {busy === key ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <RotateCw size={14} />
                    )}
                    重新生成
                  </span>
                )}
                {open[key] ? (
                  <ChevronUp className="text-slate-400" size={20} />
                ) : (
                  <ChevronDown className="text-slate-400" size={20} />
                )}
              </div>
            </button>
            {open[key] ? <div className="border-t border-slate-100 p-5">{node}</div> : null}
          </Card>
        ))}
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
            onClick={() => {
              if (!course || !content) return;
              setCourseContent(course.id, content);
              updateCourse(course.id, {});
            }}
            type="button"
          >
            <Save size={16} /> 保存草稿
          </button>
          <PrimaryButton
            className="h-12 px-7"
            disabled={!content}
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
