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
  | "proposal-review"
  | "project-making"
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
  proposal?: ProjectProposal;
  teacherApproval?: {
    status: "pending" | "approved" | "revision";
    teacherName?: string;
    note?: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProjectProposal = {
  projectQuestion: string;
  outcomeFormat: string;
  implementationPlan: string;
  requiredKnowledge: string[];
  aiUsePlan: string;
  risks: string[];
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
 * - local：仅用于历史数据或显式标记的规则诊断，不作为 AI 调用失败兜底
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
  /** 标识本记录由 LLM 还是显式规则诊断生成；AI 调用失败时不再自动回退到 local。 */
  source?: AiSupportSource;
  /**
   * 教师/学生二次编辑后的内容。
   * - diagnosis / suggestions / evidence 均为 AI 原始生成内容，保留不动
   * - editedContent 用于存储人工编辑后的最终采用内容（如编辑后的项目骨架、过程评价报告）
   */
  editedContent?: string;
  /** AI 生成的结构化扩展内容（如项目骨架 JSON、过程评价报告 JSON），用于可编辑展示 */
  structuredPayload?: unknown;
  adoption?: {
    decision: "adopted" | "adopted-after-edit" | "rejected";
    reason?: string;
    before?: string;
    after?: string;
    handledBy: string;
    handledAt: string;
  };
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
  /** 教师当前投屏的 OpenMAIC 授课资源；null 表示已停止投屏。 */
  teacherResourceProjection?: TeacherResourceProjection | null;
};

export type TeacherResourceProjection = {
  classroomId: string;
  sceneId: string;
  stageKey: string;
  title: string;
  sceneType: TeacherResourceScene["type"];
  startedAt: string;
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
  currentGoals?: string[];
  achievedGoals?: string[];
  unmetGoals?: string[];
  pathAdjustmentReason?: string;
  currentTeachingAction?: string;
  nextStageCondition?: string;
};

export type TeacherInterventionScope = "student" | "group" | "course";
export type TeacherInterventionAction =
  | "guidance"
  | "scope-adjustment"
  | "regroup"
  | "evaluation-requirement"
  | "pause-ai"
  | "request-reasoning"
  | "override-stage";

export type TeacherIntervention = {
  id: string;
  stageKey: string;
  scope: TeacherInterventionScope;
  targetIds: string[];
  reason: string;
  evidence: string[];
  action: TeacherInterventionAction;
  instruction: string;
  severity: "notice" | "warning" | "high";
  status: "open" | "resolved";
  teacherName: string;
  createdAt: string;
  resolvedAt?: string;
};

export type StageTransitionRecord = {
  id: string;
  fromStageKey: string;
  toStageKey: string;
  gateStatus: "passed" | "overridden";
  blockers: string[];
  warnings: string[];
  overrideReason?: string;
  actor: string;
  createdAt: string;
};

export type Course = {
  id: string;
  name: string;
  subject: string;
  grade: string;
  hours: number;
  summary: string;
  drivingQuestion: string;
  learningObjectives?: string[];
  expectedOutcome?: string;
  status: CourseStatus;
  stages: Stage[];
  currentStageIndex: number;
  content: CourseContent;
  classConfig?: ClassConfig;
  inviteCode?: string;
  /** AI 生成的项目封面图 URL */
  coverImageUrl?: string;
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
  teacherInterventions?: TeacherIntervention[];
  stageTransitions?: StageTransitionRecord[];
  evaluations?: EvaluationRecord[];
  uiState?: CourseUiState;
  /** OpenMAIC AI 课堂 ID（生成后关联） */
  aiLearningClassroomId?: string;
  /** 教师授课资源 OpenMAIC 课堂 ID（课程引入+PBL讲解，供教师 PPT 预览播放） */
  teacherClassroomId?: string;
  /** 学生在 AI 课堂中的学习进度，key 为 studentId */
  aiLearningProgress?: Record<string, StudentAiProgress>;
  createdAt: string;
  updatedAt: string;
};

export type CourseContent = {
  pblOutline: string;
  knowledgePoints: KnowledgePoint[];
  knowledgeGraph?: KnowledgeGraph;
  /**
   * 教师备课阶段确认的整节课程授课大纲。
   * 粒度接近教案：说明教师、平台与 AI 在每个教学活动中的分工。
   */
  teachingOutline?: TeachingOutlineSection[];
  lessonOutline: LessonOutlineSection[];
  evaluationPlan: EvaluationPlan;
  /** 临时字段：OpenMAIC classroom ID（迁移期间使用） */
  _openmaicClassroomId?: string;
  /** 临时字段：OpenMAIC classroom 场景数 */
  _openmaicScenesCount?: number;
  /** Confirmed OpenMAIC outline snapshot used by the final classroom generator. */
  _openmaicSceneOutlines?: OpenMaicSceneOutlineSnapshot[];
  /**
   * 教师授课资源：从 OpenMAIC 生成结果中拆分出的课程引入与 PBL 题目讲解内容。
   * 这些内容不会出现在学生 AI 授知课堂中，仅供教师在授课时使用。
   */
  teacherResources?: TeacherResources;
  /** 教师授课资源对应的 OpenMAIC classroom ID（用于 PPT 预览播放） */
  teacherClassroomId?: string;
};

/**
 * 教师授课资源：课程引入 + PBL 题目讲解
 */
export type TeacherResources = {
  /** 资源生成时间（ISO） */
  generatedAt: string;
  /** 教师资源场景列表 */
  scenes: TeacherResourceScene[];
};

export type TeacherResourceScene = {
  id: string;
  /** 场景角色：课程引入 / PBL 题目讲解 / 其他课堂演示资源 */
  role: "introduction" | "pbl-topic" | "teaching-aid";
  /** 对应课程阶段 key。旧数据可能没有，由课堂端按角色与标题推断。 */
  stageKey?: string;
  /** 场景标题 */
  title: string;
  /** OpenMAIC 场景真实类型。 */
  type: "slide" | "quiz" | "interactive" | "pbl";
  /** 大纲描述 */
  description: string;
  /** 核心要点 */
  keyPoints: string[];
  /** 讲稿文本（从 speech action 汇总） */
  script?: string;
};

export type KnowledgePoint = {
  id: string;
  name: string;
  description: string;
  keyInfo?: string;
  relatedIds?: string[];
};

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  description: string;
  keyInfo?: string;
  level?: "foundation" | "core" | "application" | "extension";
  relatedLessonIds?: string[];
  position?: { x: number; y: number };
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type TeachingOutlineSection = {
  id: string;
  stageKey: string;
  title: string;
  durationMin: number;
  teachingGoal: string;
  teacherRole: string;
  platformRole: string;
  aiRole: string;
  studentActivity: string;
  knowledgePointIds?: string[];
  openMaicUse?: "none" | "student-ai-learning" | "teacher-resource";
  resourceTypes?: Array<
    "ppt" | "interactive-demo" | "script" | "worksheet" | "rubric" | "project-brief"
  >;
  notes?: string;
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
  flows?: EvaluationFlow[];
};

export type EvaluationSourceRole = "ai" | "teacher" | "peer" | "self";

export type EvaluationFlow = {
  id: string;
  sourceRole: EvaluationSourceRole;
  name: string;
  weight: number;
  evidenceRequirements: string[];
  enabled: boolean;
};

export type EvaluationRecord = {
  id: string;
  courseId: string;
  stageKey: string;
  sourceRole: EvaluationSourceRole;
  targetType: "student" | "group";
  targetId: string;
  score?: number;
  comment: string;
  evidence: string[];
  status: "draft" | "submitted" | "confirmed";
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_EVALUATION_FLOWS: EvaluationFlow[] = [
  { id: "evaluation-ai", sourceRole: "ai", name: "AI 过程评价", weight: 25, evidenceRequirements: ["学习目标达成记录", "AI 支架与采纳记录"], enabled: true },
  { id: "evaluation-teacher", sourceRole: "teacher", name: "教师项目与汇报评价", weight: 50, evidenceRequirements: ["项目作品版本", "汇报与答辩记录"], enabled: true },
  { id: "evaluation-peer", sourceRole: "peer", name: "学生互评", weight: 15, evidenceRequirements: ["同伴反馈与回应"], enabled: true },
  { id: "evaluation-self", sourceRole: "self", name: "学生自评", weight: 10, evidenceRequirements: ["个人反思与判断说明"], enabled: true },
];

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
  sourceRole?: "ai" | "teacher" | "peer";
  sourceName?: string;
  evidence?: string[];
  status?: "open" | "resolved";
  createdAt: string;
};

export type RubricScore = {
  id: string;
  courseId: string;
  groupId: string;
  stageKey: string;
  dimensionScores: Record<string, number>;
  teacherTotal?: number;
  aiDimensionScores?: Record<string, number>;
  aiTotal?: number | null;
  finalTotal?: number;
  scoringMode?: "teacher" | "hybrid" | "ai-import";
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
    label: "方案汇报与纠偏",
    view: "proposal-review",
    description: "中期方案汇报与教师纠偏",
  },
  {
    key: "make",
    label: "项目制作",
    view: "project-making",
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
