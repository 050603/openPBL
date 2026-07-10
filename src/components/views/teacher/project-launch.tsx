"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  CheckCheck,
  Flag,
  HelpCircle,
  Lightbulb,
  Megaphone,
  Send,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/dashboard-shell";
import { Card, Pill, ProgressBar, PrimaryButton, TextArea, TextInput } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";

export function ProjectLaunchTeacherView({ course }: { course: Course }) {
  const session = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const totalSeats = course.classConfig?.totalStudents ?? 40;
  const joined = course.students.length;
  const rate = Math.min(100, Math.round((joined / totalSeats) * 100));
  const grouped = course.groups?.reduce((sum, group) => sum + group.members.length, 0) ?? 0;
  const announcementRead = course.announcements?.length ? Math.round((joined / Math.max(1, totalSeats)) * 100) : 0;

  function publish() {
    if (!title.trim() || !content.trim()) return;
    session.upsertAnnouncement(course.id, { title: title.trim(), content: content.trim(), pinned: true });
    setTitle("");
    setContent("");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="到课情况" value={`${joined} / ${totalSeats}`} sub={`出勤率 ${rate}%`} icon={<Users className="text-blue-600" size={22} />} progress={rate} />
        <StatCard title="已入组学生" value={`${grouped}`} sub={`${course.groups?.length ?? 0} 个小组`} icon={<Lightbulb className="text-emerald-600" size={22} />} progress={Math.min(100, Math.round((grouped / Math.max(1, joined)) * 100))} tone="emerald" />
        <StatCard title="学生待办" value={`${course.todos?.length ?? 0}`} sub="阅读、选题、入组" icon={<HelpCircle className="text-amber-600" size={22} />} progress={66} tone="amber" />
        <StatCard title="公告触达" value={`${announcementRead}%`} sub={`${course.announcements?.length ?? 0} 条公告`} icon={<Bell className="text-rose-600" size={22} />} progress={announcementRead} tone="rose" />
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
            <Field title="驱动问题" text={course.drivingQuestion} />
            <Field title="项目目标" text={course.summary} />
            <div className="rounded-[8px] border border-blue-100 bg-blue-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                <Target size={16} /> 重点关注
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                学生需要完成：阅读项目说明、选择兴趣方向、加入小组。教师可在此发布公告并观察未入组学生。
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Megaphone className="text-amber-600" size={20} /> 发布课堂公告
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

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Megaphone className="text-blue-700" size={20} /> 课堂公告管理
          </h2>
          <ul className="space-y-3">
            {(course.announcements ?? []).map((announcement) => (
              <li className="rounded-[8px] border border-slate-200 bg-white p-3" key={announcement.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{announcement.title}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{announcement.content}</p>
                    <div className="mt-2 text-xs text-slate-400">
                      {new Date(announcement.createdAt).toLocaleString("zh-CN")} · {announcement.replies.length} 条回复
                    </div>
                  </div>
                  <button
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[6px] border border-red-100 text-red-500 hover:bg-red-50"
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
              <li className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">暂无公告</li>
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
                <span className="text-sm text-slate-500">最近加入：{course.students[course.students.length - 1]?.name}</span>
              </div>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {course.students.map((s) => (
                  <li className="flex items-center gap-3 rounded-[6px] border border-slate-200 bg-white px-3 py-2" key={s.id}>
                    <Avatar name={s.name} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                    <Pill tone={course.groups?.some((g) => g.members.some((m) => m.studentId === s.id)) ? "green" : "orange"}>
                      {course.groups?.some((g) => g.members.some((m) => m.studentId === s.id)) ? "已入组" : "待入组"}
                    </Pill>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[6px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              <CheckCheck className="mx-auto mb-2 text-slate-300" size={20} />
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
      <div className="text-sm font-semibold text-slate-500">{title}</div>
      <p className="mt-1 text-[15px] leading-7 text-slate-800">{text}</p>
    </div>
  );
}

function StatCard({ title, value, sub, icon, progress, tone = "blue" }: { title: string; value: string; sub: string; icon: ReactNode; progress: number; tone?: "blue" | "emerald" | "amber" | "rose" }) {
  const toneColor = {
    blue: "bg-blue-50",
    emerald: "bg-emerald-50",
    amber: "bg-amber-50",
    rose: "bg-rose-50",
  }[tone];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{title}</div>
        <div className={`grid h-9 w-9 place-items-center rounded-full ${toneColor}`}>{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
      <div className="mt-3">
        <ProgressBar className="h-1.5" tone={tone === "blue" ? "blue" : tone === "emerald" ? "green" : "orange"} value={progress} />
      </div>
    </Card>
  );
}
