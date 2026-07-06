import Link from "next/link";
import { Bot, LogIn, Sparkles } from "lucide-react";
import { Card, PrimaryButton } from "@/components/ui";
import type { Course } from "@/lib/session/types";

export function AiLearningView({ course }: { course?: Course }) {
  const classroomId = course?.aiLearningClassroomId;
  const hasClassroom = Boolean(classroomId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[34px] font-black text-slate-950">AI学习</h1>
        <p className="mt-1 text-xl text-slate-600">阶段二：AI授知</p>
      </div>

      {hasClassroom && classroomId ? (
        <Card>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                <Sparkles size={26} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-950">AI 课堂已就绪</h2>
                <p className="mt-2 text-[15px] leading-7 text-slate-600">
                  AI 授知内容已生成，点击进入课堂即可开始自主学习。课堂包含由 AI 生成的幻灯片、测验与互动内容。
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  课堂 ID：{classroomId}
                </p>
              </div>
            </div>
            <Link
              href={`/student/ai-learning/${classroomId}?courseId=${encodeURIComponent(course?.id ?? "")}`}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[6px] bg-blue-600 px-6 text-base font-semibold text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition hover:bg-blue-700"
            >
              <LogIn size={18} /> 进入 AI 课堂
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600">
            <Bot size={32} />
          </div>
          <h2 className="mt-4 text-2xl font-black">AI 课堂尚未生成</h2>
          <p className="mt-2 text-sm text-slate-500">
            请等待教师生成 AI 授知内容，生成完成后即可进入课堂学习。
          </p>
          <PrimaryButton className="mx-auto mt-6" variant="outline" disabled>
            进入 AI 课堂
          </PrimaryButton>
        </Card>
      )}
    </div>
  );
}
