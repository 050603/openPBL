"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Lightbulb } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Button, FlowActionBar, FormField, Input, SaveStatus, Textarea, toast } from "@/components/ui";
import { useHydrated, useSession } from "@/lib/session/store";
import { generateProjectSkeleton, type ProjectSkeletonResult } from "@/lib/teaching-ai/client-api";

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "内容生成" },
  { key: "preview", label: "预览与发布" },
];

export default function PrepareNewPage() {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [hours, setHours] = useState(8);
  const [learningObjectives, setLearningObjectives] = useState("");
  const [summary, setSummary] = useState("");
  const [drivingQuestion, setDrivingQuestion] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [error, setError] = useState<string>();
  const [suggestion, setSuggestion] = useState<ProjectSkeletonResult>();
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  async function requestSuggestion() {
    if (!name.trim()) { setError("请先填写课程名称"); return; }
    setSuggestionLoading(true);
    setError(undefined);
    try {
      setSuggestion(await generateProjectSkeleton({ courseName: name.trim(), subject: subject.trim(), grade: grade.trim(), hours, summary: summary.trim(), initialDrivingQuestion: drivingQuestion.trim() }));
      setDismissed(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "课程建议生成失败";
      setError(message);
      toast.error("课程建议生成失败", { description: message });
    } finally { setSuggestionLoading(false); }
  }

  function next() {
    if (!name.trim()) { setError("请填写课程名称"); return; }
    if (!drivingQuestion.trim()) { setError("请明确这门课程要解决的驱动问题"); return; }
    const course = session.createCourse({
      name: name.trim(), subject: subject.trim(), grade: grade.trim(), hours,
      summary: summary.trim(), drivingQuestion: drivingQuestion.trim(), expectedOutcome: expectedOutcome.trim(),
      learningObjectives: learningObjectives.split(/\n|；|;/).map((item) => item.trim()).filter(Boolean),
    });
    router.push(`/teacher/prepare/${course.id}/verify`);
  }

  return (
    <DashboardShell currentTask="定义课程要解决的问题" leadRole="教师" role="teacher" userName={session.user.name} variant="bare" headerSlot={<div className="ml-4 hidden lg:block"><WizardStepper current={0} steps={STEPS} /></div>}>
      <div className="mx-auto max-w-6xl py-6">
        <header className="mb-8 border-b border-[var(--pbl-border)] pb-6">
          <Link aria-label="返回教师首页" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--pbl-text-muted)] hover:text-[var(--pbl-teacher)]" href="/teacher"><ArrowLeft size={17} />返回课程</Link>
          <p className="text-sm font-semibold text-[var(--pbl-teacher)]">创建项目 · 1/4</p>
          <h1 className="font-editorial mt-2 text-3xl font-semibold md:text-4xl">这门课程要和学生一起解决什么问题？</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--pbl-text-muted)]">先定义真实问题、学习目标和预期成果。AI 只在具体字段旁提供范围检查与候选方向。</p>
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form className="space-y-7" onSubmit={(event) => { event.preventDefault(); next(); }}>
            <FormField error={error && !name.trim() ? error : undefined} label="课程名称">
              {({ id, describedBy, invalid }) => <Input aria-describedby={describedBy} aria-invalid={invalid} id={id} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="例如：校园低碳生活解决方案" value={name} />}
            </FormField>
            <div className="grid gap-5 sm:grid-cols-3">
              <FormField label="学科">{({ id }) => <Input id={id} onChange={(event) => setSubject(event.target.value)} placeholder="环境科学" value={subject} />}</FormField>
              <FormField label="年级">{({ id }) => <Input id={id} onChange={(event) => setGrade(event.target.value)} placeholder="高一" value={grade} />}</FormField>
              <FormField label="预计课时">{({ id }) => <Input id={id} min={1} onChange={(event) => setHours(Math.max(1, Number(event.target.value) || 1))} type="number" value={hours} />}</FormField>
            </div>
            <FormField description="每行一个可观察、可评价的学习目标。" label="课程目标">
              {({ id, describedBy }) => <Textarea aria-describedby={describedBy} id={id} onChange={(event) => setLearningObjectives(event.target.value)} placeholder={"解释项目所需的核心概念\n运用证据比较不同方案\n形成并修订可实施的项目成果"} value={learningObjectives} />}
            </FormField>
            <FormField description="补充真实情境和课程范围，不必写成宣传文案。" label="课程说明" optional>
              {({ id, describedBy }) => <Textarea aria-describedby={describedBy} id={id} onChange={(event) => setSummary(event.target.value)} placeholder="学生将调查什么、接触哪些真实对象、形成怎样的判断？" value={summary} />}
            </FormField>
            <FormField error={error && name.trim() && !drivingQuestion.trim() ? error : undefined} description="一个好的驱动问题有真实对象、开放空间和可完成边界。" label="驱动问题">
              {({ id, describedBy, invalid }) => <Textarea aria-describedby={describedBy} aria-invalid={invalid} className="min-h-32" id={id} onChange={(event) => setDrivingQuestion(event.target.value)} placeholder="我们如何为校园提出一项有证据支持、能够被实际采用的低碳改进方案？" value={drivingQuestion} />}
            </FormField>

            <div className="border-l-2 border-[var(--pbl-ai)] pl-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">需要 AI 帮你检查这个问题吗？</h2><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">AI 会检查范围、补充真实情境，并给出可编辑候选方向。</p></div><Button loading={suggestionLoading} onClick={() => void requestSuggestion()} variant="secondary">检查驱动问题</Button></div>
              {suggestion && !dismissed ? <div className="mt-5 space-y-4 border-t border-[var(--pbl-border)] pt-4"><p className="text-sm font-semibold text-[var(--pbl-ai)]">AI 建议 · 依据当前课程名称、学科、年级与课时</p>{suggestion.drivingQuestions.map((question) => <div className="flex flex-col gap-2 border-b border-[var(--pbl-border-soft)] pb-3 sm:flex-row sm:items-start" key={question}><p className="flex-1 text-sm leading-6">{question}</p><Button onClick={() => setDrivingQuestion(question)} size="sm" variant="text"><Check size={14} />采纳</Button></div>)}<p className="text-sm leading-6 text-[var(--pbl-text-muted)]"><strong className="font-semibold text-[var(--pbl-text)]">真实情境：</strong>{suggestion.scenario}</p><div className="flex gap-2"><Button onClick={() => { setExpectedOutcome(suggestion.suggestedForms.join("、")); setDismissed(true); }} size="sm" variant="secondary">采纳成果方向</Button><Button onClick={() => setDismissed(true)} size="sm" variant="text">不采纳</Button></div></div> : null}
            </div>

            <FormField description="先写一个方向，后续可在课程核查中调整。" label="初步成果形式">
              {({ id, describedBy }) => <Input aria-describedby={describedBy} id={id} onChange={(event) => setExpectedOutcome(event.target.value)} placeholder="例如：校园节能提案、数据海报与三分钟答辩" value={expectedOutcome} />}
            </FormField>
          </form>

          <aside className="self-start border-t border-[var(--pbl-border)] pt-5 lg:sticky lg:top-24">
            <h2 className="font-editorial text-xl font-semibold">课程摘要</h2>
            <dl className="mt-4 divide-y divide-[var(--pbl-border-soft)] text-sm"><Summary label="课程" value={name || "尚未命名"} /><Summary label="对象" value={[subject, grade].filter(Boolean).join(" · ") || "待补充"} /><Summary label="时长" value={`${hours} 课时`} /><Summary label="目标" value={`${learningObjectives.split(/\n/).filter(Boolean).length} 项`} /><Summary label="成果" value={expectedOutcome || "待补充"} /></dl>
            <div className="mt-6 flex gap-3 border-l-2 border-[var(--pbl-warning)] pl-3 text-sm leading-6 text-[var(--pbl-text-muted)]"><Lightbulb className="mt-1 shrink-0 text-[var(--pbl-warning)]" size={16} /><p>下一页将核查知识结构、教学活动、学习内容和评价设计，不会一次生成后直接发布。</p></div>
          </aside>
        </div>
      </div>
      <FlowActionBar back={<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)]" href="/teacher">取消</Link>} saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}><Button disabled={!hydrated} onClick={next}>确认并进入课程核查</Button></FlowActionBar>
    </DashboardShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[72px_1fr] gap-3 py-3"><dt className="text-[var(--pbl-text-muted)]">{label}</dt><dd className="break-words font-medium">{value}</dd></div>; }
