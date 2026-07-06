import type {
  Course,
  CourseAnnouncement,
  CourseResource,
  CourseTodo,
  EvaluationDimension,
  KnowledgePoint,
  LessonOutlineSection,
  ProjectGroup,
  Stage,
  WhiteboardNode,
  WorkPlanItem,
} from "./types";
import { DEFAULT_STAGES } from "./types";

function nowMinus(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const sampleKnowledgePoints: KnowledgePoint[] = [
  { id: "kp-1", name: "碳中和与碳循环", description: "理解碳排放源、自然与人工碳汇的平衡机制。" },
  { id: "kp-2", name: "能源利用与转化", description: "分析不同能源形式的转化效率与碳排放强度。" },
  { id: "kp-3", name: "低碳技术与创新", description: "识别校园可落地的节能、减废、回收技术方案。" },
  { id: "kp-4", name: "资源循环利用", description: "理解垃圾分类、回收链路与循环闭环设计。" },
  { id: "kp-5", name: "生态系统与环境保护", description: "认识校园生态系统的服务功能与保护策略。" },
  { id: "kp-6", name: "可持续发展策略", description: "运用社会、经济、环境三重底线评估方案价值。" },
];

const sampleLessonOutline: LessonOutlineSection[] = [
  {
    id: "lo-1",
    stageKey: "ai-learning",
    title: "AI讲解：生成式AI基础与项目应用",
    objectives: ["理解生成式AI的基本概念与典型应用", "掌握提示词编写的基本方法"],
    activities: ["AI讲解视频", "案例学习", "随堂测验"],
    durationMin: 45,
  },
  {
    id: "lo-2",
    stageKey: "ai-learning",
    title: "AI讲解：低碳技术与校园应用",
    objectives: ["了解主流低碳技术分类", "识别校园场景中的低碳切入点"],
    activities: ["AI讲解", "小组讨论", "概念检测"],
    durationMin: 45,
  },
];

const sampleEvaluationDimensions: EvaluationDimension[] = [
  { id: "ev-1", name: "问题识别与分析", weight: 20, description: "把握驱动问题背景、范围与关键变量。" },
  { id: "ev-2", name: "方案创新性", weight: 20, description: "方案是否有新意、是否回应真实痛点。" },
  { id: "ev-3", name: "可行性与实施路径", weight: 25, description: "实施步骤、资源、风险与成本是否清晰。" },
  { id: "ev-4", name: "数据与论证充分性", weight: 15, description: "数据来源、引用与论证链是否可靠。" },
  { id: "ev-5", name: "展示与表达", weight: 10, description: "汇报结构、视觉呈现与现场表达质量。" },
  { id: "ev-6", name: "团队协作", weight: 10, description: "分工、沟通、互助与任务推进情况。" },
];

export function makeSeedCourses(): Course[] {
  const content = baseSeedContent();
  return [
    makeCourse({
      id: "course-low-carbon",
      name: "校园低碳生活解决方案",
      subject: "环境科学",
      grade: "高一",
      hours: 16,
      status: "teaching",
      currentStageIndex: 2,
      inviteCode: "A2K9QP",
      students: [
        { id: "s-1", name: "李明轩", joinedAt: nowMinus(0), stageProgress: { launch: 100, "ai-learning": 80, group: 30 } },
        { id: "s-2", name: "王思涵", joinedAt: nowMinus(0), stageProgress: { launch: 100, "ai-learning": 60, group: 25 } },
        { id: "s-3", name: "张子豪", joinedAt: nowMinus(0), stageProgress: { launch: 100, "ai-learning": 100, group: 65 } },
      ],
      classConfig: { groupMode: "free", totalStudents: 32, perGroup: 4 },
      content,
    }),
    makeCourse({
      id: "course-ai-art",
      name: "AI与艺术创作",
      subject: "信息技术",
      grade: "高二",
      hours: 12,
      status: "ready",
      currentStageIndex: 0,
      content: {
        pblOutline: "学生以小组形式调研AI创作工具，制定创作方案并完成一件AI辅助创作作品。",
        knowledgePoints: sampleKnowledgePoints.slice(0, 4),
        lessonOutline: sampleLessonOutline,
        evaluationPlan: content.evaluationPlan,
      },
    }),
    makeCourse({
      id: "course-smart-city",
      name: "智慧城市与公共服务",
      subject: "综合实践",
      grade: "高三",
      hours: 20,
      status: "ready",
      currentStageIndex: 0,
      content: {
        pblOutline: "通过调研访谈与原型设计，提出智慧公共服务的优化方案。",
        knowledgePoints: sampleKnowledgePoints.slice(2),
        lessonOutline: sampleLessonOutline,
        evaluationPlan: content.evaluationPlan,
      },
    }),
  ];
}

function makeCourse(input: Partial<Course> & Pick<Course, "id" | "name" | "subject" | "grade" | "hours" | "status" | "currentStageIndex" | "content">): Course {
  const now = nowMinus(1);
  return {
    summary: "围绕真实校园问题开展调研、构思、制作、汇报与评价，训练人机协同的问题解决能力。",
    drivingQuestion: "校园内能源浪费、一次性用品使用过多、垃圾分类不规范等问题普遍存在，如何通过创新方案推动校园低碳生活方式的形成？",
    stages: DEFAULT_STAGES,
    students: [],
    submissions: [],
    feedback: [],
    rubricScores: [],
    reflections: [],
    activityLog: [],
    announcements: sampleAnnouncements(),
    todos: sampleTodos(),
    resources: sampleResources(),
    groups: sampleGroups(),
    groupAnnouncements: [],
    workPlan: sampleWorkPlan(),
    whiteboard: sampleWhiteboard(),
    uploads: [],
    teamContributions: [],
    uiState: {},
    createdAt: nowMinus(12),
    updatedAt: now,
    ...input,
  };
}

function sampleTodos(): CourseTodo[] {
  return [
    { id: "todo-read-brief", title: "阅读项目说明", description: "了解项目背景、目标与成果要求。", stageKey: "launch", completedBy: [] },
    { id: "todo-pick-direction", title: "选择兴趣方向", description: "选择你想研究的校园低碳切入点。", stageKey: "launch", completedBy: [] },
    { id: "todo-join-group", title: "加入小组", description: "选择或创建小组，开启协作。", stageKey: "launch", completedBy: [] },
  ];
}

function sampleResources(): CourseResource[] {
  return [
    { id: "res-brief", title: "项目说明书_校园低碳生活解决方案.pdf", type: "PDF", size: "1.2 MB", description: "项目背景、任务说明与成果要求", url: "/api/uploads?file=demo-project-brief.txt", downloadedBy: [] },
    { id: "res-data", title: "校园低碳生活现状调研数据.xlsx", type: "XLSX", size: "58 KB", description: "示例调研数据与统计模板", url: "/api/uploads?file=demo-campus-data.txt", downloadedBy: [] },
    { id: "res-rubric", title: "评价量规与汇报标准.pdf", type: "PDF", size: "890 KB", description: "评分维度、权重与汇报建议", url: "/api/uploads?file=demo-rubric.txt", downloadedBy: [] },
  ];
}

function sampleAnnouncements(): CourseAnnouncement[] {
  const now = nowMinus(0);
  return [
    {
      id: "ann-kickoff",
      title: "项目启动安排",
      content: "请先阅读项目说明，完成兴趣方向选择，并在本节课内加入或创建小组。",
      pinned: true,
      replies: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sampleGroups(): ProjectGroup[] {
  const now = nowMinus(0);
  return [
    {
      id: "group-green",
      name: "绿色校园行动小组",
      topic: "校园低碳生活推广方案",
      goal: "通过调研与宣传机制设计，推动低碳行为在校园持续发生。",
      keywords: ["低碳生活", "行为改变", "数据驱动", "校园场景"],
      selectedForms: ["方案报告", "数据看板"],
      members: [
        { studentId: "s-1", name: "李明轩", role: "组长" },
        { studentId: "s-2", name: "王思涵", role: "调研负责人" },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sampleWorkPlan(): WorkPlanItem[] {
  return [
    { id: "task-1", groupId: "group-green", role: "组长", memberName: "李明轩", task: "整体规划与进度把控", progress: 60 },
    { id: "task-2", groupId: "group-green", role: "调研负责人", memberName: "王思涵", task: "问卷调研与数据分析", progress: 80 },
    { id: "task-3", groupId: "group-green", role: "内容负责人", memberName: "张子豪", task: "方案内容撰写与资料整理", progress: 50 },
  ];
}

function sampleWhiteboard(): WhiteboardNode[] {
  return [
    { id: "node-root", groupId: "group-green", label: "校园低碳生活推广方案", x: 45, y: 45, color: "green" },
    { id: "node-problem", groupId: "group-green", label: "问题洞察", x: 24, y: 26, color: "blue", parentId: "node-root" },
    { id: "node-path", groupId: "group-green", label: "执行路径", x: 70, y: 28, color: "violet", parentId: "node-root" },
    { id: "node-evaluate", groupId: "group-green", label: "评估优化", x: 66, y: 68, color: "green", parentId: "node-root" },
    { id: "node-strategy", groupId: "group-green", label: "核心策略", x: 28, y: 70, color: "orange", parentId: "node-root" },
  ];
}

function baseSeedContent() {
  return {
    pblOutline:
      "本课程以“校园低碳生活”为驱动问题，引导学生调研校园能源、垃圾分类、绿色出行等现状，结合所学知识与AI工具提出可落地的低碳生活解决方案，并通过实践验证其推广价值。",
    knowledgePoints: sampleKnowledgePoints,
    lessonOutline: sampleLessonOutline,
    evaluationPlan: {
      dimensions: sampleEvaluationDimensions,
      overallRubric: "总分由六个维度加权得出，权重合计100%。各维度得分0-100，最终按权重折算。",
    },
  };
}

export const SAMPLE_COURSE_CONTENT = baseSeedContent();

export function makeSeedStages(): Stage[] {
  return DEFAULT_STAGES;
}
