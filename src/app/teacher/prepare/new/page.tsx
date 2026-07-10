"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Copy, Loader2, Wand2 } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Card, PrimaryButton } from "@/components/ui";
import { useSession, useHydrated } from "@/lib/session/store";
import { generateProjectSkeleton, type ProjectSkeletonResult } from "@/lib/teaching-ai/client-api";

type SkeletonResult = ProjectSkeletonResult;

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "生成课程" },
  { key: "preview", label: "预览发布" },
];

export default function PrepareNewPage() {
  const router = useRouter();
  const { createCourse, user } = useSession();
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [hours, setHours] = useState(8);
  const [summary, setSummary] = useState("");
  const [drivingQuestion, setDrivingQuestion] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [skeleton, setSkeleton] = useState<SkeletonResult | null>(null);
  const [skeletonError, setSkeletonError] = useState<string | undefined>();
  const [editedDimensions, setEditedDimensions] = useState<
    Array<{ name: string; weight: number; description: string }>
  >([]);

  async function generateSkeleton() {
    if (!name.trim()) {
      setSkeletonError("请先填写课程名称");
      return;
    }
    setSkeletonLoading(true);
    setSkeletonError(undefined);
    try {
      const result = await generateProjectSkeleton({
        courseName: name.trim(),
        subject: subject.trim(),
        grade: grade.trim(),
        hours: Number(hours) || 8,
        summary: summary.trim(),
        initialDrivingQuestion: drivingQuestion.trim(),
      });
      setSkeleton(result);
      setEditedDimensions(
        result.evaluationDimensions.map((d) => ({ ...d })),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 生成失败";
      setSkeletonError(message);
      window.alert(message);
    } finally {
      setSkeletonLoading(false);
    }
  }

  function applyDrivingQuestion(q: string) {
    setDrivingQuestion(q);
  }

  function copyScenario() {
    if (!skeleton) return;
    void navigator.clipboard?.writeText(skeleton.scenario);
  }

  function updateDimensionWeight(idx: number, weight: number) {
    setEditedDimensions((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, weight: Math.max(0, Math.min(100, weight)) } : d)),
    );
  }

  function next() {
    if (!name.trim()) {
      setError("请填写课程名称");
      return;
    }
    setError(undefined);
    const course = createCourse({
      name: name.trim(),
      subject: subject.trim(),
      grade: grade.trim(),
      hours: Number(hours) || 8,
      summary: summary.trim(),
      drivingQuestion: drivingQuestion.trim(),
    });
    router.push(`/teacher/prepare/${course.id}/verify`);
  }

  return (
    <DashboardShell
      role="teacher"
      userName={user.name}
      variant="bare"
      headerSlot={
        <div className="ml-4">
          <WizardStepper current={0} steps={STEPS} />
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Link
          className="grid h-9 w-9 place-items-center rounded-[6px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          href="/teacher"
        >
          <ArrowLeft size={17} />
        </Link>
        <h1 className="text-[28px] font-black">创建新课程</h1>
        <span className="text-base text-slate-500">· 填写基础信息，下一步由 AI 协助生成完整课程</span>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-5">
        <Card>
          <FormRow
            hint="建议不超过 30 字"
            label="课程名称"
            value={name}
            onChange={setName}
            placeholder="如：校园低碳生活解决方案"
            required
          />
          <div className="mt-6 grid grid-cols-3 gap-5">
            <FormRow
              label="学科"
              value={subject}
              onChange={setSubject}
              placeholder="如：环境科学"
            />
            <FormRow
              label="年级"
              value={grade}
              onChange={setGrade}
              placeholder="如：高一"
            />
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">课时</span>
              <div className="flex items-center gap-2">
                <input
                  className="h-11 w-full rounded-[6px] border border-slate-300 px-4 outline-none focus:border-blue-500"
                  min={1}
                  onChange={(e) => setHours(Number(e.target.value) || 1)}
                  type="number"
                  value={hours}
                />
                <span className="text-sm text-slate-500">课时</span>
              </div>
            </label>
          </div>
          <div className="mt-6">
            <FormRow
              label="课程简介"
              hint="简要描述课程的目标与内容（200 字以内）"
              value={summary}
              onChange={setSummary}
              placeholder="如：通过调研校园能源与垃圾分类现状，运用 AI 工具提出可落地的低碳生活方案。"
              multiline
            />
          </div>
          <div className="mt-6">
            <FormRow
              label="驱动问题"
              hint="可留空，由 AI 在下一步补充"
              value={drivingQuestion}
              onChange={setDrivingQuestion}
              placeholder="如：校园内能源浪费、一次性用品使用过多、垃圾分类不规范等现象普遍存在，如何通过创新方案推动校园低碳生活方式的形成？"
              multiline
            />
          </div>

          <div className="mt-6 rounded-[8px] border border-blue-100 bg-blue-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-blue-700">AI 生成项目骨架</div>
                <div className="mt-1 text-xs text-slate-500">
                  基于课程信息一键生成候选驱动问题、情境故事、成果形式与评价维度（可编辑后采纳）。
                </div>
              </div>
              <PrimaryButton
                onClick={() => void generateSkeleton()}
                disabled={skeletonLoading || !name.trim()}
                type="button"
              >
                {skeletonLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {skeletonLoading ? "生成中..." : "生成项目骨架"}
              </PrimaryButton>
            </div>
            {skeletonError ? (
              <div className="mt-3 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {skeletonError}
              </div>
            ) : null}
          </div>

          {skeleton ? (
            <div className="mt-5 space-y-4 rounded-[8px] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black">
                  <Wand2 size={16} className="mr-1 inline text-amber-600" />
                  AI 项目骨架
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${skeleton.source === "llm" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {skeleton.source === "llm" ? "AI 生成" : "已记录"}
                  </span>
                </h3>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-700">候选驱动问题（点击采纳）</div>
                <ul className="space-y-2">
                  {skeleton.drivingQuestions.map((q, i) => (
                    <li key={i}>
                      <button
                        className="block w-full rounded-[6px] border border-slate-200 px-3 py-2 text-left text-sm leading-6 text-slate-700 hover:border-blue-300 hover:bg-blue-50/40"
                        onClick={() => applyDrivingQuestion(q)}
                        type="button"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">情境故事</span>
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                    onClick={copyScenario}
                    type="button"
                  >
                    <Copy size={12} /> 复制
                  </button>
                </div>
                <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-7 text-slate-700">
                  {skeleton.scenario}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-700">建议成果形式</div>
                <div className="flex flex-wrap gap-2">
                  {skeleton.suggestedForms.map((f, i) => (
                    <span key={i} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold text-slate-700">评价维度（权重可编辑）</div>
                <div className="overflow-hidden rounded-[6px] border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">维度</th>
                        <th className="px-3 py-2 text-left w-24">权重 (%)</th>
                        <th className="px-3 py-2 text-left">描述</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedDimensions.map((d, idx) => (
                        <tr key={idx} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold">{d.name}</td>
                          <td className="px-3 py-2">
                            <input
                              className="h-8 w-20 rounded-[4px] border border-slate-200 px-2 text-sm outline-none focus:border-blue-500"
                              max={100}
                              min={0}
                              onChange={(e) => updateDimensionWeight(idx, Number(e.target.value) || 0)}
                              type="number"
                              value={d.weight}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">{d.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  当前权重合计：{editedDimensions.reduce((s, d) => s + d.weight, 0)}%
                </div>
              </div>
            </div>
          ) : null}
        </Card>

        <aside className="space-y-5">
          <Card>
            <h2 className="text-lg font-black">下一步</h2>
            <ul className="mt-3 space-y-3 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                  1
                </span>
                AI 将根据你填写的信息生成 PBL 大纲、知识点、AI 授知章节、评价方案。
              </li>
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                  2
                </span>
                你可以编辑 AI 生成的内容并对每个部分重新生成。
              </li>
              <li className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                  3
                </span>
                确认后系统将生成完整课程并进入预览。
              </li>
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-black">小贴士</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              课程核查页会调用真实 AI 生成课程结构；若模型未配置或返回结构不完整，系统会直接提示错误，避免混入示例数据。
            </p>
          </Card>
        </aside>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <Link
          className="text-sm font-semibold text-slate-500 hover:text-blue-600"
          href="/teacher"
        >
          ← 返回课程列表
        </Link>
        <div className="flex items-center gap-3">
          {error ? (
            <span className="text-sm font-semibold text-red-600">{error}</span>
          ) : null}
          <PrimaryButton
            className="h-12 px-7"
            disabled={!hydrated}
            onClick={next}
            type="button"
          >
            <Wand2 size={18} /> 下一步：AI 课程核查
          </PrimaryButton>
        </div>
      </div>
    </DashboardShell>
  );
}

function FormRow({
  label,
  value,
  onChange,
  placeholder,
  hint,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {multiline ? (
        <textarea
          className="min-h-[88px] w-full rounded-[6px] border border-slate-300 px-4 py-3 text-[15px] leading-7 outline-none focus:border-blue-500"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className="h-11 w-full rounded-[6px] border border-slate-300 px-4 outline-none focus:border-blue-500"
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
      {hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}
