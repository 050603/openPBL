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
  Target,
  Trash2,
  Users,
  Plus,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar, PrimaryButton, TextArea, TextInput } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";

export function ProjectLaunchTeacherView({ course }: { course: Course }) {
  const session = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newInquiryQuestion, setNewInquiryQuestion] = useState("");
  const totalSeats = course.classConfig?.totalStudents ?? 40;
  const joined = course.students.length;
  const rate = Math.min(100, Math.round((joined / totalSeats) * 100));
  const projectSpaces = course.students.filter((student) => course.groups?.some((project) => project.members.some((member) => member.studentId === student.id))).length;
  const announcementRead = course.announcements?.length ? Math.round((joined / Math.max(1, totalSeats)) * 100) : 0;
  const inquiryQuestions = course.pblConfig?.inquiryQuestions?.length
    ? course.pblConfig.inquiryQuestions
    : course.drivingQuestion
      ? [course.drivingQuestion]
      : [];
  const studentSelections = course.students.map((student) => ({
    student,
    topic: course.groups
      ?.find((project) => project.members.some((member) => member.studentId === student.id))
      ?.topic,
  }));
  const selectedCount = studentSelections.filter(({ topic }) =>
    topic ? inquiryQuestions.includes(topic) : false,
  ).length;

  function publish() {
    if (!title.trim() || !content.trim()) return;
    session.upsertAnnouncement(course.id, { title: title.trim(), content: content.trim(), pinned: true });
    setTitle("");
    setContent("");
  }

  function addInquiryQuestion() {
    const question = newInquiryQuestion.trim();
    if (!question || inquiryQuestions.includes(question)) return;
    const nextQuestions = [...inquiryQuestions, question];
    session.updateCourse(course.id, {
      drivingQuestion: course.drivingQuestion || question,
      pblConfig: normalizePblCourseConfig({
        ...course.pblConfig,
        inquiryQuestions: nextQuestions,
      }),
    });
    setNewInquiryQuestion("");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="到课情况" value={`${joined} / ${totalSeats}`} sub={`出勤率 ${rate}%`} icon={<Users className="text-blue-600" size={22} />} progress={rate} />
        <StatCard title="个人项目空间" value={`${projectSpaces}`} sub={`${joined} 名学生独立完成`} icon={<Sparkles className="text-emerald-600" size={22} />} progress={Math.min(100, Math.round((projectSpaces / Math.max(1, joined)) * 100))} tone="emerald" />
        <StatCard title="学生待办" value={`${course.todos?.length ?? 0}`} sub="阅读、理解任务、确认成果" icon={<HelpCircle className="text-[var(--pbl-warning)]" size={22} />} progress={66} tone="amber" />
        <StatCard title="公告触达" value={`${announcementRead}%`} sub={`${course.announcements?.length ?? 0} 条公告`} icon={<Bell className="text-[var(--pbl-danger)]" size={22} />} progress={announcementRead} tone="rose" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Flag className="text-blue-700" size={20} /> 项目概览
            </h2>
            <Pill tone="blue">阶段一 · 项目启动</Pill>
          </div>
          <div className="space-y-4">
            <Field title="主驱动问题" text={course.drivingQuestion} />
            <Field title="项目目标" text={course.summary} />
            <div className="rounded-[8px] border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Target size={16} /> 重点关注
              </div>
              <p className="mt-2 text-sm leading-7 text-stone-700">
                学生需要理解真实情境、驱动问题、个人成果要求与评价标准。每名学生独立承担完整项目，AI 伴学小组提供认知支持。
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Megaphone className="text-[var(--pbl-warning)]" size={20} /> 发布课堂公告
          </h2>
          <div className="space-y-3">
            <TextInput placeholder="公告标题" value={title} onChange={(event) => setTitle(event.target.value)} />
            <TextArea className="min-h-28" placeholder="公告内容，例如：本节课结束前请完成兴趣方向选择..." value={content} onChange={(event) => setContent(event.target.value)} />
            <PrimaryButton className="w-full" onClick={publish} disabled={!title.trim() || !content.trim()}>
              <Send size={16} /> 发布公告
            </PrimaryButton>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--pbl-teacher)]">项目问题现场管理</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-stone-900">
              <Lightbulb className="text-amber-500" size={22} /> 启发问题与学生选题
            </h2>
            <p className="mt-1 text-sm text-stone-500">课堂中新增的问题会同步到学生端；已有学生选择不会被覆盖。</p>
          </div>
          <Pill tone={selectedCount === joined && joined > 0 ? "green" : "blue"}>
            已选择 {selectedCount}/{joined}
          </Pill>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <div className="space-y-3">
            {inquiryQuestions.map((question, index) => {
              const students = studentSelections
                .filter((selection) => selection.topic === question)
                .map((selection) => selection.student.name);
              return (
                <div className="rounded-[9px] border border-stone-200 bg-white p-4" key={question}>
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
                尚未设置项目启发问题，请立即添加。
              </div>
            ) : null}
          </div>

          <div className="rounded-[9px] border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/35 p-4">
            <h3 className="font-bold text-stone-900">课堂中增加问题</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">适合根据课堂讨论即时增加新的真实情境或研究切入点。</p>
            <TextArea
              className="mt-3 min-h-28 bg-white"
              onChange={(event) => setNewInquiryQuestion(event.target.value)}
              placeholder="例如：我们如何利用实地数据，为学校设计一套可验证的节水改进方案？"
              value={newInquiryQuestion}
            />
            <PrimaryButton
              className="mt-3 w-full justify-center"
              disabled={!newInquiryQuestion.trim() || inquiryQuestions.includes(newInquiryQuestion.trim())}
              onClick={addInquiryQuestion}
            >
              <Plus size={16} /> 发布到学生选题池
            </PrimaryButton>
            <div className="mt-4 border-t border-[var(--pbl-teacher-border)] pt-4">
              <p className="text-xs font-bold text-stone-600">尚未选择的学生</p>
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

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
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
              <li className="rounded-[8px] border border-dashed border-stone-300 bg-stone-50 py-8 text-center text-sm text-stone-500">暂无公告</li>
            ) : null}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
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
            <div className="rounded-[6px] border border-dashed border-stone-300 py-8 text-center text-sm text-stone-500">
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
    <div>
      <div className="text-sm font-semibold text-stone-500">{title}</div>
      <p className="mt-1 text-[15px] leading-7 text-stone-800">{text}</p>
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
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-500">{title}</div>
        <div className={`grid h-9 w-9 place-items-center rounded-full ${toneColor}`}>{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-stone-900">{value}</div>
      <div className="mt-1 text-xs text-stone-500">{sub}</div>
      <div className="mt-3">
        <ProgressBar className="h-1.5" tone={tone === "blue" ? "blue" : tone === "emerald" ? "green" : "orange"} value={progress} />
      </div>
    </Card>
  );
}
