"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CheckCheck,
  Flag,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Megaphone,
  Send,
  Trash2,
  Users,
  Plus,
  ExternalLink,
  FileUp,
  Loader2,
  FileText,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar, PrimaryButton, TextArea, TextInput } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import { cn } from "@/lib/utils";
import { courseResourceTypeLabel } from "@/lib/user-facing-labels";
import {
  isProjectLaunchTodo,
} from "@/lib/project-launch-readiness";
import { resourcesForStage } from "@/lib/classroom/stage-resources";

export function ProjectLaunchTeacherView({ course }: { course: Course }) {
  const session = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newInquiryQuestion, setNewInquiryQuestion] = useState("");
  const [resourceUploading, setResourceUploading] = useState(false);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [resourceMessage, setResourceMessage] = useState<string | null>(null);
  const totalSeats = course.classConfig?.totalStudents ?? 40;
  const launchResources = resourcesForStage(course.resources, "launch");
  const joined = course.students.length;
  const rate = Math.min(100, Math.round((joined / totalSeats) * 100));
  const projectSpaces = course.students.filter((student) => course.groups?.some((project) => project.members.some((member) => member.studentId === student.id))).length;
  const coreDrivingQuestion = course.drivingQuestion || course.pblConfig?.inquiryQuestions?.[0] || "";
  const inquiryQuestions = coreDrivingQuestion ? [coreDrivingQuestion] : [];
  const studentSelections = course.students.map((student) => ({
    student,
    topic: course.groups
      ?.find((project) => project.members.some((member) => member.studentId === student.id))
      ?.topic,
  }));
  const selectedCount = studentSelections.filter(({ topic }) =>
    topic ? inquiryQuestions.includes(topic) : false,
  ).length;
  const selectionRate = Math.round((selectedCount / Math.max(1, joined)) * 100);
  const launchTodos = (course.todos ?? []).filter(isProjectLaunchTodo);
  const completedTodoCount = launchTodos.reduce(
    (sum, todo) =>
      sum +
      todo.completedBy.filter((studentId) =>
        course.students.some((student) => student.id === studentId),
      ).length,
    0,
  );
  const totalTodoCount = launchTodos.length * joined;
  const todoCompletion = totalTodoCount
    ? Math.round((completedTodoCount / totalTodoCount) * 100)
    : 100;

  function publish() {
    if (!title.trim() || !content.trim()) return;
    session.upsertAnnouncement(course.id, { title: title.trim(), content: content.trim(), pinned: true });
    setTitle("");
    setContent("");
  }

  function addInquiryQuestion() {
    const question = newInquiryQuestion.trim();
    if (!question || inquiryQuestions[0] === question) return;
    session.updateCourse(course.id, {
      drivingQuestion: question,
      pblConfig: normalizePblCourseConfig({
        ...course.pblConfig,
        inquiryQuestions: [question],
      }),
    });
    setNewInquiryQuestion("");
  }

  async function uploadCourseResource(file: File) {
    setResourceUploading(true);
    setResourceMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      form.append("courseId", course.id);
      form.append("bindAsCourseResource", "true");
      form.append("stageKey", "launch");
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { message?: string; requestId?: string } | null;
        const requestHint = errorPayload?.requestId ? `（请求编号：${errorPayload.requestId}）` : "";
        throw new Error(`${errorPayload?.message || `上传失败（${response.status}）`}${requestHint}`);
      }
      const data = await response.json() as {
        id?: string;
        title?: string;
        fileName?: string;
        fileType?: string;
        size?: string;
        url?: string;
      };
      if (!data.id || !data.fileName || !data.url) throw new Error("上传响应不完整，请重试");
      await session.refresh();
      setResourceMessage(`已上传并同步到学生端：${data.title || file.name}`);
    } catch (error) {
      setResourceMessage(error instanceof Error ? error.message : "课程资源上传失败");
    } finally {
      setResourceUploading(false);
    }
  }

  async function deleteCourseResource(resource: NonNullable<Course["resources"]>[number]) {
    if (!window.confirm(`确定删除“${resource.title}”吗？删除后教师端和学生端都将无法访问该资源。`)) return;
    setDeletingResourceId(resource.id);
    setResourceMessage(null);
    try {
      const response = await fetch(`/api/uploads/${resource.id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as { message?: string; requestId?: string } | null;
        const requestHint = errorPayload?.requestId ? `（请求编号：${errorPayload.requestId}）` : "";
        throw new Error(`${errorPayload?.message || `删除失败（${response.status}）`}${requestHint}`);
      }
      await session.refresh();
      setResourceMessage(`已删除课程资源：${resource.title}`);
    } catch (error) {
      setResourceMessage(error instanceof Error ? error.message : "课程资源删除失败");
    } finally {
      setDeletingResourceId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="到课情况" value={`${joined} / ${totalSeats}`} sub={`出勤率 ${rate}%`} icon={<Users className="text-blue-600" size={22} />} progress={rate} />
        <StatCard title="个人项目空间" value={`${projectSpaces}`} sub={`${joined} 名学生独立完成`} icon={<Sparkles className="text-emerald-600" size={22} />} progress={Math.min(100, Math.round((projectSpaces / Math.max(1, joined)) * 100))} tone="emerald" />
        <StatCard title="学生待办" value={`${todoCompletion}%`} sub={`${completedTodoCount} / ${totalTodoCount} 项已完成`} icon={<HelpCircle className="text-[var(--pbl-warning)]" size={22} />} progress={todoCompletion} tone="amber" />
        <StatCard title="方向确认" value={`${selectedCount} / ${joined}`} sub="学生已确认个人研究方向" icon={<Bell className="text-[var(--pbl-danger)]" size={22} />} progress={selectionRate} tone="rose" />
      </div>

      <Card compact className="overflow-hidden border-l-4 border-l-[var(--pbl-teacher)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]"><FileUp size={19} /></span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-900">项目启动材料</h2>
              <p className="mt-0.5 text-xs text-stone-500">上传后同步到学生端 · PDF / Office / 图片 / 视频 · 最大 50 MiB</p>
            </div>
          </div>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[8px] bg-[var(--pbl-teacher)] px-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[var(--pbl-teacher-hover)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            {resourceUploading ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
            {resourceUploading ? "上传中…" : "选择文件上传"}
            <input
              accept=".pdf,.pptx,.docx,.xlsx,.mp4,.png,.jpg,.jpeg,.webp"
              className="sr-only"
              disabled={resourceUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadCourseResource(file);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
        </div>
        {resourceMessage ? <p aria-live="polite" className={cn("mt-2 rounded-md px-3 py-2 text-xs", resourceMessage.startsWith("已") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{resourceMessage}</p> : null}
        <div className="mt-3 grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {launchResources.map((resource) => (
            <div className="group flex min-w-0 items-center gap-2 rounded-[8px] border border-stone-200 bg-white p-1.5 pl-2.5 transition hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-teacher-soft)]/30" key={resource.id}>
              <a className="flex min-w-0 flex-1 items-center gap-2.5" href={resource.url || "#"} rel="noreferrer" target="_blank">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] bg-[var(--pbl-teacher-soft)] text-[10px] font-black text-[var(--pbl-teacher)]">{courseResourceTypeLabel(resource.type)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-stone-900">{resource.title}</span><span className="mt-0.5 block text-xs text-stone-500">{resource.size}</span></span>
                <ExternalLink className="shrink-0 text-stone-400" size={14} />
              </a>
              <button
                aria-label={`删除资源 ${resource.title}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
                disabled={deletingResourceId !== null}
                onClick={() => void deleteCourseResource(resource)}
                title="删除资源"
                type="button"
              >
                {deletingResourceId === resource.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
          {!launchResources.length ? <div className="rounded-[8px] border border-dashed border-stone-300 px-4 py-3 text-center text-xs text-stone-500 sm:col-span-2 xl:col-span-3">尚未上传材料，学生端暂不会显示额外资源。</div> : null}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card compact>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Flag className="text-blue-700" size={20} /> 项目概览
            </h2>
            <Pill tone="blue">阶段一 · 项目启动</Pill>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Field title="主驱动问题" text={course.drivingQuestion} />
            <Field title="项目目标" text={course.summary} />
          </div>
        </Card>

        <Card compact>
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Megaphone className="text-[var(--pbl-warning)]" size={20} /> 发布课堂公告
          </h2>
          <div className="space-y-3">
            <TextInput placeholder="公告标题" value={title} onChange={(event) => setTitle(event.target.value)} />
            <TextArea className="min-h-20" placeholder="公告内容，例如：本节课结束前请完成兴趣方向选择..." value={content} onChange={(event) => setContent(event.target.value)} />
            <PrimaryButton className="w-full" size="sm" onClick={publish} disabled={!title.trim() || !content.trim()}>
              <Send size={16} /> 发布公告
            </PrimaryButton>
          </div>
        </Card>
      </div>

      <Card compact>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--pbl-teacher)]">项目驱动问题管理</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-stone-900">
              <Lightbulb className="text-amber-500" size={22} /> 核心驱动问题与学生确认
            </h2>
          </div>
          <Pill tone={selectedCount === joined && joined > 0 ? "green" : "blue"}>
            已确认 {selectedCount}/{joined}
          </Pill>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
          <div className="space-y-3">
            {inquiryQuestions.map((question, index) => {
              const students = studentSelections
                .filter((selection) => selection.topic === question)
                .map((selection) => selection.student.name);
              return (
                <div className="rounded-[9px] border border-stone-200 bg-white p-3" key={question}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-50 text-sm font-bold text-amber-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-7 text-stone-900">{question}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Pill tone={students.length ? "blue" : "gray"}>{students.length} 人选择</Pill>
                        {students.map((name) => (
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600" key={name}>
                            {name}
                          </span>
                        ))}
                        {!students.length ? <span className="text-xs text-stone-400">暂时无人选择</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {!inquiryQuestions.length ? (
              <div className="rounded-[9px] border border-dashed border-amber-200 bg-amber-50/50 py-8 text-center text-sm text-amber-800">
                尚未设置项目核心驱动问题，请立即补充。
              </div>
            ) : null}
          </div>

          <div className="rounded-[9px] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/35 p-3.5">
            <h3 className="font-bold text-stone-900">更新核心驱动问题</h3>
            <TextArea
              className="mt-3 min-h-20 bg-white"
              onChange={(event) => setNewInquiryQuestion(event.target.value)}
              placeholder="例如：我们如何利用实地数据，为学校设计一套可验证的节水改进方案？"
              value={newInquiryQuestion}
            />
            <PrimaryButton
              className="mt-3 w-full justify-center"
              size="sm"
              disabled={!newInquiryQuestion.trim() || inquiryQuestions.includes(newInquiryQuestion.trim())}
              onClick={addInquiryQuestion}
            >
              <Plus size={16} /> 更新并发布核心问题
            </PrimaryButton>
            <div className="mt-4 border-t border-[var(--pbl-teacher-border)] pt-4">
              <p className="text-xs font-bold text-stone-600">尚未确认的学生</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {studentSelections
                  .filter(({ topic }) => !topic || !inquiryQuestions.includes(topic))
                  .map(({ student }) => (
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-600 shadow-sm" key={student.id}>
                      {student.name}
                    </span>
                  ))}
                {selectedCount === joined && joined > 0 ? <span className="text-xs text-emerald-700">全员已完成选题</span> : null}
                {joined === 0 ? <span className="text-xs text-stone-400">等待学生加入课堂</span> : null}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card compact>
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Megaphone className="text-blue-700" size={20} /> 课堂公告管理
          </h2>
          <ul className="space-y-3">
            {(course.announcements ?? []).map((announcement) => (
              <li className="rounded-[8px] border border-stone-200 bg-white p-3" key={announcement.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-800">{announcement.title}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-500">{announcement.content}</p>
                    <div className="mt-2 text-xs text-stone-400">
                      {new Date(announcement.createdAt).toLocaleString("zh-CN")} · {announcement.replies.length} 条回复
                    </div>
                  </div>
                  <button
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] border border-[var(--pbl-danger-border)] text-[var(--pbl-danger)] hover:bg-[var(--pbl-danger-soft)]"
                    onClick={() => session.deleteAnnouncement(course.id, announcement.id)}
                    type="button"
                    aria-label="删除公告"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
            {!course.announcements?.length ? (
              <li className="rounded-[8px] border border-dashed border-stone-300 bg-stone-50 py-5 text-center text-sm text-stone-500">暂无公告</li>
            ) : null}
          </ul>
        </Card>

        <Card compact>
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
            <Users className="text-blue-700" size={20} /> 已加入学生（{joined}）
          </h2>
          {joined > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <AvatarStack names={course.students.map((s) => s.name)} />
                <span className="text-sm text-stone-500">最近加入：{course.students[course.students.length - 1]?.name}</span>
              </div>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {course.students.map((s) => (
                  <li className="flex items-center gap-3 rounded-[6px] border border-stone-200 bg-white px-3 py-2" key={s.id}>
                    <Avatar name={s.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                    <Pill tone={course.groups?.some((g) => g.members.some((m) => m.studentId === s.id)) ? "green" : "orange"}>
                      {course.groups?.some((g) => g.members.some((m) => m.studentId === s.id)) ? "项目空间就绪" : "正在初始化"}
                    </Pill>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[6px] border border-dashed border-stone-300 py-5 text-center text-sm text-stone-500">
              <CheckCheck className="mx-auto mb-2 text-stone-300" size={20} />
              等待学生通过邀请码加入...
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[8px] border border-stone-200 bg-stone-50/70 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-500"><FileText size={13} />{title}</div>
      <p className="mt-1 text-sm leading-6 text-stone-800">{text}</p>
    </div>
  );
}

function StatCard({ title, value, sub, icon, progress, tone = "blue" }: { title: string; value: string; sub: string; icon: ReactNode; progress: number; tone?: "blue" | "emerald" | "amber" | "rose" }) {
  const toneColor = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    amber: "bg-[var(--pbl-warning-soft)]",
    rose: "bg-[var(--pbl-danger-soft)]",
  }[tone];
  return (
    <Card compact className="group transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-stone-500">{title}</div>
        <div className={`grid h-8 w-8 place-items-center rounded-[9px] ${toneColor}`}>{icon}</div>
      </div>
      <div className="mt-1.5 text-xl font-bold text-stone-900">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-stone-500">{sub}</div>
      <div className="mt-2.5">
        <ProgressBar className="h-1.5" tone={tone === "blue" ? "blue" : tone === "emerald" ? "green" : "orange"} value={progress} />
      </div>
    </Card>
  );
}
