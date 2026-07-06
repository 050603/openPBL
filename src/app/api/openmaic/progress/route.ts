// AI 课堂学习进度端点
// GET  读取 course.aiLearningProgress
// POST 更新某学生在 AI 课堂中的学习进度

import { type NextRequest } from 'next/server';
import {
  apiError,
  apiSuccess,
  API_ERROR_CODES,
} from '@openmaic/lib/server/api-response';
import { createLogger } from '@openmaic/lib/logger';
import { getCourse, updateCourse } from '@/lib/session/server-store';
import type { StudentAiProgress } from '@/lib/session/types';

const log = createLogger('ProgressAPI');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProgressRequestBody = {
  courseId?: string;
  studentId?: string;
  studentName?: string;
  classroomId?: string;
  currentSceneIndex?: number;
  totalScenes?: number;
  completedScenes?: string[];
  quizScore?: number;
};

// 计算 masteryLevel：
// - not-started: index===0 且 completedScenes 为空
// - mastered: 已完成全部场景 且 quizScore>=80
// - completed: 已完成全部场景
// - in-progress: 其它
function computeMasteryLevel(
  currentSceneIndex: number,
  totalScenes: number,
  completedScenes: string[],
  quizScore?: number,
): StudentAiProgress['masteryLevel'] {
  if (currentSceneIndex === 0 && completedScenes.length === 0) {
    return 'not-started';
  }
  const allDone = completedScenes.length >= totalScenes;
  if (allDone && quizScore !== undefined && quizScore >= 80) {
    return 'mastered';
  }
  if (allDone) {
    return 'completed';
  }
  return 'in-progress';
}

export async function GET(request: NextRequest) {
  try {
    const courseId = request.nextUrl.searchParams.get('courseId');

    if (!courseId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: courseId',
      );
    }

    const course = await getCourse(courseId);
    if (!course) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
    }

    return apiSuccess({ data: { progress: course.aiLearningProgress ?? {} } });
  } catch (error) {
    log.error(
      `Progress retrieval failed [courseId=${request.nextUrl.searchParams.get('courseId') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve progress',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProgressRequestBody;
    const {
      courseId,
      studentId,
      studentName,
      classroomId,
      currentSceneIndex,
      totalScenes,
      completedScenes,
      quizScore,
    } = body;

    if (!courseId || typeof courseId !== 'string') {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: courseId (string)',
      );
    }
    if (!studentId || typeof studentId !== 'string') {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: studentId (string)',
      );
    }
    if (!classroomId || typeof classroomId !== 'string') {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: classroomId (string)',
      );
    }
    if (typeof currentSceneIndex !== 'number' || typeof totalScenes !== 'number') {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: currentSceneIndex, totalScenes (number)',
      );
    }

    const sceneCompleted = Array.isArray(completedScenes) ? completedScenes : [];
    const score =
      typeof quizScore === 'number' && !Number.isNaN(quizScore) ? quizScore : undefined;
    const masteryLevel = computeMasteryLevel(
      currentSceneIndex,
      totalScenes,
      sceneCompleted,
      score,
    );

    const now = new Date().toISOString();

    let updatedEntry: StudentAiProgress | undefined;
    await updateCourse(courseId, (course) => {
      const next: StudentAiProgress = {
        classroomId,
        studentId,
        currentSceneIndex,
        totalScenes,
        completedScenes: sceneCompleted,
        lastActiveAt: now,
        masteryLevel,
        ...(score !== undefined ? { quizScore: score } : {}),
      };
      updatedEntry = next;
      // 保留 studentName 仅用于审计展示，未在类型中持久化（类型未定义该字段）。
      // 通过合并已有进度字典写入。
      const prevProgress = course.aiLearningProgress ?? {};
      void studentName; // studentName 当前不落盘，预留后续扩展
      return {
        ...course,
        aiLearningProgress: { ...prevProgress, [studentId]: next },
      };
    });

    if (!updatedEntry) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to persist progress: course not found',
      );
    }

    return apiSuccess({ data: { progress: updatedEntry } });
  } catch (error) {
    log.error('Progress update failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update progress',
      error instanceof Error ? error.message : String(error),
    );
  }
}
