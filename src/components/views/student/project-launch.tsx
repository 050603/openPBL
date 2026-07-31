"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  HelpCircle,
  MessageCircle,
  Target,
  UserRoundCheck,
} from "lucide-react";
import { Card, FileBadge, Pill, PrimaryButton } from "@/components/ui";
import { ProjectCoverImage } from "@/components/visuals";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import {
  buildCourseTopicOptions,
  getLaunchTodoKind,
  hasSelectedProjectTopic,
  haveAllResourcesBeenViewed,
} from "@/lib/project-launch-readiness";

export function ProjectLaunchView({ course }: { course: Course }) {
  const session = useSession();
  const [expandedAnnouncement, setExpandedAnnouncement] = useState<string | null>(course?.announcements?.[0]?.id ?? null);
  const studentId = session.studentId;
  const title = course?.name || "未命名项目";
  const drivingQ = course?.drivingQuestion || "暂无驱动问题，请联系教师补充。";
  const project = course.groups?.find((item) => item.members.some((member) => member.studentId === studentId));
  const resourcesRef = useRef<HTMLDivElement>(null);
  const topicOptions = useMemo(() => buildCourseTopicOptions(course), [course]);
  const inquiryQuestions = useMemo(
    () => topicOptions.map((option) => option.value),
    [topicOptions],
  );
  const [selectedTopic, setSelectedTopic] = useState(
    hasSelectedProjectTopic(project, inquiryQuestions)
      ? project?.topic ?? ""
      : inquiryQuestions.length === 1
        ? inquiryQuestions[0]
        : "",
  );
  const launchTodos = useMemo(
    () => (course.todos ?? []).map((todo) => ({ todo, kind: getLaunchTodoKind(todo) })),
    [course.todos],
  );
  const resourceTodo = launchTodos.find(({ kind }) => kind === "resources")?.todo;
  const topicTodo = launchTodos.find(({ kind }) => kind === "topic")?.todo;
  const viewedAllResources = haveAllResourcesBeenViewed(course, studentId);
  const topicSelected = hasSelectedProjectTopic(project, inquiryQuestions);
  const effectiveSelectedTopic =
    selectedTopic || (inquiryQuestions.length === 1 ? inquiryQuestions[0] : "");

  useEffect(() => {
    if (
      !project ||
      topicSelected ||
      inquiryQuestions.length !== 1
    ) {
      return;
    }
    session.setGroupTopic(course.id, project.id, { topic: inquiryQuestions[0] });
    if (topicTodo) session.completeTodo(course.id, topicTodo.id, true);
  }, [course.id, inquiryQuestions, project, session, topicSelected, topicTodo]);

  useEffect(() => {
    if (!studentId) return;
    for (const { todo, kind } of launchTodos) {
      const alreadyDone = todo.completedBy.includes(studentId);
      const shouldBeDone =
        kind === "personal-space" ||
        (kind === "resources" && viewedAllResources) ||
        (kind === "topic" && topicSelected);
      if (shouldBeDone && !alreadyDone) session.completeTodo(course.id, todo.id, true);
    }
  }, [course.id, launchTodos, session, studentId, topicSelected, viewedAllResources]);

  // 从 course.stages 派生时间表（替代 mock-data 的 projectTimeline）
  const projectTimeline = course.stages.map((stage, index) => {
    // Stage 类型无日期字段，使用 index 作为序号，description 作为副信息
    const subtitle = stage.description?.trim() || "—";
    return [String(index + 1), stage.label, subtitle] as const;
  });

  function saveTopic() {
    const topic = effectiveSelectedTopic.trim();
    if (!topic || !project) return;
    session.setGroupTopic(course.id, project.id, { topic });
    if (topicTodo) session.completeTodo(course.id, topicTodo.id, true);
  }

  function viewResource(resourceId: string, url?: string) {
    session.markResourceDownloaded(course.id, resourceId);
    const remainingResources = (course.resources ?? []).filter(
      (resource) =>
        resource.id !== resourceId && !(studentId && resource.downloadedBy.includes(studentId)),
    );
    if (remainingResources.length === 0 && resourceTodo) {
      session.completeTodo(course.id, resourceTodo.id, true);
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-bold tracking-[0] leading-tight text-stone-900 md:text-4xl">{title}</h1>
          <Pill tone="green">进行中</Pill>
        </div>
        <ProjectCoverImage course={course} className="h-56 w-full sm:h-60 md:h-64" />

        <Card>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-blue-600"><HelpCircle size={23} /></div>
            <div><p className="text-xs font-bold uppercase tracking-wider text-[var(--pbl-student)]">项目任务书</p><h2 className="text-xl font-bold text-stone-900">先理解问题，再确认自己的项目方向</h2></div>
          </div>
          <dl className="mt-5 grid gap-4">
            <div className="rounded-[10px] border border-stone-200 bg-stone-50/70 p-4"><dt className="flex items-center gap-2 text-sm font-bold text-stone-900"><HelpCircle size={17} className="text-[var(--pbl-student)]" />驱动问题</dt><dd className="mt-2 text-[15px] leading-7 text-stone-700">{drivingQ}</dd></div>
            <div className="rounded-[10px] border border-stone-200 bg-stone-50/70 p-4"><dt className="flex items-center gap-2 text-sm font-bold text-stone-900"><Target size={17} className="text-[var(--pbl-student)]" />学习目标</dt><dd className="mt-2 text-sm leading-6 text-stone-600">{course.summary || "教师尚未补充项目目标说明。"}</dd></div>
            <div className="rounded-[10px] border border-stone-200 bg-stone-50/70 p-4"><dt className="flex items-center gap-2 text-sm font-bold text-stone-900"><FileText size={17} className="text-[var(--pbl-student)]" />最终成果</dt><dd className="mt-2 text-sm leading-6 text-stone-600">{course.expectedOutcome?.trim() || "按教师发布的成果要求，完成一个可展示、可说明依据的个人项目成果。"}</dd></div>
          </dl>
          <div className="mt-4 rounded-[10px] border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm leading-6 text-stone-700">
            你独立负责完整项目；AI 伙伴只提供解释、提问、质疑和反馈，不能替你选择方向或提交成果。
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
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">启动准备</h2>
              <p className="mt-1 text-sm text-stone-500">完成实际操作后，状态会自动更新。</p>
            </div>
            <Pill tone={viewedAllResources && topicSelected ? "green" : "blue"}>
              {viewedAllResources && topicSelected ? "准备完成" : "进行中"}
            </Pill>
          </div>

          <div className="rounded-[8px] border border-stone-200 p-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[6px] ${viewedAllResources ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]" : "bg-[var(--pbl-student-soft)] text-blue-600"}`}>
                {viewedAllResources ? <CheckCircle2 size={22} /> : <Eye size={22} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">浏览课程资源</div>
                <div className="text-sm text-stone-500">
                  {(course.resources?.length ?? 0) === 0
                    ? "教师未上传资源，本项已自动完成"
                    : `已浏览 ${(course.resources ?? []).filter((resource) => studentId && resource.downloadedBy.includes(studentId)).length}/${course.resources?.length ?? 0}`}
                </div>
              </div>
              {!viewedAllResources ? (
                <button
                  className="h-9 rounded-[5px] border border-[var(--pbl-student-border)] px-3 text-sm font-semibold text-[var(--pbl-student)] hover:bg-[var(--pbl-student-soft)]"
                  onClick={() => resourcesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  type="button"
                >
                  去浏览
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 rounded-[8px] border border-stone-200 p-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[6px] ${topicSelected ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]" : "bg-[var(--pbl-student-soft)] text-blue-600"}`}>
                {topicSelected ? <CheckCircle2 size={22} /> : <Compass size={22} />}
              </div>
              <div>
                <div className="font-bold">选择研究主题</div>
                <div className="text-sm text-stone-500">
                  {topicSelected
                    ? `当前研究问题：${project?.topic}`
                    : inquiryQuestions.length === 0
                      ? "教师尚未发布项目启发问题"
                      : inquiryQuestions.length === 1
                        ? "系统将自动采用教师设置的项目问题"
                        : "选择你最感兴趣、最想深入研究的启发问题"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {topicOptions.map((option) => {
                const active = effectiveSelectedTopic === option.value;
                return (
                  <button
                    aria-pressed={active}
                    className={`rounded-[7px] border p-3 text-left transition ${active ? "border-[var(--pbl-student)] bg-[var(--pbl-student-soft)] ring-1 ring-[var(--pbl-student)]" : "border-stone-200 hover:border-[var(--pbl-student-border)]"}`}
                    key={option.value}
                    disabled={inquiryQuestions.length === 1}
                    onClick={() => setSelectedTopic(option.value)}
                    type="button"
                  >
                    <span className="block text-sm font-bold leading-6 text-stone-900">{option.value}</span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      {inquiryQuestions.length === 1 ? "教师设置的唯一项目问题，将自动选中" : "选择后，你的个人项目将围绕这个问题展开"}
                    </span>
                  </button>
                );
              })}
            </div>
            {inquiryQuestions.length > 1 ? (
              <PrimaryButton
                className="mt-3 w-full justify-center"
                disabled={!effectiveSelectedTopic.trim() || !project || effectiveSelectedTopic.trim() === project.topic}
                onClick={saveTopic}
              >
                {topicSelected ? "保存新的研究问题" : "确认选择并开始研究"}
              </PrimaryButton>
            ) : null}
            {!project ? <p className="mt-2 text-xs text-amber-700">个人项目空间正在创建，请稍后重试。</p> : null}
            {inquiryQuestions.length === 0 ? <p className="mt-2 text-xs text-amber-700">请等待教师在项目启动阶段发布问题。</p> : null}
          </div>

          {launchTodos.filter(({ kind }) => kind === "other").map(({ todo }) => {
            const done = Boolean(studentId && todo.completedBy.includes(studentId));
            return (
              <button
                className="mt-3 flex w-full items-center gap-3 rounded-[8px] border border-stone-200 p-3 text-left"
                disabled={done}
                key={todo.id}
                onClick={() => session.completeTodo(course.id, todo.id, true)}
                type="button"
              >
                {done ? <CheckCircle2 className="text-[var(--pbl-success)]" size={21} /> : <FileText className="text-blue-600" size={21} />}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{todo.title}</span>
                  <span className="block text-sm text-stone-500">{todo.description}</span>
                </span>
                <span className="text-sm font-semibold text-[var(--pbl-student)]">{done ? "已完成" : "标记完成"}</span>
              </button>
            );
          })}
        </Card>

        <div ref={resourcesRef}>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">相关资源</h2>
            <Pill tone="blue">{course.resources?.length ?? 0} 个</Pill>
          </div>
          <div className="space-y-3">
            {(course.resources ?? []).map((resource) => {
              const viewed = Boolean(studentId && resource.downloadedBy.includes(studentId));
              return (
                <button
                  className="flex w-full items-center gap-3 rounded-[8px] border border-stone-200 bg-white p-3 text-left transition hover:border-[var(--pbl-teacher-border)] hover:bg-[var(--pbl-student-soft)]/40"
                  key={resource.id}
                  onClick={() => viewResource(resource.id, resource.url)}
                  type="button"
                >
                  <FileBadge type={resource.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{resource.title}</div>
                    <div className="text-sm text-stone-500">{resource.type} · {resource.size}</div>
                    {resource.description ? <div className="mt-1 line-clamp-2 text-xs text-stone-400">{resource.description}</div> : null}
                  </div>
                  {viewed ? <Pill tone="green">已浏览</Pill> : <ExternalLink size={17} className="text-[var(--pbl-student)]" />}
                </button>
              );
            })}
            {!course.resources?.length ? (
              <div className="rounded-[8px] border border-dashed border-stone-300 bg-stone-50 py-7 text-center text-sm text-stone-500">
                教师暂未上传课程资源，无需额外操作。
              </div>
            ) : null}
          </div>
        </Card>
        </div>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">教师通知</h2>
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
                  <Pill tone={announcement.pinned ? "blue" : "gray"}>{announcement.pinned ? "置顶" : "通知"}</Pill>
                </button>
                {expandedAnnouncement === announcement.id ? (
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    <p className="text-sm leading-6 text-stone-700">{announcement.content}</p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">如有疑问，请在课堂中直接向教师提出，或请伴学伙伴先帮你整理问题。</p>
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

        <div className="flex min-h-14 items-center gap-3 rounded-[8px] border border-[var(--pbl-student-border)] bg-[var(--pbl-success-soft)] px-4 text-[var(--pbl-success)]"><UserRoundCheck size={24} /><span><span className="block font-bold">个人项目空间已准备</span><span className="text-sm">{project?.name ?? "进入方案阶段后即可开始独立构思"}</span></span></div>
      </aside>
    </div>
  );
}
