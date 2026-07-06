// Domain types for the openPBL classroom demo.

export type CourseStatus =
  | "draft"
  | "preparing"
  | "ready"
  | "teaching"
  | "finished";

export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  draft: "草稿",
  preparing: "备课中",
  ready: "已发布",
  teaching: "授课中",
  finished: "已结束",
};

export type StageViewKey =
  | "project-launch"
  | "ai-learning"
  | "group"
  | "workspace"
  | "showcase"
  | "reflection";

export type Stage = {
  key: string;
  label: string;
  view: StageViewKey;
  description: string;
};

export type GroupMode = "none" | "solo" | "free" | "random" | "assigned";

export type ClassConfig = {
  groupMode: GroupMode;
  totalStudents: number;
  perGroup?: number;
  crossClass?: boolean;
};

export type AnnouncementReply = {
  id: string;
  studentId?: string;
  studentName: string;
  content: string;
  createdAt: string;
};

export type CourseAnnouncement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  replies: AnnouncementReply[];
};

export type CourseTodo = {
  id: string;
  title: string;
  description: string;
  stageKey?: string;
  completedBy: string[];
};

export type CourseResource = {
  id: string;
  title: string;
  type: string;
  size: string;
  description?: string;
  url?: string;
  downloadedBy: string[];
};

export type GroupMemberRole = {
  studentId: string;
  name: string;
  role?: string;
};

export type ProjectGroup = {
  id: string;
  name: string;
  topic: string;
  goal?: string;
  keywords: string[];
  selectedForms: string[];
  members: GroupMemberRole[];
  createdAt: string;
  updatedAt: string;
};

export type GroupAnnouncement = {
  id: string;
  groupId: string;
  title: string;
  content: string;
  actor: string;
  createdAt: string;
};

export type WorkPlanItem = {
  id: string;
  groupId: string;
  role: string;
  memberName: string;
  task: string;
  progress: number;
};

export type WhiteboardNode = {
  id: string;
  groupId: string;
  label: string;
  note?: string;
  x: number;
  y: number;
  color: "blue" | "green" | "orange" | "violet" | "slate";
  parentId?: string;
};

/**
 * A tldraw-based collaborative board snapshot stored per group.
 * The snapshot is opaque to the session layer (we never inspect its internals);
 * we only persist it and pass it back to tldraw for rendering.
 */
export type GroupBoard = {
  groupId: string;
  /** Serialized tldraw TLSnapshot (JSON-serializable). */
  snapshot: unknown;
  /** ISO timestamp of the last persisted update. Used for polling merge. */
  updatedAt: string;
  /** Active tool palette: "mindmap" emphasizes nodes/arrows; "whiteboard" emphasizes draw/text/image. */
  mode: GroupBoardMode;
};

export type GroupBoardMode = "mindmap" | "whiteboard";

export type CourseUpload = {
  id: string;
  courseId: string;
  groupId?: string;
  studentId?: string;
  studentName?: string;
  stageKey: string;
  category: "artifact" | "evidence" | "presentation" | "resource";
  title: string;
  fileName: string;
  fileType: string;
  size: string;
  url: string;
  createdAt: string;
};

export type TeamContribution = {
  id: string;
  courseId: string;
  groupId: string;
  studentId?: string;
  studentName: string;
  percent: number;
  note?: string;
  updatedAt: string;
};

export type AiSupportKind =
  | "launch-prep"
  | "idea-check"
  | "proposal-diagnosis"
  | "artifact-diagnosis"
  | "showcase-coach"
  | "reflection-evidence"
  | "teacher-intervention"
  // 新增：AI 介入模式扩展类型
  | "project-skeleton" // 阶段一：AI 生成项目骨架
  | "direction-suggestion" // 阶段三：AI 项目方向建议
  | "rehearsal" // 阶段四：AI 汇报彩排
  | "peer-question" // 阶段四：AI 同伴评价引导
  | "proposal-review" // 阶段四：教师端 AI 方案诊断摘要
  | "live-evaluation" // 阶段六：AI 实时汇报评价
  | "process-evaluation" // 阶段七：AI 过程性评价报告
  | "growth-advice"; // 阶段七：AI 个性化成长建议

export type AiSupportStatus =
  | "draft"
  | "teacher-confirmed"
  | "student-applied"
  | "dismissed";

/**
 * 标识 AiSupportRecord 的来源：
 * - llm：由真实 LLM 调用生成（统一使用系统 LLM 配置）
 * - local：LLM 不可用或调用失败时，由本地规则函数兜底生成
 */
export type AiSupportSource = "llm" | "local";

export type AiSupportRecord = {
  id: string;
  courseId: string;
  stageKey: string;
  targetType: "student" | "group" | "course";
  targetId: string;
  groupId?: string;
  studentId?: string;
  studentName?: string;
  kind: AiSupportKind;
  trigger: string;
  inputSummary: string;
  diagnosis: string;
  suggestions: string[];
  evidence: string[];
  status: AiSupportStatus;
  /** 标识本记录由 LLM 还是本地规则生成（LLM 不可用时回退到 local） */
  source?: AiSupportSource;
  /**
   * 教师/学生二次编辑后的内容。
   * - diagnosis / suggestions / evidence 均为 AI 原始生成内容，保留不动
   * - editedContent 用于存储人工编辑后的最终采用内容（如编辑后的项目骨架、过程评价报告）
   */
  editedContent?: string;
  /** AI 生成的结构化扩展内容（如项目骨架 JSON、过程评价报告 JSON），用于可编辑展示 */
  structuredPayload?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type CourseUiState = {
  previewUploadId?: string;
  activeGroupId?: string;
  aiPanelCollapsed?: boolean;
  presentationTimerSeconds?: number;
  timerRunning?: boolean;
  /**
   * 教师控制：哪些阶段向学生开放 AI 对话面板。
   * 取 stage.key，如 ["launch", "group", "workspace", "reflection"]。
   * 教师可在授课界面按阶段一键开关，避免学生过度依赖 AI。
   */
  aiChatStagesEnabled?: string[];
  /**
   * 学生端有更新时，系统置位此标志提醒教师。
   * 教师下次进入监控页时主动触发 LLM 重新分析后清除此标志。
   * 避免打断式主动推送：教师自己决定何时刷新。
   */
  aiAnalysisPending?: boolean;
  /** 上次教师主动刷新 AI 分析的时间戳，用于 UI 显示"已刷新 X 分钟前" */
  aiAnalysisRefreshedAt?: string;
};

export type OpenMaicSceneOutlineSnapshot = {
  id: string;
  type?: string;
  title: string;
  description?: string;
  keyPoints?: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  order?: number;
  languageNote?: string;
  suggestedImageIds?: string[];
  mediaGenerations?: unknown[];
  quizConfig?: unknown;
  interactiveConfig?: unknown;
  pblConfig?: unknown;
  widgetType?: string;
  widgetOutline?: unknown;
  [key: string]: unknown;
};

export type StudentAiProgress = {
  classroomId: string;
  studentId: string;
  currentSceneIndex: number;
  totalScenes: number;
  completedScenes: string[];
  quizScore?: number;
  lastActiveAt: string;
  masteryLevel: "not-started" | "in-progress" | "completed" | "mastered";
};

export type Course = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  hours: number;
  summary: string;
  drivingQuestion: string;
  status: CourseStatus;
  stages: Stage[];
  currentStageIndex: number;
  content: CourseContent;
  classConfig?: ClassConfig;
  inviteCode?: string;
  students: Student[];
  submissions?: ClassroomSubmission[];
  feedback?: TeacherFeedback[];
  rubricScores?: RubricScore[];
  reflections?: ReflectionRecord[];
  activityLog?: ActivityRecord[];
  presentingGroupId?: string;
  announcements?: CourseAnnouncement[];
  todos?: CourseTodo[];
  resources?: CourseResource[];
  groups?: ProjectGroup[];
  groupAnnouncements?: GroupAnnouncement[];
  workPlan?: WorkPlanItem[];
  whiteboard?: WhiteboardNode[];
  /** tldraw snapshots for collaborative group boards, keyed by groupId. */
  boards?: GroupBoard[];
  uploads?: CourseUpload[];
  teamContributions?: TeamContribution[];
  aiSupports?: AiSupportRecord[];
  uiState?: CourseUiState;
  /** OpenMAIC AI 课堂 ID（生成后关联） */
  aiLearningClassroomId?: string;
  /** 学生在 AI 课堂中的学习进度，key 为 studentId */
  aiLearningProgress?: Record<string, StudentAiProgress>;
  createdAt: string;
  updatedAt: string;
};

export type CourseContent = {
  pblOutline: string;
  knowledgePoints: KnowledgePoint[];
  lessonOutline: LessonOutlineSection[];
  evaluationPlan: EvaluationPlan;
  /** 临时字段：OpenMAIC classroom ID（迁移期间使用） */
  _openmaicClassroomId?: string;
  /** 临时字段：OpenMAIC classroom 场景数 */
  _openmaicScenesCount?: number;
  /** Confirmed OpenMAIC outline snapshot used by the final classroom generator. */
  _openmaicSceneOutlines?: OpenMaicSceneOutlineSnapshot[];
};

export type KnowledgePoint = {
  id: string;
  name: string;
  description: string;
};

export type LessonOutlineSection = {
  id: string;
  stageKey: string;
  title: string;
  objectives: string[];
  activities: string[];
  durationMin: number;
};

export type EvaluationPlan = {
  dimensions: EvaluationDimension[];
  overallRubric: string;
};

export type EvaluationDimension = {
  id: string;
  name: string;
  weight: number;
  description: string;
};

export type Student = {
  id: string;
  name: string;
  joinedAt: string;
  stageProgress: Record<string, number>;
  /** ISO timestamp of the student's last heartbeat. Used to derive online status. */
  lastSeenAt?: string;
};

export type ClassroomSubmission = {
  id: string;
  courseId: string;
  studentId?: string;
  studentName?: string;
  groupId?: string;
  stageKey: string;
  type:
    | "idea"
    | "plan"
    | "document"
    | "resource"
    | "showcase"
    | "reflection"
    | "evidence";
  title: string;
  content: string;
  files?: { name: string; type: string; size?: string; url?: string }[];
  createdAt: string;
  updatedAt: string;
};

export type TeacherFeedback = {
  id: string;
  courseId: string;
  targetType: "student" | "group" | "course";
  targetId: string;
  stageKey: string;
  kind: "comment" | "question" | "ai-support" | "revision" | "praise";
  content: string;
  createdAt: string;
};

export type RubricScore = {
  id: string;
  courseId: string;
  groupId: string;
  stageKey: string;
  dimensionScores: Record<string, number>;
  comment: string;
  total: number;
  status: "draft" | "submitted" | "passed" | "revision";
  createdAt: string;
  updatedAt: string;
};

export type ReflectionRecord = {
  id: string;
  courseId: string;
  studentId: string;
  studentName: string;
  content: string;
  improvementPlan?: string;
  createdAt: string;
  updatedAt: string;
};

export type ActivityRecord = {
  id: string;
  actor: string;
  action: string;
  detail?: string;
  createdAt: string;
};

export type SessionSnapshot = {
  courses: Course[];
  updatedAt: string;
};

export type AiProviderSettings = {
  endpoint: string;
  model: string;
  apiKey?: string;
  updatedAt?: string;
};

export type PublicAiProviderSettings = Omit<AiProviderSettings, "apiKey"> & {
  hasApiKey: boolean;
};

export const DEFAULT_STAGES: Stage[] = [
  {
    key: "launch",
    label: "项目启动",
    view: "project-launch",
    description: "项目导入，明确驱动问题与目标",
  },
  {
    key: "ai-learning",
    label: "AI授知",
    view: "ai-learning",
    description: "AI辅助知识学习与基础概念建构",
  },
  {
    key: "group",
    label: "小组构思",
    view: "group",
    description: "小组组建、选题与方案方向讨论",
  },
  {
    key: "review",
    label: "方案汇报",
    view: "workspace",
    description: "中期方案汇报与教师纠偏",
  },
  {
    key: "make",
    label: "项目制作",
    view: "workspace",
    description: "项目方案执行与作品制作",
  },
  {
    key: "showcase",
    label: "最终展示",
    view: "showcase",
    description: "成果展示与现场汇报",
  },
  {
    key: "reflection",
    label: "评价反思",
    view: "reflection",
    description: "综合评价与个人成长反思",
  },
];

export const GROUP_MODE_LABEL: Record<GroupMode, string> = {
  none: "不分组（全班统一）",
  solo: "一人一组（独立完成）",
  free: "按学生自由组队",
  random: "按系统自动分组",
  assigned: "按教师指定分组",
};
