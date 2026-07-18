import { useMemo, useState } from "react";
import { ClipboardPlus, PenLine, Save, Star, Wand2 } from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import {
  EvaluationRadar,
  type EvaluationRadarDatum,
} from "@/components/charts";
import { Card, PrimaryButton, toast } from "@/components/ui";
import type {
  Course,
  EvaluationDimension,
  ReflectionRecord,
  RubricScore,
  Stage,
  TeacherFeedback,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildReflectionEvidencePrompts } from "@/lib/teaching-ai/client-api";
import { CompanionRoundtable } from "./companion-roundtable";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";

const FIVE_STAR_TOTAL = 5;

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickLatest<T extends { createdAt: string }>(
  list: T[] | undefined,
  predicate: (item: T) => boolean = () => true,
): T | undefined {
  if (!list || list.length === 0) return undefined;
  return list
    .filter(predicate)
    .reduce<T | undefined>((latest, item) => {
      if (!latest) return item;
      return new Date(item.createdAt) > new Date(latest.createdAt) ? item : latest;
    }, undefined);
}

function scoreToStars(score: number): number {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export function ReflectionView({ course }: { course?: Course }) {
  const session = useSession();
  const { upsertReflection, updateStudentProgress } = session;
  const title = course?.name ?? "—";
  const studentId = session.studentId ?? "guest";
  const studentName = session.studentName ?? "访客学生";
  const confirmation = useStudentActionConfirmation({ course, stageKey: "reflection" });

  // ===== 真实数据：从 store 读取 =====
  const dimensions: EvaluationDimension[] = useMemo(
    () => course?.content.evaluationPlan.dimensions ?? [],
    [course?.content.evaluationPlan.dimensions],
  );
  const allRubricScores: RubricScore[] = useMemo(
    () => course?.rubricScores ?? [],
    [course?.rubricScores],
  );
  const allFeedback: TeacherFeedback[] = useMemo(
    () => course?.feedback ?? [],
    [course?.feedback],
  );
  const allReflections: ReflectionRecord[] = useMemo(
    () => course?.reflections ?? [],
    [course?.reflections],
  );
  const stages: Stage[] = useMemo(
    () => course?.stages ?? [],
    [course?.stages],
  );

  // 当前学生的个人项目空间（沿用旧项目容器字段以兼容历史数据）
  const myGroup = useMemo(
    () =>
      course?.groups?.find((g) =>
        g.members.some((m) => m.studentId === studentId),
      ),
    [course?.groups, studentId],
  );

  // 找到与当前学生个人项目相关的 rubric 评分
  const studentRubricScores = useMemo(
    () =>
      allRubricScores.filter((s) => s.groupId === myGroup?.id),
    [allRubricScores, myGroup?.id],
  );

  // 取最后一条包含 dimensionScores 的评分（按 updatedAt）
  const latestRubric = useMemo(
    () =>
      [...studentRubricScores]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [studentRubricScores],
  );

  // ===== 计算 AI 过程评价雷达图数据 =====
  const radarData: EvaluationRadarDatum[] = useMemo(() => {
    if (dimensions.length === 0) {
      // 没有真实维度时使用 stages 名称兜底（让学生至少看到阶段而非占位）
      return stages.map((s, i) => ({
        subject: s.label,
        // fallback: 用各阶段 stageProgress 计算 (0-100 -> 0-5)
        value: Number(((course?.stages[i]?.key ? (course?.students?.find((st) => st.id === studentId)?.stageProgress?.[s.key] ?? 0) / 20 : 0).toFixed(1))),
      }));
    }
    if (latestRubric) {
      return dimensions.map((d) => ({
        subject: d.name,
        value: Number(((latestRubric.dimensionScores[d.id] ?? 0) / 20).toFixed(1)),
      }));
    }
    // 没有 rubric 评分时根据学生各 stage 进度粗略推断（仅作展示兜底，标识为"待评"）
    return dimensions.map((d) => ({
      subject: d.name,
      value: 0,
    }));
  }, [dimensions, latestRubric, stages, course?.stages, course?.students, studentId]);

  // ===== 综合得分 =====
  const overallScore = useMemo(() => {
    if (latestRubric && typeof latestRubric.total === "number") {
      return latestRubric.total;
    }
    // 无 rubric 时按 stages 进度均值（0-100）兜底
    if (stages.length === 0) return 0;
    const sp = course?.students?.find((s) => s.id === studentId)?.stageProgress ?? {};
    const sum = stages.reduce((acc, s) => acc + (sp[s.key] ?? 0), 0);
    return Math.round(sum / stages.length);
  }, [latestRubric, stages, course?.students, studentId]);

  // ===== 超越班级百分比 =====
  const classRankPercent = useMemo(() => {
    const totals = course?.students
      ?.map((s) => {
        const sp = s.stageProgress ?? {};
        const sum = stages.reduce((acc, st) => acc + (sp[st.key] ?? 0), 0);
        return { id: s.id, score: stages.length === 0 ? 0 : sum / stages.length };
      }) ?? [];
    if (totals.length <= 1) return null;
    const me = totals.find((t) => t.id === studentId);
    if (!me) return null;
    const beaten = totals.filter((t) => t.score < me.score).length;
    return Math.round((beaten / (totals.length - 1)) * 100);
  }, [course?.students, stages, studentId]);

  // ===== 真实教师评价（targetType=student/group，最近一条） =====
  const teacherFeedback = useMemo(
    () =>
      allFeedback
        .filter(
          (f) =>
            f.targetType === "student" ||
            f.targetType === "group",
        )
        .filter((f) => f.targetId === studentId || f.targetId === myGroup?.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [allFeedback, studentId, myGroup?.id],
  );

  // ===== 真实成长建议：从 evaluationPlan.overallRubric 句子拆分；空时用维度描述拼接 =====
  const improvementSuggestions = useMemo(() => {
    const overall = course?.content.evaluationPlan.overallRubric?.trim();
    if (overall) {
      // 拆句：按句号/分号/换行
      const sentences = overall
        .split(/[。；;.\n]+/g)
        .map((s) => s.trim())
        .filter(Boolean);
      if (sentences.length > 0) return sentences.slice(0, 5);
    }
    // 兜底：使用维度描述
    return dimensions.slice(0, 5).map((d) => d.description);
  }, [course?.content.evaluationPlan.overallRubric, dimensions]);

  // ===== 真实成长里程碑：从 course.stages + student.stageProgress =====
  const milestones = useMemo(() => {
    if (stages.length === 0) return [];
    const sp = course?.students?.find((s) => s.id === studentId)?.stageProgress ?? {};
    return stages.map((s) => ({
      key: s.key,
      label: s.label,
      done: (sp[s.key] ?? 0) >= 100,
      progress: sp[s.key] ?? 0,
    }));
  }, [stages, course?.students, studentId]);

  const milestonesCompleted = milestones.filter((m) => m.done).length;

  // ===== 顶部"评价时间"：取最近一次相关记录的 createdAt =====
  const latestRecord = useMemo(
    () =>
      pickLatest<ReflectionRecord | TeacherFeedback | RubricScore>(
        [
          ...allReflections.filter((r) => r.studentId === studentId),
          ...allFeedback.filter(
            (f) => f.targetId === studentId || f.targetId === myGroup?.id,
          ),
          ...studentRubricScores,
        ],
      ),
    [allReflections, allFeedback, studentRubricScores, studentId, myGroup?.id],
  );
  const evaluationDate = formatDate(
    latestRecord?.createdAt ?? course?.updatedAt,
  );

  // ===== 自我反思：优先读 store 中已有记录 =====
  const existingReflection = useMemo(
    () =>
      allReflections
        .filter((r) => r.studentId === studentId)
        .sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0],
    [allReflections, studentId],
  );
  const [content, setContent] = useState<string>(existingReflection?.content ?? "");
  const [improvementPlanText, setImprovementPlanText] = useState<string>(existingReflection?.improvementPlan ?? "");
  const [saved, setSaved] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const isViewingExisting = Boolean(existingReflection);
  const latestReflectionSupport = useMemo(
    () =>
      (course?.aiSupports ?? [])
        .filter(
          (item) =>
            item.kind === "reflection-evidence" &&
            (item.studentId === studentId || item.groupId === myGroup?.id),
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [course?.aiSupports, studentId, myGroup?.id],
  );

  function performSaveReflection(improvementPlan?: string) {
    if (!course) return;
    upsertReflection({
      id: existingReflection?.id,
      content,
      improvementPlan,
      studentName,
    });
    updateStudentProgress("reflection", improvementPlan ? 100 : 80);
    setSaved(true);
  }

  function saveReflection() {
    confirmation.request({
      action: existingReflection ? "overwrite" : "save",
      title: existingReflection ? "覆盖个人反思记录" : "保存个人反思记录",
      summary: "这会把你当前写下的反思保存到课堂记录，供你和伴学伙伴在后续回看。",
      payload: { reflectionId: existingReflection?.id },
      onConfirm: () => performSaveReflection(),
    });
  }

  async function generateReflectionPrompts() {
    if (!course) return;
    try {
      const draft = await buildReflectionEvidencePrompts({
        course,
        group: myGroup,
        studentId,
      });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentName,
      });
      // 提醒教师有新数据可刷新
      session.setUiState(course.id, { aiAnalysisPending: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 反思提示生成失败";
      toast.error("AI 反思建议生成失败", { description: message });
    }
  }

  function saveImprovementPlan() {
    if (!course) return;
    const plan = improvementPlanText.trim();
    if (!plan) {
      setPlanError("请先填写改进计划内容");
      return;
    }
    setPlanError(null);
    confirmation.request({
      action: "mark-complete",
      title: "保存改进计划并完成反思阶段",
      summary: "这会保存当前改进计划，并将个人反思阶段标记为 100%。请确认这条行动计划是你愿意真正执行的下一步。",
      payload: { reflectionId: existingReflection?.id, stageKey: "reflection" },
      onConfirm: () => performSaveReflection(plan),
    });
  }

  const overallStars = scoreToStars(overallScore);

  return (
    <div className="space-y-5">
      <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">个人评价与反思</h1>
          <p className="mt-3 text-base text-stone-500">
            回顾项目全过程，查看评价与建议，反思成长与不足，持续提升综合素养。
          </p>
        </div>
        <div className="text-sm font-semibold text-stone-600 sm:text-base">
          项目：{title}　评价时间：{evaluationDate}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              AI过程评价 <span className="text-stone-400">ⓘ</span>
            </h2>
            {latestRubric ? (
              <span className="rounded-[6px] bg-[var(--pbl-success-soft)] px-3 py-1 text-xs font-bold text-[var(--pbl-success)]">
                已收到评分
              </span>
            ) : myGroup ? (
              <span className="rounded-[6px] bg-[var(--pbl-warning-soft)] px-3 py-1 text-xs font-bold text-[var(--pbl-warning)]">
                待教师评分
              </span>
            ) : (
              <span className="rounded-[6px] bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                数据同步中
              </span>
            )}
          </div>
          {!latestRubric ? (
            <div className="mb-3 rounded-[8px] border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500">
              {myGroup
                ? `你的个人项目「${myGroup.name}」尚未收到教师评分。教师在「成果汇报与评价」阶段提交评分后将自动同步至此。`
                : "个人项目数据正在同步中，请稍候刷新。"}
            </div>
          ) : null}
          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_190px]">
            <EvaluationRadar data={radarData} />
            <div className="border-l border-stone-200 pl-7">
              <div className="text-base text-stone-600">综合得分</div>
              <div className="mt-4 text-5xl font-bold text-blue-600">
                {overallScore}
                <span className="text-lg text-stone-500"> /100</span>
              </div>
              <div className="mt-3 flex text-blue-600">
                {Array.from({ length: FIVE_STAR_TOTAL }).map((_, index) => (
                  <Star
                    className={index < overallStars ? "" : "text-stone-300"}
                    fill="currentColor"
                    key={index}
                    size={23}
                  />
                ))}
              </div>
              <div className="mt-4 text-sm text-stone-500">
                {classRankPercent === null ? (
                  "暂无同级对比数据"
                ) : (
                  <>
                    超越班级 <span className="font-bold text-blue-600">{classRankPercent}%</span> 的同学
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-5 text-xl font-bold">教师评价</h2>
          {teacherFeedback ? (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <Avatar name={session.user?.name ?? "教师"} />
                <div className="min-w-0">
                  <div className="truncate font-bold">{session.user?.name ?? "教师"}</div>
                  <div className="text-sm text-stone-500">{formatDate(teacherFeedback.createdAt)}</div>
                </div>
                <span className="ml-auto shrink-0 rounded-[6px] bg-[var(--pbl-success-soft)] px-3 py-2 font-bold text-[var(--pbl-success)]">
                  {teacherFeedback.kind === "praise"
                    ? "优秀"
                    : teacherFeedback.kind === "revision"
                      ? "需修改"
                      : teacherFeedback.kind === "ai-support"
                        ? "AI 助教"
                        : teacherFeedback.kind === "question"
                          ? "待回复"
                          : "已评价"}
                </span>
              </div>
              <p className="break-words text-[15px] leading-8 text-stone-700">
                {teacherFeedback.content}
              </p>
            </>
          ) : (
            <div className="rounded-[8px] border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
              暂未收到教师评价。
              <div className="mt-1 text-xs text-stone-400">
                完成个人项目汇报后，教师将在此留言。
              </div>
            </div>
          )}
        </Card>

      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.75fr_0.92fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">自我反思</h2>
            <button className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-[var(--pbl-teacher-border)] px-3 text-sm font-semibold text-[var(--pbl-student)] hover:bg-[var(--pbl-student-soft)]" onClick={generateReflectionPrompts} type="button">
              <Wand2 size={15} /> 提取过程证据
            </button>
          </div>
          {latestReflectionSupport ? (
            <div className="mb-4 rounded-[8px] border border-blue-100 bg-[var(--pbl-student-soft)]/70 p-3">
              <div className="font-bold text-blue-800">{latestReflectionSupport.diagnosis}</div>
              <div className="mt-2 space-y-2">
                {latestReflectionSupport.suggestions.map((item) => (
                  <div className="text-sm leading-6 text-stone-700" key={item}>· {item}</div>
                ))}
              </div>
              <div className="mt-2 text-xs leading-5 text-stone-500">可引用证据：{latestReflectionSupport.evidence.join("；")}</div>
            </div>
          ) : null}
          <textarea
            className="min-h-[140px] w-full resize-none rounded-[8px] border border-stone-300 p-4 text-[15px] leading-8 outline-none focus:border-blue-500"
            onChange={(e) => setContent(e.target.value)}
            placeholder="回顾本项目全过程：你最大的收获是什么？遇到了哪些困难？下一步如何改进？"
            value={content}
          />
          <div className="mt-2 flex items-center justify-between text-sm text-stone-500">
            <span>
              {isViewingExisting ? "已加载历史反思，编辑后将覆盖原内容" : "首次撰写"}
            </span>
            <span>
              {content.length}/1000 {saved ? "· 已保存" : ""}
            </span>
          </div>
          <h3 className="mb-2 mt-5 text-base font-bold">下一轮改进计划</h3>
          <textarea
            className="min-h-[90px] w-full resize-none rounded-[8px] border border-stone-300 p-3 text-[14px] leading-7 outline-none focus:border-blue-500"
            onChange={(e) => {
              setImprovementPlanText(e.target.value);
              if (planError) setPlanError(null);
            }}
            placeholder="针对本轮项目中的不足，写下你在下一轮要落实的具体行动（如：提前规划调研样本、用数据表跟踪任务等）。"
            value={improvementPlanText}
          />
          {planError ? (
            <div className="mt-1 text-xs text-[var(--pbl-danger)]">{planError}</div>
          ) : null}
          <div className="mt-1 text-right text-xs text-stone-400">
            {improvementPlanText.length} 字
          </div>
        </Card>

        <Card>
          <h2 className="mb-5 text-xl font-bold">成长建议</h2>
          {improvementSuggestions.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
              暂未配置评价量规，无法生成具体建议。
            </div>
          ) : (
            <div className="space-y-5">
              {improvementSuggestions.map((item, index) => (
                <div className="flex gap-3" key={`${index}-${item}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--pbl-student-soft)]0 font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="text-[15px] leading-7 text-stone-700">{item}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-5 text-xl font-bold">
            成长里程碑{" "}
            <span className="text-base font-medium text-stone-500">
              （已完成 {milestonesCompleted} / {milestones.length}）
            </span>
          </h2>
          {milestones.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
              课程尚未配置阶段。
            </div>
          ) : (
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_150px]">
              <div className="space-y-4">
                {milestones.map((m) => {
                  const stage = stages.find((s) => s.key === m.key);
                  const label = stage?.label ?? m.label;
                  return (
                    <div className="flex items-center gap-3 text-[15px]" key={m.key}>
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold text-white ${
                          m.done ? "bg-[var(--pbl-success)]" : "bg-stone-300"
                        }`}
                      >
                        {m.done ? "✓" : ""}
                      </span>
                      <span>
                        {label}（{Math.round(m.progress)}%）
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-[var(--pbl-student-soft)] text-5xl text-blue-200">
                ★
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="flex min-h-[88px] flex-wrap items-center justify-center gap-4 rounded-[10px] border border-stone-200/80 bg-white px-6 py-5 sm:gap-6">
        <PrimaryButton className="min-w-[16rem] flex-1 sm:flex-none" onClick={() => saveReflection()}>
          <Save size={21} /> {isViewingExisting ? "更新反思" : "保存反思"}
        </PrimaryButton>
        <PrimaryButton className="min-w-[16rem] flex-1 sm:flex-none" variant="outline">
          <ClipboardPlus size={21} /> 查看成长报告
        </PrimaryButton>
        <PrimaryButton
          className="min-w-[16rem] flex-1 sm:flex-none"
          onClick={() => saveImprovementPlan()}
          variant="outline"
        >
          <PenLine size={21} /> 保存改进计划
        </PrimaryButton>
      </div>
      {course ? (
        <CompanionRoundtable course={course} stageKey="reflection" contextLabel="评价反思" />
      ) : null}
      <StudentActionConfirmationDialog busy={confirmation.busy} onConfirm={() => void confirmation.confirm()} onReject={confirmation.reject} pending={confirmation.pending} />
    </div>
  );
}
