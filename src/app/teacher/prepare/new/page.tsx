"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Lightbulb, LockKeyhole, UsersRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { WizardStepper } from "@/components/wizard-stepper";
import { Button, FlowActionBar, FormField, Input, SaveStatus, Textarea, toast } from "@/components/ui";
import { useHydrated, useSession } from "@/lib/session/store";
import { generateProjectSkeleton, type ProjectSkeletonResult } from "@/lib/teaching-ai/client-api";
import { AI_COMPANIONS } from "@/lib/ai-companions";
import {
  DEFAULT_PBL_EVIDENCE_REQUIREMENTS,
  DEFAULT_PBL_OUTCOME,
  normalizePblCourseConfig,
  type PblCompanionId,
  type PblEvidenceKind,
  type PblOutcomeSpec,
} from "@/lib/pbl-course-config";

const STEPS = [
  { key: "new", label: "创建项目" },
  { key: "verify", label: "课程核查" },
  { key: "generate", label: "内容生成" },
  { key: "preview", label: "预览与发布" },
];

const INITIAL_SELECTED_EVIDENCE = DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter((item) => item.required).map(
  (item) => item.kind,
);

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
  const [difficultyLevel, setDifficultyLevel] = useState<"introductory" | "standard" | "advanced">("standard");
  const [outcome, setOutcome] = useState<PblOutcomeSpec>({ ...DEFAULT_PBL_OUTCOME });
  const [selectedEvidence, setSelectedEvidence] = useState<PblEvidenceKind[]>(INITIAL_SELECTED_EVIDENCE);
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>(AI_COMPANIONS.map((item) => item.id));
  const [error, setError] = useState<string>();
  const [suggestion, setSuggestion] = useState<ProjectSkeletonResult>();
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const selectedEvidenceItems = useMemo(
    () => DEFAULT_PBL_EVIDENCE_REQUIREMENTS.filter((item) => selectedEvidence.includes(item.kind)),
    [selectedEvidence],
  );

  async function requestSuggestion() {
    if (!name.trim()) {
      setError("请先填写课程名称");
      return;
    }
    setSuggestionLoading(true);
    setError(undefined);
    try {
      setSuggestion(
        await generateProjectSkeleton({
          courseName: name.trim(),
          subject: subject.trim(),
          grade: grade.trim(),
          hours,
          summary: summary.trim(),
          initialDrivingQuestion: drivingQuestion.trim(),
        }),
      );
      setDismissed(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "课程建议生成失败";
      setError(message);
      toast.error("课程建议生成失败", { description: message });
    } finally {
      setSuggestionLoading(false);
    }
  }

  function toggleEvidence(kind: PblEvidenceKind) {
    setSelectedEvidence((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  function toggleCompanion(id: string) {
    if (id === "recorder") return;
    setSelectedCompanions((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function next() {
    setError(undefined);
    if (!name.trim()) {
      setError("请填写课程名称");
      return;
    }
    if (!drivingQuestion.trim()) {
      setError("请明确这门课程要解决的驱动问题");
      return;
    }
    if (!outcome.artifact.trim() || !outcome.presentation.trim() || !outcome.reflection.trim()) {
      setError("请分别填写作品、表达和反思三类成果要求");
      return;
    }
    if (!selectedEvidence.length) {
      setError("至少选择一类过程证据，让记记有明确的记录目标");
      return;
    }

    const pblConfig = normalizePblCourseConfig({
      difficultyLevel,
      evidenceRequirements: selectedEvidenceItems,
      outcome,
      companionIds: selectedCompanions as PblCompanionId[],
    });
    const course = session.createCourse({
      name: name.trim(),
      subject: subject.trim(),
      grade: grade.trim(),
      hours,
      summary: summary.trim(),
      drivingQuestion: drivingQuestion.trim(),
      expectedOutcome: outcome.artifact.trim(),
      learningObjectives: learningObjectives
        .split(/\n|，|;/)
        .map((item) => item.trim())
        .filter(Boolean),
      pblConfig,
    });
    router.push(`/teacher/prepare/${course.id}/verify`);
  }

  return (
    <DashboardShell
      currentTask="定义个人项目与课程生成边界"
      leadRole="教师"
      role="teacher"
      userName={session.user.name}
      variant="bare"
      headerSlot={
        <div className="ml-4 hidden lg:block">
          <WizardStepper current={0} steps={STEPS} />
        </div>
      }
    >
      <div className="mx-auto max-w-6xl py-6">
        <header className="mb-8 border-b border-[var(--pbl-border)] pb-6">
          <Link
            aria-label="返回教师首页"
            className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--pbl-text-muted)] hover:text-[var(--pbl-teacher)]"
            href="/teacher"
          >
            <ArrowLeft size={17} /> 返回课程
          </Link>
          <p className="text-sm font-semibold text-[var(--pbl-teacher)]">创建项目 · 1/4</p>
          <h1 className="font-editorial mt-2 text-3xl font-semibold md:text-4xl">
            先把项目的学习边界说清楚
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--pbl-text-muted)]">
            课程会按六阶段生成一套可授课的课堂剧本。每名学生独立完成个人项目，AI 伴学小组负责解释、质疑、建议与记忆过程证据。
          </p>
          {error ? (
            <div className="mt-5 rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
              {error}
            </div>
          ) : null}
        </header>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form
            className="space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              next();
            }}
          >
            <section className="space-y-5">
              <SectionHeading eyebrow="课程底稿" title="这门课要和学生一起解决什么问题？" />
              <FormField label="课程名称">
                {({ id, describedBy, invalid }) => (
                  <Input
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    id={id}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="例如：校园低碳生活解决方案"
                    value={name}
                  />
                )}
              </FormField>
              <div className="grid gap-5 sm:grid-cols-3">
                <FormField label="学科">
                  {({ id }) => <Input id={id} onChange={(event) => setSubject(event.target.value)} placeholder="环境科学" value={subject} />}
                </FormField>
                <FormField label="年级">
                  {({ id }) => <Input id={id} onChange={(event) => setGrade(event.target.value)} placeholder="高一" value={grade} />}
                </FormField>
                <FormField label="预计课时">
                  {({ id }) => <Input id={id} min={1} onChange={(event) => setHours(Math.max(1, Number(event.target.value) || 1))} type="number" value={hours} />}
                </FormField>
              </div>
              <FormField description="每行一个可观察、可评价的学习目标。" label="课程目标">
                {({ id, describedBy }) => (
                  <Textarea
                    aria-describedby={describedBy}
                    id={id}
                    onChange={(event) => setLearningObjectives(event.target.value)}
                    placeholder={"解释项目所需的核心概念\n运用证据比较不同方案\n形成并修订可实施的项目成果"}
                    value={learningObjectives}
                  />
                )}
              </FormField>
              <FormField description="补充真实情境和课程范围，不必写成宣传文案。" label="课程说明" optional>
                {({ id, describedBy }) => (
                  <Textarea aria-describedby={describedBy} id={id} onChange={(event) => setSummary(event.target.value)} placeholder="学生将调查什么、接触哪些真实对象、形成怎样的判断？" value={summary} />
                )}
              </FormField>
              <FormField description="一个好的驱动问题有真实对象、开放空间和可完成边界。" label="驱动问题">
                {({ id, describedBy }) => (
                  <Textarea aria-describedby={describedBy} className="min-h-32" id={id} onChange={(event) => setDrivingQuestion(event.target.value)} placeholder="我们如何为校园提出一项有证据支持、能够被实际采用的低碳改进方案？" value={drivingQuestion} />
                )}
              </FormField>
            </section>

            <section className="rounded-[var(--radius-md)] border border-[var(--pbl-ai)]/30 bg-[var(--pbl-ai-soft)]/30 p-5 shadow-[0_10px_30px_rgba(37,99,235,0.06)]">
              <div className="flex flex-col gap-4 border-b border-[var(--pbl-ai)]/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pbl-ai)]">新课堂 PBL 配置</p>
                  <h2 className="font-editorial mt-2 text-2xl font-semibold">个人项目 + AI 伴学小组</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pbl-text-muted)]">
                    这里明确的是课堂模式，不创建真实学生小组。学生是项目负责人；伴学角色提供不同视角，但不替学生做决定或完成作品。
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--pbl-ai)]/30 bg-white px-3 py-1.5 text-xs font-bold text-[var(--pbl-ai)]">
                  <LockKeyhole size={14} /> 模式已锁定
                </span>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[var(--radius-sm)] border border-[var(--pbl-ai)]/20 bg-white px-4 py-3 xl:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--pbl-text-muted)]">项目模式</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--pbl-text)]">个人项目 · 每名学生独立负责一个完整项目</p>
                  <p className="mt-1 text-xs text-[var(--pbl-text-muted)]">课堂不创建真人学生小组；“AI 伴学小组”只表示虚拟支架角色。</p>
                </div>
                <label className="block rounded-[var(--radius-sm)] border border-[var(--pbl-ai)]/20 bg-white px-4 py-3">
                  <span className="text-sm font-bold text-[var(--pbl-text)]">项目难度</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--pbl-text-muted)]">用于预估知识建构、方案校准和项目实践的时间比例，之后仍可由教师调整。</span>
                  <select
                    className="mt-3 h-10 w-full rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-white px-3 text-sm outline-none focus:border-[var(--pbl-ai)]"
                    onChange={(event) => setDifficultyLevel(event.target.value as typeof difficultyLevel)}
                    value={difficultyLevel}
                  >
                    <option value="introductory">入门：需要更多示范与引导</option>
                    <option value="standard">标准：知识与实践均衡</option>
                    <option value="advanced">进阶：强调探究、论证与迭代</option>
                  </select>
                </label>
                <fieldset>
                  <legend className="text-sm font-bold text-[var(--pbl-text)]">记记需要整理哪些过程证据？</legend>
                  <p className="mt-1 text-xs leading-5 text-[var(--pbl-text-muted)]">选中的证据会进入生成模板、评价方案和学生阶段提示。</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {DEFAULT_PBL_EVIDENCE_REQUIREMENTS.map((item) => {
                      const selected = selectedEvidence.includes(item.kind);
                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex min-h-20 items-start gap-3 rounded-[var(--radius-sm)] border px-3 py-3 text-left transition ${selected ? "border-[var(--pbl-ai)] bg-white shadow-sm" : "border-[var(--pbl-border)] bg-white/60 hover:border-[var(--pbl-ai)]/50"}`}
                          key={item.kind}
                          onClick={() => toggleEvidence(item.kind)}
                          type="button"
                        >
                          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? "border-[var(--pbl-ai)] bg-[var(--pbl-ai)] text-white" : "border-[var(--pbl-border-strong)] text-transparent"}`}>
                            <Check size={13} />
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{item.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--pbl-text-muted)]">{item.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="flex items-center gap-2 text-sm font-bold text-[var(--pbl-text)]"><UsersRound size={16} /> AI 伴学小组角色</legend>
                  <p className="mt-1 text-xs leading-5 text-[var(--pbl-text-muted)]">生成器会按阶段调度已选角色。记记固定参与，用于过程证据。</p>
                  <div className="mt-3 space-y-2">
                    {AI_COMPANIONS.map((companion) => {
                      const selected = selectedCompanions.includes(companion.id);
                      const locked = companion.id === "recorder";
                      return (
                        <button
                          aria-pressed={selected}
                          className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-left transition ${selected ? "border-[var(--pbl-ai)] bg-white" : "border-[var(--pbl-border)] bg-white/60"}`}
                          key={companion.id}
                          onClick={() => toggleCompanion(companion.id)}
                          type="button"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg" style={{ backgroundColor: `${companion.color}18` }}>{companion.emoji}</span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{companion.name} · {companion.role}</span><span className="block truncate text-xs text-[var(--pbl-text-muted)]">{companion.description}</span></span>
                          {locked ? <span className="text-[10px] font-bold text-[var(--pbl-ai)]">必选</span> : <CheckCircle2 className={selected ? "text-[var(--pbl-ai)]" : "text-[var(--pbl-border-strong)]"} size={17} />}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 border-t border-[var(--pbl-ai)]/15 pt-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div><h3 className="text-sm font-bold">结构化成果要求</h3><p className="mt-1 text-xs text-[var(--pbl-text-muted)]">每个项目都必须同时包含作品、表达和反思。</p></div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--pbl-ai)]">三方评价：AI 评过程 · 教师评成果与表达 · 学生评成长</span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <OutcomeField label="作品" value={outcome.artifact} onChange={(value) => setOutcome((current) => ({ ...current, artifact: value }))} placeholder="例如：校园节能改进方案、数据报告或交互原型" />
                  <OutcomeField label="表达" value={outcome.presentation} onChange={(value) => setOutcome((current) => ({ ...current, presentation: value }))} placeholder="学生如何讲清问题、证据、取舍与价值" />
                  <OutcomeField label="反思" value={outcome.reflection} onChange={(value) => setOutcome((current) => ({ ...current, reflection: value }))} placeholder="学生如何说明成长、AI 使用与下一步改进" />
                </div>
              </div>
            </section>

            <div className="border-l-2 border-[var(--pbl-ai)] pl-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold">需要 AI 帮你检查这个问题吗？</h2><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">AI 只检查范围、真实情境和可完成边界，建议仍由教师确认。</p></div>
                <Button loading={suggestionLoading} onClick={() => void requestSuggestion()} variant="secondary">检查驱动问题</Button>
              </div>
              {suggestion && !dismissed ? (
                <div className="mt-5 space-y-4 border-t border-[var(--pbl-border)] pt-4">
                  <p className="text-sm font-semibold text-[var(--pbl-ai)]">AI 建议 · 依据当前课程名称、学科、年级与课时</p>
                  {suggestion.drivingQuestions.map((question) => (
                    <div className="flex flex-col gap-2 border-b border-[var(--pbl-border-soft)] pb-3 sm:flex-row sm:items-start" key={question}>
                      <p className="flex-1 text-sm leading-6">{question}</p>
                      <Button onClick={() => setDrivingQuestion(question)} size="sm" variant="text"><Check size={14} /> 采纳</Button>
                    </div>
                  ))}
                  <p className="text-sm leading-6 text-[var(--pbl-text-muted)]"><strong className="font-semibold text-[var(--pbl-text)]">真实情境：</strong>{suggestion.scenario}</p>
                  <div className="flex gap-2"><Button onClick={() => { setOutcome((current) => ({ ...current, artifact: suggestion.suggestedForms.join("、") })); setDismissed(true); }} size="sm" variant="secondary">采纳作品方向</Button><Button onClick={() => setDismissed(true)} size="sm" variant="text">不采纳</Button></div>
                </div>
              ) : null}
            </div>
          </form>

          <aside className="self-start border-t border-[var(--pbl-border)] pt-5 lg:sticky lg:top-24">
            <h2 className="font-editorial text-xl font-semibold">课程摘要</h2>
            <dl className="mt-4 divide-y divide-[var(--pbl-border-soft)] text-sm">
              <Summary label="课程" value={name || "尚未命名"} />
              <Summary label="对象" value={[subject, grade].filter(Boolean).join(" · ") || "待补充"} />
              <Summary label="时长" value={`${hours} 课时`} />
              <Summary label="目标" value={`${learningObjectives.split(/\n/).filter(Boolean).length} 项`} />
              <Summary label="过程证据" value={`${selectedEvidence.length} 类`} />
              <Summary label="AI 角色" value={`${selectedCompanions.length} 个`} />
              <Summary label="成果" value={outcome.artifact || "待补充作品形式"} />
            </dl>
            <div className="mt-6 flex gap-3 border-l-2 border-[var(--pbl-warning)] pl-3 text-sm leading-6 text-[var(--pbl-text-muted)]"><Lightbulb className="mt-1 shrink-0 text-[var(--pbl-warning)]" size={16} /><p>下一页会分别核查知识图谱、教师主持大纲、AI 授知场景和评价方案，然后再进入内容生成。</p></div>
          </aside>
        </div>
      </div>
      <FlowActionBar back={<Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pbl-text-muted)]" href="/teacher">取消</Link>} saveStatus={<SaveStatus lastSavedAt={session.lastSavedAt} onRetry={() => void session.retrySave()} state={session.saveState} />}><Button disabled={!hydrated} onClick={next}>确认并进入课程核查</Button></FlowActionBar>
    </DashboardShell>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pbl-teacher)]">{eyebrow}</p><h2 className="font-editorial mt-2 text-2xl font-semibold">{title}</h2></div>;
}

function OutcomeField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-semibold">{label}<span className="mt-2 block text-xs font-normal leading-5 text-[var(--pbl-text-muted)]">{placeholder}</span><Textarea className="mt-2 min-h-28 bg-white" onChange={(event) => onChange(event.target.value)} value={value} /></label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[72px_1fr] gap-3 py-3"><dt className="text-[var(--pbl-text-muted)]">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}
