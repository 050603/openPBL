import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Eye,
  FileCheck2,
  Lightbulb,
  Loader2,
  MessageSquare,
  Send,
  Users,
  Wand2,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, Pill, PrimaryButton, ProgressBar, toast } from "@/components/ui";
import type {
  Course,
  EvaluationDimension,
  ReflectionRecord,
  RubricScore,
  TeacherFeedback,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import {
  generateProcessEvaluation,
  type ProcessEvaluationResult,
} from "@/lib/teaching-ai/client-api";
import { buildCourseSummaryPresentation } from "@/lib/evaluation/course-summary";

function latestShowcaseScore(
  rubricScores: RubricScore[],
  projectId?: string,
): RubricScore | undefined {
  if (!projectId) return undefined;
  return [...rubricScores]
    .filter((score) => score.groupId === projectId && score.stageKey === "showcase")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

function computeDimensionAverages(
  rubricScores: RubricScore[],
  dimensions: EvaluationDimension[],
): Record<string, number | null> {
  return Object.fromEntries(
    dimensions.map((dimension) => {
      const values = rubricScores
        .map((score) => score.dimensionScores?.[dimension.id])
        .filter((value): value is number => typeof value === "number");
      return [
        dimension.id,
        values.length
          ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
          : null,
      ];
    }),
  );
}

function latestByStudent(
  records: ReflectionRecord[],
): Map<string, ReflectionRecord> {
  const result = new Map<string, ReflectionRecord>();
  [...records]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .forEach((record) => {
      if (!result.has(record.studentId)) result.set(record.studentId, record);
    });
  return result;
}

export function ReflectionTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (id: string) => void;
}) {
  const { addFeedback, addActivity, updateCourse } = useSession();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const [processEval, setProcessEval] =
    useState<ProcessEvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string>();
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [summaryDeck, setSummaryDeck] = useState(
    course.content.courseSummaryPresentation ?? null,
  );

  const students = course.students;
  const groups = useMemo(() => course.groups ?? [], [course.groups]);
  const reflections = useMemo(
    () => course.reflections ?? [],
    [course.reflections],
  );
  const showcaseScores = useMemo(
    () =>
      (course.rubricScores ?? []).filter(
        (score) => score.stageKey === "showcase",
      ),
    [course.rubricScores],
  );
  const dimensions = course.content.evaluationPlan.dimensions;
  const dimensionAverages = useMemo(
    () => computeDimensionAverages(showcaseScores, dimensions),
    [showcaseScores, dimensions],
  );
  const reflectionsByStudent = useMemo(
    () => latestByStudent(reflections),
    [reflections],
  );

  const projectByStudent = useMemo(() => {
    const result = new Map<string, (typeof groups)[number]>();
    groups.forEach((project) => {
      project.members.forEach((member) =>
        result.set(member.studentId, project),
      );
    });
    return result;
  }, [groups]);

  const feedbackByStudent = useMemo(() => {
    const result = new Map<string, TeacherFeedback>();
    const feedback = [...(course.feedback ?? [])]
      .filter(
        (item) =>
          item.stageKey === "reflection" && item.sourceRole !== "ai",
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    feedback.forEach((item) => {
      const studentIds =
        item.targetType === "student"
          ? [item.targetId]
          : (groups.find((group) => group.id === item.targetId)?.members ?? []).map(
              (member) => member.studentId,
            );
      studentIds.forEach((studentId) => {
        if (!result.has(studentId)) result.set(studentId, item);
      });
    });
    return result;
  }, [course.feedback, groups]);

  const studentEvidenceIds = useMemo(() => {
    const result = new Set<string>();
    const validStudentIds = new Set(students.map((student) => student.id));
    const markStudent = (studentId: string) => {
      if (validStudentIds.has(studentId)) result.add(studentId);
    };
    (course.companionProcessRecords ?? []).forEach((record) =>
      markStudent(record.studentId),
    );
    (course.learningEvents ?? []).forEach((event) =>
      markStudent(event.studentId),
    );
    (course.companionThreads ?? []).forEach((thread) => {
      if (thread.messages.length) markStudent(thread.studentId);
    });
    (course.submissions ?? []).forEach((submission) => {
      if (submission.studentId) {
        markStudent(submission.studentId);
      } else if (submission.groupId) {
        groups
          .find((group) => group.id === submission.groupId)
          ?.members.forEach((member) => markStudent(member.studentId));
      }
    });
    (course.uploads ?? []).forEach((upload) => {
      if (upload.studentId) {
        markStudent(upload.studentId);
      } else if (upload.groupId) {
        groups
          .find((group) => group.id === upload.groupId)
          ?.members.forEach((member) => markStudent(member.studentId));
      }
    });
    return result;
  }, [
    course.companionProcessRecords,
    course.companionThreads,
    course.learningEvents,
    course.submissions,
    course.uploads,
    groups,
    students,
  ]);

  const evaluatedStudentIds = useMemo(() => {
    const result = new Set<string>();
    showcaseScores.forEach((score) => {
      groups
        .find((group) => group.id === score.groupId)
        ?.members.forEach((member) => result.add(member.studentId));
    });
    return result;
  }, [groups, showcaseScores]);

  const pendingStudents = students.filter(
    (student) =>
      !evaluatedStudentIds.has(student.id) ||
      !reflectionsByStudent.has(student.id),
  );
  const evaluatedStudentCount = students.filter((student) =>
    evaluatedStudentIds.has(student.id),
  ).length;
  const reflectionStudentCount = students.filter((student) =>
    reflectionsByStudent.has(student.id),
  ).length;
  const draftedCommentCount = Object.values(comments).filter((comment) =>
    comment.trim(),
  ).length;
  const hasStudentProcessEvidence = studentEvidenceIds.size > 0;
  const canBuildSummary =
    showcaseScores.length > 0 ||
    reflections.length > 0 ||
    Boolean(processEval);

  function flashMessage(text: string, tone: "ok" | "err") {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 3500);
  }

  async function runProcessEval() {
    if (!hasStudentProcessEvidence) return;
    setEvalLoading(true);
    setEvalError(undefined);
    try {
      const result = await generateProcessEvaluation({ course });
      setProcessEval(result);
      setEditedSummary(result.summary);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "AI 过程评价失败";
      setEvalError(errorMessage);
      toast.error("AI 过程评价失败", { description: errorMessage });
    } finally {
      setEvalLoading(false);
    }
  }

  function saveEditedSummary() {
    if (!processEval || !editedSummary.trim()) return;
    setProcessEval({ ...processEval, summary: editedSummary.trim() });
    setEditingSummary(false);
    flashMessage("已保留教师核验后的过程总结", "ok");
  }

  function generateSummaryDeck() {
    if (!canBuildSummary) return;
    const nextDeck = buildCourseSummaryPresentation(course, processEval);
    setSummaryDeck(nextDeck);
    updateCourse(course.id, {
      content: {
        ...course.content,
        courseSummaryPresentation: nextDeck,
      },
    });
    flashMessage("总结演示结构与教师讲稿已生成，等待教师确认", "ok");
  }

  function confirmSummaryDeck() {
    if (!summaryDeck) return;
    const confirmed = {
      ...summaryDeck,
      status: "teacher-confirmed" as const,
      updatedAt: new Date().toISOString(),
    };
    setSummaryDeck(confirmed);
    updateCourse(course.id, {
      content: {
        ...course.content,
        courseSummaryPresentation: confirmed,
      },
    });
    addActivity(course.id, "确认课程总结演示", confirmed.title, "教师");
    flashMessage("课程总结演示已确认，可用于课堂收束", "ok");
  }

  function sendComment(studentId: string) {
    const content = comments[studentId]?.trim();
    if (!content) {
      flashMessage("请先填写针对性评语", "err");
      return;
    }
    setSaving(true);
    try {
      addFeedback({
        courseId: course.id,
        targetType: "student",
        targetId: studentId,
        stageKey: "reflection",
        kind: "comment",
        content,
      });
      setComments((current) => ({ ...current, [studentId]: "" }));
      addActivity(course.id, "发送个人课程评语", content, "教师");
      flashMessage("个人评语已发送", "ok");
    } finally {
      setSaving(false);
    }
  }

  function batchSendComments() {
    const entries = students
      .map((student) => ({
        student,
        content: comments[student.id]?.trim() ?? "",
      }))
      .filter((entry) => entry.content);
    if (!entries.length) {
      flashMessage("请先为至少一位学生填写针对性评语", "err");
      return;
    }
    setSaving(true);
    try {
      entries.forEach(({ student, content }) => {
        addFeedback({
          courseId: course.id,
          targetType: "student",
          targetId: student.id,
          stageKey: "reflection",
          kind: "comment",
          content,
        });
      });
      setComments({});
      addActivity(
        course.id,
        "批量发送课程评语",
        `已发送 ${entries.length} 条教师撰写的评语`,
        "教师",
      );
      flashMessage(`已发送 ${entries.length} 条教师评语`, "ok");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div
          className={`flex items-start gap-2 rounded-[8px] border px-4 py-3 text-sm font-semibold ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-[var(--pbl-success)]"
              : "border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] text-[var(--pbl-danger)]"
          }`}
        >
          {message.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} />
          ) : (
            <Lightbulb className="mt-0.5 shrink-0" size={16} />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<FileCheck2 className="text-blue-600" size={20} />}
          label="成果已评价"
          value={`${evaluatedStudentCount} / ${students.length}`}
        />
        <MetricCard
          icon={<Edit3 className="text-emerald-600" size={20} />}
          label="已交个人反思"
          value={`${reflectionStudentCount} / ${students.length}`}
        />
        <MetricCard
          icon={<Users className="text-[var(--pbl-warning)]" size={20} />}
          label="有过程证据"
          value={`${studentEvidenceIds.size} / ${students.length}`}
        />
        <MetricCard
          icon={<Lightbulb className="text-[var(--pbl-danger)]" size={20} />}
          label="待补齐记录"
          value={`${pendingStudents.length}`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <FileCheck2 className="text-blue-700" size={20} />
            已提交成果评价的维度均值
          </h2>
          {showcaseScores.length ? (
            <ul className="space-y-3">
              {dimensions.map((dimension) => {
                const average = dimensionAverages[dimension.id];
                return (
                  <li className="flex items-center gap-3" key={dimension.id}>
                    <span className="w-32 text-sm text-stone-600">
                      {dimension.name}
                    </span>
                    <ProgressBar
                      className="h-2 flex-1"
                      tone={
                        average !== null && average >= 85
                          ? "green"
                          : average !== null && average >= 70
                            ? "blue"
                            : "slate"
                      }
                      value={average ?? 0}
                    />
                    <span className="w-10 text-right text-sm font-bold">
                      {average ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState text="尚无教师提交的展示阶段评分，不使用进度数据代替成绩。" />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <ClipboardCheck className="text-[var(--pbl-warning)]" size={20} />
            数据完整性
          </h2>
          {pendingStudents.length ? (
            <div className="space-y-3">
              <p className="text-sm leading-6 text-stone-600">
                以下学生仍缺少成果评价或个人反思。补齐真实记录后，再生成班级过程评价和总结演示。
              </p>
              <ul className="flex flex-wrap gap-2">
                {pendingStudents.map((student) => (
                  <li key={student.id}>
                    <button
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-400"
                      onClick={() => onSelectStudent?.(student.id)}
                      type="button"
                    >
                      {student.name}
                      {!evaluatedStudentIds.has(student.id)
                        ? " · 缺评价"
                        : ""}
                      {!reflectionsByStudent.has(student.id)
                        ? " · 缺反思"
                        : ""}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
              全班成果评价与个人反思记录已齐备。
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <ClipboardCheck className="text-[var(--pbl-warning)]" size={20} />
              AI 过程性评价草案
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-500">
              根据当前课程记录生成，完成后请教师核对。
            </p>
          </div>
          <PrimaryButton
            className="h-9 px-3 text-sm"
            disabled={evalLoading || !hasStudentProcessEvidence}
            onClick={() => void runProcessEval()}
            type="button"
          >
            {evalLoading ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Wand2 size={15} />
            )}
            {evalLoading ? "生成中..." : "基于现有证据生成"}
          </PrimaryButton>
        </div>
        {!hasStudentProcessEvidence ? (
          <EmptyState text="尚无学生过程证据，暂不生成推测性评价。" />
        ) : null}
        {evalError ? (
          <div className="rounded-[6px] border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--pbl-danger)]">
            {evalError}
          </div>
        ) : null}
        {processEval ? (
          <div className="space-y-4">
            <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-stone-700">
                  全班过程总结 · 待教师核验
                </span>
                {editingSummary ? (
                  <button
                    className="text-xs font-semibold text-blue-700 hover:underline"
                    onClick={saveEditedSummary}
                    type="button"
                  >
                    保存核验结果
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                    onClick={() => {
                      setEditingSummary(true);
                      setEditedSummary(processEval.summary);
                    }}
                    type="button"
                  >
                    <Edit3 size={12} /> 编辑核验
                  </button>
                )}
              </div>
              {editingSummary ? (
                <textarea
                  className="min-h-[6.25rem] w-full rounded-[6px] border border-stone-200 bg-white px-3 py-2 text-sm leading-7 outline-none focus:border-blue-500"
                  onChange={(event) => setEditedSummary(event.target.value)}
                  value={editedSummary}
                />
              ) : (
                <p className="text-sm leading-7 text-stone-700">
                  {processEval.summary}
                </p>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {processEval.dimensions.map((dimension) => (
                <article
                  className="rounded-[8px] border border-stone-200 bg-white p-3"
                  key={dimension.name}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {dimension.name}
                    </span>
                    <span className="text-sm font-bold text-blue-700">
                      {typeof dimension.score === "number"
                        ? `${dimension.score} 分`
                        : "0 分（证据不足）"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-stone-600">
                    {dimension.rationale}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    证据：
                    {dimension.evidenceIds.length
                      ? dimension.evidenceIds.join("；")
                      : "模型未返回证据，请勿采用该分数"}
                  </p>
                  {dimension.evidenceGaps.length ? (
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      缺口：{dimension.evidenceGaps.join("；")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <EvidenceList
                items={processEval.highlights}
                title="有证据支持的亮点"
                tone="green"
              />
              <EvidenceList
                items={processEval.improvements}
                title="需核验的改进方向"
                tone="amber"
              />
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-stone-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Wand2 className="text-[var(--pbl-teacher)]" size={20} />
              课程总结演示
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">
              将已有课程信息、真实评价与反思组织成演示结构和教师讲稿；这不是可下载的 PPT 文件。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {summaryDeck ? (
              <Pill
                tone={
                  summaryDeck.status === "teacher-confirmed"
                    ? "green"
                    : "orange"
                }
              >
                {summaryDeck.status === "teacher-confirmed"
                  ? "教师已确认"
                  : "待确认"}
              </Pill>
            ) : null}
            <PrimaryButton
              className="h-9 px-3 text-sm"
              disabled={!canBuildSummary}
              onClick={generateSummaryDeck}
              type="button"
            >
              <Wand2 size={15} />
              {summaryDeck ? "重新生成结构" : "生成演示结构与讲稿"}
            </PrimaryButton>
          </div>
        </div>
        {summaryDeck ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              {summaryDeck.slides.map((slide, index) => (
                <article
                  className="aspect-[16/10] rounded-lg border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 p-4 shadow-sm"
                  key={slide.id}
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-[var(--pbl-teacher-border)]">
                    <span>页面 {String(index + 1).padStart(2, "0")}</span>
                    <span>
                      {slide.evidenceIds.length
                        ? `${slide.evidenceIds.length} 条证据`
                        : "课程信息"}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-black text-stone-900">
                    {slide.title}
                  </h3>
                  <ul className="mt-3 space-y-1.5 text-sm leading-5 text-stone-700">
                    {slide.bullets.map((bullet) => (
                      <li className="flex gap-2" key={bullet}>
                        <span className="text-[var(--pbl-teacher-border)]">
                          •
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <aside className="rounded-lg border border-amber-100 bg-[var(--pbl-warning-soft)]/60 p-4">
              <h3 className="font-bold text-[var(--pbl-warning)]">
                教师讲稿
              </h3>
              <div className="mt-3 max-h-[360px] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-stone-700">
                {summaryDeck.script}
              </div>
              {summaryDeck.status !== "teacher-confirmed" ? (
                <PrimaryButton
                  className="mt-4 w-full"
                  onClick={confirmSummaryDeck}
                  type="button"
                >
                  <CheckCircle2 size={16} /> 确认总结演示
                </PrimaryButton>
              ) : (
                <p className="mt-4 rounded-md bg-white/70 px-3 py-2 text-xs font-semibold text-[var(--pbl-success)]">
                  已确认，可在课程总结环节使用。
                </p>
              )}
            </aside>
          </div>
        ) : (
          <EmptyState
            text={
              canBuildSummary
                ? "尚未生成总结演示。"
                : "至少需要一条真实评价或个人反思，才可生成总结演示。"
            }
          />
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <MessageSquare className="text-blue-700" size={20} />
              个别学生反思与教师评语
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              将已填写的教师评语发送给学生。
            </p>
          </div>
          <PrimaryButton
            className="h-9 px-3 text-sm"
            disabled={saving || draftedCommentCount === 0}
            onClick={batchSendComments}
            type="button"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Send size={15} />
            )}
            发送已填写评语（{draftedCommentCount}）
          </PrimaryButton>
        </div>
        {students.length ? (
          <ul className="max-h-[42rem] space-y-3 overflow-auto pr-1">
            {students.map((student) => {
              const project = projectByStudent.get(student.id);
              const score = latestShowcaseScore(showcaseScores, project?.id);
              const reflection = reflectionsByStudent.get(student.id);
              const latestFeedback = feedbackByStudent.get(student.id);
              return (
                <li
                  className="rounded-[8px] border border-stone-200 bg-white p-3"
                  key={student.id}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={student.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <button
                        className="inline-flex items-center gap-1 font-semibold hover:text-blue-600"
                        onClick={() => onSelectStudent?.(student.id)}
                        type="button"
                      >
                        {student.name} <Eye size={13} />
                      </button>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {project ? `项目：${project.name}` : "个人项目待同步"}
                        {" · "}
                        {score ? `展示评价 ${score.total} 分` : "展示评价待提交"}
                      </div>
                    </div>
                    <Pill tone={reflection ? "green" : "orange"}>
                      {reflection ? "已交反思" : "待交反思"}
                    </Pill>
                  </div>
                  {reflection ? (
                    <div className="mt-3 rounded-[6px] border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs leading-5 text-stone-600">
                      <span className="font-semibold">最近反思：</span>
                      {reflection.content.replace(/\s+/g, " ").slice(0, 180)}
                      {reflection.content.length > 180 ? "…" : ""}
                      {reflection.improvementPlan
                        ? `；下一步：${reflection.improvementPlan}`
                        : ""}
                    </div>
                  ) : null}
                  {latestFeedback ? (
                    <div className="mt-2 text-xs leading-5 text-stone-500">
                      最近教师评语：{latestFeedback.content}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <textarea
                      className="min-h-16 flex-1 rounded-[6px] border border-stone-200 p-2 text-sm outline-none focus:border-blue-500"
                      onChange={(event) =>
                        setComments((current) => ({
                          ...current,
                          [student.id]: event.target.value,
                        }))
                      }
                      placeholder={`根据 ${student.name} 的成果和反思填写针对性评语…`}
                      value={comments[student.id] ?? ""}
                    />
                    <PrimaryButton
                      className="self-end sm:h-10"
                      disabled={saving || !comments[student.id]?.trim()}
                      onClick={() => sendComment(student.id)}
                      type="button"
                      variant="outline"
                    >
                      <Send size={15} /> 发送此评语
                    </PrimaryButton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState text="暂无学生数据。" />
        )}
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-500">{label}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold text-stone-900">{value}</div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-[8px] border border-dashed border-stone-300 bg-stone-50 py-8 text-center text-sm text-stone-500">
      {text}
    </div>
  );
}

function EvidenceList({
  items,
  title,
  tone,
}: {
  items: string[];
  title: string;
  tone: "green" | "amber";
}) {
  const style =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
      : "border-amber-200 bg-amber-50/60 text-amber-800";
  return (
    <div className={`rounded-[8px] border p-3 ${style}`}>
      <div className="mb-1 text-xs font-bold">{title}</div>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-stone-700">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">没有返回可核验内容。</p>
      )}
    </div>
  );
}
