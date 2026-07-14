"use client";

import type { Course } from "@/lib/session/types";
import { WorkspaceTeacherView } from "./workspace";

export function ProjectMakingTeacherView({ course }: { course: Course }) {
  return <div className="space-y-8"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-teacher)]">课堂巡视与介入台</p><h2 className="font-editorial mt-1 text-2xl font-semibold">按学生查看制作进度与伴学风险</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">学生卡片集中显示进度和叹号风险；教师处理后，风险会从列表中消失并写入课堂记录。</p></header><WorkspaceTeacherView course={course} /></div>;
}
