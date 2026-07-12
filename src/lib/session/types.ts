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

export type ProjectionMode = "forced" | "optional";
export type ProjectedEngineMode = "idle" | "playing" | "paused" | "live";

export type ProjectionPlaybackSnapshot = {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: string[];
  sceneId?: string;
};

export type TeacherResourceProjection = {
  classroomId: string;
  sceneId: string;
  stageKey: string;
  title: string;
  sceneType: TeacherResourceScene["type"];
  startedAt: string;
  mode?: ProjectionMode;
  version?: number;
  updatedAt?: string;
  engineMode?: ProjectedEngineMode;
  playback?: ProjectionPlaybackSnapshot;
  /**
   * 互动场景状态快照（仅 interactive 类型场景使用）。
   * 教师端在 iframe 内操作时由桥接脚本广播出 state-broadcast 消息，
   * 经 InteractiveIframeHost 捕获后写入此字段；
   * 学生端读取此字段并通过 postMessage apply-state 应用到对应 iframe。
   * null/undefined 表示尚无互动状态需要同步。
   */
  interactionState?: Record<string, unknown> | null;
};

export type LearningEventType =
  | "scene-enter"
  | "scene-leave"
  | "heartbeat"
  | "scene-replay"
  | "interaction-result"
  | "artifact-change"
  | "stage-enter"
  | "stage-goal-complete";

export type LearningEvent = {
  id: string;
  idempotencyKey: string;
  courseId: string;
  studentId: string;
  stageKey: string;
  sceneId?: string;
  type: LearningEventType;
  occurredAt: string;
  durationMs?: number;
  expectedDurationSec?: number;
  visible?: boolean;
  progressMarker?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CompanionMessageVisibility = "student-and-teacher" | "teacher-only";
export type CompanionMessageRole = "student" | "agent" | "teacher-guidance" | "system-trigger";
export type CompanionTriggerKind =
  | "stage-opening"
  | "idle"
  | "no-progress"
  | "artifact-stalled"
  | "document-saved"
  | "file-uploaded"
  | "teacher-goal"
  | "milestone";

export type CompanionMessage = {
  id: string;
  role: CompanionMessageRole;
  content: string;
  createdAt: string;
  visibility: CompanionMessageVisibility;
  companionId?: string;
  authorId?: string;
  authorName?: string;
  triggerKind?: CompanionTriggerKind;
};

export type CompanionThread = {
  id: string;
  courseId: string;
  studentId: string;
  stageKey: string;
  messages: CompanionMessage[];
  openingSentAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LearningSignalKind =
  | "dwell-overrun"
  | "repeated-playback"
  | "idle"
  | "conversation-no-progress"
  | "goal-stalled";
export type InterventionStatus = "open" | "handled" | "resolved" | "dismissed";

export type LearningSignal = {
  id: string;
  courseId: string;
  studentId: string;
  stageKey: string;
  sceneId?: string;
  kind: LearningSignalKind;
  severity: "notice" | "warning" | "high";
  status: InterventionStatus;
  title: string;
  summary: string;
  normalizedIssueKey: string;
  evidenceEventIds: string[];
  aiInterventionAttempts: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  handledAt?: string;
  resolvedAt?: string;
};

export type ClassCommonIssue = {
  id: string;
  courseId: string;
  stageKey: string;
  normalizedIssueKey: string;
  title: string;
  summary: string;
  severity: "warning" | "high";
  studentIds: string[];
  signalIds: string[];
  status: InterventionStatus;
  firstDetectedAt: string;
  lastDetectedAt: string;
  handledAt?: string;
  resolvedAt?: string;
};

export type TeacherDirectiveStatus = "active" | "goal-completed" | "revoked";

export type TeacherAgentDirective = {
  id: string;
  courseId: string;
  stageKey: string;
  targetStudentIds: string[];
  targetScope: "student" | "multiple" | "course";
  goal: string;
  instruction: string;
  successCriteria: string[];
  status: TeacherDirectiveStatus;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  revokedAt?: string;
};

export type OfflineInterventionKind = "patrol" | "individual-guidance" | "whole-class-teaching";

export type OfflineInterventionRecord = {
  id: string;
  courseId: string;
  stageKey: string;
  kind: OfflineInterventionKind;
  targetStudentIds: string[];
  signalIds: string[];
  note?: string;
  teacherName: string;
  createdAt: string;
};

export type DynamicFacilitationScaffold = {
  id: string;
  courseId: string;
  stageKey: string;
  kind: "proposal-critique" | "artifact-critique" | "common-issue" | "presentation-summary";
  title: string;
  sections: Array<{ id: string; title: string; prompt: string; evidenceSlots: string[] }>;
  status: "template" | "draft" | "teacher-confirmed";
  filledContent?: string;
  evidenceIds: string[];
  generatedAt: string;
  updatedAt: string;
  confirmedAt?: string;
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
  signalId?: string;
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
  /** 已由教师处理的规则型介入信号 ID，避免刷新后重新出现。 */
  resolvedInterventionSignalIds?: string[];
  stageTransitions?: StageTransitionRecord[];
  evaluations?: EvaluationRecord[];
  uiState?: CourseUiState;
  /** OpenMAIC AI 课堂 ID（生成后关联） */
  aiLearningClassroomId?: string;
  /** 教师授课资源 OpenMAIC 课堂 ID（课程引入+PBL讲解，供教师 PPT 预览播放） */
  teacherClassroomId?: string;
  /** 学生在 AI 课堂中的学习进度，key 为 studentId */
  aiLearningProgress?: Record<string, StudentAiProgress>;
  /** 学生学习行为的结构化、幂等事件流。 */
  learningEvents?: LearningEvent[];
  /** 学生与伴学圆桌的后端持久化会话。 */
  companionThreads?: CompanionThread[];
  /** 由确定性规则从学习事件和会话中派生的个体信号。 */
  learningSignals?: LearningSignal[];
  /** 达到班级阈值的共性问题。 */
  classCommonIssues?: ClassCommonIssue[];
  /** 教师对单人、多人与全班 Agent 下发的目标指令。 */
  teacherAgentDirectives?: TeacherAgentDirective[];
  /** AI 授知阶段的线下巡视、个别辅导与全班讲解记录。 */
  offlineInterventions?: OfflineInterventionRecord[];
  /** 课堂前生成框架、课堂中基于真实证据填充的主持支架。 */
  dynamicFacilitationScaffolds?: DynamicFacilitationScaffold[];
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
  /** 阶段六教师课程总结演示（只填充已获得的班级证据）。 */
  courseSummaryPresentation?: CourseSummaryPresentation;
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

export type CourseSummarySlide = {
  id: string;
  title: string;
  bullets: string[];
  speakerNotes: string;
  evidenceIds: string[];
};

export type CourseSummaryPresentation = {
  id: string;
  title: string;
  generatedAt: string;
  updatedAt: string;
  status: "draft" | "teacher-confirmed";
  slides: CourseSummarySlide[];
  script: string;
  evidenceIds: string[];
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
  generationMode?: "predictable" | "dynamic-scaffold";
  scaffoldKind?: DynamicFacilitationScaffold["kind"];
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
  /** 是否计入最终成绩；学生反思保留为非计分流程。 */
  scored?: boolean;
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
  { id: "evaluation-ai", sourceRole: "ai", name: "AI 过程与专业评价", weight: 40, evidenceRequirements: ["学习过程与产物推进", "AI 协作健康度", "方案迭代与证据", "专业准确性、逻辑与可行性"], enabled: true, scored: true },
  { id: "evaluation-teacher", sourceRole: "teacher", name: "教师现场汇报评价", weight: 60, evidenceRequirements: ["现场汇报与答辩", "成果呈现", "课堂规范与通用能力", "项目价值理解"], enabled: true, scored: true },
  { id: "evaluation-self", sourceRole: "self", name: "学生课程反思", weight: 0, evidenceRequirements: ["课程收获与困难", "成长总结", "后续改进与迁移计划"], enabled: true, scored: false },
];

export type EvaluationDimension = {
  id: string;
  name: string;
  weight: number;
  description: string;
  responsibleRole?: "ai" | "teacher";
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
    key: "proposal",
    label: "方案构思与校准",
    view: "proposal-review",
    description: "独立形成项目方案，在 AI 伴学与教师指导下校准方向",
  },
  {
    key: "make",
    label: "项目实践",
    view: "project-making",
    description: "独立完成核心作品，在 AI 伴学支持下持续迭代",
  },
  {
    key: "showcase",
    label: "成果汇报与评价",
    view: "showcase",
    description: "公开呈现个人项目成果，由教师评价作品与表达",
  },
  {
    key: "reflection",
    label: "学习反思",
    view: "reflection",
    description: "回顾个人项目过程，反思 AI 使用并形成迁移计划",
  },
];

export const GROUP_MODE_LABEL: Record<GroupMode, string> = {
  none: "不分组（全班统一）",
  solo: "一人一组（独立完成）",
  free: "按学生自由组队",
  random: "按系统自动分组",
  assigned: "按教师指定分组",
};
