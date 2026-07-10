import type { Course } from "@/lib/session/types";
import { WorkspaceView } from "./workspace";

export function ProjectMakingView({ course }: { course: Course }) {
  return <div className="space-y-6"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-student)]">项目制作与 AI 实时支架</p><h1 className="font-editorial mt-1 text-2xl font-semibold">作品是主体，AI 根据当前任务提供下一步支架</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">重要生成前先提交自己的想法、草稿或具体问题。系统会记录建议、采纳决定和作品前后变化。</p></header><WorkspaceView course={course} /></div>;
}
