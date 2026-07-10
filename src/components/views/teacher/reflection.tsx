import { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Lightbulb,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Star,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import {
  Card,
  Pill,
  PrimaryButton,
  ProgressBar,
} from "@/components/ui";
import type {
  Course,
  EvaluationDimension,
  RubricScore,
  TeacherFeedback,
} from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { generateProcessEvaluation, type ProcessEvaluationResult } from "@/lib/teaching-ai/client-api";

type ProcessEvaluation = ProcessEvaluationResult;

/**
 * 计算某学生/小组的真实综合得分。
 * 优先从 rubricScores 取最新一条；无评分时按 stageProgress 均值兜底。
 */
function computeRealScore(
  rubricScores: RubricScore[],
  targetId: string,
  stageProgress: Record<string, number>,
  stageKeys: string[],
): number {
  // 取最新一条 rubric（按 updatedAt 降序）
  const sorted = [...rubricScores]
    .filter((s) => s.groupId === targetId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  if (sorted.length > 0 && typeof sorted[0].total === "number") {
    return sorted[0].total;
  }
  // 兜底：stageProgress 均值
  if (stageKeys.length === 0) return 0;
  const sum = stageKeys.reduce((acc, k) => acc + (stageProgress[k] ?? 0), 0);
  return Math.round(sum / stageKeys.length);
}

/**
 * 计算维度均分：从 rubricScores 的 dimensionScores 汇总。
 */
function computeDimensionAverages(
  rubricScores: RubricScore[],
  dimensions: EvaluationDimension[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const d of dimensions) {
    const scores = rubricScores
      .map((s) => s.dimensionScores?.[d.id])
      .filter((v): v is number => typeof v === "number");
    result[d.id] = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }
  return result;
}

export function ReflectionTeacherView({
  course,
  onSelectStudent,
}: {
  course: Course;
  onSelectStudent?: (id: string) => void;
}) {
  const { addFeedback, upsertRubricScore, addActivity } = useSession();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const students = course.students;
  const dimensions = course.content.evaluationPlan.dimensions;
  const rubricScores = useMemo(() => course.rubricScores ?? [], [course.rubricScores]);
  const feedback = useMemo(() => course.feedback ?? [], [course.feedback]);
  const groups = useMemo(() => course.groups ?? [], [course.groups]);
  const stageKeys = course.stages.map((s) => s.key);

  // 每个学生的真实综合得分
  const studentScores = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of students) {
      // 学生可能在小组中，优先查小组评分；否则查个人
      const group = groups.find((g) => g.members.some((m) => m.studentId === s.id));
      const targetId = group?.id ?? s.id;
      map.set(s.id, computeRealScore(rubricScores, targetId, s.stageProgress ?? {}, stageKeys));
    }
    return map;
  }, [students, rubricScores, groups, stageKeys]);

  // 班级维度均分
  const dimensionAverages = useMemo(
    () => computeDimensionAverages(rubricScores, dimensions),
    [rubricScores, dimensions],
  );

  // 班级平均分
  const classAvg = useMemo(() => {
    if (students.length === 0) return 0;
    const sum = students.reduce((acc, s) => acc + (studentScores.get(s.id) ?? 0), 0);
    return Math.round(sum / students.length);
  }, [students, studentScores]);

  const excellentCount = students.filter((s) => (studentScores.get(s.id) ?? 0) >= 90).length;
  const passCount = students.filter((s) => {
    const sc = studentScores.get(s.id) ?? 0;
    return sc >= 75 && sc < 90;
  }).length;
  const needImproveCount = students.filter((s) => (studentScores.get(s.id) ?? 0) < 75).length;

  // AI 班级整体点评：基于维度均分动态生成
  const aiClassComment = useMemo(() => {
    const strongDims = dimensions.filter((d) => (dimensionAverages[d.id] ?? 0) >= 85);
    const weakDims = dimensions.filter((d) => (dimensionAverages[d.id] ?? 0) < 70);
    const parts: string[] = [];
    if (rubricScores.length === 0) {
      parts.push("尚未对任何小组提交评分，请先在「展示评价」阶段完成评分后查看班级整体分析。");
    } else {
      if (strongDims.length > 0) {
        parts.push(`班级整体在「${strongDims.map((d) => d.name).join("」「")}」维度表现突出（85+）。`);
      }
      if (weakDims.length > 0) {
        parts.push(`建议在下一轮加强「${weakDims.map((d) => d.name).join("」「")}」的练习。`);
      }
      if (strongDims.length === 0 && weakDims.length === 0) {
        parts.push("班级各维度表现均衡，整体处于良好水平。");
      }
      if (excellentCount > 0) {
        parts.push(`${excellentCount} 个小组达到优秀水平，可作为示范案例。`);
      }
    }
    return parts.join("");
  }, [rubricScores, dimensions, dimensionAverages, excellentCount]);

  // 个别学生最新 feedback
  const studentLatestFeedback = useMemo(() => {
    const map = new Map<string, TeacherFeedback>();
    for (const f of feedback) {
      if (f.targetType === "student" || f.targetType === "group") {
        const existing = map.get(f.targetId);
        if (!existing || new Date(f.createdAt) > new Date(existing.createdAt)) {
          map.set(f.targetId, f);
        }
      }
    }
    return map;
  }, [feedback]);

  function flashMessage(text: string, tone: "ok" | "err") {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 3500);
  }

  // ===== 阶段七：AI 过程性评价报告 =====
  const [processEval, setProcessEval] = useState<ProcessEvaluation | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | undefined>();
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [sendingToStudents, setSendingToStudents] = useState(false);

  async function runProcessEval() {
    setEvalLoading(true);
    setEvalError(undefined);
    try {
      const result = await generateProcessEvaluation({ course });
      setProcessEval(result);
      setEditedSummary(result.summary);
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 过程评价失败";
      setEvalError(message);
      window.alert(message);
    } finally {
      setEvalLoading(false);
    }
  }

  function saveEditedSummary() {
    if (!processEval) return;
    setProcessEval({ ...processEval, summary: editedSummary });
    setEditingSummary(false);
    flashMessage("已保存编辑后的总结", "ok");
  }

  async function sendProcessEvalToStudents() {
    if (!processEval) return;
    setSendingToStudents(true);
    try {
      const summary = processEval.summary;
      for (const s of students) {
        addFeedback({
          courseId: course.id,
          targetType: "student",
          targetId: s.id,
          stageKey: "reflection",
          kind: "praise",
          content: summary,
        });
      }
      addActivity(course.id, "发送 AI 过程评价", `已发送给 ${students.length} 位学生`, "教师");
      flashMessage(`已向 ${students.length} 位学生发送 AI 过程评价`, "ok");
    } catch (e) {
      flashMessage(`发送失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSendingToStudents(false);
    }
  }

  async function setExcellent(s: { id: string; name: string }) {
    setSaving(true);
    try {
      const group = groups.find((g) => g.members.some((m) => m.studentId === s.id));
      const targetId = group?.id ?? s.id;
      addFeedback({
        courseId: course.id,
        targetType: group ? "group" : "student",
        targetId,
        stageKey: "reflection",
        kind: "praise",
        content: comments[s.id] || `${s.name} 在本项目中表现优秀，建议作为课堂示范案例。`,
      });
      upsertRubricScore({
        courseId: course.id,
        groupId: targetId,
        stageKey: "reflection",
        dimensionScores: Object.fromEntries(dimensions.map((d) => [d.id, 95])),
        comment: comments[s.id] || "综合表现优秀。",
        total: 95,
        status: "passed",
      });
      flashMessage(`已将 ${s.name} 标记为优秀（95 分）`, "ok");
    } catch (e) {
      flashMessage(`操作失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSaving(false);
    }
  }

  async function batchSendComments() {
    setSaving(true);
    try {
      students.forEach((s) => {
        addFeedback({
          courseId: course.id,
          targetType: "student",
          targetId: s.id,
          stageKey: "reflection",
          kind: "comment",
          content: comments[s.id] || "已生成并发送课程综合评语，请结合成长建议完成个人反思。",
        });
      });
      addActivity(course.id, "批量发送课程评语", `已发送给 ${students.length} 位学生`, "教师");
      flashMessage(`已向 ${students.length} 位学生发送评语`, "ok");
    } catch (e) {
      flashMessage(`发送失败：${e instanceof Error ? e.message : "未知错误"}`, "err");
    } finally {
      setSaving(false);
    }
  }

  const anyScored = rubricScores.length > 0;

  return (
    <div className="space-y-5">
      {/* 状态提示条 */}
      {message ? (
        <div
          className={`flex items-start gap-2 rounded-[8px] border px-4 py-3 text-sm font-semibold ${
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.tone === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : null}
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">班级平均分</div>
            <TrendingUp className="text-blue-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-700">
            {students.length > 0 ? classAvg : "—"}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">优秀（≥90）</div>
            <Award className="text-emerald-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700">{excellentCount}</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">合格（75-89）</div>
            <Star className="text-amber-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-700">{passCount}</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">待改进（&lt;75）</div>
            <Lightbulb className="text-rose-600" size={20} />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-700">{needImproveCount}</div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
            <Users className="text-blue-700" size={20} /> 班级综合评价汇总
            {!anyScored ? (
              <span className="ml-2 rounded-[6px] bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                暂无评分
              </span>
            ) : null}
          </h2>
          <ul className="space-y-2">
            {dimensions.map((d) => {
              const avg = dimensionAverages[d.id] ?? 0;
              return (
                <li className="flex items-center gap-3" key={d.id}>
                  <span className="w-32 text-sm text-slate-600">{d.name}</span>
                  <div className="flex-1">
                    <ProgressBar
                      className="h-2"
                      tone={avg >= 90 ? "green" : avg >= 75 ? "blue" : "slate"}
                      value={avg}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-bold">{avg}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
            <Lightbulb className="text-amber-600" size={20} /> AI 班级整体点评
          </h2>
          <div className="rounded-[8px] border border-amber-200 bg-amber-50/60 p-4 text-sm leading-7 text-slate-700">
            {aiClassComment}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <ClipboardCheck className="text-amber-600" size={20} /> AI 过程性评价报告
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              基于学生过程数据（活动记录、AI 支架采纳率、上传材料、提交记录）生成全班过程评价；总结可编辑后发送给学生。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {processEval ? (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${processEval.source === "llm" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                {processEval.source === "llm" ? "AI 生成" : "已记录"}
              </span>
            ) : null}
            <PrimaryButton
              className="h-9 px-3 text-sm"
              disabled={evalLoading}
              onClick={() => void runProcessEval()}
              type="button"
            >
              {evalLoading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {evalLoading ? "评价中..." : "生成全班过程评价"}
            </PrimaryButton>
          </div>
        </div>
        {evalError ? (
          <div className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {evalError}
          </div>
        ) : null}
        {processEval ? (
          <div className="space-y-4">
            <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">过程评价总结（可编辑）</span>
                {editingSummary ? (
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                    onClick={saveEditedSummary}
                    type="button"
                  >
                    <Save size={12} /> 保存
                  </button>
                ) : (
                  <button
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                    onClick={() => { setEditingSummary(true); setEditedSummary(processEval.summary); }}
                    type="button"
                  >
                    <Edit3 size={12} /> 编辑
                  </button>
                )}
              </div>
              {editingSummary ? (
                <textarea
                  className="min-h-[100px] w-full rounded-[6px] border border-slate-200 bg-white px-3 py-2 text-sm leading-7 outline-none focus:border-blue-500"
                  onChange={(e) => setEditedSummary(e.target.value)}
                  value={editedSummary}
                />
              ) : (
                <p className="text-sm leading-7 text-slate-700">{processEval.summary}</p>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-bold text-slate-700">维度评分与证据</div>
              <ul className="space-y-2">
                {processEval.dimensions.map((d) => (
                  <li key={d.name} className="rounded-[6px] border border-slate-200 bg-white px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-800">{d.name}</span>
                      <span className="text-sm font-black text-blue-700">{d.score} 分</span>
                    </div>
                    <ProgressBar
                      className="mt-2 h-1.5"
                      tone={d.score >= 85 ? "green" : d.score >= 70 ? "blue" : "red"}
                      value={d.score}
                    />
                    {d.evidence.length > 0 ? (
                      <div className="mt-1 text-xs leading-5 text-slate-500">证据：{d.evidence.join("；")}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[6px] border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-1 text-xs font-bold text-emerald-700">过程亮点</div>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {processEval.highlights.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
              <div className="rounded-[6px] border border-amber-200 bg-amber-50/60 p-3">
                <div className="mb-1 text-xs font-bold text-amber-700">改进建议</div>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {processEval.improvements.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            </div>

            <div className="flex justify-end">
              <PrimaryButton
                className="h-10 px-4"
                disabled={sendingToStudents}
                onClick={() => void sendProcessEvalToStudents()}
                type="button"
              >
                {sendingToStudents ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                发送评价给学生（{students.length} 人）
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
          <MessageSquare className="text-blue-700" size={20} /> 个别学生评语
        </h2>
        {students.length > 0 ? (
          <ul className="max-h-[620px] space-y-2 overflow-auto pr-1">
            {students.map((s) => {
              const score = studentScores.get(s.id) ?? 0;
              const tone = score >= 90 ? "green" : score >= 75 ? "blue" : "orange";
              const group = groups.find((g) => g.members.some((m) => m.studentId === s.id));
              // 取该学生/小组最新 feedback
              const latestFb = studentLatestFeedback.get(group?.id ?? s.id);
              return (
                <li
                  className="rounded-[8px] border border-slate-200 bg-white p-2.5"
                  key={s.id}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={s.name} size={36} />
                    <div className="flex-1">
                      <div
                        className="cursor-pointer font-semibold hover:text-blue-600"
                        onClick={() => onSelectStudent?.(s.id)}
                      >
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        综合分 {score} · {group ? `小组：${group.name}` : "未分组"} · 已加入课堂
                      </div>
                    </div>
                    <Pill tone={tone}>
                      {score >= 90 ? "优秀" : score >= 75 ? "合格" : "待改进"}
                    </Pill>
                    <PrimaryButton
                      className="h-8 px-3 text-xs"
                      disabled={saving}
                      onClick={() => void setExcellent(s)}
                      type="button"
                      variant="outline"
                    >
                      {saving ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}{" "}
                      设为优秀
                    </PrimaryButton>
                  </div>
                  {/* 已有 feedback 提示 */}
                  {latestFb ? (
                    <div className="mt-2 rounded-[6px] border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold">最近评语：</span>
                      {latestFb.content.slice(0, 80)}{latestFb.content.length > 80 ? "..." : ""}
                    </div>
                  ) : null}
                  <textarea
                    className="mt-2 h-11 w-full rounded-[6px] border border-slate-200 p-2 text-sm outline-none focus:border-blue-500"
                    onChange={(e) =>
                      setComments((p) => ({ ...p, [s.id]: e.target.value }))
                    }
                    placeholder={`为 ${s.name} 写一条针对性评语...`}
                    value={comments[s.id] ?? ""}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-[6px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            暂无学生数据
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
          <Send className="text-blue-700" size={20} /> 批量操作
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton
            className="h-10 px-4"
            disabled={saving}
            onClick={() => void batchSendComments()}
            type="button"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}{" "}
            一键发送课程评语给学生
          </PrimaryButton>
          <PrimaryButton
            className="h-10 px-4"
            onClick={() =>
              addActivity(course.id, "保存评价结果", `已保存 ${students.length} 位学生的综合评价`, "教师")
            }
            tone="green"
            type="button"
          >
            <Save size={16} /> 保存评价结果
          </PrimaryButton>
          <PrimaryButton
            className="h-10 px-4"
            onClick={() =>
              addActivity(course.id, "导出班级报告", `已保存 ${rubricScores.length} 条评分记录`, "教师")
            }
            type="button"
            variant="outline"
          >
            导出班级报告（PDF）
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
