"use client";

import type { Course } from "@/lib/session/types";
import { WorkspaceTeacherView } from "./workspace";

export function ProjectMakingTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (studentId: string) => void;
}) {
  return <div className="space-y-8"><header className="border-b border-[var(--pbl-border)] pb-5"><h2 className="font-editorial text-2xl font-semibold">阶段四 · 项目实践</h2><p className="mt-2 text-sm text-[var(--pbl-text-muted)]">查看学生作品版本和需要帮助的学生。</p></header><WorkspaceTeacherView course={course} onSelectStudent={onSelectStudent} /></div>;
}
