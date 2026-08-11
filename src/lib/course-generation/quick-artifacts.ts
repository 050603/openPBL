import type { CourseDesignGenerationArtifact } from "@/lib/session/types";

export type QuickClassroomGenerationEvent = {
  step: string;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes: number;
  ts: number;
};

export type QuickClassroomScenePreview = {
  id: string;
  title: string;
  type: string;
  stageKey?: string;
  stageLabel?: string;
  estimatedDuration?: number;
};

export type QuickClassroomGenerationSnapshot = {
  status: "queued" | "running" | "cancelling" | "cancelled" | "completed" | "failed";
  step: string;
  progress: number;
  message: string;
  scenesGenerated: number;
  totalScenes: number;
  events: QuickClassroomGenerationEvent[];
  result?: {
    id: string;
    scenesCount: number;
    studentSceneCount?: number;
    teacherSceneCount?: number;
    teacherClassroomId?: string;
    qualityReport?: { score?: number; summary?: string };
  } | null;
  requestPreview?: {
    courseTitle?: string;
    sceneOutlines: QuickClassroomScenePreview[];
    enableImageGeneration: boolean;
    enableVideoGeneration: boolean;
    enableTTS: boolean;
    interactiveMode: boolean;
  };
};

const STAGE_LABELS: Record<string, string> = {
  launch: "项目启动",
  "ai-learning": "AI 授知",
  proposal: "方案构思",
  make: "项目实现",
  showcase: "成果汇报",
  reflection: "总结反思",
};

export function buildQuickClassroomArtifacts(
  job: QuickClassroomGenerationSnapshot | null,
): CourseDesignGenerationArtifact[] {
  if (!job) return [];
  const outlines = job.requestPreview?.sceneOutlines ?? [];
  const artifacts: CourseDesignGenerationArtifact[] = [{
    id: "classroom-generation-plan",
    kind: "timeline",
    eyebrow: "课堂内容生成 · 制作计划",
    title: "开始制作可上课的课程内容",
    summary: `${job.totalScenes || outlines.length} 个课堂页面与配套资源`,
    accent: "orange",
    items: summarizeStages(outlines),
  }];

  const completedCount = Math.min(job.scenesGenerated, outlines.length || job.totalScenes);
  const pageMilestones = Math.max(0, Math.ceil(completedCount / 3));
  for (let milestone = 0; milestone < pageMilestones; milestone += 1) {
    const end = Math.min(completedCount, (milestone + 1) * 3);
    const start = milestone * 3;
    const pages = outlines.slice(start, end);
    artifacts.push({
      id: `classroom-pages-${milestone + 1}`,
      kind: "facts",
      eyebrow: `课堂内容生成 · 第 ${start + 1}—${Math.max(start + 1, end)} 页`,
      title: end >= (job.totalScenes || outlines.length) ? "课堂页面制作接近完成" : "正在逐页制作课堂内容",
      summary: `已完成 ${completedCount} / ${job.totalScenes || outlines.length} 个页面`,
      accent: milestone % 2 === 0 ? "blue" : "violet",
      items: pages.length > 0
        ? pages.map((page, index) => ({
            label: `${STAGE_LABELS[page.stageKey ?? ""] ?? page.stageLabel ?? "课堂页面"} · ${start + index + 1}`,
            value: page.title,
            meta: `${resourceLabel(page.type)} · ${formatDuration(page.estimatedDuration)}`,
          }))
        : [{ label: "页面进度", value: `${completedCount} 个页面已经完成` }],
    });
  }

  if (hasAnyStep(job, ["separating_classrooms", "saving_classrooms", "checking_adaptive_resources", "generating_adaptive_resources", "adaptive_resources_ready", "generating_media_assets", "generating_tts_assets", "persisting_assets", "completed"])) {
    artifacts.push({
      id: "classroom-routing",
      kind: "outcome",
      eyebrow: "课堂内容生成 · 内容分流",
      title: "学生课堂与教师资源",
      summary: "课堂主体、教师引导与活动支架",
      accent: "blue",
      items: [
        { label: "学生课堂", value: `${job.result?.studentSceneCount ?? job.scenesGenerated} 个课堂页面` },
        { label: "教师资源", value: job.result?.teacherSceneCount ? `${job.result.teacherSceneCount} 个授课资源` : "正在整理教师引导与活动支架" },
        { label: "课堂关联", value: "主课、教师资源与个性化分支" },
      ],
    });
  }

  if (hasAnyStep(job, ["checking_adaptive_resources", "generating_adaptive_resources", "adaptive_resources_ready"])) {
    const adaptiveMessage = latestMessage(job, ["checking_adaptive_resources", "generating_adaptive_resources", "adaptive_resources_ready"]);
    const adaptive = parseAdaptiveMessage(adaptiveMessage);
    artifacts.push({
      id: "classroom-adaptive-resources",
      kind: "branches",
      eyebrow: "课堂内容生成 · 分层学习资源",
      title: "诊断补缺与达标拓展",
      summary: adaptiveMessage,
      accent: "violet",
      items: [
        ...(adaptive.title ? [{ label: "当前资源", value: adaptive.title, meta: adaptive.progress }] : []),
        { label: "诊断补缺", value: "连接先修知识与主课页面" },
        { label: "达标拓展", value: "按学习证据进入进阶任务" },
      ],
    });
  }

  const options = job.requestPreview;
  if (hasAnyStep(job, ["generating_media_assets"]) && (options?.enableImageGeneration || options?.enableVideoGeneration)) {
    artifacts.push({
      id: "classroom-media-assets",
      kind: "facts",
      eyebrow: "课堂资源生成 · 图片与视频",
      title: "视觉资源正在写入课堂",
      summary: latestMessage(job, ["generating_media_assets"]),
      accent: "orange",
      items: [
        ...(options.enableImageGeneration ? [{ label: "课堂配图", value: "生成、校验并替换页面占位素材" }] : []),
        ...(options.enableVideoGeneration ? [{ label: "课堂视频", value: "生成并绑定适用的视频片段" }] : []),
      ],
    });
  }

  if (hasAnyStep(job, ["generating_tts_assets"]) && options?.enableTTS) {
    artifacts.push({
      id: "classroom-tts-assets",
      kind: "facts",
      eyebrow: "课堂资源生成 · 讲授语音",
      title: "正在合成并校准课堂语音",
      summary: latestMessage(job, ["generating_tts_assets"]),
      accent: "blue",
      items: [
        { label: "语音合成", value: "按页面讲稿生成中文语音" },
        { label: "时长校准", value: "与讲授、思考和互动时间对齐" },
        { label: "页面写入", value: "音频绑定到对应课堂页面" },
      ],
    });
  }

  if (hasAnyStep(job, ["generating_course_cover", "course_cover_ready", "course_cover_failed"])) {
    const failed = hasAnyStep(job, ["course_cover_failed"]);
    artifacts.push({
      id: "classroom-course-cover",
      kind: failed ? "facts" : "audit",
      eyebrow: "课程视觉 · 封面图片",
      title: failed ? "课程封面需要稍后补充" : "正在生成课程专属封面",
      summary: latestMessage(job, ["generating_course_cover", "course_cover_ready", "course_cover_failed"]),
      accent: failed ? "orange" : "green",
      items: [
        { label: "课程主题", value: options?.courseTitle || "本次项目课程" },
        { label: "图片规格", value: "16:9 · 1024×576", meta: "无文字、无标识的主题插画" },
        { label: "保存状态", value: failed ? "可在设计稿中重新生成" : hasAnyStep(job, ["course_cover_ready"]) ? "已写入课程" : "正在生成" },
      ],
    });
  }

  if (hasAnyStep(job, ["generation_resources_ready"])) {
    const coverNeedsAttention = hasAnyStep(job, ["course_cover_failed"])
      && !hasAnyStep(job, ["course_cover_ready"]);
    artifacts.push({
      id: "classroom-resources-ready",
      kind: "audit",
      eyebrow: "课堂资源生成 · 汇总检查",
      title: coverNeedsAttention ? "课堂资源已经就绪" : "课程封面与课堂资源已经就绪",
      summary: latestMessage(job, ["generation_resources_ready"]),
      accent: "green",
      items: [
        { label: "课程封面", value: coverNeedsAttention ? "需要在设计稿中重新生成" : "主题封面已写入课程" },
        { label: "分层学习", value: "诊断补缺与模块拓展已关联" },
        { label: "课堂素材", value: "图片、视频与语音资源已核对" },
        { label: "下一步", value: "正在执行最终保存" },
      ],
    });
  }

  if (hasAnyStep(job, ["persisting_assets", "completed"]) || job.status === "completed") {
    artifacts.push({
      id: "classroom-persisting",
      kind: "audit",
      eyebrow: "课堂内容生成 · 自动保存",
      title: job.status === "completed" ? "课程内容已经生成并保存" : "正在保存并核对课程内容",
      summary: "学生课堂、教师资源与个性化内容",
      accent: "green",
      items: [
        { label: "学生课堂", value: `${job.result?.studentSceneCount ?? job.scenesGenerated} 个学生页面已写入课程` },
        { label: "教师资源", value: `${job.result?.teacherSceneCount ?? 0} 个教师资源页面已关联` },
        { label: "课程存档", value: job.status === "completed" ? "已自动保存" : "正在保存" },
        ...(job.result?.qualityReport?.summary
          ? [{ label: "生成检查", value: job.result.qualityReport.summary }]
          : []),
      ],
    });
  }

  return artifacts;
}

export function resolveQuickClassroomActiveArtifactId(
  job: QuickClassroomGenerationSnapshot | null,
): string | undefined {
  if (!job) return undefined;
  if (job.status === "completed" || job.step === "completed") return "classroom-persisting";
  if (job.step === "persisting_assets") return "classroom-persisting";
  if (job.step === "generation_resources_ready") return "classroom-resources-ready";
  if (["generating_course_cover", "course_cover_ready", "course_cover_failed"].includes(job.step)) return "classroom-course-cover";
  if (job.step === "generating_tts_assets") return "classroom-tts-assets";
  if (job.step === "generating_media_assets") return "classroom-media-assets";
  if (["checking_adaptive_resources", "generating_adaptive_resources", "adaptive_resources_ready"].includes(job.step)) {
    return "classroom-adaptive-resources";
  }
  if (["separating_classrooms", "saving_classrooms"].includes(job.step)) return "classroom-routing";
  if (job.step === "generating_scenes" && job.scenesGenerated > 0) {
    return `classroom-pages-${Math.max(1, Math.ceil(job.scenesGenerated / 3))}`;
  }
  return "classroom-generation-plan";
}

export function combineQuickGenerationProgress(
  designProgress: number,
  classroomProgress: number,
  completed: boolean,
): number {
  if (completed) return 100;
  const designShare = Math.max(0, Math.min(100, designProgress)) * 0.62;
  const classroomShare = Math.max(0, Math.min(100, classroomProgress)) * 0.38;
  return Math.min(99, Math.round(designShare + classroomShare));
}

function hasAnyStep(job: QuickClassroomGenerationSnapshot, steps: string[]): boolean {
  return steps.includes(job.step) || job.events.some((event) => steps.includes(event.step));
}

function latestMessage(job: QuickClassroomGenerationSnapshot, steps: string[]): string {
  return [...job.events].reverse().find((event) => steps.includes(event.step))?.message ?? job.message;
}

function parseAdaptiveMessage(message: string): { title?: string; progress?: string } {
  const match = message.match(/分层学习资源[：:]\s*(.+?)(?:（(已完成\s*\d+\s*\/\s*\d+)）)?$/);
  if (!match) return {};
  return { title: match[1]?.trim(), progress: match[2]?.trim() };
}

function summarizeStages(outlines: QuickClassroomScenePreview[]): CourseDesignGenerationArtifact["items"] {
  const counts = new Map<string, number>();
  for (const outline of outlines) {
    const key = outline.stageKey ?? outline.stageLabel ?? "课堂内容";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [{ label: "课堂页面", value: "正在整理课程结构", meta: "学生课堂与教师资源" }];
  return [...counts.entries()].map(([stage, count]) => ({
    label: STAGE_LABELS[stage] ?? stage,
    value: `${count} 个课堂页面`,
    meta: "学生页面、互动活动与教师资源",
  }));
}

function resourceLabel(type: string): string {
  if (type === "interactive") return "互动页面";
  if (type === "quiz") return "测验页面";
  if (type === "pbl") return "项目活动";
  return "课件页面";
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "按页面内容控制时长";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `约 ${minutes} 分钟`;
}
