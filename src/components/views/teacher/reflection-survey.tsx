"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Download,
  FileText,
  MessageSquareText,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar } from "@/components/ui";
import type {
  Course,
  ReflectionRecord,
  ReflectionSurveyResponseV1,
} from "@/lib/session/types";
import {
  REFLECTION_SURVEY_SCALE,
  latestReflectionByStudent,
  normalizeReflectionSurvey,
  reflectionSurveyAverage,
  reflectionSurveyDistribution,
} from "@/lib/reflection-survey";
import { StagePageHeader } from "@/components/classroom/classroom-ui";

const SCORE_FIELDS: Array<{
  key: "aiHelpfulness" | "systemUsability" | "reuseIntention";
  label: string;
}> = [
  { key: "aiHelpfulness", label: "AI 引导帮助" },
  { key: "systemUsability", label: "系统易理解" },
  { key: "reuseIntention", label: "继续使用意愿" },
];

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}

function surveyFor(record?: ReflectionRecord): ReflectionSurveyResponseV1 | undefined {
  return normalizeReflectionSurvey(record?.survey);
}

export function NewReflectionTeacherView({ course }: { course: Course }) {
  const [expandedStudentId, setExpandedStudentId] = useState<string>();
  const latest = useMemo(() => latestReflectionByStudent(course.reflections), [course.reflections]);
  const submitted = useMemo(
    () => course.students
      .map((student) => ({ student, reflection: latest.get(student.id) }))
      .map((item) => ({ ...item, survey: surveyFor(item.reflection) }))
      .filter((item) => Boolean(item.survey)),
    [course.students, latest],
  );
  const submittedRecords = submitted
    .map((item) => item.reflection)
    .filter((reflection): reflection is ReflectionRecord => Boolean(surveyFor(reflection)));
  const submittedCount = submitted.length;
  const totalStudents = course.students.length;
  const completionRate = totalStudents ? Math.round((submittedCount / totalStudents) * 100) : 0;
  const exportHref = `/api/courses/${encodeURIComponent(course.id)}/reflections/export`;

  return (
    <div className="classroom-stage space-y-5">
      <StagePageHeader
        action={<PrimaryButton disabled={!submittedCount} onClick={() => { window.location.href = exportHref; }} size="sm" tone="blue"><Download size={15} />导出 CSV</PrimaryButton>}
        description="查看课程收获、系统体验与 AI 组员反馈。"
        title="学生反思数据"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Users className="text-blue-600" size={20} />} label="已提交" value={`${submittedCount} / ${totalStudents}`} detail={`提交率 ${completionRate}%`} />
        {SCORE_FIELDS.map(({ key, label }) => (
          <MetricCard
            detail="有效回答平均分"
            icon={<BarChart3 className="text-[var(--pbl-teacher)]" size={20} />}
            key={key}
            label={label}
            value={reflectionSurveyAverage(submittedRecords, key)?.toFixed(1) ?? "—"}
          />
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 className="text-[var(--pbl-teacher)]" size={19} />量表分布</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">只统计已提交且有完整结构化回答的学生；每个量表单独计算。</p>
          </div>
          <Pill tone={submittedCount ? "green" : "gray"}>{submittedCount ? `${submittedCount} 份有效回答` : "暂无有效回答"}</Pill>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {SCORE_FIELDS.map(({ key, label }) => {
            const distribution = reflectionSurveyDistribution(submittedRecords, key);
            const scoreCount = Object.values(distribution).reduce((sum, count) => sum + count, 0);
            return (
              <section key={key}>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold"><span>{label}</span><span className="text-[var(--pbl-teacher)]">{reflectionSurveyAverage(submittedRecords, key)?.toFixed(1) ?? "—"} / 5</span></div>
                <div className="mt-3 space-y-2">
                  {REFLECTION_SURVEY_SCALE.map((option) => {
                    const count = distribution[option.value];
                    const percent = scoreCount ? Math.round((count / scoreCount) * 100) : 0;
                    return (
                      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-xs" key={option.value}>
                        <span className="font-semibold text-stone-600">{option.value}分</span>
                        <ProgressBar className="h-2" tone="blue" value={percent} />
                        <span className="text-right text-stone-500">{count} 人</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><MessageSquareText className="text-[var(--pbl-teacher)]" size={19} />逐生反思明细</h2>
            <p className="mt-1 text-sm text-stone-500">包含未提交学生；展开后查看两个开放回答。</p>
          </div>
          <span className="text-xs text-stone-500">姓名和学生编号按课程名单展示</span>
        </div>
        {course.students.length ? (
          <ul className="space-y-3">
            {course.students.map((student) => {
              const reflection = latest.get(student.id);
              const survey = surveyFor(reflection);
              const expanded = expandedStudentId === student.id;
              return (
                <li className="rounded-xl border border-stone-200 bg-white p-3" key={student.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={student.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-stone-900">{student.name}</div>
                      <div className="mt-0.5 text-xs text-stone-500">学生编号：{student.id}</div>
                    </div>
                    <div className="text-right text-xs text-stone-500">
                      <Pill size="sm" tone={survey ? "green" : "orange"}>{survey ? "已提交" : "待提交"}</Pill>
                      {reflection ? <div className="mt-1">提交于 {formatDate(reflection.updatedAt)}</div> : null}
                    </div>
                    {survey ? (
                      <button
                        aria-expanded={expanded}
                        aria-label={`${student.name}的反思详情`}
                        className="grid size-9 place-items-center rounded-lg border border-stone-200 text-stone-500 transition hover:border-blue-300 hover:text-blue-700"
                        onClick={() => setExpandedStudentId(expanded ? undefined : student.id)}
                        type="button"
                      >
                        <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} size={17} />
                      </button>
                    ) : null}
                  </div>
                  {survey ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {SCORE_FIELDS.map(({ key, label }) => <div className="rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] px-3 py-2 text-xs" key={key}><span className="text-stone-500">{label}</span><strong className="ml-2 text-sm text-[var(--pbl-teacher)]">{survey[key]} / 5</strong></div>)}
                    </div>
                  ) : reflection?.content ? (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">检测到旧版反思记录，尚未包含本阶段问卷数据。</p>
                  ) : null}
                  {expanded && survey ? <SurveyDetail survey={survey} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 py-12 text-center text-sm text-stone-500">暂无学生名单。</div>
        )}
      </Card>

    </div>
  );
}

function SurveyDetail({ survey }: { survey: ReflectionSurveyResponseV1 }) {
  return (
    <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3 lg:grid-cols-2">
      <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-stone-600"><FileText size={14} />课程与项目收获</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{survey.learningReflection}</p>
      </div>
      <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-stone-600"><MessageSquareText size={14} />系统与 AI 使用体验</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{survey.systemReflection}</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card compact>
      <div className="flex items-center justify-between gap-2"><span className="text-sm text-stone-500">{label}</span>{icon}</div>
      <div className="mt-2 text-2xl font-bold text-stone-900">{value}</div>
      <div className="mt-1 text-xs text-stone-500">{detail}</div>
    </Card>
  );
}
