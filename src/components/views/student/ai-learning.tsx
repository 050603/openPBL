import { Bot } from 'lucide-react';
import { AdaptiveAiLearningRuntime } from '@/components/views/student/adaptive-ai-learning-runtime';
import { Card, PrimaryButton } from '@/components/ui';
import { useSession } from '@/lib/session/store';
import type { Course } from '@/lib/session/types';

export function AiLearningView({ course }: { course?: Course }) {
  const classroomId = course?.aiLearningClassroomId;
  const { studentId, studentName, user } = useSession();

  if (!classroomId) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold leading-tight text-stone-900 md:text-4xl">AI 授课</h1>
          <p className="mt-1 text-base text-stone-600 md:text-xl">
            进入 AI 课堂，完成核心概念学习。
          </p>
        </div>
        <Card className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--pbl-warning-soft)] text-[var(--pbl-warning)]">
            <Bot size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-bold">AI 课堂尚未生成</h2>
          <p className="mt-2 text-sm text-stone-500">
            请等待教师生成 AI 授课内容。生成完成后，本阶段会直接显示 AI 学习课堂。
          </p>
          <PrimaryButton className="mx-auto mt-6" disabled variant="outline">
            等待课堂生成
          </PrimaryButton>
        </Card>
      </div>
    );
  }

  if (!studentId) {
    return (
      <Card className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-[var(--pbl-student)]">
          <Bot size={32} />
        </div>
        <h2 className="mt-4 text-2xl font-bold">正在初始化学习身份</h2>
        <p className="mt-2 text-sm text-stone-500">
          请从学生端重新进入课堂，以便记录学习进度。
        </p>
      </Card>
    );
  }

  return (
    <div className="h-full min-h-0">
      <section className="h-full min-h-0 overflow-hidden bg-white">
        <AdaptiveAiLearningRuntime
          backHref={course?.id ? `/student/classroom/${course.id}` : '/student'}
          classroomId={classroomId}
          course={course}
          studentId={studentId}
          studentName={studentName ?? user.name}
        />
      </section>
    </div>
  );
}
