import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/session/types";
import type { ShowcaseData, ShowcaseQueueItem } from "@/lib/showcase/types";
import { getStagesForSystemMode } from "@/lib/system-mode";

type MockState = { loading: boolean; error?: string; data: ShowcaseData };

const mocks = vi.hoisted(() => ({
  state: undefined as MockState | undefined,
  runAction: vi.fn(),
}));

vi.mock("@/hooks/use-showcase-presentation", () => ({
  useShowcasePresentation: () => ({ ...mocks.state, runAction: mocks.runAction }),
}));
vi.mock("@/components/showcase/showcase-artifact-viewer", () => ({ ShowcaseArtifactViewer: () => <div data-testid="artifact-viewer" /> }));

import { NewShowcaseTeacherView } from "./showcase-reporting";

const now = "2026-09-05T10:00:00.000Z";
const artifact = { kind: "document" as const, versionId: "a1", title: "校园节水方案", sequence: 1, submittedAt: now, displayModes: ["continuous" as const] };
const course: Course = {
  id: "course-1", name: "测试课", subject: "科学", grade: "六年级", hours: 2, summary: "", drivingQuestion: "", status: "teaching",
  stages: getStagesForSystemMode("new"), currentStageIndex: 3,
  students: [{ id: "s1", name: "小林", joinedAt: now, stageProgress: {} }],
  groups: [{ id: "g1", name: "小林的个人项目", topic: "节水", keywords: [], selectedForms: [], members: [{ studentId: "s1", name: "小林" }], createdAt: now, updatedAt: now }],
  content: { pblOutline: "", knowledgePoints: [], lessonOutline: [], evaluationPlan: { dimensions: [], overallRubric: "" } },
  createdAt: now, updatedAt: now,
};

function baseState(overrides: Partial<ShowcaseData> = {}): MockState {
  const queueItem: ShowcaseQueueItem = { studentId: "s1", studentName: "小林", groupId: "g1", position: 1, status: "waiting", artifacts: [artifact], primaryArtifactTitle: artifact.title };
  return {
    loading: false,
    error: undefined,
    data: {
      courseId: "course-1", stageKey: "showcase", presentingGroupId: undefined, presentingStudentId: undefined,
      students: [], ownArtifacts: [], activePresentation: null, presentations: [], queue: [queueItem], minutesPerStudent: 5,
      currentQueueItem: null, nextQueueItem: queueItem,
      ...overrides,
    },
  };
}

describe("NewShowcaseTeacherView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = baseState();
    mocks.runAction.mockResolvedValue(baseState().data);
  });

  it("starts the default queue from the prominent current-report panel", async () => {
    render(<NewShowcaseTeacherView course={course} />);
    expect(screen.getByText("尚未点名")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "按提交顺序开始" }));
    await waitFor(() => expect(mocks.runAction).toHaveBeenCalledWith({ action: "assign", groupId: "g1", studentId: "s1" }));
  });

  it("puts teacher evaluation in the flow and finishes it with an optional note", async () => {
    const evaluation = { id: "p1", courseId: "course-1", groupId: "g1", studentId: "s1", studentName: "小林", artifactKind: "document" as const, artifactVersionId: "a1", artifactTitle: artifact.title, displayMode: "continuous" as const, status: "evaluating" as const, revision: 2, requestedAt: now, endedAt: now, updatedAt: now };
    mocks.state = baseState({
      presentingGroupId: "g1", presentingStudentId: "s1",
      queue: [{ studentId: "s1", studentName: "小林", groupId: "g1", position: 1, status: "evaluating", artifacts: [artifact], primaryArtifactTitle: artifact.title, presentationId: "p1" }],
      currentQueueItem: { studentId: "s1", studentName: "小林", groupId: "g1", position: 1, status: "evaluating", artifacts: [artifact], primaryArtifactTitle: artifact.title, presentationId: "p1" },
      nextQueueItem: null, presentations: [evaluation],
    });
    render(<NewShowcaseTeacherView course={course} />);
    fireEvent.change(screen.getByRole("textbox", { name: "课堂点评记录（可选）" }), { target: { value: "表达清楚" } });
    fireEvent.click(screen.getByRole("button", { name: "结束评价并点名下一位" }));
    await waitFor(() => expect(mocks.runAction).toHaveBeenCalledWith({ action: "finish-evaluation", presentationId: "p1", note: "表达清楚" }));
  });
});
