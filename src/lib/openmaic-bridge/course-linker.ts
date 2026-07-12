// 将 OpenMAIC 生成的 classroom 与 openPBL 的 Course 关联
// 这是 openPBL 侧的逻辑，不修改 OpenMAIC 任何代码

import { updateCourse, getCourse } from '@/lib/session/server-store';
import type { Course, TeacherResourceScene } from '@/lib/session/types';

export interface ClassroomLinkInfo {
  scenesCount: number;
  stageName: string;
  teacherClassroomId?: string;
  teacherResourceScenes?: TeacherResourceScene[];
}

export async function linkClassroomToCourse(
  courseId: string,
  classroomId: string,
  info: ClassroomLinkInfo,
): Promise<void> {
  await updateCourse(courseId, (course): Course => {
    const teacherResources = info.teacherResourceScenes
      ? {
          generatedAt: new Date().toISOString(),
          scenes: info.teacherResourceScenes,
        }
      : course.content.teacherResources;
    return {
      ...course,
      aiLearningClassroomId: classroomId,
      ...(info.teacherClassroomId !== undefined
        ? { teacherClassroomId: info.teacherClassroomId || undefined }
        : {}),
      content: {
        ...course.content,
        _openmaicClassroomId: classroomId,
        _openmaicScenesCount: info.scenesCount,
        ...(info.teacherClassroomId !== undefined
          ? { teacherClassroomId: info.teacherClassroomId || undefined }
          : {}),
        ...(info.teacherResourceScenes
          ? { teacherResources }
          : {}),
      },
    };
  });
}

export async function getCourseClassroomId(courseId: string): Promise<string | undefined> {
  const course = await getCourse(courseId);
  return course?.aiLearningClassroomId;
}
