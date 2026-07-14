import type { Course } from "@/lib/session/types";
import { WorkspaceView } from "./workspace";

export function ProjectMakingView({ course }: { course: Course }) {
  return <div className="space-y-6"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-student)]">项目实践</p><h1 className="font-editorial mt-1 text-2xl font-semibold">独立完成核心作品，让 AI 伙伴提供下一步支架</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">你需要判断、修改或拒绝 AI 建议。系统会记录你的关键选择、作品迭代和 AI 使用过程，作为过程性学习证据。</p></header><WorkspaceView course={course} /></div>;
}
