'use client';

import { Suspense, useCallback, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { StudentStageHost } from '@/components/openmaic-bridge/student-stage-host';
import { useSession } from '@/lib/session/store';

function MicroLessonLoading() {
  return (
    <div className="grid h-screen place-items-center bg-[#f6f4ee] text-stone-600">
      <div className="text-center">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-stone-300 border-t-teal-700" />
        <p className="text-sm font-medium">正在打开微课学习空间…</p>
      </div>
    </div>
  );
}

function MicroLessonPlayer() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const [completed, setCompleted] = useState(false);
  const [returning, setReturning] = useState(false);

  const classroomId = params?.id;
  const courseId = searchParams.get('courseId') ?? '';
  const lessonId = searchParams.get('lessonId') ?? '';
  const topic = searchParams.get('topic') ?? '即时微课';
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/student/')
    ? requestedReturnTo
    : courseId
      ? `/student/classroom/${courseId}`
      : '/student';

  const returnToClassroom = useCallback(async () => {
    if (returning) return;
    setReturning(true);
    if (completed && courseId && lessonId && session.studentId) {
      await fetch('/api/adaptive-learning/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OpenPBL-Role': 'student' },
        body: JSON.stringify({
          action: 'complete-micro-lesson',
          courseId,
          studentId: session.studentId,
          lessonId,
        }),
      }).catch(() => undefined);
    }
    router.push(returnTo);
  }, [completed, courseId, lessonId, returnTo, returning, router, session.studentId]);

  if (!classroomId) return <MicroLessonLoading />;

  return (
    <main className="relative h-screen overflow-hidden bg-black">
      <div className="fixed left-1/2 top-3 z-[90] flex max-w-[calc(100vw-220px)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-stone-950/72 px-4 py-2 text-white shadow-xl backdrop-blur-xl">
        <span className={`h-2 w-2 rounded-full ${completed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className="truncate text-xs font-bold">{topic}</span>
        <small className="whitespace-nowrap text-[10px] text-white/60">{completed ? '学习完成' : '2–3 分钟'}</small>
      </div>
      <button
        className="fixed right-3 top-3 z-[91] inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-stone-950/78 px-4 text-xs font-bold text-white shadow-xl backdrop-blur-xl transition hover:bg-stone-900"
        disabled={returning}
        onClick={returnToClassroom}
        type="button"
      >
        {completed ? <CheckCircle2 size={16} /> : <ArrowLeft size={16} />}
        {returning ? '正在返回…' : completed ? '完成并返回课堂' : '返回伴学课堂'}
      </button>
      <StudentStageHost
        backHref={returnTo}
        classroomId={classroomId}
        className="h-full"
        onSceneComplete={({ completedSceneCount, totalSceneCount }) => {
          if (completedSceneCount >= totalSceneCount) setCompleted(true);
        }}
        standalone
        variant="fullscreen"
      />
    </main>
  );
}

export default function StudentMicroLessonPage() {
  return (
    <Suspense fallback={<MicroLessonLoading />}>
      <MicroLessonPlayer />
    </Suspense>
  );
}
