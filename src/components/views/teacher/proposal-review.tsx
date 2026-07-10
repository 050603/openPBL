"use client";

import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { Button } from "@/components/ui/button";
import { FeedbackLanes } from "@/components/classroom/classroom-chrome";
import { WorkspaceTeacherView } from "./workspace";

export function ProposalReviewTeacherView({ course, onSelectGroup }: { course: Course; onSelectGroup?: (groupId: string) => void }) {
  const session = useSession();
  function approve(groupId: string, status: "approved" | "revision") {
    const group = course.groups?.find((item) => item.id === groupId);
    if (!group) return;
    session.upsertGroup(course.id, { ...group, teacherApproval: { status, teacherName: session.user.name, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() });
    session.addActivity(course.id, status === "approved" ? "教师批准方案" : "教师要求修订", group.name, session.user.name);
  }
  return (
    <div className="space-y-8">
      <header className="border-b border-[var(--pbl-border)] pb-5">
        <p className="text-sm font-semibold text-[var(--pbl-teacher)]">方案汇报与纠偏</p>
        <h2 className="font-editorial mt-1 text-2xl font-semibold">三类反馈彼此独立，教师拥有最终确认权</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">AI 负责完整度和风险扫描，同伴反馈关注可理解性与启发，教师结合教学目标决定方案是否进入制作。</p>
      </header>
      <FeedbackLanes feedback={(course.feedback ?? []).filter((item) => item.stageKey === "review")} />
      <section>
        <h3 className="mb-3 text-lg font-semibold">教师最终确认</h3>
        <div className="divide-y divide-[var(--pbl-border)] border-y border-[var(--pbl-border)]">
          {(course.groups ?? []).map((group) => <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center" key={group.id}><div className="min-w-0 flex-1"><p className="font-semibold">{group.name} · {group.topic || "待补充主题"}</p><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">状态：{group.teacherApproval?.status === "approved" ? "已批准" : group.teacherApproval?.status === "revision" ? "需要修订" : "等待确认"}</p></div><div className="flex gap-2"><Button onClick={() => approve(group.id, "revision")} size="sm" variant="secondary">要求修订</Button><Button onClick={() => approve(group.id, "approved")} size="sm">批准进入制作</Button></div></div>)}
        </div>
      </section>
      <WorkspaceTeacherView course={course} onSelectGroup={onSelectGroup} />
    </div>
  );
}
