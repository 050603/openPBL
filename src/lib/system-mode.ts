import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import type { CourseGenerationTemplate } from "@/lib/pbl-course-config";
import type {
  Course,
  CourseContent,
  CourseGenerationModeSnapshot,
  Stage,
} from "@/lib/session/types";
import { DEFAULT_STAGES } from "@/lib/session/types";

export type OpenPblSystemMode = "legacy" | "new";

const NEW_SYSTEM_STAGES: readonly Stage[] = [
  {
    key: "launch",
    label: "项目启动",
    view: "simple-resource",
    description: "查看教师发布的项目说明与授课资源",
  },
  {
    key: "ai-learning",
    label: "知识讲授",
    view: "ai-learning",
    description: "分节学习核心知识，通过节末小测与 AI 助教讲解及时巩固",
  },
  {
    key: "make",
    label: "项目实践",
    view: "ai-collaboration",
    description: "在文档或代码工作台中与 AI 组员协作完成项目成果",
  },
  {
    key: "showcase",
    label: "成果汇报与评价",
    view: "showcase-reporting",
    description: "查看最终成果、申请汇报并跟随课堂同步展示",
  },
  {
    key: "reflection",
    label: "学习反思",
    view: "reflection-survey",
    description: "用约 3–5 分钟回顾课程收获与系统使用体验",
  },
];

export function resolveOpenPblSystemMode(value?: string | null): OpenPblSystemMode {
  return value?.trim().toLowerCase() === "new" ? "new" : "legacy";
}

export function getOpenPblSystemMode(): OpenPblSystemMode {
  return resolveOpenPblSystemMode(process.env.NEXT_PUBLIC_OPENPBL_SYSTEM_MODE);
}

export function isNewOpenPblSystem(): boolean {
  return getOpenPblSystemMode() === "new";
}

export function getStagesForSystemMode(
  mode: OpenPblSystemMode = getOpenPblSystemMode(),
): Stage[] {
  const source = mode === "new" ? NEW_SYSTEM_STAGES : DEFAULT_STAGES;
  return source.map((stage) => ({ ...stage }));
}

export function generationTemplateForSystemMode(
  mode: OpenPblSystemMode = getOpenPblSystemMode(),
): CourseGenerationTemplate {
  return mode === "new" ? "new-ai-learning-only" : "pbl-six-stage";
}

function cloneCourseContent(content: CourseContent): CourseContent {
  return {
    ...content,
    knowledgePoints: [...(content.knowledgePoints ?? [])],
    lessonOutline: [...(content.lessonOutline ?? [])],
    teachingOutline: content.teachingOutline
      ? [...content.teachingOutline]
      : undefined,
    _openmaicSceneOutlines: content._openmaicSceneOutlines
      ? [...content._openmaicSceneOutlines]
      : undefined,
  };
}

function snapshotCourseGeneration(course: Course): CourseGenerationModeSnapshot {
  return {
    aiLearningClassroomId: course.aiLearningClassroomId,
    teacherClassroomId: course.teacherClassroomId,
    dynamicFacilitationScaffolds: course.dynamicFacilitationScaffolds
      ? [...course.dynamicFacilitationScaffolds]
      : undefined,
    content: cloneCourseContent(course.content),
  };
}

function deriveNewSystemSnapshot(
  source: CourseGenerationModeSnapshot,
): CourseGenerationModeSnapshot {
  const sceneOutlines = (source.content._openmaicSceneOutlines ?? []).filter(
    (outline) =>
      outline.stageKey === "ai-learning"
      && outline.audience !== "teacher",
  );
  return {
    aiLearningClassroomId:
      source.aiLearningClassroomId ?? source.content._openmaicClassroomId,
    teacherClassroomId: undefined,
    dynamicFacilitationScaffolds: [],
    content: {
      ...cloneCourseContent(source.content),
      pblOutline: "",
      projectMainline: undefined,
      teachingOutline: (source.content.teachingOutline ?? []).filter(
        (section) => section.stageKey === "ai-learning",
      ),
      lessonOutline: (source.content.lessonOutline ?? []).filter(
        (section) => section.stageKey === "ai-learning",
      ),
      _openmaicSceneOutlines: sceneOutlines,
      _openmaicScenesCount: sceneOutlines.length,
      moduleTimingPlan: undefined,
      teacherResources: undefined,
      teacherClassroomId: undefined,
      adaptiveLearningPlan: undefined,
      designGenerationTrace: undefined,
    },
  };
}

function inferGenerationMode(course: Course): OpenPblSystemMode {
  if (course.uiState?.activeGenerationMode) {
    return course.uiState.activeGenerationMode;
  }
  return course.pblConfig?.generationTemplate === "new-ai-learning-only"
    ? "new"
    : "legacy";
}

/**
 * Select the content snapshot that belongs to the active launch mode. Saving
 * both snapshots keeps a new-system regeneration from destroying an existing
 * six-stage course prepared with the legacy command.
 */
export function reconcileCourseGenerationMode(
  course: Course,
  targetMode: OpenPblSystemMode = getOpenPblSystemMode(),
): Course {
  const sourceMode = inferGenerationMode(course);
  const currentSnapshot = snapshotCourseGeneration(course);
  const snapshots: Partial<
    Record<OpenPblSystemMode, CourseGenerationModeSnapshot>
  > = {
    ...(course.uiState?.systemGenerationByMode ?? {}),
    [sourceMode]: currentSnapshot,
  };
  const selected = snapshots[targetMode]
    ?? (targetMode === "new"
      ? deriveNewSystemSnapshot(currentSnapshot)
      : currentSnapshot);
  snapshots[targetMode] = selected;

  return {
    ...course,
    aiLearningClassroomId: selected.aiLearningClassroomId,
    teacherClassroomId: selected.teacherClassroomId,
    dynamicFacilitationScaffolds:
      selected.dynamicFacilitationScaffolds ?? [],
    content: cloneCourseContent(selected.content),
    pblConfig: normalizePblCourseConfig({
      ...course.pblConfig,
      generationTemplate: generationTemplateForSystemMode(targetMode),
    }),
    uiState: {
      ...(course.uiState ?? {}),
      activeGenerationMode: targetMode,
      systemGenerationByMode: snapshots,
    },
  };
}

export function inferStageCollectionMode(
  stages: readonly Pick<Stage, "key">[] | undefined,
): OpenPblSystemMode | undefined {
  if (!stages?.length) return undefined;
  const keys = stages.map((stage) => stage.key);
  if (
    keys.length === NEW_SYSTEM_STAGES.length
    && keys.every((key, index) => key === NEW_SYSTEM_STAGES[index]?.key)
  ) {
    return "new";
  }
  if (keys.includes("proposal") || keys.length === DEFAULT_STAGES.length) {
    return "legacy";
  }
  return undefined;
}

export function mapStageKeyToSystemMode(
  stageKey: string | undefined,
  mode: OpenPblSystemMode,
): string {
  if (mode === "legacy") {
    return DEFAULT_STAGES.some((stage) => stage.key === stageKey)
      ? stageKey!
      : "launch";
  }
  if (stageKey === "launch" || stageKey === "ai-learning") return stageKey;
  if (stageKey === "showcase" || stageKey === "reflection") return stageKey;
  return "make";
}

export function collaborationBackHref(courseId: string): string {
  return isNewOpenPblSystem()
    ? "/student"
    : `/student/classroom/${courseId}`;
}
