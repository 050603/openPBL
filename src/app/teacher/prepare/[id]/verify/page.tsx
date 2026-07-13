"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  List,
  Map,
  Network,
  Loader2,
  RotateCw,
  Save,
  X,
  Zap,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { normalizeKnowledgeGraphForDisplay } from "@/components/knowledge-graph";
import { KnowledgeGraphFlow } from "@/components/knowledge-graph-flow";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, Pill, PrimaryButton, toast } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import type {
  CourseContent,
  KnowledgeGraph,
  LessonOutlineSection,
  OpenMaicSceneOutlineSnapshot,
  TeachingOutlineSection,
} from "@/lib/session/types";
import { DEFAULT_EVALUATION_FLOWS } from "@/lib/session/types";
import { resolveDimensionRole } from "@/lib/evaluation/responsibility";
import type { SceneOutline } from "@/lib/openmaic/types/generation";
import type { AgentInfo } from "@/lib/openmaic/generation/generation-pipeline";
import { I18nProvider } from "@/lib/openmaic/hooks/use-i18n";
import { OutlinesEditor } from "@/components/openmaic/generation/outlines-editor";
import { cn } from "@/lib/utils";
import {
  buildPblCourseRequirement,
  buildPblActivityCatalog,
  buildTeacherActivityRequirements,
} from "@/lib/openmaic/pbl/course-request";
import { checkPblStageCoverage } from "@/lib/openmaic/pbl/course-template";
import {
  buildPblModuleTimingPlan,
  buildPblProjectMainline,
  formatPblProjectMainline,
  isPblModuleTimingPlanConfirmed,
  PBL_MODULE_DEFINITIONS,
  reallocatePblStageDurations,
  rescalePblDetailDurations,
  type PblTimeActivity,
} from "@/lib/pbl-time-model";
import { validatePblKnowledgeAlignment } from "@/lib/pbl-outline-validation";
import { normalizePblTeachingOutline } from "@/lib/pbl-outline-normalization";
import { PblModuleTimingPanel } from "@/components/teacher/pbl-module-timing-panel";

// ===== SceneOutline ↔ LessonOutlineSection 转换 =====
function sceneOutlineToLessonSection(
  outline: SceneOutline,
  index: number,
  stageKeys: string[],
): LessonOutlineSection {
  return {
    id: outline.id,
    stageKey:
      outline.stageKey && stageKeys.includes(outline.stageKey)
        ? outline.stageKey
        : stageKeys[Math.min(index, stageKeys.length - 1)] ?? "ai-learning",
    title: outline.title,
    objectives: outline.keyPoints ?? [],
    activities: outline.description ? [outline.description] : [],
    durationMin: Math.max(
      1,
      Math.round((outline.targetDurationSec ?? outline.estimatedDuration ?? 300) / 60),
    ),
    parentActivityId: outline.parentActivityId,
    detailKind: outline.detailKind,
    knowledgePointIds: outline.knowledgePointIds ?? [],
    resourceTypes: outline.resourceTypes,
    targetDurationSec: outline.targetDurationSec,
    ttsPolicy: outline.ttsPolicy,
    timingPlan: outline.timingPlan,
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
    stageKey: section.stageKey,
    parentActivityId: section.parentActivityId,
    detailKind: section.detailKind,
    knowledgePointIds: section.knowledgePointIds,
    resourceTypes: section.resourceTypes,
    targetDurationSec: section.targetDurationSec ?? section.durationMin * 60,
    ttsPolicy: section.ttsPolicy,
    timingPlan: section.timingPlan,
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
    parentActivityId:
      typeof raw.parentActivityId === "string" && raw.parentActivityId.trim()
        ? raw.parentActivityId.trim()
        : undefined,
    detailKind:
      typeof raw.detailKind === "string"
        ? (raw.detailKind as SceneOutline["detailKind"])
        : undefined,
    knowledgePointIds: Array.isArray(raw.knowledgePointIds)
      ? raw.knowledgePointIds.filter(
          (x): x is string => typeof x === "string" && Boolean(x.trim()),
        )
      : [],
    resourceTypes: Array.isArray(raw.resourceTypes)
      ? raw.resourceTypes.filter(
          (x): x is NonNullable<SceneOutline["resourceTypes"]>[number] =>
            typeof x === "string" &&
            [
              "ppt",
              "interactive-demo",
              "code-interactive",
              "script",
              "worksheet",
              "rubric",
              "project-brief",
            ].includes(x),
        )
      : undefined,
    targetDurationSec:
      typeof raw.targetDurationSec === "number" && Number.isFinite(raw.targetDurationSec)
        ? Math.max(0, Math.round(raw.targetDurationSec))
        : undefined,
    ttsPolicy:
      raw.ttsPolicy === "none" || raw.ttsPolicy === "target-duration"
        ? raw.ttsPolicy
        : undefined,
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
  teachingOutline: "课程模块",
  lessonOutline: "课程大纲",
  evaluationPlan: "评价方案",
};

const SECTION_DESC: Record<Section, string> = {
  knowledgePoints: "学生需掌握的核心概念、关键信息与节点关系",
  teachingOutline: "整节课的六个宏观课程模块：明确目标、分工和时间",
  lessonOutline: "基于课程模块独立深化的课程大纲：PPT、互动、讲稿与支架",
  evaluationPlan: "项目各维度的评价指标与权重",
};

const FLOW_STEPS: { key: "base" | Section; label: string; desc: string }[] = [
  { key: "base", label: "基础信息", desc: "确认课程名称、学科、年级、课时与驱动问题" },
  { key: "knowledgePoints", label: "知识图谱", desc: "确认本课知识节点和节点间关系" },
  { key: "teachingOutline", label: "课程模块", desc: "确认六个宏观环节、时间分配与人机分工" },
  { key: "lessonOutline", label: "课程大纲", desc: "确认每个课程模块下独立展开的具体教学资源" },
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
  // 知识图谱视图状态
  const [kgViewMode, setKgViewMode] = useState<"graph" | "list">("graph");
  const [kgSelectedNode, setKgSelectedNode] = useState<string | null>(null);
  const [kgFullscreen, setKgFullscreen] = useState(false);
  // OpenMAIC outline 流式生成状态
  const [outlineStreaming, setOutlineStreaming] = useState(false);
  const [streamingCount, setStreamingCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  // OpenMAIC SceneOutline[] 状态：OutlinesEditor 直接编辑此数组
  const [sceneOutlines, setSceneOutlines] = useState<SceneOutline[]>([]);
  const stageKeys = useMemo(
    () => (course?.stages ?? []).map((s) => s.key),
    [course?.stages],
  );
  const pblTimeContext = useMemo(
    () => ({
      topic: course?.name,
      subject: course?.subject,
      summary: course?.summary,
      grade: course?.grade,
      difficulty: course?.pblConfig?.difficultyLevel,
      knowledgePoints: content?.knowledgePoints,
      knowledgeGraph: content?.knowledgeGraph,
    }),
    [
      content?.knowledgeGraph,
      content?.knowledgePoints,
      course?.grade,
      course?.name,
      course?.pblConfig?.difficultyLevel,
      course?.subject,
      course?.summary,
    ],
  );
  const pblCoverage = useMemo(
    () => checkPblStageCoverage(sceneOutlines),
    [sceneOutlines],
  );
  const pblKnowledgeValidation = useMemo(
    () =>
      validatePblKnowledgeAlignment(
        sceneOutlines
          .filter((outline) => outline.stageKey === "ai-learning" || outline.audience === "student")
          .map((outline) => ({
            id: outline.id,
            title: outline.title,
            stageKey: outline.stageKey,
            knowledgePointIds: outline.knowledgePointIds,
          })),
        content?.knowledgePoints ?? [],
        { requireReferences: true, requireCoverage: true },
      ),
    [content?.knowledgePoints, sceneOutlines],
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

  const applyTeachingOutlineChange = useCallback(
    (nextTeachingOutline: TeachingOutlineSection[]) => {
      const totalMinutes = Math.max(0, Math.round((course?.hours ?? 0) * 60));
      const nextTimingPlan = nextTeachingOutline.length > 0
        ? buildPblModuleTimingPlan(totalMinutes, nextTeachingOutline, pblTimeContext, {
            status: "suggested",
            preserveCurrentDurations: true,
          })
        : undefined;
      const validActivityIds = new Set(nextTeachingOutline.map((activity) => activity.id));
      const nextDetails = rescalePblDetailDurations(
        sceneOutlines.filter(
          (outline) => !outline.parentActivityId || validActivityIds.has(outline.parentActivityId),
        ),
        nextTeachingOutline,
      );
      setSceneOutlines(nextDetails);
      setContent((current) =>
        current
          ? {
              ...current,
              teachingOutline: nextTeachingOutline,
              projectMainline: undefined,
              /* pblOutline:
                mainline && (!current.pblOutline.trim() || current.pblOutline.startsWith("项目主线（"))
                  ? formatPblProjectMainline(mainline)
                  : current.pblOutline, */
              pblOutline: "",
              lessonOutline: nextDetails.map((outline, index) =>
                sceneOutlineToLessonSection(outline, index, stageKeys),
              ),
              _openmaicSceneOutlines: cloneSceneOutlinesForSession(nextDetails),
              moduleTimingPlan: nextTimingPlan,
            }
          : current,
      );
    },
    [course?.hours, pblTimeContext, sceneOutlines, stageKeys],
  );

  const applyPblStageDurationChange = useCallback(
    (kind: Exclude<PblTimeActivity["activityKind"], undefined | "other">, targetMinutes: number) => {
      const activities = content?.teachingOutline ?? [];
      const nextTeachingOutline = reallocatePblStageDurations(
        Math.max(0, Math.round((course?.hours ?? 0) * 60)),
        activities,
        kind,
        targetMinutes,
        pblTimeContext,
      );
      applyTeachingOutlineChange(nextTeachingOutline);
    },
    [applyTeachingOutlineChange, content?.teachingOutline, course?.hours, pblTimeContext],
  );

  const confirmModuleTiming = useCallback(() => {
    const activities = content?.teachingOutline ?? [];
    const totalMinutes = Math.max(0, Math.round((course?.hours ?? 0) * 60));
    const moduleTimingPlan = buildPblModuleTimingPlan(
      totalMinutes,
      activities,
      pblTimeContext,
      { status: "confirmed", preserveCurrentDurations: true },
    );
    if (!isPblModuleTimingPlanConfirmed(moduleTimingPlan)) {
      const message = "请先完成六个模块的时间分配，并确保模块合计等于课程总时长。";
      setError(message);
      toast.error("课程时间尚未确认", { description: message });
      return;
    }
    const projectMainline = {
      ...buildPblProjectMainline(totalMinutes, activities),
      generatedAt: new Date().toISOString(),
    };
    setContent((current) => current
      ? {
          ...current,
          moduleTimingPlan,
          projectMainline,
          pblOutline: formatPblProjectMainline(projectMainline),
        }
      : current);
    setInfo("六个模块的时间已确认，项目主线已生成。现在可以继续生成课程大纲。 ");
    setError(undefined);
  }, [content?.teachingOutline, course?.hours, pblTimeContext]);

  // Initialize content from course when loaded
  useEffect(() => {
    if (!course || content) return;
    const totalMinutes = Math.max(0, Math.round(course.hours * 60));
    const baseTeachingOutline = course.content.teachingOutline ?? [];
    const teachingOutline = course.pblConfig?.generationTemplate === "pbl-six-stage"
      ? normalizePblTeachingOutline(baseTeachingOutline, {
          totalMinutes,
          topic: course.name,
          subject: course.subject,
          summary: course.summary,
          grade: course.grade,
           difficulty: course.pblConfig?.difficultyLevel ?? "standard",
          knowledgePoints: course.content.knowledgePoints,
          knowledgeGraph: course.content.knowledgeGraph,
          applyTimeModel: Boolean(course.content.projectMainline),
        })
      : baseTeachingOutline;
    const hasModules = teachingOutline.length > 0;
    const initialTimingPlan = hasModules
      ? course.content.moduleTimingPlan ?? buildPblModuleTimingPlan(
          totalMinutes,
          teachingOutline,
          {
            topic: course.name,
            subject: course.subject,
            summary: course.summary,
            grade: course.grade,
             difficulty: course.pblConfig?.difficultyLevel ?? "standard",
            knowledgePoints: course.content.knowledgePoints,
            knowledgeGraph: course.content.knowledgeGraph,
          },
        )
      : undefined;
    const plannedTeachingOutline = initialTimingPlan
      ? teachingOutline.map((activity) => ({
          ...activity,
          durationMin: initialTimingPlan.allocations.find((item) => item.id === activity.id)?.durationMin
            ?? activity.durationMin,
        }))
      : teachingOutline;
    const initialDetails = hasModules
      ? rescalePblDetailDurations(
          contentToSceneOutlines({ ...course.content, teachingOutline: plannedTeachingOutline }),
          plannedTeachingOutline,
        )
      : [];
    const initialPlanIsConfirmed = initialTimingPlan
      ? isPblModuleTimingPlanConfirmed(initialTimingPlan)
      : false;
    const projectMainline = initialPlanIsConfirmed
      ? {
          ...buildPblProjectMainline(totalMinutes, plannedTeachingOutline),
          generatedAt: course.content.projectMainline?.generatedAt ?? new Date().toISOString(),
        }
      : undefined;
    const initialContent: CourseContent = {
      ...course.content,
      teachingOutline: plannedTeachingOutline,
      projectMainline,
      moduleTimingPlan: initialTimingPlan,
      lessonOutline: initialDetails.map((outline, index) =>
        sceneOutlineToLessonSection(outline, index, stageKeys),
      ),
      _openmaicSceneOutlines: initialDetails.length
        ? cloneSceneOutlinesForSession(initialDetails)
        : undefined,
    };
    setContent(initialContent);
    setSceneOutlines(initialDetails);
  }, [course, content, stageKeys]);

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
              pblConfig: course.pblConfig,
            },
            context: content
              ? {
                  pblOutline: content.pblOutline,
                  knowledgePoints: content.knowledgePoints,
                  knowledgeGraph: content.knowledgeGraph,
                  projectMainline: content.projectMainline,
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
        const previousContent = content ?? course.content;
        const totalMinutes = Math.max(0, Math.round(course.hours * 60));
        const previousTeachingOutline = previousContent.teachingOutline ?? [];
        const generatedKnowledgePoints =
          section === "knowledgePoints"
            ? data.content.knowledgePoints
            : previousContent.knowledgePoints;
        const generatedKnowledgeGraph =
          section === "knowledgePoints"
            ? data.content.knowledgeGraph
            : previousContent.knowledgeGraph;
        const knowledgeAlignedTeachingOutline =
          section === "knowledgePoints" &&
          course.pblConfig?.generationTemplate === "pbl-six-stage" &&
          previousTeachingOutline.length > 0
            ? normalizePblTeachingOutline(previousTeachingOutline, {
                totalMinutes,
                topic: course.name,
                subject: course.subject,
                summary: course.summary,
                grade: course.grade,
               difficulty: course.pblConfig?.difficultyLevel ?? "standard",
                knowledgePoints: generatedKnowledgePoints,
                knowledgeGraph: generatedKnowledgeGraph,
                applyTimeModel: Boolean(previousContent.projectMainline),
              })
            : undefined;
        const knowledgeAlignedPlan = knowledgeAlignedTeachingOutline && knowledgeAlignedTeachingOutline.length > 0
          ? buildPblModuleTimingPlan(totalMinutes, knowledgeAlignedTeachingOutline, {
              topic: course.name,
              subject: course.subject,
              summary: course.summary,
              grade: course.grade,
              difficulty: course.pblConfig?.difficultyLevel ?? "standard",
              knowledgePoints: generatedKnowledgePoints,
              knowledgeGraph: generatedKnowledgeGraph,
            })
          : undefined;
        const knowledgeAlignedOutline = knowledgeAlignedPlan
          ? knowledgeAlignedTeachingOutline!.map((activity) => ({
              ...activity,
              durationMin: knowledgeAlignedPlan.allocations.find((item) => item.id === activity.id)?.durationMin
                ?? activity.durationMin,
            }))
          : knowledgeAlignedTeachingOutline;
        const rawGeneratedTeachingOutline = data.content.teachingOutline ?? [];
        const generatedTeachingOutline =
          course.pblConfig?.generationTemplate === "pbl-six-stage"
            && rawGeneratedTeachingOutline.length > 0
            ? normalizePblTeachingOutline(rawGeneratedTeachingOutline, {
                totalMinutes,
                topic: course.name,
                subject: course.subject,
                summary: course.summary,
                grade: course.grade,
                difficulty: course.pblConfig?.difficultyLevel ?? "standard",
                knowledgePoints: generatedKnowledgePoints,
                knowledgeGraph: generatedKnowledgeGraph,
              })
            : rawGeneratedTeachingOutline;
        const generatedTimingPlan = generatedTeachingOutline.length > 0
          ? buildPblModuleTimingPlan(totalMinutes, generatedTeachingOutline, {
              topic: course.name,
              subject: course.subject,
              summary: course.summary,
              grade: course.grade,
              difficulty: course.pblConfig?.difficultyLevel ?? "standard",
              knowledgePoints: generatedKnowledgePoints,
              knowledgeGraph: generatedKnowledgeGraph,
            })
          : undefined;
        const plannedTeachingOutline = generatedTimingPlan
          ? generatedTeachingOutline.map((activity) => ({
              ...activity,
              durationMin: generatedTimingPlan.allocations.find((item) => item.id === activity.id)?.durationMin
                ?? activity.durationMin,
            }))
          : generatedTeachingOutline;
        setContent((prev) => ({
          ...(prev ?? course.content),
          ...(section === "knowledgePoints"
            ? {
                knowledgePoints: data.content.knowledgePoints,
                knowledgeGraph: data.content.knowledgeGraph,
                teachingOutline:
                  course.pblConfig?.generationTemplate === "pbl-six-stage"
                    ? knowledgeAlignedOutline ?? []
                    : previousTeachingOutline,
                projectMainline: undefined,
                moduleTimingPlan:
                  course.pblConfig?.generationTemplate === "pbl-six-stage"
                    ? knowledgeAlignedPlan
                    : undefined,
                lessonOutline: [],
                _openmaicSceneOutlines: undefined,
              }
            : {}),
          ...(section === "teachingOutline"
              ? {
                pblOutline: "",
                teachingOutline: plannedTeachingOutline,
                projectMainline: undefined,
                moduleTimingPlan: generatedTimingPlan,
                lessonOutline: [],
                _openmaicSceneOutlines: undefined,
              }
            : {}),
          ...(section === "lessonOutline"
            ? { lessonOutline: data.content.lessonOutline }
            : {}),
          ...(section === "evaluationPlan"
            ? { evaluationPlan: data.content.evaluationPlan }
            : {}),
        }));
        if (section === "knowledgePoints" || section === "teachingOutline") {
          setSceneOutlines([]);
        }
        if (section === "lessonOutline") {
          const generatedDetails = (data.content.lessonOutline ?? []).map((item, index) =>
            normalizeSceneOutlineSnapshot(lessonSectionToSceneOutline(item, index), index),
          );
          setSceneOutlines(generatedDetails);
          syncLessonOutline(generatedDetails);
        }
        setInfo("已使用 AI 生成内容");
      } catch (e) {
        setError((e as Error).message || "生成失败");
      } finally {
        setBusy(null);
      }
    },
    [course, content, syncLessonOutline],
  );

  // ===== 课程大纲 AI 生成 =====
  // 调用 AI 生成接口，逐条推送课程大纲内容，
  // 使用 OutlinesEditor 呈现，与课堂生成流程一致。
  const generateLessonOutlineOpenMAIC = useCallback(async () => {
    if (!course) return;
    const currentContent = content ?? course.content;
    if (
      !currentContent.moduleTimingPlan
      || !isPblModuleTimingPlanConfirmed(currentContent.moduleTimingPlan)
    ) {
      const message = "请先确认六个模块的时间，再生成课程大纲。";
      setError(message);
      toast.error("课程时间尚未确认", { description: message });
      return;
    }
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

    const requirement = buildPblCourseRequirement(
      course,
      content ?? course.content,
      sceneOutlines,
    );

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
            pblProfile: course.pblConfig,
            moduleTimingPlan: (content ?? course.content).moduleTimingPlan,
            pblTeachingActivities: buildTeacherActivityRequirements(content ?? course.content),
            pblActivityCatalog: buildPblActivityCatalog(content ?? course.content),
            knowledgePoints: (content ?? course.content).knowledgePoints.map((point) => ({
              id: point.id,
              name: point.name,
            })),
            userNickname,
            userBio,
            webSearch: false,
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
            `课程大纲生成失败（HTTP ${res.status}）`,
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
            const outline = normalizeSceneOutlineSnapshot(evt.data, collected.length);
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
                const outline = normalizeSceneOutlineSnapshot(outlines[i], i);
                outline.order = i;
                collected.push(outline);
              }
              setSceneOutlines([...collected]);
              syncLessonOutline(collected);
            }
            setInfo(`课程大纲已生成（共 ${collected.length} 个资源）`);
          } else if (evt.type === "error") {
            throw new Error((evt.error as string) ?? "课程大纲生成失败");
          }
        }
      }

      if (collected.length === 0) {
        setInfo("AI 暂未返回内容，请稍后重试或检查设置中的 AI 配置。");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setInfo("已取消生成");
      } else {
        setError((e as Error).message || "课程大纲生成失败");
      }
    } finally {
      setOutlineStreaming(false);
      setStreamingCount(0);
      setBusy(null);
      abortRef.current = null;
    }
  }, [course, user, syncLessonOutline, content, sceneOutlines]);

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
    const teachingOutline = content.teachingOutline ?? [];
    const totalMinutes = Math.max(0, Math.round((course?.hours ?? 0) * 60));
    const currentPlan = content.moduleTimingPlan;
    const confirmed = currentPlan?.status === "confirmed"
      && isPblModuleTimingPlanConfirmed(currentPlan);
    const moduleTimingPlan = teachingOutline.length > 0
      ? buildPblModuleTimingPlan(totalMinutes, teachingOutline, pblTimeContext, {
          status: confirmed ? "confirmed" : "suggested",
          preserveCurrentDurations: true,
          now: currentPlan?.generatedAt,
        })
      : undefined;
    const projectMainline = moduleTimingPlan && confirmed
      ? content.projectMainline ?? {
          ...buildPblProjectMainline(totalMinutes, teachingOutline),
          generatedAt: new Date().toISOString(),
        }
      : undefined;
    const nextContent: CourseContent = {
      ...content,
      teachingOutline,
      projectMainline,
      moduleTimingPlan,
    };
    return sceneOutlines.length > 0
      ? {
          ...nextContent,
          lessonOutline: sceneOutlines.map((outline, index) =>
            sceneOutlineToLessonSection(outline, index, stageKeys),
          ),
          _openmaicSceneOutlines: cloneSceneOutlinesForSession(sceneOutlines),
        }
      : nextContent;
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
    if (section === "teachingOutline") {
      return Boolean(
        content.teachingOutline?.length
        && content.moduleTimingPlan?.status === "confirmed"
        && isPblModuleTimingPlanConfirmed(content.moduleTimingPlan),
      );
    }
    if (section === "lessonOutline") return sceneOutlines.length > 0 || content.lessonOutline.length > 0;
    return content.evaluationPlan.dimensions.length > 0;
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
      toast.error("课程核查尚未完成", { description: message });
      return;
    }
    const knowledgeIssues = pblKnowledgeValidation.issues;
    if (knowledgeIssues.length > 0) {
      const message = knowledgeIssues[0]?.message ?? "课程大纲尚未完成知识点关联。";
      setError(message);
      toast.error("请先校验课程大纲", { description: message });
      setOpen((current) => ({ ...current, lessonOutline: true }));
      return;
    }
    const missingParents = sceneOutlines.filter(
      (outline) => !outline.parentActivityId || !content?.teachingOutline?.some((activity) => activity.id === outline.parentActivityId),
    );
    if (missingParents.length > 0) {
      const message = `有 ${missingParents.length} 个课程大纲资源未关联课程模块，请补充父模块后再生成课程。`;
      setError(message);
      toast.error("课程大纲层级不完整", { description: message });
      setOpen((current) => ({ ...current, lessonOutline: true }));
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
        <div className="grid place-items-center py-20 text-stone-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">
          未找到课程。
          <Link className="mt-4 text-[var(--pbl-teacher)] hover:underline" href="/teacher">
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
          <PblModuleTimingPanel
            moduleActivities={content?.teachingOutline ?? []}
            totalMinutes={Math.max(0, Math.round((course?.hours ?? 0) * 60))}
            timeContext={pblTimeContext}
            timingPlan={content?.moduleTimingPlan}
            onChangeModuleDuration={applyPblStageDurationChange}
            onApplyRecommendation={(allocations) => {
              const activities = content?.teachingOutline ?? [];
              applyTeachingOutlineChange(
                activities.map((item) => ({
                  ...item,
                  durationMin: allocations[item.id] ?? item.durationMin,
                })),
              );
            }}
            onConfirm={confirmModuleTiming}
          />
          <div>
            <div className="mb-2 text-sm font-bold text-stone-800">PBL 项目主线说明</div>
            <p className="mb-2 text-xs leading-5 text-stone-500">下方时间轴由课程模块的最终分配自动重算；修改模块时，课程大纲中已有资源的目标时长也会同步更新。</p>
            {content?.projectMainline ? (
              <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {content.projectMainline.modules.map((module) => (
                  <div className="rounded-[6px] border border-stone-200 bg-stone-50 px-3 py-2 text-xs" key={module.stageKey}>
                    <div className="flex items-center justify-between gap-2 font-semibold text-stone-700">
                      <span>{module.label}</span>
                      <span className="tabular-nums text-[var(--pbl-teacher)]">{module.durationMin} 分钟</span>
                    </div>
                    <p className="mt-1 text-stone-500">{module.startMin}-{module.endMin} 分钟</p>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              className="min-h-[100px] w-full rounded-[6px] border border-stone-300 px-4 py-3 text-[15px] leading-7 outline-none focus:border-[var(--pbl-teacher)]"
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
                className="rounded-[8px] border border-stone-200 bg-white p-4"
                key={section.id}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--pbl-teacher-soft)] text-xs font-bold text-[var(--pbl-teacher)]">
                    {index + 1}
                  </span>
                  <input
                    className="h-9 min-w-[220px] flex-1 rounded-[6px] border border-stone-300 px-3 text-sm font-semibold outline-none focus:border-[var(--pbl-teacher)]"
                    onChange={(e) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        title: e.target.value,
                      })
                    }
                    value={section.title}
                  />
                  <span className="rounded-[4px] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[var(--pbl-teacher)]">
                    {section.durationMin} 分钟
                  </span>
                  <select
                    className="h-9 rounded-[6px] border border-stone-300 px-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    onChange={(e) =>
                      updateTeachingOutlineItem(setContent, section.id, {
                        openMaicUse: e.target.value as TeachingOutlineSection["openMaicUse"],
                      })
                    }
                    value={section.openMaicUse ?? "none"}
                  >
                    <option value="none">普通课堂活动</option>
                    <option value="student-ai-learning">学生 AI 授知</option>
                  </select>
                  {index >= PBL_MODULE_DEFINITIONS.length ? (
                    <button
                      className="text-sm font-semibold text-stone-400 hover:text-red-600"
                      onClick={() =>
                        applyTeachingOutlineChange(
                          (content?.teachingOutline ?? []).filter(
                            (item) => item.id !== section.id,
                          ),
                        )
                      }
                      type="button"
                    >
                      删除
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--pbl-teacher)]">核心模块</span>
                  )}
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

                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <fieldset><legend className="mb-2 text-xs font-semibold text-[var(--pbl-text-muted)]">关联知识</legend><div className="flex flex-wrap gap-2">{(content?.knowledgePoints ?? []).map((point) => { const selected = (section.knowledgePointIds ?? []).includes(point.id); return <button aria-pressed={selected} className={cn("min-h-9 rounded-[var(--radius-xs)] border px-3 text-xs font-semibold", selected ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]" : "border-[var(--pbl-border)] bg-[var(--pbl-surface)] text-[var(--pbl-text-muted)]")} key={point.id} onClick={() => updateTeachingOutlineItem(setContent, section.id, { knowledgePointIds: selected ? (section.knowledgePointIds ?? []).filter((id) => id !== point.id) : [...(section.knowledgePointIds ?? []), point.id] })} type="button">{point.name}</button>; })}</div></fieldset>
                  <fieldset><legend className="mb-2 text-xs font-semibold text-[var(--pbl-text-muted)]">学习资源</legend><div className="flex flex-wrap gap-2">{([{ value: "ppt", label: "演示文稿" }, { value: "interactive-demo", label: "互动演示" }, { value: "code-interactive", label: "代码互动" }, { value: "script", label: "教师讲稿" }, { value: "worksheet", label: "学习单" }, { value: "rubric", label: "评价量规" }, { value: "project-brief", label: "项目任务书" }] as const).map((resource) => { const selected = (section.resourceTypes ?? []).includes(resource.value); return <button aria-pressed={selected} className={cn("min-h-9 rounded-[var(--radius-xs)] border px-3 text-xs font-semibold", selected ? "border-[var(--pbl-ai)] bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]" : "border-[var(--pbl-border)] bg-[var(--pbl-surface)] text-[var(--pbl-text-muted)]")} key={resource.value} onClick={() => updateTeachingOutlineItem(setContent, section.id, { resourceTypes: selected ? (section.resourceTypes ?? []).filter((value) => value !== resource.value) : [...(section.resourceTypes ?? []), resource.value] })} type="button">{resource.label}</button>; })}</div></fieldset>
                </div>
              </div>
            ))}
          </div>

          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
            onClick={() =>
              applyTeachingOutlineChange([
                ...(content?.teachingOutline ?? []),
                createEmptyTeachingOutlineItem(content?.teachingOutline?.length ?? 0),
              ])
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
        <div className="space-y-4">
          {/* 视图切换 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                kgViewMode === "graph"
                  ? "bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] border border-[var(--pbl-teacher-border)]"
                  : "text-stone-500 hover:bg-stone-50 border border-transparent",
              )}
              onClick={() => setKgViewMode("graph")}
            >
              <Map size={14} /> 图谱视图
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                kgViewMode === "list"
                  ? "bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)] border border-[var(--pbl-teacher-border)]"
                  : "text-stone-500 hover:bg-stone-50 border border-transparent",
              )}
              onClick={() => setKgViewMode("list")}
            >
              <List size={14} /> 列表视图
            </button>
          </div>

          {kgViewMode === "graph" ? (
            /* ── 图谱视图 ── */
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <div className="min-h-[520px] overflow-hidden rounded-[8px] border border-stone-200 bg-white">
                <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                  <div className="flex items-center gap-2 font-bold text-stone-900">
                    <Network size={18} className="text-[var(--pbl-teacher)]" />
                    知识图谱
                  </div>
                  <div className="text-xs text-stone-400">
                    点击节点查看详情 · 可拖拽、缩放
                  </div>
                </div>
                <div className="h-[520px]">
                  <KnowledgeGraphFlow
                    graph={content?.knowledgeGraph}
                    points={content?.knowledgePoints ?? []}
                    height={520}
                    isFullscreen={kgFullscreen}
                    onToggleFullscreen={() => setKgFullscreen((v) => !v)}
                    onNodeSelect={setKgSelectedNode}
                    onNodePositionChange={(nodeId, position) => setContent((current) => current ? { ...current, knowledgeGraph: { ...ensureKnowledgeGraph(current), nodes: ensureKnowledgeGraph(current).nodes.map((node) => node.id === nodeId ? { ...node, position } : node) } } : current)}
                  />
                </div>
              </div>

              {/* 节点详情面板 */}
              <div className="space-y-4">
                {kgSelectedNode ? (() => {
                  const point = content?.knowledgePoints.find((p) => p.id === kgSelectedNode);
                  const graph = content ? ensureKnowledgeGraph(content) : null;
                  const upstream = graph?.edges.filter((e) => e.target === kgSelectedNode) ?? [];
                  const downstream = graph?.edges.filter((e) => e.source === kgSelectedNode) ?? [];
                  if (!point) return null;
                  return (
                    <div className="rounded-[8px] border border-stone-200 bg-white">
                      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                        <h3 className="text-sm font-bold text-stone-800">节点详情</h3>
                        <button type="button" onClick={() => setKgSelectedNode(null)} className="text-stone-400 hover:text-stone-600">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="space-y-4 p-4">
                        {/* 节点名称 */}
                        <div>
                          <label className="text-xs font-semibold text-stone-500">节点名称</label>
                          <input
                            className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                            value={point.name}
                            onChange={(e) => setContent((c) => {
                              if (!c) return c;
                              const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kgSelectedNode ? { ...x, name: e.target.value } : x) };
                              return syncGraphNodeFromPoint(next, kgSelectedNode);
                            })}
                          />
                        </div>
                        {/* 节点说明 */}
                        <div>
                          <label className="text-xs font-semibold text-stone-500">节点说明</label>
                          <input
                            className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                            value={point.description}
                            placeholder="描述该知识点"
                            onChange={(e) => setContent((c) => {
                              if (!c) return c;
                              const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kgSelectedNode ? { ...x, description: e.target.value } : x) };
                              return syncGraphNodeFromPoint(next, kgSelectedNode);
                            })}
                          />
                        </div>
                        {/* 关键信息 */}
                        <div>
                          <label className="text-xs font-semibold text-stone-500">本课关键信息</label>
                          <input
                            className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                            value={point.keyInfo ?? ""}
                            placeholder="本课需要掌握的关键信息"
                            onChange={(e) => setContent((c) => {
                              if (!c) return c;
                              const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kgSelectedNode ? { ...x, keyInfo: e.target.value } : x) };
                              return syncGraphNodeFromPoint(next, kgSelectedNode);
                            })}
                          />
                        </div>
                        {/* 知识点难度层级 */}
                        <div>
                          <label className="text-xs font-semibold text-stone-500">知识点层级</label>
                          <select
                            className="mt-1 h-9 w-full rounded-[6px] border border-stone-300 bg-white px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                            value={point.level ?? content?.knowledgeGraph?.nodes.find((node) => node.id === point.id)?.level ?? "core"}
                            onChange={(e) => setContent((c) => {
                              if (!c) return c;
                              const level = e.target.value as NonNullable<KnowledgeGraph["nodes"][number]["level"]>;
                              const graph = ensureKnowledgeGraph(c);
                              return {
                                ...c,
                                knowledgePoints: c.knowledgePoints.map((item) => item.id === point.id ? { ...item, level } : item),
                                knowledgeGraph: {
                                  ...graph,
                                  nodes: graph.nodes.map((node) => node.id === point.id ? { ...node, level } : node),
                                },
                              };
                            })}
                          >
                            <option value="foundation">基础</option>
                            <option value="core">核心</option>
                            <option value="application">应用</option>
                            <option value="extension">拓展</option>
                          </select>
                        </div>
                        {/* 上游节点 */}
                        {upstream.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold text-stone-500">上游节点</label>
                            <div className="mt-1 space-y-1">
                              {upstream.map((edge) => {
                                const sourcePoint = content?.knowledgePoints.find((p) => p.id === edge.source);
                                return (
                                  <div key={edge.id} className="flex items-center gap-2 rounded-md bg-[var(--pbl-teacher-soft)] px-3 py-1.5 text-xs">
                                    <span className="font-semibold text-[var(--pbl-teacher)]">{sourcePoint?.name ?? edge.source}</span>
                                    <span className="text-stone-400">→</span>
                                    <input
                                      className="h-6 w-16 rounded border border-stone-200 bg-white px-1.5 text-xs outline-none focus:border-[var(--pbl-teacher)]"
                                      value={edge.label || "支撑"}
                                      onChange={(e) => setContent((c) => {
                                        if (!c) return c;
                                        const g = ensureKnowledgeGraph(c);
                                        return { ...c, knowledgeGraph: { ...g, edges: g.edges.map((item) => item.id === edge.id ? { ...item, label: e.target.value } : item) } };
                                      })}
                                    />
                                    <button
                                      type="button"
                                      className="ml-auto text-stone-300 hover:text-red-500"
                                      title="删除此关系"
                                      onClick={() => setContent((c) => {
                                        if (!c) return c;
                                        const g = ensureKnowledgeGraph(c);
                                        return { ...c, knowledgeGraph: { ...g, edges: g.edges.filter((item) => item.id !== edge.id) } };
                                      })}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* 下游节点 */}
                        {downstream.length > 0 && (
                          <div>
                            <label className="text-xs font-semibold text-stone-500">下游节点</label>
                            <div className="mt-1 space-y-1">
                              {downstream.map((edge) => {
                                const targetPoint = content?.knowledgePoints.find((p) => p.id === edge.target);
                                return (
                                  <div key={edge.id} className="flex items-center gap-2 rounded-md bg-[var(--pbl-success-soft)] px-3 py-1.5 text-xs">
                                    <input
                                      className="h-6 w-16 rounded border border-stone-200 bg-white px-1.5 text-xs outline-none focus:border-[var(--pbl-teacher)]"
                                      value={edge.label || "支撑"}
                                      onChange={(e) => setContent((c) => {
                                        if (!c) return c;
                                        const g = ensureKnowledgeGraph(c);
                                        return { ...c, knowledgeGraph: { ...g, edges: g.edges.map((item) => item.id === edge.id ? { ...item, label: e.target.value } : item) } };
                                      })}
                                    />
                                    <span className="text-stone-400">→</span>
                                    <span className="font-semibold text-[var(--pbl-success)]">{targetPoint?.name ?? edge.target}</span>
                                    <button
                                      type="button"
                                      className="ml-auto text-stone-300 hover:text-red-500"
                                      title="删除此关系"
                                      onClick={() => setContent((c) => {
                                        if (!c) return c;
                                        const g = ensureKnowledgeGraph(c);
                                        return { ...c, knowledgeGraph: { ...g, edges: g.edges.filter((item) => item.id !== edge.id) } };
                                      })}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {/* 删除节点按钮 */}
                        <div className="border-t border-stone-100 pt-3">
                          <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"
                            onClick={() => {
                              setContent((c) => {
                                if (!c) return c;
                                const g = ensureKnowledgeGraph(c);
                                return {
                                  ...c,
                                  knowledgePoints: c.knowledgePoints.filter((x) => x.id !== kgSelectedNode),
                                  knowledgeGraph: {
                                    nodes: g.nodes.filter((node) => node.id !== kgSelectedNode),
                                    edges: g.edges.filter((edge) => edge.source !== kgSelectedNode && edge.target !== kgSelectedNode),
                                  },
                                };
                              });
                              setKgSelectedNode(null);
                            }}
                          >
                            <X size={12} /> 删除此节点
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="rounded-[8px] border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
                    点击图谱中的节点查看详情
                  </div>
                )}

                {/* 图谱视图下也保留添加节点/关系按钮 */}
                <div className="flex gap-2">
                  <button
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                    onClick={() =>
                      setContent((c) => {
                        if (!c) return c;
                        const id = `kp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
                        const point = { id, name: "新知识点", description: "", keyInfo: "" };
                        const graph = ensureKnowledgeGraph(c);
                        return {
                          ...c,
                          knowledgePoints: [...c.knowledgePoints, point],
                          knowledgeGraph: { ...graph, nodes: [...graph.nodes, { id, label: point.name, description: "", keyInfo: "", level: "core" as const }] },
                        };
                      })
                    }
                    type="button"
                  >
                    + 添加节点
                  </button>
                  <button
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                    disabled={(content?.knowledgePoints.length ?? 0) < 2}
                    onClick={() =>
                      setContent((c) => {
                        if (!c || c.knowledgePoints.length < 2) return c;
                        const graph = ensureKnowledgeGraph(c);
                        return {
                          ...c,
                          knowledgeGraph: {
                            ...graph,
                            edges: [...graph.edges, { id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, source: c.knowledgePoints[0].id, target: c.knowledgePoints[1].id, label: "支撑" }],
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
            </div>
          ) : (
            /* ── 列表视图（原有表单） ── */
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_520px]">
              <div className="space-y-5 xl:order-2">
                <div>
                  <div className="mb-2 text-sm font-bold text-stone-800">知识节点</div>
                  <div className="space-y-2">
                    {(content?.knowledgePoints ?? []).map((kp) => (
                      <div
                        className="grid gap-2 overflow-hidden rounded-[8px] border border-stone-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto]"
                        key={kp.id}
                      >
                        <input
                          className="h-10 min-w-0 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 min-w-0 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 min-w-0 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="shrink-0 text-sm font-semibold text-stone-400 hover:text-red-600"
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
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
                    onClick={() =>
                      setContent((c) => {
                        if (!c) return c;
                        const id = `kp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
                  <div className="mb-2 text-sm font-bold text-stone-800">节点关系</div>
                  <div className="space-y-2">
                    {(content ? ensureKnowledgeGraph(content).edges : []).map((edge) => (
                      <div
                        className="grid gap-2 overflow-hidden rounded-[8px] border border-stone-200 bg-stone-50 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                        key={edge.id}
                      >
                        <select
                          className="h-10 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="text-sm font-semibold text-stone-400 hover:text-red-600"
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
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
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
                                id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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

              <div className="min-h-[400px] overflow-hidden rounded-[8px] border border-stone-200 bg-white xl:order-1">
                <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                  <div className="flex items-center gap-2 font-bold text-stone-900">
                    <Network size={18} className="text-[var(--pbl-teacher)]" />
                    图谱预览
                  </div>
                </div>
                <div className="h-[400px]">
                  <KnowledgeGraphFlow
                    graph={content?.knowledgeGraph}
                    points={content?.knowledgePoints ?? []}
                    height={400}
                    showMiniMap={false}
                    onNodePositionChange={(nodeId, position) => setContent((current) => current ? { ...current, knowledgeGraph: { ...ensureKnowledgeGraph(current), nodes: ensureKnowledgeGraph(current).nodes.map((node) => node.id === nodeId ? { ...node, position } : node) } } : current)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "lessonOutline",
      node: (
        <div className="space-y-4">
          <PblDetailHierarchySummary
            activities={content?.teachingOutline ?? []}
            details={sceneOutlines}
            knowledgeValidation={pblKnowledgeValidation}
          />
          <PblCoverageSummary coverage={pblCoverage} />
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
                setInfo("课程大纲已保存");
                window.setTimeout(() => setInfo(undefined), 2500);
              }}
              onBack={() => {
                setOpen((o) => ({ ...o, lessonOutline: false }));
              }}
              isStreaming={outlineStreaming}
              parentActivities={(content?.teachingOutline ?? []).map((activity) => ({
                id: activity.id,
                title: activity.title,
              }))}
              knowledgePoints={(content?.knowledgePoints ?? []).map((point) => ({
                id: point.id,
                name: point.name,
              }))}
              hideHeader
              hideFooter
              bare
            />
            </I18nProvider>
          ) : (
            <div className="rounded-[8px] border border-dashed border-stone-200 px-6 py-10 text-center">
              <p className="text-sm text-stone-500">
                暂无课程大纲。点击上方「AI 生成」按钮，基于课程模块生成资源。
              </p>
              <p className="mt-2 text-xs text-stone-400">
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
          <section className="border-y border-[var(--pbl-border)] py-4">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">两类计分评价 + 学生非计分反思</h3><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">AI 负责过程与专业性，教师负责现场汇报与通用表现；两部分独立评分后按权重合成。</p></div><span className={cn("text-sm font-semibold", (content?.evaluationPlan.flows ?? DEFAULT_EVALUATION_FLOWS).filter((item) => item.enabled && item.scored !== false).reduce((sum, item) => sum + item.weight, 0) === 100 ? "text-[var(--pbl-success)]" : "text-[var(--pbl-danger)]")}>计分权重合计 {(content?.evaluationPlan.flows ?? DEFAULT_EVALUATION_FLOWS).filter((item) => item.enabled && item.scored !== false).reduce((sum, item) => sum + item.weight, 0)}%</span></div>
            <div className="mt-4 divide-y divide-[var(--pbl-border-soft)]">
              {(content?.evaluationPlan.flows ?? DEFAULT_EVALUATION_FLOWS).filter((flow) => flow.sourceRole !== "peer").map((flow) => <div className="grid gap-3 py-4 md:grid-cols-[180px_100px_1fr] md:items-start" key={flow.id}><div><p className="font-semibold">{flow.name}</p><p className="mt-1 text-xs text-[var(--pbl-text-muted)]">{flow.sourceRole === "ai" ? "过程推进、AI 协作健康度与方案专业性" : flow.sourceRole === "teacher" ? "现场汇报、答辩、呈现与通用能力" : "课程反思与成长总结（不计分）"}</p></div><label className="text-xs text-[var(--pbl-text-muted)]">{flow.scored === false ? "计分状态" : "权重"}{flow.scored === false ? <div className="mt-1 grid min-h-10 place-items-center rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] text-sm font-semibold">不计分</div> : <input className="mt-1 min-h-10 w-full rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] px-2 text-sm" max={100} min={0} onChange={(event) => setContent((current) => current ? { ...current, evaluationPlan: { ...current.evaluationPlan, flows: (current.evaluationPlan.flows ?? DEFAULT_EVALUATION_FLOWS).map((item) => item.id === flow.id ? { ...item, weight: Number(event.target.value) || 0 } : item) } } : current)} type="number" value={flow.weight} />}</label><div><p className="text-xs font-semibold text-[var(--pbl-text-muted)]">评价证据</p><div className="mt-2 flex flex-wrap gap-2">{flow.evidenceRequirements.map((evidence) => <span className="rounded-[var(--radius-xs)] border border-[var(--pbl-border)] px-2 py-1 text-xs" key={evidence}>{evidence}</span>)}</div></div></div>)}
            </div>
          </section>
          <h3 className="pt-3 font-semibold">评价维度</h3>
          <div className="overflow-hidden rounded-[6px] border border-stone-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="p-3">维度</th>
                  <th className="p-3 w-28">负责角色</th>
                  <th className="p-3 w-24">权重</th>
                  <th className="p-3">描述</th>
                  <th className="p-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {(content?.evaluationPlan.dimensions ?? []).map((d) => {
                  return (
                    <tr className="border-b border-stone-100" key={d.id}>
                      <td className="p-3">
                        <input
                          className="h-9 w-full rounded-[6px] border border-stone-200 px-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                        <select
                          aria-label={`${d.name}负责角色`}
                          className="h-9 w-full rounded-[6px] border border-stone-200 bg-white px-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                          onChange={(e) =>
                            setContent((c) =>
                              c
                                ? {
                                    ...c,
                                    evaluationPlan: {
                                      ...c.evaluationPlan,
                                      dimensions: c.evaluationPlan.dimensions.map((x) =>
                                        x.id === d.id
                                          ? { ...x, responsibleRole: e.target.value as "ai" | "teacher" }
                                          : x,
                                      ),
                                    },
                                  }
                                : c,
                            )
                          }
                          value={resolveDimensionRole(d)}
                        >
                          <option value="ai">AI</option>
                          <option value="teacher">教师</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input
                            className="h-9 w-16 rounded-[6px] border border-stone-200 px-2 text-right text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          <span className="text-xs text-stone-500">%</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <input
                          className="h-9 w-full rounded-[6px] border border-stone-200 px-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="text-sm font-semibold text-stone-400 hover:text-red-600"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
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
                              responsibleRole: "ai",
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
              className="min-h-[60px] flex-1 ml-3 rounded-[6px] border border-stone-200 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
      wide
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={1} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
          href="/teacher/prepare/new"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="font-editorial text-3xl font-semibold">课程核查</h1>
          <p className="mt-1 text-sm text-stone-500">
            {course.name} · {course.subject} · {course.grade} · {course.hours} 课时
          </p>
        </div>

      </div>

      {info ? (
        <div className="mb-4 rounded-[8px] border border-[var(--pbl-student-border)] bg-[var(--pbl-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--pbl-success)]">
          {info}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-[8px] border border-[var(--pbl-danger-soft)] bg-[var(--pbl-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--pbl-danger)]">
          {error}
        </div>
      ) : null}

      <nav aria-label="课程核查步骤" className="mb-6 overflow-x-auto border-b border-[var(--pbl-border)]">
        <ol className="flex min-w-max items-end gap-1">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.key}><button aria-current={flowStep === index ? "step" : undefined} className={cn("min-h-12 border-b-2 px-4 text-sm font-semibold transition-colors", flowStep === index ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]" : "border-transparent text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]")} onClick={() => setFlowStep(index)} type="button"><span className="mr-2 text-xs">{index + 1}</span>{step.label}</button></li>
        ))}
        </ol>
      </nav>

      <div className="space-y-4">
        {FLOW_STEPS[flowStep]?.key === "base" ? (
          <Card>
            <h2 className="text-lg font-bold">确认课程基础信息</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["课程名称", course.name],
                ["学科", course.subject],
                ["年级", course.grade],
                ["课时", `${course.hours} 课时`],
                ["驱动问题", course.drivingQuestion || "未填写"],
                ["课程简介", course.summary || "未填写"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-stone-200 bg-stone-50 px-4 py-3">
                  <div className="text-xs font-bold text-stone-400">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <PrimaryButton type="button" onClick={() => setFlowStep(1)}>
                进入下一步核查 →
              </PrimaryButton>
            </div>
          </Card>
        ) : (
          sections
            .filter(({ key }) => key === FLOW_STEPS[flowStep]?.key)
            .map(({ key, node }) => (
          <Card className="p-0" key={key}>
            <div
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
              onClick={() => toggle(key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(key); } }}
            >
              <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{SECTION_LABEL[key]}</h2>
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
                          正在生成 {streamingCount} 项
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
                  <p className="mt-1 text-sm text-stone-500">
                    {SECTION_DESC[key]}
                  </p>
                </div>
              <div className="flex items-center gap-3">
                {key === "lessonOutline" ? (
                  <>
                    <Pill tone="blue">六阶段项目式</Pill>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)] px-3 text-sm font-semibold text-[var(--pbl-teacher)] hover:bg-[var(--pbl-teacher-soft)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void generateLessonOutlineOpenMAIC();
                      }}
                    >
                      {outlineStreaming ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          正在生成 {streamingCount} 项
                        </>
                      ) : sceneOutlines.length > 0 ? (
                        <>
                          <RotateCw size={14} />
                          重新生成
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          AI 生成
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-stone-200 px-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"
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
                    {isStepReady(key) ? "重新生成" : "生成"}
                  </button>
                )}
                {open[key] ? (
                  <ChevronUp className="text-stone-400" size={20} />
                ) : (
                  <ChevronDown className="text-stone-400" size={20} />
                )}
              </div>
            </div>
            {open[key] ? <div className="border-t border-stone-100 p-5">{node}</div> : null}
          </Card>
            ))
        )}
      </div>

      <div className="mt-7 flex items-center justify-end border-t border-stone-200 pt-5">
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-600 hover:bg-stone-50"
            onClick={() => saveDraft(true)}
            type="button"
          >
            <Save size={16} /> 保存草稿
          </button>
          {flowStep < FLOW_STEPS.length - 1 ? (
            <PrimaryButton
              type="button"
              onClick={() => setFlowStep(flowStep + 1)}
            >
              进入下一步核查 →
            </PrimaryButton>
          ) : (
            <PrimaryButton
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
              进入课程生成 →
            </PrimaryButton>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function PblDetailHierarchySummary({
  activities,
  details,
  knowledgeValidation,
}: {
  activities: ReadonlyArray<TeachingOutlineSection>;
  details: ReadonlyArray<SceneOutline>;
  knowledgeValidation: ReturnType<typeof validatePblKnowledgeAlignment>;
}) {
  const detailsByParent = new globalThis.Map<string, SceneOutline[]>();
  details.forEach((detail) => {
    const parentId = detail.parentActivityId ?? "__orphan__";
    detailsByParent.set(parentId, [...(detailsByParent.get(parentId) ?? []), detail]);
  });
  return (
    <section className="rounded-[var(--radius-sm)] border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">层级深化预览</p>
          <p className="mt-1 text-sm text-stone-600">课程模块是六个宏观时间单元，课程大纲可在同一模块下独立拆分为多个资源。</p>
        </div>
        <span className={cn(
          "rounded-full px-2.5 py-1 text-xs font-bold",
          knowledgeValidation.issues.length > 0 ? "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]" : "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]",
        )}>
          知识点 {knowledgeValidation.referencedPointIds.length}/{knowledgeValidation.referencedPointIds.length + knowledgeValidation.unreferencedPointIds.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {activities.map((activity) => {
          const childDetails = detailsByParent.get(activity.id) ?? [];
          return (
            <div className="rounded-[6px] border border-stone-100 bg-stone-50/70 p-3" key={activity.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-stone-800">{activity.title}</span>
                <span className="text-xs tabular-nums text-stone-500">{activity.durationMin} 分钟 · {childDetails.length} 个细化</span>
              </div>
              {childDetails.length > 0 ? (
                <div className="mt-2 space-y-1 border-l-2 border-[var(--pbl-teacher-border)] pl-3">
                  {childDetails.map((detail) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600" key={detail.id}>
                      <span className="min-w-0 truncate">↳ {detail.title}</span>
                      <span className="shrink-0 text-stone-400">{Math.round((detail.targetDurationSec ?? detail.estimatedDuration ?? 0) / 60)} 分钟 · {detail.audience === "teacher" ? "教师资源" : "学生资源"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--pbl-warning)]">尚未生成课程大纲资源</p>
              )}
            </div>
          );
        })}
        {(detailsByParent.get("__orphan__") ?? []).length > 0 ? (
          <p className="text-xs font-semibold text-rose-700">有 {(detailsByParent.get("__orphan__") ?? []).length} 个课程大纲资源尚未关联课程模块。</p>
        ) : null}
      </div>
      {knowledgeValidation.issues.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-amber-800">
          {knowledgeValidation.issues.slice(0, 3).map((issue) => <p key={`${issue.code}-${issue.outlineId}`}>⚠ {issue.message}</p>)}
        </div>
      ) : null}
      {knowledgeValidation.unreferencedPointIds.length > 0 ? (
        <p className="mt-2 text-xs text-stone-500">尚未被课程大纲覆盖的知识点：{knowledgeValidation.unreferencedPointIds.join("、")}</p>
      ) : null}
    </section>
  );
}

function PblCoverageSummary({
  coverage,
}: {
  coverage: ReturnType<typeof checkPblStageCoverage>;
}) {
  const labels: Record<string, string> = {
    launch: "项目启动",
    "ai-learning": "AI 授知",
    proposal: "方案构思",
    make: "项目实践",
    showcase: "成果汇报",
    reflection: "学习反思",
  };
  const hasOutlines = Object.values(coverage.entries).some((entry) => entry.total > 0);
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pbl-ai)]">六阶段覆盖检查</p>
          <p className="mt-1 text-sm text-[var(--pbl-text-muted)]">
            {hasOutlines ? "阶段归属来自场景显式标注；关键普通课堂活动支撑只检查项目启动与成果汇报。" : "生成后会在这里检查六个阶段和关键普通课堂活动支撑。"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${coverage.ok ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]" : "bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]"}`}>
          {hasOutlines ? (coverage.ok ? "覆盖完整" : "需要补充") : "待生成"}
        </span>
      </div>
      {hasOutlines ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.values(coverage.entries).map((entry) => (
          <div className="flex items-center justify-between rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-3 py-2 text-xs" key={entry.stageKey}>
            <span className="font-semibold">{labels[entry.stageKey] ?? entry.stageKey}</span>
            <span className={entry.total ? "text-[var(--pbl-ai)]" : "text-rose-500"}>{entry.total ? `${entry.total} 场` : "缺少"}</span>
          </div>
        ))}
      </div> : null}
      {hasOutlines && coverage.missingStageKeys.length ? (
        <p className="mt-3 text-xs leading-5 text-stone-500">未生成场景的阶段（不一定需要教师资源）：{coverage.missingStageKeys.map((key) => labels[key] ?? key).join("、")}</p>
      ) : null}
      {hasOutlines && !coverage.ok ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-amber-800">
          {coverage.missingStageKeys.length ? <p>缺少阶段：{coverage.missingStageKeys.map((key) => labels[key] ?? key).join("、")}</p> : null}
          {coverage.missingStudentLearningStageKeys.length ? <p>需要学生学习场景：AI 授知</p> : null}
          {coverage.missingTeacherResourceStageKeys.length ? <p>需要普通课堂活动支撑：{coverage.missingTeacherResourceStageKeys.map((key) => labels[key] ?? key).join("、")}</p> : null}
          {coverage.routingViolations.length ? <p>分流需修正：{coverage.routingViolations[0]}</p> : null}
        </div>
      ) : null}
      {coverage.metadataWarnings.length ? <p className="mt-2 text-xs leading-5 text-stone-500">元数据提醒：{coverage.metadataWarnings.join("；")}</p> : null}
    </section>
  );
}

function createEmptyTeachingOutlineItem(index: number): TeachingOutlineSection {
  return {
    id: `to-${index + 1}`,
    stageKey: "launch",
    title: "新授课活动",
    durationMin: 10,
    teachingGoal: "",
    teacherRole: "",
    platformRole: "",
    aiRole: "无",
    studentActivity: "",
    activityKind: "launch",
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
      <span className="mb-1 block text-xs font-bold text-stone-500">{label}</span>
      <textarea
        className="min-h-[84px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--pbl-teacher)]"
        onChange={(e) => onChange(e.target.value)}
        value={value}
      />
    </label>
  );
}
