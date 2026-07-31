"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  ClipboardList,
  MessageSquareText,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card, Pill, PrimaryButton, TextArea, toast } from "@/components/ui";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildReflectionEvidencePrompts } from "@/lib/teaching-ai/client-api";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";

type ReflectionFields = {
  coreWork: string;
  aiSupport: string;
  decisions: string;
  limitsAndTransfer: string;
};

const SECTION_LABELS: Array<[keyof ReflectionFields, string]> = [
  ["coreWork", "我完成的核心工作"],
  ["aiSupport", "AI 提供的支持"],
  ["decisions", "我的采纳与拒绝"],
  ["limitsAndTransfer", "局限、改进与迁移"],
];

function parseReflection(content: string | undefined): ReflectionFields {
  const result: ReflectionFields = { coreWork: "", aiSupport: "", decisions: "", limitsAndTransfer: "" };
  if (!content?.trim()) return result;
  let matched = false;
  SECTION_LABELS.forEach(([key, label], index) => {
    const nextLabel = SECTION_LABELS[index + 1]?.[1];
    const pattern = new RegExp(`【${label}】\\s*([\\s\\S]*?)${nextLabel ? `(?=\\n+【${nextLabel}】)` : "$"}`);
    const value = content.match(pattern)?.[1]?.trim();
    if (value) {
      result[key] = value;
      matched = true;
    }
  });
  if (!matched) result.coreWork = content;
  return result;
}

function serializeReflection(fields: ReflectionFields): string {
  return SECTION_LABELS
    .map(([key, label]) => `【${label}】\n${fields[key].trim()}`)
    .join("\n\n");
}

export function ReflectionView({ course, embedded = false }: { course?: Course; embedded?: boolean }) {
  void embedded;
  const session = useSession();
  const studentId = session.studentId ?? "";
  const studentName = session.studentName ?? session.user.name;
  const project = useMemo(
    () => course?.groups?.find((item) => item.members.some((member) => member.studentId === studentId)),
    [course?.groups, studentId],
  );
  const existingReflection = useMemo(
    () => (course?.reflections ?? [])
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course?.reflections, studentId],
  );
  const [fields, setFields] = useState<ReflectionFields>(() => parseReflection(existingReflection?.content));
  const [nextAction, setNextAction] = useState(existingReflection?.improvementPlan ?? "");
  const [saved, setSaved] = useState(false);
  const confirmation = useStudentActionConfirmation({ course, stageKey: "reflection" });

  const teacherEvaluation = useMemo(
    () => (course?.evaluations ?? [])
      .filter((item) =>
        item.sourceRole === "teacher"
        && (item.targetId === studentId || item.targetId === project?.id)
        && item.status !== "draft",
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course?.evaluations, project?.id, studentId],
  );
  const aiEvaluation = useMemo(
    () => (course?.evaluations ?? [])
      .filter((item) =>
        item.sourceRole === "ai"
        && (item.targetId === studentId || item.targetId === project?.id)
        && item.status !== "draft",
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course?.evaluations, project?.id, studentId],
  );
  const latestRubric = useMemo(
    () => (course?.rubricScores ?? [])
      .filter((item) => item.groupId === project?.id && item.stageKey === "showcase")
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course?.rubricScores, project?.id],
  );
  const teacherFeedback = useMemo(
    () => (course?.feedback ?? [])
      .filter((item) => item.targetId === studentId || item.targetId === project?.id)
      .filter((item) => item.sourceRole !== "ai")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0],
    [course?.feedback, project?.id, studentId],
  );
  const processRecords = useMemo(
    () => (course?.companionProcessRecords ?? [])
      .filter((item) => item.studentId === studentId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [course?.companionProcessRecords, studentId],
  );
  const studentDecisions = processRecords.filter((item) => item.source === "student");
  const latestReflectionSupport = useMemo(
    () => (course?.aiSupports ?? [])
      .filter((item) =>
        item.kind === "reflection-evidence"
        && (item.studentId === studentId || item.groupId === project?.id),
      )
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0],
    [course?.aiSupports, project?.id, studentId],
  );
  const complete = SECTION_LABELS.every(([key]) => fields[key].trim()) && nextAction.trim();

  function updateField(key: keyof ReflectionFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function performSave() {
    if (!course) return;
    session.upsertReflection({
      id: existingReflection?.id,
      content: serializeReflection(fields),
      improvementPlan: nextAction.trim(),
      studentName,
    });
    session.updateStudentProgress("reflection", 100);
    session.addActivity(course.id, "提交个人反思", nextAction.trim(), studentName);
    setSaved(true);
  }

  function saveReflection() {
    if (!course || !complete) return;
    confirmation.request({
      action: existingReflection ? "overwrite" : "submit",
      title: existingReflection ? "更新并重新提交个人反思" : "提交完整个人反思",
      summary: "这会一次保存你的核心工作、AI 支持、采纳或拒绝理由、局限与迁移计划，并把反思阶段标记为完成。",
      payload: { reflectionId: existingReflection?.id, stageKey: "reflection" },
      onConfirm: performSave,
    });
  }

  async function generateReflectionPrompts() {
    if (!course) return;
    try {
      const draft = await buildReflectionEvidencePrompts({
        course,
        group: project,
        studentId,
      });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentName,
      });
    } catch (error) {
      toast.error("AI 反思提示生成失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    }
  }

  if (!course) {
    return <Card className="text-center"><p className="text-sm text-stone-500">课程数据尚未加载。</p></Card>;
  }

  const teacherScore =
    teacherEvaluation?.score
    ?? latestRubric?.teacherTotal
    ?? (latestRubric?.scoringMode === "teacher" ? latestRubric.total : undefined);
  const aiProcessScore = aiEvaluation?.score ?? latestRubric?.aiTotal ?? undefined;
  const aiProcessSummary = aiEvaluation?.comment ?? latestRubric?.aiProcessSummary;
  const aiProcessEvidence = aiEvaluation?.evidence ?? latestRubric?.aiProcessEvidence ?? [];
  const finalScore = latestRubric?.finalTotal;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--pbl-student)]">阶段六 · 反思与迁移</p>
          <h1 className="font-editorial mt-1 text-2xl font-semibold">说清楚“我做了什么、AI 帮了什么、我为什么这样决定”</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">反思不参与排名。请基于真实过程证据形成下一次项目也能使用的方法。</p>
        </div>
        <Pill tone={saved || existingReflection ? "green" : complete ? "blue" : "gray"}>
          {saved ? "已提交" : existingReflection ? "已有反思，可继续更新" : complete ? "可以提交" : "待完成"}
        </Pill>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.72fr)]">
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><MessageSquareText size={19} />真实评价记录</h2>
          {teacherScore !== undefined || finalScore !== undefined || teacherEvaluation || teacherFeedback ? (
            <div className="mt-4 space-y-3">
              {teacherScore !== undefined ? <div className="flex items-center justify-between rounded-[10px] border border-stone-200 bg-stone-50 px-4 py-3"><span className="text-sm font-semibold text-stone-600">教师成果与汇报评价</span><strong className="text-2xl text-[var(--pbl-student)]">{Math.round(teacherScore)}</strong></div> : null}
              {finalScore !== undefined ? <div className="flex items-center justify-between rounded-[10px] border border-amber-100 bg-amber-50/50 px-4 py-3"><span className="text-sm font-semibold text-stone-600">AI 过程与教师评价综合分</span><strong className="text-2xl text-amber-800">{Math.round(finalScore)}</strong></div> : null}
              {teacherEvaluation?.comment ? <p className="rounded-[10px] border border-blue-100 bg-blue-50/50 p-3 text-sm leading-6 text-stone-700">{teacherEvaluation.comment}</p> : null}
              {teacherFeedback ? <p className="text-sm leading-6 text-stone-700"><strong>教师反馈：</strong>{teacherFeedback.content}</p> : null}
            </div>
          ) : <p className="mt-4 rounded-[10px] border border-dashed border-stone-200 py-8 text-center text-sm text-stone-500">教师尚未提交成果评价；系统不会用阶段进度冒充评价。</p>}

          <div className="mt-5 border-t border-stone-100 pt-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Bot size={16} className="text-[var(--pbl-ai)]" />AI 过程评价</h3>
            {aiProcessSummary || aiProcessScore !== undefined ? (
              <div className="mt-3 rounded-[10px] border border-violet-100 bg-violet-50/50 p-3">
                {aiProcessScore !== undefined ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-stone-600">过程评分</span>
                    <strong className="text-xl text-violet-800">{Math.round(aiProcessScore)}</strong>
                  </div>
                ) : null}
                {aiProcessSummary ? <p className="mt-2 text-sm leading-6 text-stone-700">{aiProcessSummary}</p> : null}
                {aiProcessEvidence.length ? <p className="mt-2 text-xs leading-5 text-stone-500">依据：{aiProcessEvidence.join("；")}</p> : null}
              </div>
            ) : <p className="mt-3 text-sm text-stone-500">尚无已提交的 AI 过程评价。</p>}
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList size={19} />过程证据摘要</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] bg-stone-50 p-3"><dt className="text-xs text-stone-500">过程记录</dt><dd className="mt-1 text-2xl font-bold">{processRecords.length}</dd></div>
            <div className="rounded-[10px] bg-stone-50 p-3"><dt className="text-xs text-stone-500">学生决定</dt><dd className="mt-1 text-2xl font-bold">{studentDecisions.length}</dd></div>
            <div className="rounded-[10px] bg-stone-50 p-3"><dt className="text-xs text-stone-500">项目材料</dt><dd className="mt-1 text-2xl font-bold">{(course.uploads ?? []).filter((item) => item.studentId === studentId || item.groupId === project?.id).length}</dd></div>
            <div className="rounded-[10px] bg-stone-50 p-3"><dt className="text-xs text-stone-500">伙伴任务</dt><dd className="mt-1 text-2xl font-bold">{(course.companionTasks ?? []).filter((item) => item.studentId === studentId).length}</dd></div>
          </dl>
          {studentDecisions.length ? <div className="mt-4 space-y-2">{studentDecisions.slice(0, 3).map((record) => <p className="border-l-2 border-emerald-300 pl-3 text-xs leading-5 text-stone-600" key={record.id}>{record.title}：{record.summary}</p>)}</div> : null}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="text-[var(--pbl-ai)]" size={19} />基于证据的反思提示</h2><p className="mt-1 text-xs text-stone-500">只有点击生成并获得真实结果后才会显示，不使用通用占位建议。</p></div>
          <PrimaryButton onClick={() => void generateReflectionPrompts()} variant="outline">生成反思追问</PrimaryButton>
        </div>
        {latestReflectionSupport ? <div className="mt-4 grid gap-3 md:grid-cols-2">{latestReflectionSupport.suggestions.map((suggestion) => <p className="rounded-[10px] border border-violet-100 bg-violet-50/50 p-3 text-sm leading-6 text-stone-700" key={suggestion}>{suggestion}</p>)}</div> : <p className="mt-4 rounded-[10px] border border-dashed border-stone-200 py-6 text-center text-sm text-stone-500">尚未生成个人反思追问</p>}
      </Card>

      <Card>
        <div className="flex items-center gap-2"><ShieldCheck className="text-emerald-700" size={20} /><div><h2 className="text-lg font-bold">我的完整反思</h2><p className="text-xs text-stone-500">五项内容一次提交，全部来自你的真实经历与判断。</p></div></div>
        <div className="mt-5 grid gap-5">
          <label><span className="mb-1.5 block text-sm font-bold">1. 我完成的核心工作 *</span><TextArea className="min-h-28" onChange={(event) => updateField("coreWork", event.target.value)} placeholder="哪些问题、制作和关键判断是我亲自完成的？" value={fields.coreWork} /></label>
          <label><span className="mb-1.5 block text-sm font-bold">2. AI 提供的支持 *</span><TextArea className="min-h-24" onChange={(event) => updateField("aiSupport", event.target.value)} placeholder="AI 在哪些环节提供了解释、提问、备选方案或反馈？它没有替我做什么？" value={fields.aiSupport} /></label>
          <label><span className="mb-1.5 block text-sm font-bold">3. 我的采纳与拒绝 *</span><TextArea className="min-h-24" onChange={(event) => updateField("decisions", event.target.value)} placeholder="我采纳或拒绝了哪些建议？依据是什么？" value={fields.decisions} /></label>
          <label><span className="mb-1.5 block text-sm font-bold">4. 局限、改进与迁移 *</span><TextArea className="min-h-24" onChange={(event) => updateField("limitsAndTransfer", event.target.value)} placeholder="当前成果还有什么局限？这次形成的方法可以怎样用到下一个项目？" value={fields.limitsAndTransfer} /></label>
          <label><span className="mb-1.5 block text-sm font-bold">5. 下一次的具体行动 *</span><TextArea className="min-h-20" onChange={(event) => { setNextAction(event.target.value); setSaved(false); }} placeholder="写下一条可以实际执行、可以检查是否完成的行动。" value={nextAction} /></label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <span className="text-xs text-stone-500">{complete ? "五项内容已完整，可以提交" : "请完成全部五项内容后提交"}</span>
          <PrimaryButton disabled={!complete} onClick={saveReflection}><Save size={17} />{existingReflection ? "更新并提交反思" : "保存并提交反思"}</PrimaryButton>
        </div>
      </Card>

      <StudentActionConfirmationDialog busy={confirmation.busy} onConfirm={() => void confirmation.confirm()} onReject={confirmation.reject} pending={confirmation.pending} />
    </div>
  );
}
