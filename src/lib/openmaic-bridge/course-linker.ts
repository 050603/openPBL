// 将 OpenMAIC 生成的 classroom 与 openPBL 的 Course 关联
// 这是 openPBL 侧的逻辑，不修改 OpenMAIC 任何代码

import { updateCourse, getCourse } from '@/lib/session/server-store';
import type { Course } from '@/lib/session/types';

export interface ClassroomLinkInfo {
  scenesCount: number;
  stageName: string;
}

export async function linkClassroomToCourse(
  courseId: string,
  classroomId: string,
  info: ClassroomLinkInfo,
): Promise<void> {
  await updateCourse(courseId, (course): Course => ({
    ...course,
    aiLearningClassroomId: classroomId,
    content: {
      ...course.content,
      // 临时字段，标记 AI 授知内容已生成
      _openmaicClassroomId: classroomId,
      _openmaicScenesCount: info.scenesCount,
    },
  }));
}

export async function getCourseClassroomId(courseId: string): Promise<string | undefined> {
  const course = await getCourse(courseId);
  return course?.aiLearningClassroomId;
}
