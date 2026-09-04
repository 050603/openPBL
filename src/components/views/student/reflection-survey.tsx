"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
} from "lucide-react";
import { Card, Pill, PrimaryButton, TextArea, toast } from "@/components/ui";
import { buildReflectionEvidencePrompts } from "@/lib/teaching-ai/client-api";
import { useSession } from "@/lib/session/store";
import type {
  Course,
  ReflectionRecord,
  ReflectionSurveyResponseV1,
  ReflectionSurveyScore,
} from "@/lib/session/types";
import {
  REFLECTION_SURVEY_FALLBACK_SUGGESTIONS,
  REFLECTION_SURVEY_QUESTIONS,
  REFLECTION_SURVEY_SCALE,
  REFLECTION_SURVEY_TEXT_MAX_LENGTH,
  normalizeReflectionSurvey,
  reflectionToLegacyContent,
} from "@/lib/reflection-survey";
import { StagePageHeader } from "@/components/classroom/classroom-ui";

type SurveyFields = {
  learningReflection: string;
  systemReflection: string;
  aiHelpfulness?: ReflectionSurveyScore;
  systemUsability?: ReflectionSurveyScore;
  reuseIntention?: ReflectionSurveyScore;
};

const SCALE_FIELDS: Array<{
  key: "aiHelpfulness" | "systemUsability" | "reuseIntention";
  label: string;
}> = [
  { key: "aiHelpfulness", label: REFLECTION_SURVEY_QUESTIONS.aiHelpfulness },
  { key: "systemUsability", label: REFLECTION_SURVEY_QUESTIONS.systemUsability },
  { key: "reuseIntention", label: REFLECTION_SURVEY_QUESTIONS.reuseIntention },
];

function latestReflection(
  reflections: readonly ReflectionRecord[] | undefined,
  studentId: string,
): ReflectionRecord | undefined {
  return [...(reflections ?? [])]
    .filter((reflection) => reflection.studentId === studentId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

function draftFromReflection(reflection?: ReflectionRecord): SurveyFields {
  const survey = normalizeReflectionSurvey(reflection?.survey);
  return {
    learningReflection: survey?.learningReflection ?? "",
    systemReflection: survey?.systemReflection ?? "",
    aiHelpfulness: survey?.aiHelpfulness,
    systemUsability: survey?.systemUsability,
    reuseIntention: survey?.reuseIntention,
  };
}

function isComplete(fields: SurveyFields): fields is ReflectionSurveyResponseV1 {
  return Boolean(
    fields.learningReflection.trim()
    && fields.systemReflection.trim()
    && fields.aiHelpfulness
    && fields.systemUsability
    && fields.reuseIntention,
  );
}

export function NewReflectionStudentView({ course }: { course: Course }) {
  const session = useSession();
  const studentId = session.studentId ?? "";
  const studentName = session.studentName ?? session.user.name;
  const existingReflection = useMemo(
    () => latestReflection(course.reflections, studentId),
    [course.reflections, studentId],
  );
  const existingSurvey = useMemo(
    () => normalizeReflectionSurvey(existingReflection?.survey),
    [existingReflection?.survey],
  );
  const [fields, setFields] = useState<SurveyFields>(() => draftFromReflection(existingReflection));
  const [saved, setSaved] = useState(Boolean(existingSurvey));
  const [submitted, setSubmitted] = useState(Boolean(existingSurvey));
  // Keep the server record id locally as soon as a submission succeeds. This
  // makes a second click/update use the same record even before realtime
  // hydration delivers the updated course object.
  const [reflectionId, setReflectionId] = useState(existingReflection?.id);
  const [lastSavedAt, setLastSavedAt] = useState(existingSurvey ? existingReflection?.updatedAt : undefined);
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [generatedSuggestions, setGeneratedSuggestions] = useState<string[]>();
  const automaticGenerationKey = useRef<string | null>(null);
  const canEdit = course.status !== "finished";
  const complete = isComplete(fields);

  const project = useMemo(
    () => course.groups?.find((group) => group.members.some((member) => member.studentId === studentId)),
    [course.groups, studentId],
  );
  const savedSuggestions = useMemo(
    () => (course.aiSupports ?? [])
      .filter((support) =>
        support.kind === "reflection-evidence"
        && support.studentId === studentId,
      )
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
      ?.suggestions.slice(0, 2),
    [course.aiSupports, studentId],
  );
  const suggestions = (generatedSuggestions?.length ? generatedSuggestions : undefined)
    ?? (savedSuggestions?.length ? savedSuggestions : undefined)
    ?? [...REFLECTION_SURVEY_FALLBACK_SUGGESTIONS];

  function updateText(key: "learningReflection" | "systemReflection", value: string) {
    setFields((current) => ({
      ...current,
      [key]: value.slice(0, REFLECTION_SURVEY_TEXT_MAX_LENGTH),
    }));
    setSaved(false);
  }

  function updateScore(key: "aiHelpfulness" | "systemUsability" | "reuseIntention", value: ReflectionSurveyScore) {
    setFields((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  const generatePrompts = useCallback(async () => {
    if (!studentId || !course || !canEdit) return;
    setGeneratingPrompts(true);
    try {
      const draft = await buildReflectionEvidencePrompts({
        course,
        group: project,
        studentId,
        format: "compact",
      });
      const support = session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentName,
      });
      if (support?.suggestions.length && support.suggestions.length >= 2) {
        setGeneratedSuggestions(support.suggestions.slice(0, 2));
      } else {
        throw new Error("AI 未返回两条完整提示，已切换为固定提示。");
      }
    } catch (error) {
      // The fixed prompts remain available, so an unavailable model never
      // prevents a student from completing the short survey.
      setGeneratedSuggestions([...REFLECTION_SURVEY_FALLBACK_SUGGESTIONS]);
      toast.error("AI 反思提示暂时不可用", {
        description: error instanceof Error ? error.message : "已显示固定提示，可继续填写。",
      });
    } finally {
      setGeneratingPrompts(false);
    }
  }, [canEdit, course, project, session, studentId, studentName]);

  useEffect(() => {
    if (!studentId || !canEdit) return;
    const key = `${course.id}:${studentId}`;
    if (automaticGenerationKey.current === key) return;
    automaticGenerationKey.current = key;
    void generatePrompts();
  }, [canEdit, course.id, generatePrompts, studentId]);

  function submit() {
    if (!studentId || !canEdit || !complete) return;
    const survey: ReflectionSurveyResponseV1 = {
      schemaVersion: 1,
      learningReflection: fields.learningReflection.trim(),
      systemReflection: fields.systemReflection.trim(),
      aiHelpfulness: fields.aiHelpfulness,
      systemUsability: fields.systemUsability,
      reuseIntention: fields.reuseIntention,
    };
    const savedReflection = session.upsertReflection({
      id: reflectionId,
      content: reflectionToLegacyContent(survey),
      survey,
      studentName,
    });
    if (savedReflection) setReflectionId(savedReflection.id);
    session.updateStudentProgress("reflection", 100);
    const now = new Date().toISOString();
    const wasSubmitted = submitted;
    setSubmitted(true);
    setLastSavedAt(now);
    setSaved(true);
    toast.success(wasSubmitted ? "反思已更新" : "反思已提交", {
      description: "教师可以查看你的回答。",
    });
  }

  if (!studentId) {
    return <Card className="text-center text-sm text-stone-500">请先以学生身份进入课堂。</Card>;
  }

  return (
    <div className="classroom-stage space-y-5">
      <StagePageHeader
        description="完成五项反思后提交，课程结束前仍可更新。"
        status={<Pill tone={submitted ? "green" : complete ? "blue" : "gray"}>{submitted ? "已提交，可更新" : complete ? "可以提交" : "待完成"}</Pill>}
        title="学习反思"
        variant="student-card"
      />

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="border-[var(--pbl-student-border)] shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><BookOpenCheck size={19} />完成 5 项反思</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">前两项建议各写 1–3 句话（最多 300 字），后三项选择最符合你感受的程度。</p>
            </div>
            <Pill size="sm" tone={complete ? "green" : "gray"}>{complete ? "5 / 5" : "必填 5 项"}</Pill>
          </div>

          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">1. {REFLECTION_SURVEY_QUESTIONS.learningReflection} <span className="text-rose-600">*</span></span>
              <TextArea
                aria-label={REFLECTION_SURVEY_QUESTIONS.learningReflection}
                className="min-h-28"
                disabled={!canEdit}
                maxLength={REFLECTION_SURVEY_TEXT_MAX_LENGTH}
                onChange={(event) => updateText("learningReflection", event.target.value)}
                placeholder={REFLECTION_SURVEY_QUESTIONS.learningReflection}
                required
                value={fields.learningReflection}
              />
              <span className="mt-1 block text-right text-xs text-stone-400">{fields.learningReflection.length}/{REFLECTION_SURVEY_TEXT_MAX_LENGTH}</span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">2. {REFLECTION_SURVEY_QUESTIONS.systemReflection} <span className="text-rose-600">*</span></span>
              <TextArea
                aria-label={REFLECTION_SURVEY_QUESTIONS.systemReflection}
                className="min-h-24"
                disabled={!canEdit}
                maxLength={REFLECTION_SURVEY_TEXT_MAX_LENGTH}
                onChange={(event) => updateText("systemReflection", event.target.value)}
                placeholder={REFLECTION_SURVEY_QUESTIONS.systemReflection}
                required
                value={fields.systemReflection}
              />
              <span className="mt-1 block text-right text-xs text-stone-400">{fields.systemReflection.length}/{REFLECTION_SURVEY_TEXT_MAX_LENGTH}</span>
            </label>

            <div className="space-y-4">
              {SCALE_FIELDS.map(({ key, label }, index) => (
                <fieldset className="rounded-xl border border-stone-200 p-3" key={key}>
                  <legend className="px-1 text-sm font-bold">{index + 3}. {label} <span className="text-rose-600">*</span></legend>
                  <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
                    {REFLECTION_SURVEY_SCALE.map((option) => (
                      <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-stone-200 px-1 py-2 text-center text-[11px] text-stone-600 transition has-[:checked]:border-[var(--pbl-student)] has-[:checked]:bg-[var(--pbl-student-soft)] has-[:checked]:font-bold has-[:checked]:text-[var(--pbl-student)]" key={option.value}>
                        <input
                          aria-label={`${label}：${option.value}分，${option.label}`}
                          checked={fields[key] === option.value}
                          className="sr-only"
                          disabled={!canEdit}
                          name={`reflection-${key}`}
                          onChange={() => updateScore(key, option.value)}
                          required
                          type="radio"
                          value={option.value}
                        />
                        <span className="text-base font-bold">{option.value}</span>
                        <span className="leading-4">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="text-xs text-stone-500">
              {lastSavedAt && saved ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="text-emerald-600" size={14} />最近保存：{new Date(lastSavedAt).toLocaleString("zh-CN")}</span> : "完成所有项目后即可提交"}
            </div>
            <p className="text-center text-[11px] leading-5 text-stone-400">* 回答将仅用于教学计划改进和本课程实验分析。</p>
            <PrimaryButton className="sm:justify-self-end" disabled={!canEdit || !complete} onClick={submit} size="md" tone="teal">
              <Send size={16} />{submitted ? "更新并提交" : "提交反思"}
            </PrimaryButton>
          </div>
          {!canEdit ? <p className="mt-3 text-xs text-stone-500">课程已结束，反思内容仅供查看。</p> : null}
        </Card>

        <Card className="classroom-panel border-[var(--pbl-border)] bg-[var(--pbl-surface)] xl:sticky xl:top-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="classroom-eyebrow text-[var(--pbl-student)]">写作辅助</p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-bold"><BookOpenCheck className="text-[var(--pbl-student)]" size={18} />反思提示</h2>
            </div>
            <button
              aria-label="换一组反思提示"
              className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--pbl-text-muted)] transition hover:border-[var(--pbl-student-border)] hover:text-[var(--pbl-student)] disabled:cursor-wait disabled:opacity-60"
              disabled={generatingPrompts || !canEdit}
              onClick={() => void generatePrompts()}
              type="button"
            >
              <RefreshCw size={13} />{generatingPrompts ? "生成中…" : "换一组"}
            </button>
          </div>
          <ol className="mt-4 space-y-3">
            {suggestions.slice(0, 2).map((suggestion, index) => (
              <li className="flex gap-2.5 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-3 text-sm leading-6 text-stone-700" key={`${suggestion}-${index}`}>
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-[10px] font-bold text-[var(--pbl-student)]">{index + 1}</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-500"><Clock3 size={14} />保持简短，写清一个真实例子就够了。</div>
        </Card>
      </section>

    </div>
  );
}
