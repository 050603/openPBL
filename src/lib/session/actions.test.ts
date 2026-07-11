import { describe, expect, it } from "vitest";
import {
  applySessionAction,
  initialSessionState,
  normalizeCourse,
  type SessionAction,
  type SessionState,
} from "./actions";
import type { Course, CourseUpload, GroupBoard, Student } from "./types";
import { DEFAULT_STAGES } from "./types";

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "测试课程",
    subject: "科学",
    grade: "六年级",
    hours: 8,
    summary: "测试摘要",
    drivingQuestion: "如何节能？",
    status: "teaching",
    stages: DEFAULT_STAGES,
    currentStageIndex: 0,
    content: {
      pblOutline: "大纲",
      knowledgePoints: [],
      lessonOutline: [],
      evaluationPlan: { dimensions: [], overallRubric: "" },
    },
    students: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeStudent(id: string, name: string): Student {
  return { id, name, joinedAt: "2024-01-01T00:00:00.000Z", stageProgress: {} };
}

function stateWithCourses(...courses: Course[]): SessionState {
  return { ...initialSessionState(), courses, hydrated: true };
}

describe("applySessionAction — JOIN_CLASS", () => {
  it("adds the student to the course and sets joinedCourseId/studentId/studentName", () => {
    const course = makeCourse();
    const state = stateWithCourses(course);
    const student = makeStudent("s1", "张三");

    const next = applySessionAction(state, {
      type: "JOIN_CLASS",
      payload: { courseId: course.id, student },
    });

    expect(next.joinedCourseId).toBe(course.id);
    expect(next.studentId).toBe("s1");
    expect(next.studentName).toBe("张三");
    expect(next.courses[0].students).toHaveLength(1);
    expect(next.courses[0].students[0].name).toBe("张三");
    expect(next.courses[0].groups).toHaveLength(1);
    expect(next.courses[0].groups?.[0]).toMatchObject({
      id: "grp-s1",
      name: "张三的个人项目",
      members: [{ studentId: "s1", name: "张三", role: "项目负责人" }],
    });
  });

  it("does not duplicate the student if they already joined", () => {
    const student = makeStudent("s1", "张三");
    const course = makeCourse({ students: [student] });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "JOIN_CLASS",
      payload: { courseId: course.id, student },
    });

    expect(next.courses[0].students).toHaveLength(1);
  });

  it("adds an activity log entry", () => {
    const course = makeCourse();
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "JOIN_CLASS",
      payload: { courseId: course.id, student: makeStudent("s1", "张三") },
    });

    expect(next.courses[0].activityLog).toBeDefined();
    expect(next.courses[0].activityLog!.length).toBeGreaterThan(0);
    expect(next.courses[0].activityLog![0].actor).toBe("张三");
    expect(next.courses[0].activityLog![0].action).toBe("加入课堂");
  });
});

describe("applySessionAction — LEAVE_CLASS", () => {
  it("removes the student and their personal project space", () => {
    const student = makeStudent("s1", "张三");
    const course = makeCourse({
      students: [student],
      groups: [
        {
          id: "g1",
          name: "第1组",
          topic: "待确定选题方向",
          keywords: [],
          selectedForms: [],
          members: [{ studentId: "s1", name: "张三", role: "成员" }],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "LEAVE_CLASS",
      payload: { courseId: course.id, studentId: "s1" },
    });

    expect(next.courses[0].students).toHaveLength(0);
    expect(next.courses[0].groups).toHaveLength(0);
  });

  it("clears joinedCourseId/studentId when the leaving student is the current user", () => {
    const student = makeStudent("s1", "张三");
    const course = makeCourse({ students: [student] });
    const state: SessionState = {
      ...stateWithCourses(course),
      joinedCourseId: course.id,
      studentId: "s1",
      studentName: "张三",
    };

    const next = applySessionAction(state, {
      type: "LEAVE_CLASS",
      payload: { courseId: course.id, studentId: "s1" },
    });

    expect(next.joinedCourseId).toBeUndefined();
    expect(next.studentId).toBeUndefined();
    expect(next.studentName).toBeUndefined();
  });
});

describe("applySessionAction — UPDATE_STUDENT_PROGRESS", () => {
  it("updates the stage progress for the specified student", () => {
    const student = makeStudent("s1", "张三");
    const course = makeCourse({ students: [student] });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "UPDATE_STUDENT_PROGRESS",
      payload: { courseId: course.id, studentId: "s1", stageKey: "showcase", value: 85 },
    });

    expect(next.courses[0].students[0].stageProgress.showcase).toBe(85);
  });

  it("does not change currentStageIndex", () => {
    const student = makeStudent("s1", "张三");
    const course = makeCourse({ students: [student], currentStageIndex: 3 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "UPDATE_STUDENT_PROGRESS",
      payload: { courseId: course.id, studentId: "s1", stageKey: "make", value: 100 },
    });

    expect(next.courses[0].currentStageIndex).toBe(3);
  });

  it("preserves other students' progress", () => {
    const s1 = makeStudent("s1", "张三");
    const s2 = makeStudent("s2", "李四");
    const course = makeCourse({ students: [s1, s2] });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "UPDATE_STUDENT_PROGRESS",
      payload: { courseId: course.id, studentId: "s1", stageKey: "make", value: 50 },
    });

    expect(next.courses[0].students[0].stageProgress.make).toBe(50);
    expect(next.courses[0].students[1].stageProgress.make).toBeUndefined();
  });
});

describe("applySessionAction — ADVANCE_STAGE", () => {
  it("advances the stage index by 1", () => {
    const course = makeCourse({ currentStageIndex: 2 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "ADVANCE_STAGE",
      payload: { id: course.id, direction: 1 },
    });

    expect(next.courses[0].currentStageIndex).toBe(3);
  });

  it("does not advance past the last stage", () => {
    const course = makeCourse({ currentStageIndex: DEFAULT_STAGES.length - 1 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "ADVANCE_STAGE",
      payload: { id: course.id, direction: 1 },
    });

    expect(next.courses[0].currentStageIndex).toBe(DEFAULT_STAGES.length - 1);
  });

  it("does not go below stage 0", () => {
    const course = makeCourse({ currentStageIndex: 0 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "ADVANCE_STAGE",
      payload: { id: course.id, direction: -1 },
    });

    expect(next.courses[0].currentStageIndex).toBe(0);
  });

  it("stops teacher resource projection when the stage changes", () => {
    const course = makeCourse({
      uiState: {
        teacherResourceProjection: {
          classroomId: "teacher-classroom",
          sceneId: "scene-1",
          stageKey: "launch",
          title: "课程引入",
          sceneType: "slide",
          startedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    });

    const next = applySessionAction(stateWithCourses(course), {
      type: "ADVANCE_STAGE",
      payload: { id: course.id, direction: 1 },
    });

    expect(next.courses[0].uiState?.teacherResourceProjection).toBeNull();
  });
});

describe("applySessionAction — UPSERT_UPLOAD", () => {
  it("adds a new upload to the course", () => {
    const course = makeCourse();
    const state = stateWithCourses(course);
    const upload: CourseUpload = {
      id: "u1",
      courseId: course.id,
      groupId: "g1",
      stageKey: "showcase",
      category: "artifact",
      title: "研究报告",
      fileName: "report.pdf",
      fileType: "PDF",
      size: "1.2 MB",
      url: "/api/uploads?file=report.pdf",
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const next = applySessionAction(state, {
      type: "UPSERT_UPLOAD",
      payload: { courseId: course.id, upload },
    });

    expect(next.courses[0].uploads).toHaveLength(1);
    expect(next.courses[0].uploads![0].fileName).toBe("report.pdf");
  });

  it("updates an existing upload with the same id", () => {
    const existing: CourseUpload = {
      id: "u1",
      courseId: "course-1",
      stageKey: "showcase",
      category: "artifact",
      title: "旧标题",
      fileName: "old.pdf",
      fileType: "PDF",
      size: "1 MB",
      url: "/api/uploads?file=old.pdf",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const course = makeCourse({ uploads: [existing] });
    const state = stateWithCourses(course);

    const updated: CourseUpload = { ...existing, title: "新标题", fileName: "new.pdf" };
    const next = applySessionAction(state, {
      type: "UPSERT_UPLOAD",
      payload: { courseId: course.id, upload: updated },
    });

    expect(next.courses[0].uploads).toHaveLength(1);
    expect(next.courses[0].uploads![0].title).toBe("新标题");
    expect(next.courses[0].uploads![0].fileName).toBe("new.pdf");
  });
});

describe("applySessionAction — UPSERT_GROUP_BOARD", () => {
  it("creates a new board when none exists for the group", () => {
    const course = makeCourse();
    const state = stateWithCourses(course);
    const board: GroupBoard = {
      groupId: "g1",
      snapshot: { schema: {} },
      updatedAt: "2024-01-01T00:00:00.000Z",
      mode: "mindmap",
    };

    const next = applySessionAction(state, {
      type: "UPSERT_GROUP_BOARD",
      payload: { courseId: course.id, board },
    });

    expect(next.courses[0].boards).toHaveLength(1);
    expect(next.courses[0].boards![0].groupId).toBe("g1");
    expect(next.courses[0].boards![0].mode).toBe("mindmap");
  });

  it("replaces an existing board for the same group", () => {
    const existing: GroupBoard = {
      groupId: "g1",
      snapshot: { old: true },
      updatedAt: "2024-01-01T00:00:00.000Z",
      mode: "mindmap",
    };
    const course = makeCourse({ boards: [existing] });
    const state = stateWithCourses(course);

    const updated: GroupBoard = {
      groupId: "g1",
      snapshot: { new: true },
      updatedAt: "2024-01-02T00:00:00.000Z",
      mode: "whiteboard",
    };
    const next = applySessionAction(state, {
      type: "UPSERT_GROUP_BOARD",
      payload: { courseId: course.id, board: updated },
    });

    expect(next.courses[0].boards).toHaveLength(1);
    expect(next.courses[0].boards![0].mode).toBe("whiteboard");
    expect(next.courses[0].boards![0].updatedAt).toBe("2024-01-02T00:00:00.000Z");
  });
});

describe("applySessionAction — HYDRATE", () => {
  it("replaces the entire state with the payload", () => {
    const oldState = stateWithCourses(makeCourse());
    const newCourse = makeCourse({ id: "course-2", name: "新课程" });
    const newState: SessionState = {
      ...initialSessionState(),
      courses: [newCourse],
      hydrated: true,
      updatedAt: "2024-06-01T00:00:00.000Z",
    };

    const next = applySessionAction(oldState, {
      type: "HYDRATE",
      payload: newState,
    });

    expect(next.courses).toHaveLength(1);
    expect(next.courses[0].id).toBe("course-2");
    expect(next.courses[0].name).toBe("新课程");
  });
});

describe("applySessionAction — SET_PREVIEW_UPLOAD", () => {
  it("sets previewUploadId in uiState", () => {
    const course = makeCourse();
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "SET_PREVIEW_UPLOAD",
      payload: { courseId: course.id, uploadId: "u1" },
    });

    expect(next.courses[0].uiState?.previewUploadId).toBe("u1");
  });

  it("can clear previewUploadId by passing undefined", () => {
    const course = makeCourse({ uiState: { previewUploadId: "u1" } });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "SET_PREVIEW_UPLOAD",
      payload: { courseId: course.id, uploadId: undefined },
    });

    expect(next.courses[0].uiState?.previewUploadId).toBeUndefined();
  });
});

describe("applySessionAction — SET_STAGE", () => {
  it("sets the currentStageIndex to the specified value", () => {
    const course = makeCourse({ currentStageIndex: 0 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "SET_STAGE",
      payload: { id: course.id, index: 4 },
    });

    expect(next.courses[0].currentStageIndex).toBe(4);
  });

  it("clamps the index to valid range", () => {
    const course = makeCourse({ currentStageIndex: 0 });
    const state = stateWithCourses(course);

    const next = applySessionAction(state, {
      type: "SET_STAGE",
      payload: { id: course.id, index: 999 },
    });

    expect(next.courses[0].currentStageIndex).toBe(DEFAULT_STAGES.length - 1);
  });
});

describe("normalizeCourse — v2 migration", () => {
  it("migrates seven stages into the six-stage personal-project model", () => {
    const legacyStages = [
      ...DEFAULT_STAGES.slice(0, 2),
      { key: "group", label: "小组构思", view: "group" as const, description: "组队" },
      { key: "review", label: "方案汇报与纠偏", view: "workspace" as const, description: "汇报" },
      ...DEFAULT_STAGES.slice(3),
    ];
    const legacy = makeCourse({
      stages: legacyStages,
      currentStageIndex: 3,
      classConfig: { groupMode: "free", totalStudents: 36, perGroup: 6 },
      feedback: [{ id: "f1", courseId: "course-1", targetType: "group", targetId: "g1", stageKey: "review", kind: "comment", content: "请补充证据", createdAt: "2024-01-01T00:00:00.000Z" }],
    });
    const result = normalizeCourse(legacy);
    expect(result.stages.map((stage) => stage.key)).toEqual(["launch", "ai-learning", "proposal", "make", "showcase", "reflection"]);
    expect(result.stages[result.currentStageIndex].key).toBe("proposal");
    expect(result.classConfig).toMatchObject({ groupMode: "solo", perGroup: 1, crossClass: false });
    expect(result.feedback?.[0]).toMatchObject({ sourceRole: "teacher", status: "open", evidence: [] });
    expect(result.content.evaluationPlan.flows?.map((flow) => flow.sourceRole)).toEqual(["ai", "teacher", "self"]);
    expect(result.content.evaluationPlan.flows?.reduce((sum, flow) => sum + flow.weight, 0)).toBe(100);
  });
});
