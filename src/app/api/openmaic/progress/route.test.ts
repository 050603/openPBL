import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const courseStore = vi.hoisted(() => ({
  course: null as null | Record<string, unknown>,
  updateCourse: vi.fn(),
}));
const classroomStore = vi.hoisted(() => ({
  classroom: null as null | { scenes: Array<{ id: string; outlineId?: string }> },
}));

vi.mock('@/lib/session/server-store', () => ({
  getCourse: vi.fn(async () => courseStore.course),
  updateCourse: courseStore.updateCourse,
}));
vi.mock('@openmaic/lib/server/classroom-storage', () => ({
  readClassroom: vi.fn(async () => classroomStore.classroom),
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/openmaic/progress', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('progress route integrity', () => {
  beforeEach(() => {
    courseStore.updateCourse.mockReset();
    courseStore.course = {
      id: 'course-1',
      aiLearningClassroomId: 'classroom-1',
      content: {},
      students: [{ id: 'student-1' }],
      aiLearningProgress: {
        'student-1': { completedScenes: ['s1'], completionModelVersion: 2 },
      },
    };
    classroomStore.classroom = {
      scenes: [
        { id: 's1', outlineId: 'outline-ai-1' },
        { id: 's2', outlineId: 'outline-ai-2' },
      ],
    };
    courseStore.updateCourse.mockImplementation(async (_id, updater) => {
      courseStore.course = updater(courseStore.course);
    });
  });

  it('rejects progress written to a classroom not linked to the course', async () => {
    const response = await POST(request({
      courseId: 'course-1', studentId: 'student-1', classroomId: 'other',
      currentSceneIndex: 0, totalScenes: 99, completedScenes: [],
    }));

    expect(response.status).toBe(400);
    expect(courseStore.updateCourse).not.toHaveBeenCalled();
  });

  it('uses persisted scenes and preserves earlier completion', async () => {
    const response = await POST(request({
      courseId: 'course-1', studentId: 'student-1', classroomId: 'classroom-1',
      currentSceneIndex: 99, totalScenes: 999,
      completedScenes: ['s2', 's2', 'unknown'],
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.progress).toMatchObject({
      currentSceneIndex: 1,
      totalScenes: 2,
      completedScenes: ['s1', 's2'],
      completedOutlineIds: ['outline-ai-1', 'outline-ai-2'],
      masteryLevel: 'completed',
    });
  });

  it('does not carry forward completion produced by the legacy enter-page model', async () => {
    courseStore.course = {
      ...(courseStore.course ?? {}),
      aiLearningProgress: {
        'student-1': { completedScenes: ['s1', 's2'], masteryLevel: 'completed' },
      },
    };

    const response = await POST(request({
      courseId: 'course-1', studentId: 'student-1', classroomId: 'classroom-1',
      currentSceneIndex: 0, totalScenes: 2, completedScenes: [],
    }));
    const body = await response.json();

    expect(body.data.progress).toMatchObject({
      completedScenes: [],
      masteryLevel: 'not-started',
      completionModelVersion: 2,
    });
  });
});
