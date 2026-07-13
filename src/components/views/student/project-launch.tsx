"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Compass,
  Download,
  FileText,
  Flag,
  HelpCircle,
  MessageCircle,
  Send,
  Target,
  UserRoundCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, FileBadge, Pill, PrimaryButton, TextArea } from "@/components/ui";
import { ProjectCoverImage } from "@/components/visuals";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";

export function ProjectLaunchView({ course }: { course: Course }) {
  const session = useSession();
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [expandedAnnouncement, setExpandedAnnouncement] = useState<string | null>(course?.announcements?.[0]?.id ?? null);
  const studentId = session.studentId;
  const title = course?.name || "未命名项目";
  const drivingQ = course?.drivingQuestion || "暂无驱动问题，请联系教师补充。";
  const project = course.groups?.find((item) => item.members.some((member) => member.studentId === studentId));

  // 从 course.stages 派生时间表（替代 mock-data 的 projectTimeline）
  const projectTimeline = course.stages.map((stage, index) => {
    // Stage 类型无日期字段，使用 index 作为序号，description 作为副信息
    const subtitle = stage.description?.trim() || "—";
    return [String(index + 1), stage.label, subtitle] as const;
  });

  function completeTodo(todoId: string) {
    session.completeTodo(course.id, todoId, true);
  }

  function downloadResource(resourceId: string, url?: string) {
    session.markResourceDownloaded(course.id, resourceId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function reply(announcementId: string) {
    const content = replyDrafts[announcementId]?.trim();
    if (!content) return;
    session.replyAnnouncement(course.id, announcementId, content);
    setReplyDrafts((drafts) => ({ ...drafts, [announcementId]: "" }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-bold tracking-[0] leading-tight text-stone-900 md:text-4xl">{title}</h1>
          <Pill tone="green">进行中</Pill>
        </div>
        <ProjectCoverImage course={course} className="h-56 w-full sm:h-60 md:h-64" />

        <InfoBlock icon={<HelpCircle size={26} />} title="驱动问题" text={drivingQ} />
        <InfoBlock
          icon={<Target size={26} />}
          title="项目目标"
          text={course.summary || "请教师完善项目目标说明。"}
        />
        <Card>
          <div className="flex gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-blue-600">
              <FileText size={26} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">成果要求</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-7 text-stone-700">
                <li>按教师设定的课程阶段推进项目，完成各阶段任务。</li>
                <li>在「方案阶段」提交完整项目方案文档。</li>
                <li>在「成果汇报与评价」阶段完成个人汇报与材料提交。</li>
              </ul>
              <p className="mt-2 text-xs text-stone-500">具体要求以教师发布的项目公告与待办为准。</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-blue-600">
              <Flag size={25} />
            </div>
            <h2 className="text-xl font-bold">时间安排</h2>
          </div>
          <div className="relative grid gap-2 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${projectTimeline.length}, minmax(96px, 1fr))` }}>
            <div className="absolute left-[6%] right-[7%] top-[18px] h-1 rounded-full bg-stone-200" />
            {projectTimeline.map(([step, label, date], index) => (
              <div className="relative z-10 min-w-[86px] text-center" key={step}>
                <div className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-base font-bold text-white ${index <= course.currentStageIndex ? "bg-[var(--pbl-student)]" : "bg-stone-300"}`}>
                  {step}
                </div>
                <div className={index <= course.currentStageIndex ? "mt-3 font-bold text-[var(--pbl-student)]" : "mt-3 font-semibold text-stone-600"}>{label}</div>
                <div className={index <= course.currentStageIndex ? "mt-1 text-sm text-blue-600" : "mt-1 text-sm text-stone-500"}>{date}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <aside className="min-w-0 space-y-5">
        <Card>
          <h2 className="mb-4 text-xl font-bold">学生待办</h2>
          {(course.todos ?? []).map((todo) => {
            const done = Boolean(studentId && todo.completedBy.includes(studentId));
            const Icon = todo.id.includes("group") ? UserRoundCheck : todo.id.includes("direction") ? Compass : FileText;
            const displayTitle = todo.id.includes("group") ? "确认个人项目空间" : todo.title;
            const displayDescription = todo.id.includes("group") ? "系统已为你建立个人项目与 AI 伴学小组" : todo.description;
            return (
              <div className="mb-3 flex items-center gap-4 rounded-[8px] border border-stone-200 p-3 last:mb-0" key={todo.id}>
                <div className={`grid h-10 w-10 place-items-center rounded-[6px] ${done ? "bg-emerald-50 text-emerald-600" : "bg-[var(--pbl-student-soft)] text-blue-600"}`}>
                  {done ? <CheckCircle2 size={22} /> : <Icon size={23} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{displayTitle}</div>
                  <div className="text-sm text-stone-500">{displayDescription}</div>
                </div>
                <button
                  className={`h-9 rounded-[5px] border px-3 text-sm font-semibold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-400 text-[var(--pbl-student)] hover:bg-[var(--pbl-student-soft)]"}`}
                  onClick={() => completeTodo(todo.id)}
                  type="button"
                  disabled={done}
                >
                  {done ? "已完成" : "去完成"}
                </button>
              </div>
            );
          })}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">相关资源</h2>
            <Pill tone="blue">{course.resources?.length ?? 0} 个</Pill>
          </div>
          <div className="space-y-3">
            {(course.resources ?? []).map((resource) => {
              const downloaded = Boolean(studentId && resource.downloadedBy.includes(studentId));
              return (
                <button
                  className="flex w-full items-center gap-3 rounded-[8px] border border-stone-200 bg-white p-3 text-left transition hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-student-soft)]/40"
                  key={resource.id}
                  onClick={() => downloadResource(resource.id, resource.url)}
                  type="button"
                >
                  <FileBadge type={resource.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{resource.title}</div>
                    <div className="text-sm text-stone-500">{resource.type} · {resource.size}</div>
                    {resource.description ? <div className="mt-1 line-clamp-2 text-xs text-stone-400">{resource.description}</div> : null}
                  </div>
                  {downloaded ? <Pill tone="green">已下载</Pill> : <Download size={17} className="text-[var(--pbl-student)]" />}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">项目公告 / 讨论</h2>
            <Pill tone="gray">{course.announcements?.length ?? 0} 条</Pill>
          </div>
          <div className="space-y-3">
            {(course.announcements ?? []).map((announcement) => (
              <div className="rounded-[8px] border border-stone-200 bg-white p-3" key={announcement.id}>
                <button
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setExpandedAnnouncement(expandedAnnouncement === announcement.id ? null : announcement.id)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-stone-900">{announcement.title}</span>
                    <span className="mt-1 block text-xs text-stone-500">{new Date(announcement.createdAt).toLocaleString("zh-CN")}</span>
                  </span>
                  <Pill tone={announcement.pinned ? "blue" : "gray"}>{announcement.replies.length} 回复</Pill>
                </button>
                {expandedAnnouncement === announcement.id ? (
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <p className="text-sm leading-6 text-stone-700">{announcement.content}</p>
                    <div className="mt-3 space-y-2">
                      {announcement.replies.slice(0, 3).map((item) => (
                        <div className="rounded-[6px] bg-stone-50 p-2 text-sm" key={item.id}>
                          <span className="font-bold text-stone-800">{item.studentName}：</span>
                          <span className="text-stone-600">{item.content}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <TextArea
                        className="min-h-10 flex-1 py-2"
                        placeholder="回复公告..."
                        value={replyDrafts[announcement.id] ?? ""}
                        onChange={(event) => setReplyDrafts((drafts) => ({ ...drafts, [announcement.id]: event.target.value }))}
                      />
                      <button className="grid h-10 w-10 place-items-center rounded-[6px] bg-[var(--pbl-student)] text-white hover:bg-[var(--pbl-student-hover)]" onClick={() => reply(announcement.id)} type="button">
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {!course.announcements?.length ? (
              <div className="rounded-[8px] border border-dashed border-stone-300 bg-stone-50 py-8 text-center text-sm text-stone-500">
                <MessageCircle className="mx-auto mb-2 text-stone-300" size={22} />
                暂无公告，教师发布后会自动同步。
              </div>
            ) : null}
          </div>
        </Card>

        <div className="flex min-h-14 items-center gap-3 rounded-[8px] border border-emerald-200 bg-emerald-50 px-4 text-emerald-800"><UserRoundCheck size={24} /><span><span className="block font-bold">个人项目空间已准备</span><span className="text-sm">{project?.name ?? "进入方案阶段后即可开始独立构思"}</span></span></div>
      </aside>
    </div>
  );
}

function InfoBlock({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <Card>
      <div className="flex gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-stone-900">{title}</h2>
          <p className="mt-2 text-[15px] leading-7 text-stone-700">{text}</p>
        </div>
      </div>
    </Card>
  );
}
