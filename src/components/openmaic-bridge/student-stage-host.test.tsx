import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stageMock = vi.hoisted(() => {
  const state = {
    scenes: [] as Array<{ id: string; title: string; actions: unknown[] }>,
    currentSceneId: null as string | null,
    setStage: vi.fn(),
    clearStore: vi.fn(),
  };
  const listeners = new Set<(current: typeof state, previous: typeof state) => void>();
  return {
    state,
    reset() {
      state.scenes = [];
      state.currentSceneId = null;
      state.setStage.mockClear();
      state.clearStore.mockClear();
      listeners.clear();
    },
    setState(patch: Partial<typeof state>) {
      const previous = { ...state };
      Object.assign(state, patch);
      listeners.forEach((listener) => listener(state, previous));
    },
    subscribe(listener: (current: typeof state, previous: typeof state) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const telemetryMock = vi.hoisted(() => ({
  createLearningEvent: vi.fn((type: string, draft: Record<string, unknown>) => ({
    ...draft,
    id: `event-${type}`,
    idempotencyKey: `event-${type}`,
    type,
    occurredAt: "2026-07-11T10:00:00.000Z",
  })),
  postLearningEvents: vi.fn(async (_input: { events: Array<{ type: string }> }) => undefined),
}));

vi.mock("@openmaic/components/stage", () => ({ Stage: () => <div>stage-ready</div> }));
vi.mock("@openmaic/components/server-providers-init", () => ({ ServerProvidersInit: () => null }));
vi.mock("@openmaic/lib/hooks/use-theme", () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@openmaic/lib/hooks/use-i18n", () => ({ I18nProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@openmaic/lib/contexts/media-stage-context", () => ({ MediaStageProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@openmaic/lib/edit/slide-schema", () => ({ migrateScene: (scene: unknown) => scene }));
vi.mock("@openmaic/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("@openmaic/lib/store", () => ({
  useStageStore: Object.assign(() => undefined, {
    getState: () => stageMock.state,
    setState: stageMock.setState,
    subscribe: stageMock.subscribe,
  }),
}));
vi.mock("@openmaic/lib/store/settings", () => ({ useSettingsStore: { setState: vi.fn() } }));
vi.mock("@/lib/learning-analytics/telemetry", () => telemetryMock);

import {
  selectStudentLearningScenes,
  StudentStageHost,
  shouldTrackStudentLearning,
} from "./student-stage-host";

function classroomResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      classroom: {
        stage: { id: "classroom-1", title: "AI 课堂" },
        scenes: [{ id: "scene-1", title: "第一课", actions: [] }],
      },
    }),
  } as Response;
}

describe("StudentStageHost reporting modes", () => {
  beforeEach(() => {
    stageMock.reset();
    telemetryMock.createLearningEvent.mockClear();
    telemetryMock.postLearningEvents.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/openmaic/classroom")) return classroomResponse();
      if (url.includes("/api/openmaic/progress")) {
        return { ok: true, status: 200, json: async () => ({ data: { progress: {} } }) } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("emits initial learning events in student mode", async () => {
    render(
      <StudentStageHost
        backHref="/student"
        classroomId="classroom-1"
        courseId="course-1"
        studentId="student-1"
      />,
    );

    await waitFor(() => expect(telemetryMock.postLearningEvents).toHaveBeenCalled());
    const payload = telemetryMock.postLearningEvents.mock.calls[0]?.[0];
    expect(payload?.events.map((item) => item.type)).toEqual(["stage-enter", "scene-enter"]);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/openmaic/progress"), expect.anything());
  });

  it("teacher preview never reads or writes student progress or telemetry", async () => {
    render(
      <StudentStageHost
        backHref="#"
        classroomId="classroom-1"
        courseId="course-1"
        mode="teacher-preview"
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/openmaic/classroom"), expect.anything()));
    await waitFor(() => expect(stageMock.state.scenes).toHaveLength(1));
    expect(telemetryMock.postLearningEvents).not.toHaveBeenCalled();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes("/api/openmaic/progress"))).toBe(false);
    expect(shouldTrackStudentLearning("teacher-preview")).toBe(false);
  });

  it("filters every explicit teacher-only PBL scene before playback", () => {
    const scenes = [
      { id: "launch", type: "slide", stageKey: "launch", audience: "teacher" },
      { id: "knowledge", type: "interactive", stageKey: "ai-learning", audience: "student", generationPurpose: "knowledge-teaching" },
      { id: "proposal", type: "slide", stageKey: "proposal", audience: "teacher", generationPurpose: "facilitation-scaffold" },
    ] as unknown as import("@openmaic/lib/types/stage").Scene[];

    expect(selectStudentLearningScenes(scenes).map((scene) => scene.id)).toEqual(["knowledge"]);
  });
});
