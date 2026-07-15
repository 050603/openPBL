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
  Check,
  CheckCircle2,
  CheckSquare,
  Lightbulb,
  RefreshCw,
  Square,
  UsersRound,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { normalizeKnowledgeGraphForDisplay } from "@/components/knowledge-graph";
import { KnowledgeGraphFlow } from "@/components/knowledge-graph-flow";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, FlowActionBar, Pill, PrimaryButton, toast } from "@/components/ui";
import { ProjectCoverImage } from "@/components/visuals";
import { generateProjectSkeleton, type ProjectSkeletonResult } from "@/lib/teaching-ai/client-api";
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
import { AI_COMPANIONS } from "@/lib/ai-companions";
import {
  DEFAULT_PBL_EVIDENCE_REQUIREMENTS,
  DEFAULT_PBL_OUTCOME,
  normalizePblCourseConfig,
  type PblCompanionId,
} from "@/lib/pbl-course-config";
import {
  buildPblCourseRequirement,
  buildCourseTeachingConstraints,
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
import {
  applyConfirmedPblTimingPlan,
  assessPblTeachingOutlineStructure,
  createPblTimingSkeleton,
  normalizePblTeachingOutline,
} from "@/lib/pbl-outline-normalization";
import { PblModuleTimingPanel } from "@/components/teacher/pbl-module-timing-panel";
import { useSettingsStore } from "@/lib/openmaic/store/settings";
import { getTtsTimingProfile } from "@/lib/openmaic/audio/tts-timing";
import {
  buildCourseBasicsPatch,
  createCourseBasicsDraft,
  parseLearningObjectives,
  validateCourseBasicsDraft,
  type CourseBasicsDraft,
} from "@/lib/teacher/course-basics-draft";
import { buildCourseGenerationInput } from "@/lib/teacher/course-generation-input";

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
    segmentIndex: outline.segmentIndex,
    segmentCount: outline.segmentCount,
    segmentRole: outline.segmentRole,
    segmentGroupId: outline.segmentGroupId,
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
    segmentIndex: section.segmentIndex,
    segmentCount: section.segmentCount,
    segmentRole: section.segmentRole,
    segmentGroupId: section.segmentGroupId,
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
    segmentIndex:
      typeof raw.segmentIndex === "number" && Number.isFinite(raw.segmentIndex)
        ? Math.max(1, Math.round(raw.segmentIndex))
        : undefined,
    segmentCount:
      typeof raw.segmentCount === "number" && Number.isFinite(raw.segmentCount)
        ? Math.max(1, Math.round(raw.segmentCount))
        : undefined,
    segmentRole:
      typeof raw.segmentRole === "string" && raw.segmentRole.trim()
        ? raw.segmentRole.trim()
        : undefined,
    segmentGroupId:
      typeof raw.segmentGroupId === "string" && raw.segmentGroupId.trim()
        ? raw.segmentGroupId.trim()
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
  { key: "verify", label: "备课阶段" },
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
  { key: "base", label: "基础信息", desc: "编辑课程名称、学科、年级、课时与驱动问题" },
  { key: "knowledgePoints", label: "知识图谱", desc: "确认本课知识节点和节点间关系" },
  { key: "teachingOutline", label: "课程模块", desc: "确认六个宏观环节、时间分配与人机分工" },
  { key: "lessonOutline", label: "课程大纲", desc: "确认每个课程模块下独立展开的具体教学资源" },
  { key: "evaluationPlan", label: "评价方案", desc: "基于知识图谱与项目目标生成评价维度" },
];

export default function VerifyCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, updateCourse } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const ttsProviderId = useSettingsStore((state) => state.ttsProviderId);
  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const ttsProviderConfig = ttsProvidersConfig[ttsProviderId];
  const ttsModelId = ttsProviderConfig?.modelId || "";
  const ttsVoiceId = ttsProviderConfig?.defaultVoice || ttsVoice || "default";
  const ttsTimingProfile = getTtsTimingProfile(ttsProviderId, ttsModelId, ttsVoiceId);
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
  const [skeleton, setSkeleton] = useState<ProjectSkeletonResult | null>(null);
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [activeSuggestionPart, setActiveSuggestionPart] = useState<
    "courseHours" | "learningObjectives" | "summary" | "learnerProfile" | "drivingQuestions" | null
  >(null);
  const [baseDraft, setBaseDraft] = useState<CourseBasicsDraft | null>(null);
  const [baseDraftDirty, setBaseDraftDirty] = useState(false);
  const initializedDraftCourseIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!course || initializedDraftCourseIdRef.current === course.id) return;
    initializedDraftCourseIdRef.current = course.id;
    setBaseDraft(createCourseBasicsDraft(course));
    setBaseDraftDirty(false);
    setSkeleton(null);
    setActiveSuggestionPart(null);
  }, [course]);

  function editBaseDraft(patch: Partial<CourseBasicsDraft>) {
    if (!course) return;
    setBaseDraft((current) => ({
      ...(current ?? createCourseBasicsDraft(course)),
      ...patch,
    }));
    setBaseDraftDirty(true);
  }

  async function requestSkeleton(
    part: "courseHours" | "learningObjectives" | "summary" | "learnerProfile" | "drivingQuestions",
  ) {
    if (!course) return;
    const draft = baseDraft ?? createCourseBasicsDraft(course);
    setActiveSuggestionPart(part);
    setSkeletonLoading(true);
    try {
      const result = await generateProjectSkeleton({
        courseName: draft.name,
        subject: draft.subject,
        grade: draft.grade,
        hours: draft.hours,
        summary: draft.summary,
        initialDrivingQuestion: draft.drivingQuestion,
        learningObjectives: parseLearningObjectives(draft.learningObjectivesText),
        learnerProfile: {
          priorKnowledge: draft.priorKnowledge,
          learningNeeds: draft.learningNeeds,
          familiarContexts: draft.familiarContexts,
        },
        targetPart: part,
      });
      setSkeleton(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "AI 建议生成失败";
      toast.error("AI 建议生成失败", { description: message });
    } finally {
      setSkeletonLoading(false);
    }
  }

  async function refreshSkeletonPart(
    part: "courseHours" | "learningObjectives" | "summary" | "learnerProfile" | "drivingQuestions",
  ) {
    await requestSkeleton(part);
  }
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
      learningObjectives: course?.learningObjectives,
      learnerProfile: course?.learnerProfile,
      knowledgePoints: content?.knowledgePoints,
      knowledgeGraph: content?.knowledgeGraph,
    }),
    [
      content?.knowledgeGraph,
      content?.knowledgePoints,
      course?.grade,
      course?.name,
      course?.pblConfig?.difficultyLevel,
      course?.learningObjectives,
      course?.learnerProfile,
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

  const confirmModuleTiming = useCallback(async () => {
    if (!course) return;
    const currentContent = content ?? course.content;
    const activities = currentContent.teachingOutline ?? [];
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

    setContent((current) => current
      ? {
          ...current,
          moduleTimingPlan,
          projectMainline: undefined,
          pblOutline: "",
          lessonOutline: [],
          _openmaicSceneOutlines: undefined,
        }
      : current);
    setSceneOutlines([]);
    setBusy("teachingOutline");
    setError(undefined);
    setInfo("时间安排已确认，正在按最终时间生成 PBL 项目主线和课程模块…");

    try {
      const timingSpine = {
        ...buildPblProjectMainline(totalMinutes, moduleTimingPlan.allocations),
        generatedAt: moduleTimingPlan.confirmedAt ?? new Date().toISOString(),
      };
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "teachingOutline",
          input: buildCourseGenerationInput(course),
          context: {
            pblOutline: currentContent.pblOutline,
            knowledgePoints: currentContent.knowledgePoints,
            knowledgeGraph: currentContent.knowledgeGraph,
            projectMainline: timingSpine,
            moduleTimingPlan,
          },
        }),
      });
      if (!res.ok) {
        let detail = `课程模块生成失败（HTTP ${res.status}）`;
        try {
          const body = (await res.json()) as { detail?: string; error?: string };
          detail = body.detail || body.error || detail;
        } catch {
          // 响应非 JSON，保留默认错误。
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as { content: CourseContent; source: "llm" };
      const generatedModules = applyConfirmedPblTimingPlan(
        data.content.teachingOutline ?? [],
        moduleTimingPlan,
        { totalMinutes, ...pblTimeContext },
      );
      const structureIssues = assessPblTeachingOutlineStructure(generatedModules);
      if (structureIssues.length > 0) {
        throw new Error(`课程模块结构校验失败：${structureIssues.map((issue) => issue.message).join("；")}`);
      }
      const projectMainline = {
        ...buildPblProjectMainline(totalMinutes, generatedModules),
        generatedAt: new Date().toISOString(),
      };
      if (projectMainline.allocatedMinutes !== totalMinutes) {
        throw new Error(`课程模块时间校验失败：模块合计 ${projectMainline.allocatedMinutes} 分钟，课程总时长 ${totalMinutes} 分钟。`);
      }
      setContent((current) => current
        ? {
            ...current,
            pblOutline: data.content.pblOutline?.trim() || formatPblProjectMainline(projectMainline),
            teachingOutline: generatedModules,
            moduleTimingPlan,
            projectMainline,
            lessonOutline: [],
            _openmaicSceneOutlines: undefined,
          }
        : current);
      setInfo("已按教师确认的时间安排生成 PBL 项目主线和六个课程模块。");
    } catch (e) {
      const message = (e as Error).message || "PBL 项目主线和课程模块生成失败";
      setError(message);
      setInfo(undefined);
      toast.error("课程模块生成失败", { description: message });
    } finally {
      setBusy(null);
    }
  }, [content, course, pblTimeContext]);

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
          learningObjectives: course.learningObjectives,
          learnerProfile: course.learnerProfile,
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
            learningObjectives: course.learningObjectives,
            learnerProfile: course.learnerProfile,
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
      ? course.content.projectMainline
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
        if (
          section === "teachingOutline"
          && course.pblConfig?.generationTemplate === "pbl-six-stage"
        ) {
          const totalMinutes = Math.max(0, Math.round(course.hours * 60));
          const timingSkeleton = createPblTimingSkeleton({
            totalMinutes,
            ...pblTimeContext,
          });
          const moduleTimingPlan = buildPblModuleTimingPlan(
            totalMinutes,
            timingSkeleton,
            pblTimeContext,
            { status: "suggested", preserveCurrentDurations: true },
          );
          setContent((current) => ({
            ...(current ?? course.content),
            pblOutline: "",
            teachingOutline: timingSkeleton,
            projectMainline: undefined,
            moduleTimingPlan,
            lessonOutline: [],
            _openmaicSceneOutlines: undefined,
          }));
          setSceneOutlines([]);
          setInfo("已根据课程信息生成六阶段时间建议。请调整并确认时间后，再生成 PBL 项目主线和课程模块。");
          return;
        }
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
            input: buildCourseGenerationInput(course),
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
                learningObjectives: course.learningObjectives,
                learnerProfile: course.learnerProfile,
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
              learningObjectives: course.learningObjectives,
              learnerProfile: course.learnerProfile,
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
                learningObjectives: course.learningObjectives,
                learnerProfile: course.learnerProfile,
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
              learningObjectives: course.learningObjectives,
              learnerProfile: course.learnerProfile,
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
    [course, content, pblTimeContext, syncLessonOutline],
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
    const structureIssues = assessPblTeachingOutlineStructure(
      currentContent.teachingOutline ?? [],
    );
    if (!currentContent.projectMainline || structureIssues.length > 0) {
      const message = structureIssues[0]?.message
        ? `课程模块结构无效：${structureIssues[0].message}`
        : "请先根据已确认的时间安排生成 PBL 项目主线和课程模块。";
      setError(message);
      toast.error("PBL 项目主线尚未就绪", { description: message });
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
            teachingConstraints: buildCourseTeachingConstraints(course, content ?? course.content),
            interactiveMode: currentContent.interactiveMode === true,
            userNickname,
            userBio,
            webSearch: false,
            taskEngineMode: false,
            ttsTimingContext: {
              providerId: ttsProviderId,
              modelId: ttsModelId,
              voiceId: ttsVoiceId,
              cjkCharsPerMinute: ttsTimingProfile.cjkCharsPerMinute,
              latinWordsPerMinute: ttsTimingProfile.latinWordsPerMinute,
              calibrated: ttsTimingProfile.source === "configured",
            },
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
            if (outlines.length > 0) {
              collected.splice(0, collected.length);
              for (let i = 0; i < outlines.length; i++) {
                const outline = normalizeSceneOutlineSnapshot(outlines[i], i);
                outline.order = i;
                collected.push(outline);
              }
              setSceneOutlines([...collected]);
              syncLessonOutline(collected);
              setStreamingCount(collected.length);
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
  }, [
    course,
    user,
    syncLessonOutline,
    content,
    sceneOutlines,
    ttsProviderId,
    ttsModelId,
    ttsVoiceId,
    ttsTimingProfile,
  ]);

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
      ? content.projectMainline
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
    const draftToSave = baseDraft ?? createCourseBasicsDraft(course);
    const validationError = validateCourseBasicsDraft(draftToSave);
    if (validationError) {
      toast.error(validationError);
      setFlowStep(0);
      return null;
    }
    const nextContent = buildPersistableContent();
    if (!nextContent) return null;
    updateCourse(course.id, {
      ...buildCourseBasicsPatch(course, draftToSave),
      content: nextContent,
    });
    setBaseDraftDirty(false);
    if (showMessage) {
      setInfo("已保存基础信息与当前备课草稿，后续生成将使用最新版内容。");
      window.setTimeout(() => setInfo(undefined), 2500);
    }
    return nextContent;
  }

  function isStepReady(section: Section | null): boolean {
    if (!content) return false;
    if (!section) return true;
    if (section === "knowledgePoints") return content.knowledgePoints.length > 0;
    if (section === "teachingOutline") {
      const structureIssues = assessPblTeachingOutlineStructure(content.teachingOutline ?? []);
      const mainline = content.projectMainline;
      const mainlineValid = Boolean(
        mainline
        && mainline.totalMinutes === Math.max(0, Math.round((course?.hours ?? 0) * 60))
        && mainline.allocatedMinutes === mainline.totalMinutes
        && mainline.modules.length === PBL_MODULE_DEFINITIONS.length
        && mainline.modules.every(
          (module, index) => module.stageKey === PBL_MODULE_DEFINITIONS[index]?.stageKey,
        ),
      );
      return Boolean(
        content.teachingOutline?.length === PBL_MODULE_DEFINITIONS.length
        && structureIssues.length === 0
        && content.moduleTimingPlan?.status === "confirmed"
        && isPblModuleTimingPlanConfirmed(content.moduleTimingPlan)
        && mainlineValid,
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
      toast.error("备课阶段尚未完成", { description: message });
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
    const nextContent = saveDraft(false);
    if (!nextContent) return;
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

  const draft = baseDraft ?? createCourseBasicsDraft(course);

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
            readOnly={busy === "teachingOutline"}
            onChangeModuleDuration={applyPblStageDurationChange}
            onBatchChangeDurations={(durations) => {
              // 直接更新指定模块的时长，不触发 reallocatePblStageDurations 全局重分配
              const outline = content?.teachingOutline ?? [];
              if (outline.length === 0) return;
              const nextOutline = outline.map((activity) => {
                const newMinutes = durations[activity.id];
                return newMinutes !== undefined
                  ? { ...activity, durationMin: newMinutes }
                  : activity;
              });
              applyTeachingOutlineChange(nextOutline);
            }}
            onApplyRecommendation={(allocations) => {
              const activities = content?.teachingOutline ?? [];
              applyTeachingOutlineChange(
                activities.map((item) => ({
                  ...item,
                  durationMin: allocations[item.id] ?? item.durationMin,
                })),
              );
            }}
            onConfirm={() => void confirmModuleTiming()}
          />
          {content?.projectMainline ? (
            <>
          <div>
            <div className="mb-2 text-sm font-bold text-stone-800">PBL 项目主线说明</div>
            <p className="mb-2 text-xs leading-5 text-stone-500">下方项目节奏和课程模块均由教师最终确认的时间安排生成。</p>
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
                    className="h-10 min-w-[220px] flex-1 rounded-[6px] border border-stone-300 px-3 text-sm font-semibold outline-none focus:border-[var(--pbl-teacher)]"
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
                    className="h-10 rounded-[6px] border border-stone-300 px-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                      className="text-sm font-semibold text-stone-400 hover:text-[var(--pbl-danger)]"
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

                <div className="mt-3">
                  <fieldset><legend className="mb-2 text-xs font-semibold text-[var(--pbl-text-muted)]">学习资源</legend><div className="flex flex-wrap gap-2">{([{ value: "ppt", label: "演示文稿" }, { value: "interactive-demo", label: "互动演示" }, { value: "code-interactive", label: "代码互动" }, { value: "script", label: "教师讲稿" }, { value: "worksheet", label: "学习单" }, { value: "rubric", label: "评价量规" }, { value: "project-brief", label: "项目任务书" }] as const).map((resource) => { const selected = (section.resourceTypes ?? []).includes(resource.value); return <button aria-pressed={selected} className={cn("min-h-9 rounded-[var(--radius-xs)] border px-3 text-xs font-semibold", selected ? "border-[var(--pbl-ai)] bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]" : "border-[var(--pbl-border)] bg-[var(--pbl-surface)] text-[var(--pbl-text-muted)]")} key={resource.value} onClick={() => updateTeachingOutlineItem(setContent, section.id, { resourceTypes: selected ? (section.resourceTypes ?? []).filter((value) => value !== resource.value) : [...(section.resourceTypes ?? []), resource.value] })} type="button">{resource.label}</button>; })}</div></fieldset>
                </div>
              </div>
            ))}
          </div>

            </>
          ) : (
            <div className="rounded-[8px] border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm leading-6 text-stone-600">
              {content?.moduleTimingPlan?.status === "confirmed"
                ? "时间安排已确认。正在生成或等待重新生成 PBL 项目主线与六个课程模块。"
                : "先生成并调整六阶段时间安排；确认后，系统才会根据最终时间和知识图谱生成 PBL 项目主线与课程模块。"}
            </div>
          )}
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
                            className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          <textarea
                            className="mt-1 min-h-[60px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm leading-5 outline-none focus:border-[var(--pbl-teacher)] resize-y"
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
                          <textarea
                            className="mt-1 min-h-[60px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm leading-5 outline-none focus:border-[var(--pbl-teacher)] resize-y"
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
                            className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 bg-white px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                                      className="h-7 min-w-[60px] flex-1 rounded border border-stone-200 bg-white px-2 text-xs outline-none focus:border-[var(--pbl-teacher)]"
                                      value={edge.label || ""}
                                      placeholder="关系说明"
                                      onChange={(e) => setContent((c) => {
                                        if (!c) return c;
                                        const g = ensureKnowledgeGraph(c);
                                        return { ...c, knowledgeGraph: { ...g, edges: g.edges.map((item) => item.id === edge.id ? { ...item, label: e.target.value } : item) } };
                                      })}
                                    />
                                    <button
                                      type="button"
                                      className="ml-auto text-stone-300 hover:text-[var(--pbl-danger)]"
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
                                      className="h-7 min-w-[60px] flex-1 rounded border border-stone-200 bg-white px-2 text-xs outline-none focus:border-[var(--pbl-teacher)]"
                                      value={edge.label || ""}
                                      placeholder="关系说明"
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
                                      className="ml-auto text-stone-300 hover:text-[var(--pbl-danger)]"
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
                            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] px-3 text-xs font-semibold text-[var(--pbl-danger)] hover:bg-[var(--pbl-danger-soft)]"
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
            /* ── 列表视图 ── */
            <div className="grid gap-5 lg:grid-cols-2">
              {/* 左栏：知识节点 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold text-stone-800">知识节点（{content?.knowledgePoints.length ?? 0}）</div>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-stone-200 px-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
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
                    + 添加
                  </button>
                </div>
                <div className="space-y-2">
                  {(content?.knowledgePoints ?? []).map((kp) => {
                    const upstreamEdges = content ? ensureKnowledgeGraph(content).edges.filter((e) => e.target === kp.id) : [];
                    const downstreamEdges = content ? ensureKnowledgeGraph(content).edges.filter((e) => e.source === kp.id) : [];
                    return (
                      <div className="rounded-[8px] border border-stone-200 bg-white p-3" key={kp.id}>
                        <div className="flex items-center gap-2">
                          <input
                            className="h-9 min-w-0 flex-1 rounded-[6px] border border-stone-300 px-3 text-sm font-semibold outline-none focus:border-[var(--pbl-teacher)]"
                            onChange={(e) =>
                              setContent((c) => {
                                if (!c) return c;
                                const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kp.id ? { ...x, name: e.target.value } : x) };
                                return syncGraphNodeFromPoint(next, kp.id);
                              })
                            }
                            value={kp.name}
                            placeholder="知识点名称"
                          />
                          <button
                            className="shrink-0 text-xs font-semibold text-stone-400 hover:text-[var(--pbl-danger)]"
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
                        <div className="mt-2 grid gap-2">
                          <textarea
                            className="min-h-[44px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-xs leading-5 outline-none focus:border-[var(--pbl-teacher)] resize-y"
                            onChange={(e) =>
                              setContent((c) => {
                                if (!c) return c;
                                const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kp.id ? { ...x, description: e.target.value } : x) };
                                return syncGraphNodeFromPoint(next, kp.id);
                              })
                            }
                            placeholder="节点说明"
                            value={kp.description}
                          />
                          <textarea
                            className="min-h-[44px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-xs leading-5 outline-none focus:border-[var(--pbl-teacher)] resize-y"
                            onChange={(e) =>
                              setContent((c) => {
                                if (!c) return c;
                                const next = { ...c, knowledgePoints: c.knowledgePoints.map((x) => x.id === kp.id ? { ...x, keyInfo: e.target.value } : x) };
                                return syncGraphNodeFromPoint(next, kp.id);
                              })
                            }
                            placeholder="本课关键信息"
                            value={kp.keyInfo ?? ""}
                          />
                        </div>
                        {(upstreamEdges.length > 0 || downstreamEdges.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
                            {upstreamEdges.map((edge) => {
                              const src = content?.knowledgePoints.find((p) => p.id === edge.source);
                              return <span key={edge.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-teacher-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--pbl-teacher)]">{src?.name ?? edge.source} · {edge.label || "支撑"} →</span>;
                            })}
                            {downstreamEdges.map((edge) => {
                              const tgt = content?.knowledgePoints.find((p) => p.id === edge.target);
                              return <span key={edge.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--pbl-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--pbl-success)]">→ {tgt?.name ?? edge.target} · {edge.label || "支撑"}</span>;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 右栏：节点关系 */}
              <div>
                <p className="mb-1 text-xs text-stone-500">选择两个知识点建立关联，如“概念A 是 概念B 的前提”。</p>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-bold text-stone-800">节点关系（{content ? ensureKnowledgeGraph(content).edges.length : 0}）</div>
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-stone-200 px-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
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
                    + 添加
                  </button>
                </div>
                <div className="space-y-2">
                  {(content ? ensureKnowledgeGraph(content).edges : []).map((edge) => {
                    return (
                      <div key={edge.id} className="rounded-[8px] border border-stone-200 bg-stone-50 p-3">
                        {/* 第一行：源节点 → 目标节点 */}
                        <div className="flex items-center gap-2">
                          <select
                            className="h-8 min-w-0 flex-1 rounded-[6px] border border-stone-300 bg-white px-2 text-xs font-semibold text-[var(--pbl-teacher)] outline-none focus:border-[var(--pbl-teacher)]"
                            onChange={(e) => setContent((c) => c ? { ...c, knowledgeGraph: { ...ensureKnowledgeGraph(c), edges: ensureKnowledgeGraph(c).edges.map((item) => item.id === edge.id ? { ...item, source: e.target.value } : item) } } : c)}
                            value={edge.source}
                          >
                            {(content?.knowledgePoints ?? []).map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                          </select>
                          <span className="shrink-0 text-stone-400">→</span>
                          <select
                            className="h-8 min-w-0 flex-1 rounded-[6px] border border-stone-300 bg-white px-2 text-xs font-semibold text-[var(--pbl-success)] outline-none focus:border-[var(--pbl-teacher)]"
                            onChange={(e) => setContent((c) => c ? { ...c, knowledgeGraph: { ...ensureKnowledgeGraph(c), edges: ensureKnowledgeGraph(c).edges.map((item) => item.id === edge.id ? { ...item, target: e.target.value } : item) } } : c)}
                            value={edge.target}
                          >
                            {(content?.knowledgePoints ?? []).map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                          </select>
                        </div>
                        {/* 第二行：关系说明 + 删除 */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="shrink-0 text-xs text-stone-500">关系：</span>
                          <input
                            className="h-8 min-w-0 flex-1 rounded-[6px] border border-stone-300 bg-white px-2 text-xs outline-none focus:border-[var(--pbl-teacher)]"
                            onChange={(e) => setContent((c) => c ? { ...c, knowledgeGraph: { ...ensureKnowledgeGraph(c), edges: ensureKnowledgeGraph(c).edges.map((item) => item.id === edge.id ? { ...item, label: e.target.value } : item) } } : c)}
                            placeholder="如：支撑、前提、基础"
                            value={edge.label}
                          />
                          <button className="shrink-0 text-xs font-semibold text-stone-400 hover:text-[var(--pbl-danger)]" onClick={() => setContent((c) => c ? { ...c, knowledgeGraph: { ...ensureKnowledgeGraph(c), edges: ensureKnowledgeGraph(c).edges.filter((item) => item.id !== edge.id) } } : c)} type="button">删除</button>
                        </div>
                      </div>
                    );
                  })}
                  {(content ? ensureKnowledgeGraph(content).edges : []).length === 0 ? (
                    <p className="rounded-[8px] border border-dashed border-stone-200 bg-stone-50/50 px-3 py-4 text-center text-xs text-stone-400">
                      暂无节点关系。点击右上方“添加”可创建知识点之间的关联。
                    </p>
                  ) : null}
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
                          className="h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 w-full rounded-[6px] border border-stone-300 bg-white px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                            className="h-10 w-20 rounded-[6px] border border-stone-300 px-2 text-right text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
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
                          className="text-sm font-semibold text-stone-400 hover:text-[var(--pbl-danger)]"
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
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={0} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
          href="/teacher"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="font-editorial text-3xl font-semibold">备课阶段</h1>
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

      <nav aria-label="备课阶段步骤" className="mb-6 overflow-x-auto border-b border-[var(--pbl-border)]">
        <ol className="flex min-w-max items-end gap-1">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.key}><button aria-current={flowStep === index ? "step" : undefined} className={cn("min-h-12 border-b-2 px-4 text-sm font-semibold transition-colors", flowStep === index ? "border-[var(--pbl-teacher)] text-[var(--pbl-teacher)]" : "border-transparent text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]")} onClick={() => setFlowStep(index)} type="button"><span className="mr-2 text-xs">{index + 1}</span>{step.label}</button></li>
        ))}
        </ol>
      </nav>

      <div className="space-y-4">
        {FLOW_STEPS[flowStep]?.key === "base" ? (
          <div className="space-y-5">
            {/* ── 课程底稿 ── */}
            <Card className="p-5">
              <div className="grid gap-5 lg:grid-cols-2 lg:items-end">
                <div className="min-w-0">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pbl-teacher)]">课程底稿</p>
                    <h2 className="font-editorial mt-2 text-xl font-semibold">编辑课程信息</h2>
                    <p className="mt-1 text-sm text-stone-500">先完成本页编辑，再通过页面底部统一保存草稿；输入过程不会发送保存请求。</p>
                  </div>
                  <div className="mt-5">
                  <label className="text-sm font-bold text-stone-800">课程名称</label>
                  <input
                    className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    maxLength={40}
                    value={draft.name}
                    onChange={(e) => editBaseDraft({ name: e.target.value })}
                    placeholder="例如：校园低碳生活解决方案"
                  />
                </div>
                </div>
                <div className="overflow-hidden rounded-[10px] border border-stone-200 bg-stone-50 p-2">
                  <ProjectCoverImage course={course} allowGenerate className="h-[180px] w-full" />
                </div>
              </div>
              <div className="mt-5 space-y-5 border-t border-stone-100 pt-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-sm font-bold text-stone-800">学科</label>
                    <input className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]" value={draft.subject} onChange={(e) => editBaseDraft({ subject: e.target.value })} placeholder="环境科学" />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-stone-800">年级</label>
                    <input className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]" value={draft.grade} onChange={(e) => editBaseDraft({ grade: e.target.value })} placeholder="高一" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-bold text-stone-800">预计课时</label>
                      <AiFieldButton busy={skeletonLoading} label="AI 建议课时" loading={skeletonLoading && activeSuggestionPart === "courseHours"} onClick={() => void requestSkeleton("courseHours")} />
                    </div>
                    <input className="mt-1 h-10 w-full rounded-[6px] border border-stone-300 px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]" type="number" min={1} max={5} value={draft.hours} onChange={(e) => editBaseDraft({ hours: Number(e.target.value) })} />
                  </div>
                </div>
                {skeleton && activeSuggestionPart === "courseHours" ? (
                  <AiSuggestionPanel loading={skeletonLoading} onClose={() => setActiveSuggestionPart(null)} onRefresh={() => void refreshSkeletonPart("courseHours")}>
                    {skeleton.courseHourOptions.map((option) => (
                      <AiSuggestionCard key={option.hours} onAdopt={() => editBaseDraft({ hours: option.hours })}>
                        <p className="font-editorial text-lg font-semibold text-stone-900">{option.hours} 课时</p>
                        <p className="mt-1 font-semibold text-stone-700">{option.rationale}</p>
                        <p className="mt-1 text-stone-500">{option.scope}</p>
                      </AiSuggestionCard>
                    ))}
                  </AiSuggestionPanel>
                ) : null}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-stone-800">课程目标</label>
                    <AiFieldButton busy={skeletonLoading} label="AI 生成课程目标建议" loading={skeletonLoading && activeSuggestionPart === "learningObjectives"} onClick={() => void requestSkeleton("learningObjectives")} />
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">每行一个可观察、可评价的学习目标。</p>
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    value={draft.learningObjectivesText}
                    onChange={(e) => editBaseDraft({ learningObjectivesText: e.target.value })}
                    placeholder={"解释项目所需的核心概念\n运用证据比较不同方案\n形成并修订可实施的项目成果"}
                  />
                  {skeleton && activeSuggestionPart === "learningObjectives" ? (
                    <AiSuggestionPanel loading={skeletonLoading} onClose={() => setActiveSuggestionPart(null)} onRefresh={() => void refreshSkeletonPart("learningObjectives")}>
                      {skeleton.learningObjectiveOptions.map((option, index) => (
                        <AiSuggestionCard key={index} onAdopt={() => editBaseDraft({ learningObjectivesText: option.join("\n") })}>
                          <ol className="list-decimal space-y-1 pl-4">{option.map((item) => <li key={item}>{item}</li>)}</ol>
                        </AiSuggestionCard>
                      ))}
                    </AiSuggestionPanel>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-bold text-stone-800">课程说明</label>
                    <AiFieldButton busy={skeletonLoading} label="AI 生成课程说明建议" loading={skeletonLoading && activeSuggestionPart === "summary"} onClick={() => void requestSkeleton("summary")} />
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">补充真实情境和课程范围，不必写成宣传文案。</p>
                  <textarea
                    className="mt-1 min-h-[80px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    value={draft.summary}
                    onChange={(e) => editBaseDraft({ summary: e.target.value })}
                    placeholder="学生将调查什么、接触哪些真实对象、形成怎样的判断？"
                  />
                  {skeleton && activeSuggestionPart === "summary" ? (
                    <AiSuggestionPanel loading={skeletonLoading} onClose={() => setActiveSuggestionPart(null)} onRefresh={() => void refreshSkeletonPart("summary")}>
                      {skeleton.summaryOptions.map((option, index) => <AiSuggestionCard key={index} onAdopt={() => editBaseDraft({ summary: option })}>{option}</AiSuggestionCard>)}
                    </AiSuggestionPanel>
                  ) : null}
                </div>
                <div className="rounded-[var(--radius-sm)] border border-stone-200 bg-stone-50/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-stone-800">学生学情与认知边界</h3>
                    <AiFieldButton busy={skeletonLoading} label="AI 生成学情建议" loading={skeletonLoading && activeSuggestionPart === "learnerProfile"} onClick={() => void requestSkeleton("learnerProfile")} />
                  </div>
                  <p className="mt-1 text-xs text-stone-500">可选。未填写时系统会根据学段、学科采用保守推断。</p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label className="text-xs font-semibold text-stone-600">已有基础</label>
                      <textarea className="mt-1 min-h-[56px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]" value={draft.priorKnowledge} onChange={(e) => editBaseDraft({ priorKnowledge: e.target.value })} placeholder="例如：理解分类和概率的直观含义" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-stone-600">学习特点或困难</label>
                        <textarea className="mt-1 min-h-[56px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]" value={draft.learningNeeds} onChange={(e) => editBaseDraft({ learningNeeds: e.target.value })} placeholder="例如：抽象概念需要图示" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-600">熟悉的生活情境</label>
                        <textarea className="mt-1 min-h-[56px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]" value={draft.familiarContexts} onChange={(e) => editBaseDraft({ familiarContexts: e.target.value })} placeholder="例如：校园生活、短视频推荐" />
                      </div>
                    </div>
                  </div>
                  {skeleton && activeSuggestionPart === "learnerProfile" ? (
                    <AiSuggestionPanel loading={skeletonLoading} onClose={() => setActiveSuggestionPart(null)} onRefresh={() => void refreshSkeletonPart("learnerProfile")}>
                      {skeleton.learnerProfileOptions.map((option, index) => (
                        <AiSuggestionCard key={index} onAdopt={() => editBaseDraft(option)}>
                          <div className="space-y-1"><p><b>已有基础：</b>{option.priorKnowledge}</p><p><b>学习特点：</b>{option.learningNeeds}</p><p><b>熟悉情境：</b>{option.familiarContexts}</p></div>
                        </AiSuggestionCard>
                      ))}
                    </AiSuggestionPanel>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-stone-800">驱动问题</label>
                    <AiFieldButton busy={skeletonLoading} label="AI 生成驱动问题建议" loading={skeletonLoading && activeSuggestionPart === "drivingQuestions"} onClick={() => void requestSkeleton("drivingQuestions")} />
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">一个好的驱动问题有真实对象、开放空间和可完成边界。</p>
                  <textarea
                    className="mt-1 min-h-[100px] w-full rounded-[6px] border border-stone-300 px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    value={draft.drivingQuestion}
                    onChange={(e) => editBaseDraft({ drivingQuestion: e.target.value })}
                    placeholder="我们如何为校园提出一项有证据支持、能够被实际采用的低碳改进方案？"
                  />
                  {skeleton && activeSuggestionPart === "drivingQuestions" ? (
                    <AiSuggestionPanel loading={skeletonLoading} onClose={() => setActiveSuggestionPart(null)} onRefresh={() => void refreshSkeletonPart("drivingQuestions")}>
                      {skeleton.drivingQuestions.map((question, index) => (
                        <AiSuggestionCard key={index} onAdopt={() => editBaseDraft({ drivingQuestion: question })}>{question}</AiSuggestionCard>
                      ))}
                    </AiSuggestionPanel>
                  ) : null}
                </div>
              </div>
            </Card>

            {/* ── PBL 项目配置 ── */}
            <Card className="p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pbl-ai)]">PBL 项目配置</p>
                <h2 className="font-editorial mt-2 text-xl font-semibold">个人项目 + AI 伴学小组</h2>
              </div>
              <div className="mt-5 grid gap-5">
                <div>
                  <label className="text-sm font-bold text-stone-800">项目难度</label>
                  <p className="mt-0.5 text-xs text-stone-500">用于预估知识建构、方案校准和项目实践的时间比例。</p>
                  <select
                    className="mt-2 h-10 w-full rounded-[6px] border border-stone-300 bg-white px-3 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                    value={course.pblConfig?.difficultyLevel ?? "standard"}
                    onChange={(e) => updateCourse(course.id, { pblConfig: normalizePblCourseConfig({ difficultyLevel: e.target.value as "introductory" | "standard" | "advanced", evidenceRequirements: course.pblConfig?.evidenceRequirements ?? DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter((i) => i.required), outcome: course.pblConfig?.outcome ?? { ...DEFAULT_PBL_OUTCOME }, companionIds: (course.pblConfig?.companionIds ?? AI_COMPANIONS.map((c) => c.id as PblCompanionId)) }) })}
                  >
                    <option value="introductory">入门：需要更多示范与引导</option>
                    <option value="standard">标准：知识与实践均衡</option>
                    <option value="advanced">进阶：强调探究、论证与迭代</option>
                  </select>
                </div>
                <fieldset>
                  <legend className="text-sm font-bold text-stone-800">需要整理哪些过程证据？</legend>
                  <p className="mt-1 text-xs text-stone-500">选中的证据会进入生成模板、评价方案和学生阶段提示。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {DEFAULT_PBL_EVIDENCE_REQUIREMENTS.map((item) => {
                      const currentEvidence = (course.pblConfig?.evidenceRequirements ?? DEFAULT_PBL_EVIDENCE_REQUIREMENTS).filter((i) => i.required !== false);
                      const selected = currentEvidence.some((e) => e.kind === item.kind);
                      return (
                        <button
                          key={item.kind}
                          type="button"
                          aria-pressed={selected}
                          className={`flex items-start gap-2 rounded-[6px] border px-2.5 py-2 text-left transition ${selected ? "border-[var(--pbl-ai)] bg-white shadow-sm" : "border-stone-200 bg-stone-50/60 hover:border-[var(--pbl-ai)]/50"}`}
                          onClick={() => updateCourse(course.id, { pblConfig: normalizePblCourseConfig({ difficultyLevel: course.pblConfig?.difficultyLevel ?? "standard", evidenceRequirements: selected ? currentEvidence.filter((e) => e.kind !== item.kind) : [...currentEvidence, { ...item, required: true }], outcome: course.pblConfig?.outcome ?? { ...DEFAULT_PBL_OUTCOME }, companionIds: (course.pblConfig?.companionIds ?? AI_COMPANIONS.map((c) => c.id as PblCompanionId)) }) })}
                        >
                          <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${selected ? "border-[var(--pbl-ai)] bg-[var(--pbl-ai)] text-white" : "border-stone-300 text-transparent"}`}>
                            <Check size={11} />
                          </span>
                          <span>
                            <span className="block text-xs font-semibold">{item.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">{item.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="flex items-center gap-2 text-sm font-bold text-stone-800"><UsersRound size={16} /> AI 伴学小组角色</legend>
                  <p className="mt-1 text-xs text-stone-500">生成器会按阶段调度已选角色。记记固定参与。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {AI_COMPANIONS.map((companion) => {
                      const selected = (course.pblConfig?.companionIds ?? AI_COMPANIONS.map((c) => c.id)).includes(companion.id);
                      const locked = companion.id === "recorder";
                      return (
                        <button
                          key={companion.id}
                          type="button"
                          aria-pressed={selected}
                          className={`flex items-center gap-2.5 rounded-[6px] border px-2.5 py-2 text-left transition ${selected ? "border-[var(--pbl-ai)] bg-white" : "border-stone-200 bg-stone-50/60"}`}
                          onClick={() => {
                            if (locked) return;
                            const currentIds = course.pblConfig?.companionIds ?? AI_COMPANIONS.map((c) => c.id);
                            const newIds = selected ? currentIds.filter((id) => id !== companion.id) : [...currentIds, companion.id];
                            updateCourse(course.id, { pblConfig: normalizePblCourseConfig({ difficultyLevel: course.pblConfig?.difficultyLevel ?? "standard", evidenceRequirements: course.pblConfig?.evidenceRequirements ?? DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter((i) => i.required), outcome: course.pblConfig?.outcome ?? { ...DEFAULT_PBL_OUTCOME }, companionIds: newIds as PblCompanionId[] }) });
                          }}
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm" style={{ backgroundColor: `${companion.color}18` }}>{companion.emoji}</span>
                          <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{companion.name} · {companion.role}</span><span className="block truncate text-[11px] text-stone-500">{companion.description}</span></span>
                          {locked ? <span className="text-[9px] font-bold text-[var(--pbl-ai)]">必选</span> : <CheckCircle2 className={selected ? "text-[var(--pbl-ai)]" : "text-stone-300"} size={15} />}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="border-t border-stone-200 pt-5">
                  <div className="mb-4"><h3 className="text-sm font-bold">结构化成果要求</h3><p className="mt-1 text-xs text-stone-500">每个项目都必须同时包含作品、表达和反思。</p></div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(["artifact", "presentation", "reflection"] as const).map((key) => {
                      const labels: Record<typeof key, string> = { artifact: "作品", presentation: "表达", reflection: "反思" };
                      const placeholders: Record<typeof key, string> = { artifact: "例如：校园节能改进方案、数据报告或交互原型", presentation: "学生如何讲清问题、证据、取舍与价值", reflection: "学生如何说明成长、AI 使用与下一步改进" };
                      const draftKeys: Record<typeof key, keyof CourseBasicsDraft> = { artifact: "outcomeArtifact", presentation: "outcomePresentation", reflection: "outcomeReflection" };
                      return (
                        <label key={key} className="text-sm font-semibold">
                          {labels[key]}
                          <span className="mt-1 block text-xs font-normal text-stone-500">{placeholders[key]}</span>
                          <textarea
                            className="mt-2 min-h-[80px] w-full rounded-[6px] border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                            value={String(draft[draftKeys[key]])}
                            onChange={(e) => editBaseDraft({ [draftKeys[key]]: e.target.value })}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          </div>
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
                    <button
                      type="button"
                      className={cn(
                        "group relative inline-flex h-9 items-center gap-1.5 rounded-[6px] border px-3 text-sm font-semibold transition-colors",
                        content?.interactiveMode
                          ? "border-[var(--pbl-ai)] bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]"
                          : "border-stone-300 bg-white text-stone-500 hover:bg-stone-50"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setContent((c) => c ? { ...c, interactiveMode: !c.interactiveMode } : c);
                      }}
                    >
                      {content?.interactiveMode ? <CheckSquare size={14} /> : <Square size={14} />}
                      互动模式
                      <span className="pointer-events-none absolute -top-1 right-0 translate-x-full opacity-0 transition-opacity group-hover:opacity-100 z-10 ml-2 w-64 rounded-[6px] border border-stone-200 bg-white px-3 py-2 text-xs font-normal leading-5 text-stone-500 shadow-lg">
                        {content?.interactiveMode
                          ? "已开启：AI 授知按“1–2 个讲解页 → 相关互动实践”循环组织，最后可安排综合测验；教师资源保持不变。"
                          : "默认模式不强制互动节奏；开启后会在每组知识讲解后安排相关互动实践，测验不能替代互动。"}
                      </span>
                    </button>
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
                    disabled={busy === key}
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
                    {key === "teachingOutline"
                      ? content?.moduleTimingPlan
                        ? "重新规划时间"
                        : "生成时间安排"
                      : isStepReady(key)
                        ? "重新生成"
                        : "生成"}
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

      <FlowActionBar
        back={<span className="text-xs font-semibold text-[var(--pbl-text-muted)]">{flowStep + 1}/{FLOW_STEPS.length} · {FLOW_STEPS[flowStep].label}</span>}
        persistent
      >
          <button
            className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-stone-200 bg-white px-5 text-sm font-semibold text-stone-600 hover:bg-stone-50"
            onClick={() => saveDraft(true)}
            title={baseDraftDirty ? "保存基础信息与当前备课草稿" : "保存当前备课草稿"}
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
      </FlowActionBar>
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
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">层级深化预览</p>
        <p className="mt-1 text-sm text-stone-600">课程模块是六个宏观时间单元，课程大纲可在同一模块下独立拆分为多个资源。</p>
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
          <p className="text-xs font-semibold text-[var(--pbl-danger)]">有 {(detailsByParent.get("__orphan__") ?? []).length} 个课程大纲资源尚未关联课程模块。</p>
        ) : null}
      </div>
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
            <span className={entry.total ? "text-[var(--pbl-ai)]" : "text-[var(--pbl-danger)]"}>{entry.total ? `${entry.total} 场` : "缺少"}</span>
          </div>
        ))}
      </div> : null}
      {hasOutlines && coverage.missingStageKeys.length ? (
        <p className="mt-3 text-xs leading-5 text-stone-500">未生成场景的阶段（不一定需要教师资源）：{coverage.missingStageKeys.map((key) => labels[key] ?? key).join("、")}</p>
      ) : null}
      {hasOutlines && !coverage.ok ? (
        <div className="mt-3 space-y-1 text-xs leading-5 text-[var(--pbl-warning)]">
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

function AiFieldButton({
  busy,
  label,
  loading,
  onClick,
}: {
  busy: boolean;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid size-7 shrink-0 place-items-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition-colors hover:border-[var(--pbl-ai-border)] hover:bg-[var(--pbl-ai-soft)] hover:text-[var(--pbl-ai)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbl-ai-border)] disabled:cursor-wait disabled:opacity-55"
      disabled={busy}
      onClick={onClick}
      title={label}
      type="button"
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={13} /> : <Lightbulb aria-hidden="true" size={13} />}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function AiSuggestionPanel({
  children,
  loading,
  onClose,
  onRefresh,
}: {
  children: React.ReactNode;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--pbl-ai-border)] bg-[var(--pbl-ai-soft)]/25 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[var(--pbl-ai)]">AI 候选 · 采纳后仍需点击保存</p>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--pbl-ai)] disabled:opacity-50" disabled={loading} onClick={onRefresh} type="button">
            <RefreshCw className={loading ? "animate-spin" : ""} size={11} /> 换一批
          </button>
          <button className="text-xs text-stone-400 hover:text-stone-600" onClick={onClose} type="button">关闭</button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function AiSuggestionCard({ children, onAdopt }: { children: React.ReactNode; onAdopt: () => void }) {
  return (
    <article className="flex min-h-28 flex-col rounded-[8px] border border-white bg-white p-3 text-xs leading-5 text-stone-700 shadow-sm">
      <div className="flex-1">{children}</div>
      <button className="mt-3 self-end font-semibold text-[var(--pbl-ai)] hover:underline" onClick={onAdopt} type="button">采纳此候选</button>
    </article>
  );
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
