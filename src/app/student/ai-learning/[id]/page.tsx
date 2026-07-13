'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { StudentStageHost } from '@/components/openmaic-bridge/student-stage-host';
import { useSession } from '@/lib/session/store';

function LoadingShell() {
  return (
    <div className="grid h-screen place-items-center bg-white text-stone-500">
      <div className="text-center">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-stone-300 border-t-blue-600" />
        <p className="text-sm">正在准备学习环境...</p>
      </div>
    </div>
  );
}

function AiLearningPlayer() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const session = useSession();

  const classroomId = params?.id;
  const courseId = searchParams.get('courseId') ?? undefined;
  const studentId = session.studentId;
  const studentName = session.studentName ?? session.user.name;
  const backHref = courseId ? `/student/classroom/${courseId}` : '/student';

  if (!classroomId) {
    return (
      <div className="grid h-screen place-items-center bg-white text-stone-500">
        <p className="text-sm">缺少课堂 ID 参数</p>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="grid h-screen place-items-center bg-white text-stone-500">
        <p className="text-sm">学生身份未初始化，请重新进入课堂</p>
      </div>
    );
  }

  return (
    <StudentStageHost
      classroomId={classroomId}
      courseId={courseId}
      studentId={studentId}
      studentName={studentName}
      backHref={backHref}
    />
  );
}

export default function StudentAiLearningPage() {
  // useSearchParams 需要在 Suspense 边界内使用，否则生产构建会失败
  return (
    <Suspense fallback={<LoadingShell />}>
      <AiLearningPlayer />
    </Suspense>
  );
}
