"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  PlayCircle,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { InviteCodeCard } from "@/components/invite-code-card";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";
import { GROUP_MODE_LABEL, type GroupMode } from "@/lib/session/types";
import { isStudentOnline } from "@/lib/session/actions";

const GROUP_OPTIONS: { key: GroupMode; description: string }[] = [
  { key: "none", description: "全班统一进度，不分组" },
  { key: "solo", description: "每人独立一组，独立完成项目" },
  { key: "free", description: "学生自由组建小组" },
  { key: "random", description: "系统按设定人数随机分组" },
  { key: "assigned", description: "教师手动指定小组成员" },
];

export default function TeachSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, startTeaching, updateCourse, generateNewInviteCode } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();

  const existing = course?.classConfig;
  const [groupMode, setGroupMode] = useState<GroupMode>(existing?.groupMode ?? "free");
  const [totalStudents, setTotalStudents] = useState<number>(existing?.totalStudents ?? 32);
  const [perGroup, setPerGroup] = useState<number>(existing?.perGroup ?? 4);
  const [crossClass, setCrossClass] = useState<boolean>(existing?.crossClass ?? false);

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
    setGroupMode(course.classConfig.groupMode);
    setTotalStudents(course.classConfig.totalStudents);
    setPerGroup(course.classConfig.perGroup ?? 4);
    setCrossClass(!!course.classConfig.crossClass);
  }, [course?.classConfig]);

  const inviteCode = course?.inviteCode;
  const isTeaching = course?.status === "teaching";

  const groupCount = useMemo(() => {
    if (groupMode === "none" || groupMode === "solo") return totalStudents;
    return Math.max(1, Math.ceil(totalStudents / Math.max(1, perGroup)));
  }, [groupMode, totalStudents, perGroup]);

  if (!hydrated) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">加载中…</div>
      </DashboardShell>
    );
  }

  if (!course) {
    return (
      <DashboardShell role="teacher" userName={user.name} variant="bare">
        <div className="grid place-items-center py-20 text-slate-500">
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
      groupMode,
      totalStudents: Math.max(1, Number(totalStudents) || 1),
      perGroup: (groupMode === "none" || groupMode === "solo") ? undefined : Math.max(1, Number(perGroup) || 1),
      crossClass,
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
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          href="/teacher"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-black">班级配置</h1>
          <p className="mt-1 text-sm text-slate-500">{course.name} · 设置分组与人数，开始上课</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_400px] gap-5">
        <div className="space-y-5">
          <Card>
            <h2 className="text-xl font-black">分组方式</h2>
            <p className="mt-1 text-sm text-slate-500">选择适合本课程的小组形式</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {GROUP_OPTIONS.map((opt) => {
                const active = groupMode === opt.key;
                return (
                  <button
                    className={
                      "rounded-[8px] border p-4 text-left transition " +
                      (active
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-blue-300")
                    }
                    key={opt.key}
                    onClick={() => setGroupMode(opt.key)}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          "grid h-5 w-5 place-items-center rounded-full border " +
                          (active
                            ? "border-blue-600 bg-blue-600"
                            : "border-slate-300")
                        }
                      >
                        {active ? (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        ) : null}
                      </span>
                      <span
                        className={
                          "text-base font-black " +
                          (active ? "text-blue-700" : "text-slate-800")
                        }
                      >
                        {GROUP_MODE_LABEL[opt.key]}
                      </span>
                    </div>
                    <p className="mt-1 pl-7 text-sm text-slate-500">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-black">人数与配置</h2>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  班级总人数
                </span>
                <input
                  className="h-11 w-full rounded-[6px] border border-slate-300 px-4 outline-none focus:border-blue-500"
                  min={1}
                  onChange={(e) => setTotalStudents(Number(e.target.value) || 1)}
                  type="number"
                  value={totalStudents}
                />
              </label>
              <label
                className={
                  "block " + (groupMode === "none" || groupMode === "solo" ? "opacity-50" : "")
                }
              >
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  每组人数
                </span>
                <input
                  className="h-11 w-full rounded-[6px] border border-slate-300 px-4 outline-none focus:border-blue-500 disabled:bg-slate-100"
                  disabled={groupMode === "none" || groupMode === "solo"}
                  min={1}
                  onChange={(e) => setPerGroup(Number(e.target.value) || 1)}
                  type="number"
                  value={perGroup}
                />
              </label>
              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">
                  预计小组数
                </span>
                <div className="flex h-11 items-center rounded-[6px] border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-700">
                  <Users className="mr-2 text-slate-400" size={18} /> {groupCount} 组
                </div>
              </div>
            </div>
            <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={crossClass}
                className="h-4 w-4 accent-blue-600"
                onChange={(e) => setCrossClass(e.target.checked)}
                type="checkbox"
              />
              允许跨班分组
            </label>
          </Card>

          <Card>
            <h2 className="text-xl font-black">课程信息确认</h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <dt className="text-slate-500">课程</dt>
                <dd className="mt-0.5 font-semibold">{course.name}</dd>
              </div>
              <div>
                <dt className="text-slate-500">学科 / 年级</dt>
                <dd className="mt-0.5 font-semibold">
                  {course.subject} · {course.grade}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">课时</dt>
                <dd className="mt-0.5 font-semibold">{course.hours}</dd>
              </div>
              <div>
                <dt className="text-slate-500">阶段数</dt>
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
              <h2 className="text-lg font-black">邀请码</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                点击「开始上课」后，系统将自动生成 6 位邀请码，学生可在学生端输入加入。
              </p>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-black">在线学生</h2>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Users className="text-slate-400" size={16} />
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
                      className="flex items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-3 py-2"
                      key={s.id}
                    >
                      <span className="relative">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                          {s.name.slice(0, 1)}
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-slate-300"}`}
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
            <p className="mt-3 text-center text-xs text-slate-500">
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
