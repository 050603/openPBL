"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  PlayCircle,
  Sparkles,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { InviteCodeCard } from "@/components/invite-code-card";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { isStudentOnline } from "@/lib/session/actions";

export default function TeachSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, startTeaching, generateNewInviteCode } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();

  const existing = course?.classConfig;
  const [totalStudents, setTotalStudents] = useState<number>(existing?.totalStudents ?? 32);

  // ===== Online status: recompute every 5s =====
  // isStudentOnline compares lastSeenAt against current time; re-render
  // periodically so the UI reflects students going offline.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!course || course.status !== "teaching") return;
    const id = window.setInterval(() => setNowTick((t) => t + 1), 5_000);
    return () => window.clearInterval(id);
  }, [course?.id, course?.status]);
  void nowTick;

  // Sync local state if course changes
  useEffect(() => {
    if (!course?.classConfig) return;
    setTotalStudents(course.classConfig.totalStudents);
  }, [course?.classConfig]);

  const inviteCode = course?.inviteCode;
  const isTeaching = course?.status === "teaching";

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-stone-500">
          未找到课程。
          <Link className="mt-4 text-blue-700 hover:underline" href="/teacher">
            返回课程列表
          </Link>
        </div>
      </DashboardShell>
    );
  }

  function start() {
    if (!course) return;
    const code = startTeaching(course.id, {
      groupMode: "solo",
      totalStudents: Math.max(1, Number(totalStudents) || 1),
      perGroup: 1,
      crossClass: false,
    });
    router.push(`/teacher/teach-classroom/${course.id}`);
    return code;
  }

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
          href="/teacher"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-bold">班级配置</h1>
          <p className="mt-1 text-sm text-stone-500">{course.name} · 确认个人项目课堂人数，开始上课</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_400px] gap-5">
        <div className="space-y-5">
          <Card>
            <h2 className="text-xl font-bold">课堂协作方式</h2>
            <p className="mt-1 text-sm text-stone-500">新课堂模式固定采用“个人项目 + AI 伴学小组”</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[8px] border border-blue-300 bg-blue-50 p-4"><div className="flex items-center gap-2 font-bold text-blue-800"><Users size={19} />每名学生独立完成项目</div><p className="mt-2 text-sm leading-6 text-stone-600">学生承担构思、决策、制作、汇报与反思，不再进行真实学生分组。</p></div>
              <div className="rounded-[8px] border border-violet-200 bg-violet-50 p-4"><div className="flex items-center gap-2 font-bold text-violet-800"><Sparkles size={19} />角色化 AI 伴学小组</div><p className="mt-2 text-sm leading-6 text-stone-600">知识、启发、质疑、方案、评审和记录伙伴提供全过程认知支架。</p></div>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-bold">人数与配置</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-700">
                  班级总人数
                </span>
                <input
                  className="h-11 w-full rounded-[6px] border border-stone-300 px-4 outline-none focus:border-blue-500"
                  min={1}
                  onChange={(e) => setTotalStudents(Number(e.target.value) || 1)}
                  type="number"
                  value={totalStudents}
                />
              </label>
              <div>
                <span className="mb-2 block text-sm font-semibold text-stone-700">
                  预计个人项目数
                </span>
                <div className="flex h-11 items-center rounded-[6px] border border-stone-200 bg-stone-50 px-4 text-base font-bold text-stone-700">
                  <Users className="mr-2 text-stone-400" size={18} /> {totalStudents} 个
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone-500">每位加入课堂的学生都会自动获得一个私有项目空间和一组 AI 伴学伙伴。</p>
          </Card>

          <Card>
            <h2 className="text-xl font-bold">课程信息确认</h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <dt className="text-stone-500">课程</dt>
                <dd className="mt-0.5 font-semibold">{course.name}</dd>
              </div>
              <div>
                <dt className="text-stone-500">学科 / 年级</dt>
                <dd className="mt-0.5 font-semibold">
                  {course.subject} · {course.grade}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">课时</dt>
                <dd className="mt-0.5 font-semibold">{course.hours}</dd>
              </div>
              <div>
                <dt className="text-stone-500">阶段数</dt>
                <dd className="mt-0.5 font-semibold">{course.stages.length}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <aside className="space-y-5">
          {inviteCode ? (
            <InviteCodeCard
              code={inviteCode}
              hint={
                isTeaching
                  ? "课堂进行中，学生可通过此码加入"
                  : "点击「开始上课」后学生可凭此码加入"
              }
              onRefresh={() => generateNewInviteCode(course.id)}
            />
          ) : (
            <Card>
              <h2 className="text-lg font-bold">邀请码</h2>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                点击「开始上课」后，系统将自动生成 6 位邀请码，学生可在学生端输入加入。
              </p>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-bold">在线学生</h2>
            <div className="mt-3 flex items-center gap-2 text-sm text-stone-500">
              <Users className="text-stone-400" size={16} />
              {isTeaching
                ? `当前 ${course.students.filter((s) => isStudentOnline(s)).length} 人在线（共 ${course.students.length} 人加入）`
                : "课堂尚未开始"}
            </div>
            {isTeaching && course.students.length > 0 ? (
              <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
                {course.students.map((s) => {
                  const online = isStudentOnline(s);
                  return (
                    <li
                      className="flex items-center gap-2 rounded-[6px] border border-stone-200 bg-white px-3 py-2"
                      key={s.id}
                    >
                      <span className="relative">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                          {s.name.slice(0, 1)}
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-stone-300"}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="flex-1 text-sm font-semibold">
                        {s.name}
                      </span>
                      {online ? (
                        <Pill tone="green">在线</Pill>
                      ) : (
                        <Pill tone="gray">离线</Pill>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>

          <Card>
            {isTeaching ? (
              <PrimaryButton
                className="h-12 w-full text-base"
                onClick={() => router.push(`/teacher/teach-classroom/${course.id}`)}
                type="button"
              >
                <PlayCircle size={18} /> 进入教室
              </PrimaryButton>
            ) : (
              <PrimaryButton
                className="h-12 w-full text-base"
                onClick={start}
                type="button"
              >
                <PlayCircle size={18} /> 开始上课
              </PrimaryButton>
            )}
            <p className="mt-3 text-center text-xs text-stone-500">
              {isTeaching
                ? "课堂已开启，可随时进入教室推进阶段"
                : "点击开始上课后，邀请码将激活，学生可加入"}
            </p>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
