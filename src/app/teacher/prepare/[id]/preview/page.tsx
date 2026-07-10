"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Edit3,
  MonitorPlay,
  PlayCircle,
  Send,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { useSession, useCourse, useHydrated } from "@/lib/session/store";

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

export default function PreviewCoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, publishCourse, updateCourse } = useSession();
  const course = useCourse(params?.id);
  const hydrated = useHydrated();
  const [publishing, setPublishing] = useState(false);

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

  const isPublished = course.status === "ready" || course.status === "teaching" || course.status === "finished";

  async function publish() {
    if (!course) return;
    setPublishing(true);
    publishCourse(course.id);
    setTimeout(() => {
      setPublishing(false);
      router.push("/teacher");
    }, 500);
  }

  function startTeaching() {
    if (!course) return;
    router.push(`/teacher/teach-setup/${course.id}`);
  }

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      currentCourse={{ id: course.id, name: course.name, status: course.status }}
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={3} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          href={`/teacher/prepare/${course.id}/verify`}
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-[28px] font-black">课程预览</h1>
          <p className="mt-1 text-sm text-slate-500">
            {course.name} · 完整预览后可发布或开始授课
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isPublished ? <Pill tone="green">已发布</Pill> : <Pill tone="amber">未发布</Pill>}
          <Link
            className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            href={`/teacher/prepare/${course.id}/verify`}
          >
            <Edit3 size={15} /> 修改
          </Link>
          {course.teacherClassroomId ? (
            <Link
              className="inline-flex h-10 items-center gap-1.5 rounded-[6px] border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              href={`/teacher/prepare/${course.id}/resources`}
              title="查看课程引入与 PBL 题目讲解资源"
            >
              <MonitorPlay size={15} /> 教师授课资源
            </Link>
          ) : null}
          {!isPublished ? (
            <PrimaryButton
              className="h-11 px-6"
              disabled={publishing}
              onClick={publish}
              type="button"
            >
              <Send size={17} /> {publishing ? "发布中..." : "发布课程"}
            </PrimaryButton>
          ) : (
            <PrimaryButton className="h-11 px-6" onClick={startTeaching} type="button">
              <PlayCircle size={17} /> 开始授课
            </PrimaryButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        <div className="space-y-5">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-xl font-black">PBL 大纲</h2>
              <Pill tone="blue">核心</Pill>
            </div>
            <p className="whitespace-pre-line text-[15px] leading-8 text-slate-700">
              {course.content.pblOutline || "（未填写）"}
            </p>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-xl font-black">课程授课大纲</h2>
              <Pill tone="blue">教案级</Pill>
            </div>
            {course.content.teachingOutline?.length ? (
              <ol className="space-y-3">
                {course.content.teachingOutline.map((item, index) => (
                  <li
                    className="rounded-[8px] border border-slate-200 p-4"
                    key={item.id}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                        {index + 1}
                      </span>
                      <span className="font-black">{item.title}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {item.durationMin} 分钟
                      </span>
                      {item.openMaicUse ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {item.openMaicUse === "student-ai-learning"
                            ? "学生 AI 授知"
                            : item.openMaicUse === "teacher-resource"
                              ? "教师资源"
                              : "普通活动"}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <p className="leading-6 text-slate-600">
                        <b className="text-slate-800">目标：</b>
                        {item.teachingGoal}
                      </p>
                      <p className="leading-6 text-slate-600">
                        <b className="text-slate-800">学生活动：</b>
                        {item.studentActivity}
                      </p>
                      <p className="leading-6 text-slate-600">
                        <b className="text-slate-800">教师：</b>
                        {item.teacherRole}
                      </p>
                      <p className="leading-6 text-slate-600">
                        <b className="text-slate-800">平台 / AI：</b>
                        平台：{item.platformRole}；AI：{item.aiRole}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">暂无课程授课大纲。</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-black">阶段安排</h2>
            <ol className="space-y-3">
              {course.stages.map((stage, i) => (
                <li
                  className="flex items-start gap-3 rounded-[8px] border border-slate-200 p-4"
                  key={stage.key}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="text-base font-black">{stage.label}</div>
                    <p className="mt-1 text-sm text-slate-500">
                      {stage.description}
                    </p>
                  </div>
                  <ChevronRight className="text-slate-300" size={18} />
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-black">知识点（{course.content.knowledgePoints.length}）</h2>
            <div className="grid grid-cols-2 gap-3">
              {course.content.knowledgePoints.map((kp) => (
                <div
                  className="rounded-[8px] border border-slate-200 p-3"
                  key={kp.id}
                >
                  <div className="text-sm font-black">{kp.name}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {kp.description}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-black">
              AI 授知章节（{course.content.lessonOutline.length}）
            </h2>
            {course.content.lessonOutline.length === 0 ? (
              <p className="text-sm text-slate-500">暂无 AI 授知章节。</p>
            ) : (
              <ol className="space-y-3">
                {course.content.lessonOutline.map((lo, i) => (
                  <li
                    className="rounded-[8px] border border-slate-200 p-4"
                    key={lo.id}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                        {i + 1}
                      </span>
                      <span className="text-base font-black">{lo.title}</span>
                      <span className="ml-auto text-xs text-slate-500">
                        {lo.durationMin} 分钟
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="mb-1 text-xs font-semibold text-slate-500">教学目标</div>
                        <ul className="list-disc space-y-1 pl-5 text-slate-700">
                          {lo.objectives.map((o, idx) => (
                            <li key={idx}>{o}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold text-slate-500">教学活动</div>
                        <ul className="list-disc space-y-1 pl-5 text-slate-700">
                          {lo.activities.map((a, idx) => (
                            <li key={idx}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-black">评价方案</h2>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-3">维度</th>
                  <th className="p-3 w-24">权重</th>
                  <th className="p-3">说明</th>
                </tr>
              </thead>
              <tbody>
                {course.content.evaluationPlan.dimensions.map((d) => (
                  <tr className="border-b border-slate-100" key={d.id}>
                    <td className="p-3 font-semibold">{d.name}</td>
                    <td className="p-3 font-bold text-blue-700">{d.weight}%</td>
                    <td className="p-3 text-slate-600">{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {course.content.evaluationPlan.overallRubric ? (
              <div className="mt-4 rounded-[6px] border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                <b className="text-slate-700">整体说明：</b>
                {course.content.evaluationPlan.overallRubric}
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-black">课程信息</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">课程名称</dt>
                <dd className="font-semibold">{course.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">学科 / 年级</dt>
                <dd className="font-semibold">
                  {course.subject} · {course.grade}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">课时</dt>
                <dd className="font-semibold">{course.hours}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">阶段数</dt>
                <dd className="font-semibold">{course.stages.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">知识点数</dt>
                <dd className="font-semibold">{course.content.knowledgePoints.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">状态</dt>
                <dd className="font-semibold">
                  {isPublished ? "已发布" : "备课中"}
                </dd>
              </div>
            </dl>
          </Card>

          {course.drivingQuestion ? (
            <Card>
              <h2 className="text-lg font-black">驱动问题</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">
                {course.drivingQuestion}
              </p>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-black">发布清单</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { label: "PBL 大纲", done: !!course.content.pblOutline },
                {
                  label: `课程授课大纲 (${course.content.teachingOutline?.length ?? 0})`,
                  done: (course.content.teachingOutline?.length ?? 0) > 0,
                },
                {
                  label: `知识点 (${course.content.knowledgePoints.length})`,
                  done: course.content.knowledgePoints.length > 0,
                },
                {
                  label: `AI 授知章节 (${course.content.lessonOutline.length})`,
                  done: course.content.lessonOutline.length > 0,
                },
                {
                  label: `评价维度 (${course.content.evaluationPlan.dimensions.length})`,
                  done: course.content.evaluationPlan.dimensions.length > 0,
                },
              ].map((item) => (
                <li
                  className="flex items-center gap-2"
                  key={item.label}
                >
                  <span
                    className={
                      item.done
                        ? "grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"
                        : "grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-slate-500"
                    }
                  >
                    {item.done ? <Check size={12} /> : "·"}
                  </span>
                  <span className={item.done ? "text-slate-700" : "text-slate-500"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
