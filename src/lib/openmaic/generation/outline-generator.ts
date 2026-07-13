/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@openmaic/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  SceneResourceType,
  PblDetailKind,
  PdfImage,
  ImageMapping,
} from '@openmaic/lib/types/generation';
import type { WidgetType } from '@openmaic/lib/types/widgets';
import { buildPrompt, PROMPT_IDS } from '@openmaic/lib/prompts';
import { formatPblCourseConfigForPrompt } from '@/lib/pbl-course-config';
import {
  PBL_STAGE_DEFINITIONS,
  formatPblStageDefinitionsForPrompt,
  PBL_REQUIRED_TEACHER_RESOURCE_STAGE_KEYS,
} from '@/lib/openmaic/pbl/course-template';
import { normalizePblStageKey } from '@/lib/pbl-time-model';
import { rescalePblDetailDurations } from '@/lib/pbl-time-model';
import { formatImageDescription, formatImagePlaceholder } from './prompt-formatters';
import { parseJsonResponse } from './json-repair';
import { uniquifyMediaElementIds } from './scene-builder';
import type { AICallFn, GenerationResult, GenerationCallbacks } from './pipeline-types';
import { createLogger } from '@openmaic/lib/logger';
const log = createLogger('Generation');

/**
 * Used when the outline stage fails to produce an explicit directive (LLM
 * schema regression, empty response, upstream error). Downstream prompts
 * still need *something* that steers the model toward the requirement's
 * language rather than defaulting to the training-distribution prior.
 */
export const DEFAULT_LANGUAGE_DIRECTIVE =
  'Teach in the language that matches the user requirement.';

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
  },
): Promise<
  GenerationResult<{ languageDirective: string; courseTitle?: string; outlines: SceneOutline[] }>
> {
  // Build available images description for the prompt
  let availableImagesText = 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions
      availableImagesText = pdfImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media snippet conditions based on enabled flags.
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  const mediaEnabled = imageEnabled || videoEnabled;
  const hasSourceImages = (pdfImages?.length ?? 0) > 0;

  // Use simplified prompt variables
  const isPblCourse = requirements.pblProfile?.generationTemplate === 'pbl-six-stage';
  const promptId = isPblCourse
    ? PROMPT_IDS.PBL_COURSE
    : PROMPT_IDS.REQUIREMENTS_TO_OUTLINES;
  const prompts = buildPrompt(promptId, {
    // New simplified variables
    requirement: requirements.requirement,
    pdfContent: pdfText ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS) : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    hasSourceImages,
    imageEnabled,
    videoEnabled,
    mediaEnabled,
    researchContext: options?.researchContext || 'None',
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
    pblProfile: requirements.pblProfile
      ? formatPblCourseConfigForPrompt(requirements.pblProfile)
      : '',
    pblStages: isPblCourse ? formatPblStageDefinitionsForPrompt() : '',
    requiredTeacherResourceStages: isPblCourse
      ? PBL_REQUIRED_TEACHER_RESOURCE_STAGE_KEYS.join(', ')
      : '',
  });

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const parsed = parseJsonResponse<
      { languageDirective: string; courseTitle?: string; outlines: SceneOutline[] } | SceneOutline[]
    >(response);

    let languageDirective: string;
    let courseTitle: string | undefined;
    let rawOutlines: SceneOutline[];

    if (Array.isArray(parsed)) {
      // Fallback: LLM returned old flat array format
      languageDirective = DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed;
    } else if (parsed && parsed.outlines) {
      languageDirective = parsed.languageDirective || DEFAULT_LANGUAGE_DIRECTIVE;
      // courseTitle is optional — only honor a non-empty string, and cap its
      // length defensively (the prompt asks for ≤30 chars, but older/hallucinating
      // models may return far more). The downstream Stage.name column is bounded too.
      const rawTitle = parsed.courseTitle;
      courseTitle =
        typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 120) : undefined;
      rawOutlines = parsed.outlines;
    } else {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    if (!Array.isArray(rawOutlines)) {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    // Ensure IDs and order
    const enriched = rawOutlines.map((outline, index) => ({
      ...outline,
      id: outline.id || nanoid(),
      order: index + 1,
    }));

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const result = uniquifyMediaElementIds(
      enforcePblOutlineContract(enriched, requirements),
    );

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: { languageDirective, courseTitle, outlines: result } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig OR widgetType+widgetOutline → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function sanitizeProceduralSkillOutline(outline: SceneOutline): SceneOutline {
  const widgetOutline = { ...(outline.widgetOutline ?? {}) };
  delete widgetOutline.procedureType;
  delete widgetOutline.task;
  delete widgetOutline.tools;
  delete widgetOutline.steps;
  delete widgetOutline.successCriteria;
  delete widgetOutline.errorConsequences;

  return {
    ...outline,
    type: 'interactive',
    widgetType: 'diagram',
    description: outline.description
      ? `${outline.description} Present this as a process or structure diagram.`
      : 'Present this topic as a process or structure diagram.',
    widgetOutline,
  };
}

export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
  options: { allowProceduralSkill?: boolean; personalProject?: boolean } = {},
): SceneOutline {
  const normalizedOutline = normalizeInteractiveIntent(outline);
  // Ultra Mode: interactive scenes with widgetType + widgetOutline are valid
  const hasWidgetConfig = normalizedOutline.widgetType && normalizedOutline.widgetOutline;

  if (normalizedOutline.widgetType === 'procedural-skill' && !options.allowProceduralSkill) {
    log.warn(`Procedural-skill outline "${normalizedOutline.title}" is not enabled, falling back to diagram`);
    return sanitizeProceduralSkillOutline(normalizedOutline);
  }

  if (normalizedOutline.type === 'interactive' && !normalizedOutline.interactiveConfig && !hasWidgetConfig) {
    log.warn(
      `Interactive outline "${normalizedOutline.title}" missing widget config, using a simulation config`,
    );
    return {
      ...normalizedOutline,
      type: 'interactive',
      widgetType: 'simulation',
      widgetOutline: { concept: normalizedOutline.title },
    };
  }
  if (options.personalProject && normalizedOutline.type === 'pbl') {
    log.warn(
      `Personal-project outline "${normalizedOutline.title}" uses the legacy PBL scene type, falling back to a non-group slide`,
    );
    const withoutPblConfig = { ...normalizedOutline };
    delete withoutPblConfig.pblConfig;
    return { ...withoutPblConfig, type: 'slide' };
  }
  if (normalizedOutline.type === 'pbl' && (!normalizedOutline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${normalizedOutline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...normalizedOutline, type: 'slide' };
  }
  return normalizedOutline;
}

/**
 * Enforce the parts of the PBL generation contract that must not depend on an
 * LLM remembering a prompt instruction. In particular, every non-AI-learning
 * teaching activity gets a teacher-only support outline, and interactive
 * learning requests retain their interactive output type.
 */
export function enforcePblOutlineContract(
  outlines: SceneOutline[],
  requirements: UserRequirements,
): SceneOutline[] {
  if (requirements.pblProfile?.generationTemplate !== 'pbl-six-stage') return outlines;

  const normalized = outlines.map((outline) => {
    const next = normalizeInteractiveIntent({
      ...outline,
      ...(normalizePblStageKey(outline.stageKey)
        ? { stageKey: normalizePblStageKey(outline.stageKey) }
        : {}),
    });
    const stage = PBL_STAGE_DEFINITIONS.find((item) => item.key === next.stageKey);
    if (!stage) {
      // An unlabelled PBL outline is never allowed to become student content
      // by position or by its generated type. Keep it on the teacher side and
      // make the missing phase visible to the coverage checker.
      return normalizePblDetailMetadata({
        ...next,
        type: 'slide' as const,
        audience: 'teacher' as const,
        generationPurpose: 'facilitation-scaffold' as const,
        resourceTypes: ['ppt', 'script'] as SceneResourceType[],
      });
    }

    if (stage.key === 'ai-learning') {
      return normalizePblDetailMetadata({
        ...next,
        stageLabel: next.stageLabel ?? stage.label,
        audience: 'student' as const,
        generationPurpose: 'knowledge-teaching' as const,
      });
    }

    return normalizePblDetailMetadata({
      ...next,
      type: 'slide' as const,
      stageLabel: next.stageLabel ?? stage.label,
      audience: 'teacher' as const,
      generationPurpose:
        next.generationPurpose === 'teacher-resource'
          ? 'teacher-resource' as const
          : 'facilitation-scaffold' as const,
      resourceTypes: ['ppt', 'script'] as SceneResourceType[],
    });
  });
  const activities = requirements.pblTeachingActivities ?? [];
  for (const activity of activities) {
    const activityStageKey = normalizePblStageKey(activity.stageKey) ?? activity.stageKey;
    const existing = normalized.find(
      (outline) =>
        outline.audience === 'teacher' &&
        (outline.activityId === activity.activityId || outline.parentActivityId === activity.activityId),
    );
    if (activityStageKey === 'ai-learning') {
      continue;
    }
    if (existing) {
      existing.audience = 'teacher';
      existing.generationPurpose =
        existing.generationPurpose === 'teacher-resource'
          ? 'teacher-resource'
          : 'facilitation-scaffold';
      existing.stageKey = activityStageKey;
      existing.stageLabel =
        PBL_STAGE_DEFINITIONS.find((item) => item.key === activityStageKey)?.label;
      existing.resourceTypes = ['ppt', 'script'];
      const normalizedExisting = normalizeInteractiveIntent(existing);
      Object.assign(
        existing,
        normalizePblDetailMetadata({
          ...normalizedExisting,
          activityId: existing.activityId ?? activity.activityId,
          parentActivityId: existing.parentActivityId ?? activity.activityId,
          estimatedDuration: existing.estimatedDuration ?? activity.durationMin * 60,
        }),
      );
      continue;
    }

    const stage = PBL_STAGE_DEFINITIONS.find((item) => item.key === activityStageKey);
    const teacherSupportPurpose =
      activityStageKey === 'launch' || activityStageKey === 'showcase'
        ? 'teacher-resource'
        : 'facilitation-scaffold';

    normalized.push({
      id: `teacher-activity-${activity.activityId}`,
      type: 'slide',
      title: `教师支架：${activity.title}`,
      description: `${activity.requirement}${activity.teacherRole}`,
      keyPoints: [
        activity.teachingGoal,
        activity.teacherRole,
        activity.platformRole,
        activity.aiRole,
        activity.studentActivity,
      ].filter(Boolean),
      estimatedDuration: Math.max(60, activity.durationMin * 60),
      order: normalized.length + 1,
      stageKey: activityStageKey,
      stageLabel: stage?.label ?? activityStageKey,
      audience: 'teacher',
      generationPurpose: teacherSupportPurpose,
      activityId: activity.activityId,
      parentActivityId: activity.activityId,
      detailKind:
        activityStageKey === 'launch'
          ? 'teacher-introduction'
          : activityStageKey === 'showcase'
            ? 'showcase-coaching'
            : 'project-scaffold',
      targetDurationSec: Math.max(60, activity.durationMin * 60),
      ttsPolicy: 'none',
      resourceTypes: ['ppt', 'script'] as SceneResourceType[],
      companionIds: requirements.pblProfile.companionIds,
      companionPrompt: `围绕课堂活动“${activity.title}”提供教师主持提示，并记录学生实际证据。`,
    });
  }

  let withMetadata = normalized.map((outline) => {
    const parentActivity = requirements.pblActivityCatalog?.find(
      (activity) =>
        activity.activityId === outline.parentActivityId ||
        activity.activityId === outline.activityId,
    );
    const isStudentKnowledge =
      outline.audience === 'student' && outline.stageKey === 'ai-learning';
    const withCatalogDefaults: SceneOutline = {
      ...outline,
      ...(parentActivity && !outline.parentActivityId
        ? { parentActivityId: parentActivity.activityId }
        : {}),
      ...(parentActivity && outline.targetDurationSec === undefined
        ? { targetDurationSec: Math.max(60, parentActivity.durationMin * 60) }
        : {}),
      ...(isStudentKnowledge &&
      parentActivity &&
      (!outline.knowledgePointIds || outline.knowledgePointIds.length === 0)
        ? { knowledgePointIds: [...parentActivity.knowledgePointIds] }
        : {}),
    };
    return normalizePblDetailMetadata(withCatalogDefaults, parentActivity?.activityId);
  });
  const requiredKnowledgePoints = requirements.knowledgePoints ?? [];
  const requiredKnowledgeIds = new Set(requiredKnowledgePoints.map((point) => point.id).filter(Boolean));
  const studentIndexes = withMetadata
    .map((outline, index) => ({ outline, index }))
    .filter(({ outline }) => outline.audience === 'student' && outline.stageKey === 'ai-learning');
  const coveredKnowledgeIds = new Set(
    studentIndexes.flatMap(({ outline }) => outline.knowledgePointIds ?? []),
  );
  const missingKnowledgeIds = Array.from(requiredKnowledgeIds).filter(
    (id) => !coveredKnowledgeIds.has(id),
  );
  if (missingKnowledgeIds.length > 0 && studentIndexes.length > 0) {
    const targetIndex = studentIndexes[0].index;
    const target = withMetadata[targetIndex];
    const missingNames = requiredKnowledgePoints
      .filter((point) => missingKnowledgeIds.includes(point.id))
      .map((point) => point.name || point.id);
    withMetadata = withMetadata.map((outline, index) =>
      index === targetIndex
        ? {
            ...outline,
            knowledgePointIds: Array.from(
              new Set([...(outline.knowledgePointIds ?? []), ...missingKnowledgeIds]),
            ),
            keyPoints: Array.from(
              new Set([...(outline.keyPoints ?? []), ...missingNames.map((name) => `知识点：${name}`)]),
            ),
            description: `${outline.description} 本场景还需覆盖：${missingNames.join('、')}。`,
          }
        : outline,
    );
    log.warn(
      `PBL knowledge coverage was incomplete; attached ${missingKnowledgeIds.length} missing points to ${target.title}`,
    );
  }
  const parentActivities = (requirements.pblActivityCatalog ?? []).map((activity) => ({
    id: activity.activityId,
    durationMin: activity.durationMin,
  }));
  return rescalePblDetailDurations<SceneOutline>(withMetadata, parentActivities).map(
    (outline, index) => ({ ...outline, order: index }),
  );
}

const PBL_DETAIL_KINDS = new Set<PblDetailKind>([
  'teacher-introduction',
  'knowledge-explanation',
  'interactive-practice',
  'project-scaffold',
  'project-practice',
  'showcase-coaching',
  'reflection-transfer',
  'other',
]);

function defaultPblDetailKind(outline: SceneOutline): PblDetailKind {
  if (outline.audience === 'teacher') {
    if (outline.stageKey === 'launch') return 'teacher-introduction';
    if (outline.stageKey === 'showcase') return 'showcase-coaching';
    if (outline.stageKey === 'reflection') return 'reflection-transfer';
    return 'project-scaffold';
  }
  if (outline.stageKey === 'ai-learning') {
    return outline.type === 'interactive' ? 'interactive-practice' : 'knowledge-explanation';
  }
  return 'other';
}

function normalizePblDetailMetadata(
  outline: SceneOutline,
  fallbackActivityId?: string,
): SceneOutline {
  const parentActivityId =
    outline.parentActivityId?.trim() || outline.activityId?.trim() || fallbackActivityId?.trim();
  const detailKind = PBL_DETAIL_KINDS.has(outline.detailKind as PblDetailKind)
    ? outline.detailKind
    : defaultPblDetailKind(outline);
  const targetDurationSec =
    typeof outline.targetDurationSec === 'number' && Number.isFinite(outline.targetDurationSec)
      ? Math.max(0, Math.round(outline.targetDurationSec))
      : typeof outline.estimatedDuration === 'number' && Number.isFinite(outline.estimatedDuration)
        ? Math.max(0, Math.round(outline.estimatedDuration))
        : undefined;
  const isStudentKnowledge =
    outline.audience === 'student' && outline.stageKey === 'ai-learning';

  return {
    ...outline,
    ...(parentActivityId ? { parentActivityId } : {}),
    ...(detailKind ? { detailKind } : {}),
    ...(targetDurationSec !== undefined ? { targetDurationSec } : {}),
    ttsPolicy: isStudentKnowledge ? outline.ttsPolicy ?? 'target-duration' : 'none',
  };
}

function normalizeInteractiveIntent(outline: SceneOutline): SceneOutline {
  if (outline.audience === 'teacher') {
    return {
      ...outline,
      type: 'slide',
      resourceTypes: ['ppt', 'script'] as SceneResourceType[],
    };
  }

  const text = [outline.title, outline.description, ...(outline.keyPoints ?? [])]
    .join(' ')
    .toLowerCase();
  const isAiLearningStudent = outline.stageKey === 'ai-learning' && outline.audience === 'student';
  const requestsCode = outline.resourceTypes?.includes('code-interactive') ||
    /\bcode\b|编程|代码|python|javascript|typescript/.test(text);
  const requestsInteractive = outline.resourceTypes?.includes('interactive-demo') ||
    outline.resourceTypes?.includes('code-interactive') ||
    Boolean(outline.widgetType);

  if (!isAiLearningStudent && outline.type !== 'interactive') {
    return outline;
  }
  if (outline.type !== 'interactive' && !requestsInteractive) return outline;

  const widgetType: WidgetType = requestsCode
    ? 'code'
    : outline.widgetType && outline.widgetType !== 'procedural-skill'
      ? outline.widgetType
      : 'simulation';
  const widgetOutline = {
    ...(outline.widgetOutline ?? {}),
    concept: outline.widgetOutline?.concept || outline.title,
    ...(widgetType === 'code' ? { language: outline.widgetOutline?.language || 'python' } : {}),
  };

  return {
    ...outline,
    ...(requestsInteractive ? { type: 'interactive' as const } : {}),
    widgetType,
    widgetOutline,
  };
}
