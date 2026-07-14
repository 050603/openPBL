import { useMemo, useState } from "react";
import {
  AlertCircle,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { AvatarStack } from "@/components/dashboard-shell";
import { Card, FileBadge, Pill, PrimaryButton, ProgressBar, toast } from "@/components/ui";
import type { Course, CourseUpload } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildTeacherInterventionSignals, diagnoseAllProposals, type TeacherInterventionSignal, type ProposalDiagnosisResult } from "@/lib/teaching-ai/client-api";

type ProposalDiagnosis = ProposalDiagnosisResult;

export function WorkspaceTeacherView({
  course,
}: {
  course: Course;
}) {
  const { addFeedback, addActivity, upsertAiSupport, setUiState } = useSession();
  const groups = course.groups ?? [];
  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  const [previewUpload, setPreviewUpload] = useState<CourseUpload | null>(null);
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);

  const stageKey = course.stages[course.currentStageIndex]?.key ?? "make";
  const isReviewStage = stageKey === "proposal";
  // AI 干预信号只在教师点击刷新时请求；失败时直接提示，不写入本地兜底结果。
  const [interventionSignals, setInterventionSignals] = useState<TeacherInterventionSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  async function refreshSignals() {
    if (signalsLoading) return;
    setSignalsLoading(true);
    try {
      const signals = await buildTeacherInterventionSignals(course, stageKey);
      setInterventionSignals(signals);
      // 清除 pending 标志并记录刷新时间
      setUiState(course.id, {
        aiAnalysisPending: false,
        aiAnalysisRefreshedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 制作观察刷新失败";
      toast.error("AI 制作观察刷新失败", { description: message });
    } finally {
      setSignalsLoading(false);
    }
  }

  const activeSignal = interventionSignals.find((signal) => signal.groupId === active?.id);

  // ===== 阶段四：AI 批量方案诊断 =====
  const [proposalDiagnosis, setProposalDiagnosis] = useState<ProposalDiagnosis[]>([]);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | undefined>();
  const [editedQuestions, setEditedQuestions] = useState<Record<string, string>>({});

  async function runProposalDiagnosis() {
    setDiagnosisLoading(true);
    setDiagnosisError(undefined);
    try {
      const result = await diagnoseAllProposals({ course });
      setProposalDiagnosis(result);
      const initEdited: Record<string, string> = {};
      for (const d of result) {
        initEdited[d.groupId] = d.suggestedQuestions[0] ?? "";
      }
      setEditedQuestions(initEdited);
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI 方案诊断失败";
      setDiagnosisError(message);
      toast.error("AI 方案诊断失败", { description: message });
    } finally {
      setDiagnosisLoading(false);
    }
  }

  function pushQuestion(groupId: string, groupName: string) {
    const question = editedQuestions[groupId]?.trim();
    if (!question) return;
    addFeedback({
      courseId: course.id,
      targetType: "student",
      targetId: groups.find((project) => project.id === groupId)?.members[0]?.studentId ?? groupId,
      stageKey,
      kind: "ai-support",
      content: question,
    });
    addActivity(course.id, "推送 AI 追问", `${groupName}：${question}`, "教师");
  }

  const groupUploads = useMemo(
    () => (course.uploads ?? []).filter((u) => u.groupId === active?.id),
    [course.uploads, active?.id],
  );
  const groupSubmission = useMemo(
    () =>
      (course.submissions ?? []).find(
        (s) => s.groupId === active?.id && s.type === "document",
      ),
    [course.submissions, active?.id],
  );
  const groupProgressValue = useMemo(() => {
    if (!active) return 0;
    const members = active.members;
    if (!members.length) return 0;
    const total = members.reduce(
      (sum, m) => sum + (course.students.find((s) => s.id === m.studentId)?.stageProgress?.[stageKey] ?? 0),
      0,
    );
    return Math.round(total / members.length);
  }, [active, course.students, stageKey]);

  function sendFeedback(kind: "comment" | "ai-support", content: string) {
    if (!active) return;
    addFeedback({
      courseId: course.id,
      targetType: "student",
      targetId: active.members[0]?.studentId ?? active.id,
      stageKey,
      kind,
      content,
    });
    addActivity(course.id, kind === "ai-support" ? "推送 AI 支架" : "发送留言反馈", content, "教师");
  }

  function confirmAiSupport() {
    if (!active || !activeSignal) return;
    upsertAiSupport({
      courseId: course.id,
      stageKey,
      targetType: "student",
      targetId: active.members[0]?.studentId ?? active.id,
      groupId: active.id,
      kind: "teacher-intervention",
      trigger: "教师确认制作支架",
      inputSummary: `阶段：${stageKey}；个人项目：${active.name}；风险：${activeSignal.reasons.join("、")}`,
      diagnosis: `需关注：${activeSignal.reasons.join("、")}`,
      suggestions: [activeSignal.supportCard],
      evidence: activeSignal.evidence,
      status: "teacher-confirmed",
    });
    sendFeedback("ai-support", activeSignal.supportCard);
  }

  if (!groups.length) {
    return (
      <Card className="grid place-items-center py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]">
            <Users size={26} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--pbl-text)]">暂无个人项目数据</p>
            <p className="mt-1 text-xs text-[var(--pbl-text-muted)]">请等待学生加入课堂并建立项目空间</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-sm text-[var(--pbl-text-muted)]">个人项目总数</div>
          <div className="mt-2 text-2xl font-bold">{groups.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--pbl-text-muted)]">已上传作品</div>
          <div className="mt-2 text-2xl font-bold text-[var(--pbl-success)]">
            {(course.uploads ?? []).filter((u) => u.stageKey === "showcase" || u.stageKey === stageKey).length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--pbl-text-muted)]">平均进度</div>
          <div className="mt-2 text-2xl font-bold text-[var(--pbl-teacher)]">
            {groups.length
              ? Math.round(
                  groups.reduce((sum, g) => {
                    const m = g.members;
                    if (!m.length) return sum;
                    return sum + m.reduce((s, mem) => s + (course.students.find((st) => st.id === mem.studentId)?.stageProgress?.[stageKey] ?? 0), 0) / m.length;
                  }, 0) / groups.length,
                )
              : 0}
            %
          </div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--pbl-text-muted)]">需介入</div>
          <div className="mt-2 text-2xl font-bold text-[var(--pbl-danger)]">
            {groups.filter((g) => {
              const m = g.members;
              if (!m.length) return false;
              const avg = m.reduce((s, mem) => s + (course.students.find((st) => st.id === mem.studentId)?.stageProgress?.[stageKey] ?? 0), 0) / m.length;
              return avg < 30;
            }).length}
          </div>
        </Card>
      </div>

      {isReviewStage ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold">
                <ClipboardCheck className="text-[var(--pbl-warning)]" size={18} /> AI 方案诊断
              </h3>
              <p className="mt-1 text-xs text-[var(--pbl-text-muted)]">
                批量分析所有学生的个人方案，生成诊断摘要、风险点和可推送的追问问题（追问内容可编辑）。
              </p>
            </div>
            <PrimaryButton
              onClick={() => void runProposalDiagnosis()}
              disabled={diagnosisLoading || !groups.length}
              type="button"
              className="h-9 px-3 text-sm"
            >
              {diagnosisLoading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {diagnosisLoading ? "诊断中..." : "批量诊断所有个人方案"}
            </PrimaryButton>
          </div>
          {diagnosisError ? (
            <div className="rounded-[var(--radius-xs)] border border-[var(--pbl-danger-border)] bg-[var(--pbl-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--pbl-danger)]">
              {diagnosisError}
            </div>
          ) : null}
          {proposalDiagnosis.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {proposalDiagnosis.map((d) => (
                <div className="rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-4" key={d.groupId}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-bold">{d.groupName}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.source === "llm" ? "bg-[var(--pbl-success-soft)] text-[var(--pbl-success)]" : "bg-[var(--pbl-surface-soft)] text-[var(--pbl-text-muted)]"}`}>
                      {d.source === "llm" ? "LLM" : "本地"}
                    </span>
                  </div>
                  <div className="mb-1 text-xs text-[var(--pbl-text-muted)]">选题：{d.topic || "未填写"}</div>
                  <p className="text-sm leading-6 text-[var(--pbl-text)]">{d.diagnosis}</p>
                  {d.risks.length > 0 ? (
                    <div className="mt-2 text-xs leading-5 text-[var(--pbl-danger)]">风险：{d.risks.join("、")}</div>
                  ) : null}
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-semibold text-[var(--pbl-text)]">可推送的追问问题（可编辑）：</div>
                    <textarea
                      className="min-h-[60px] w-full rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--pbl-teacher)]"
                      value={editedQuestions[d.groupId] ?? ""}
                      onChange={(e) =>
                        setEditedQuestions((prev) => ({ ...prev, [d.groupId]: e.target.value }))
                      }
                      placeholder="编辑后推送给学生..."
                    />
                    <PrimaryButton
                      className="mt-2 h-8 px-3 text-xs"
                      onClick={() => pushQuestion(d.groupId, d.groupName)}
                      disabled={!(editedQuestions[d.groupId] ?? "").trim()}
                      type="button"
                      variant="outline"
                    >
                      <Send size={13} /> 推送追问给该组
                    </PrimaryButton>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold">
                <Lightbulb className="text-[var(--pbl-teacher)]" size={18} /> AI 制作观察
              </h3>
              <p className="mt-1 text-xs text-[var(--pbl-text-muted)]">
                刷新后按学生进度、材料上传、AI 支架采纳记录生成干预线索，重点识别停滞、缺证据和偏题。
              </p>
            </div>
            <PrimaryButton
              onClick={() => void refreshSignals()}
              disabled={signalsLoading}
              type="button"
              className="h-9 px-3 text-sm"
              variant="outline"
            >
              {signalsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {signalsLoading ? "刷新中..." : "刷新制作风险"}
            </PrimaryButton>
          </div>
        </Card>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Users className="text-[var(--pbl-teacher)]" size={20} /> 各组制作进度
          </h2>
          <ul className="max-h-[32rem] space-y-1.5 overflow-auto pr-1">
            {groups.map((g) => {
              const m = g.members;
              const prog = m.length
                ? Math.round(m.reduce((s, mem) => s + (course.students.find((st) => st.id === mem.studentId)?.stageProgress?.[stageKey] ?? 0), 0) / m.length)
                : 0;
              const tone = prog >= 70 ? "green" : prog >= 30 ? "blue" : "red";
              const groupSignal = interventionSignals.find((signal) => signal.groupId === g.id);
              return (
                <li
                  className={`cursor-pointer rounded-[var(--radius-xs)] border px-3 py-2 transition ${
                    g.id === activeId ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)]/60" : "border-[var(--pbl-border)] bg-[var(--pbl-surface)] hover:border-[var(--pbl-teacher-border)]"
                  }`}
                  key={g.id}
                  onClick={() => setActiveId(g.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      {groupSignal ? <AlertCircle aria-label="有干预信号" className="shrink-0 fill-white text-[var(--pbl-danger)]" size={15} /> : null}
                      {g.name}
                    </span>
                    <Pill tone={tone}>{prog}%</Pill>
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--pbl-text-muted)]">{g.topic || "待确定选题"}</div>
                  <ProgressBar className="mt-2 h-1.5" tone={tone} value={prog} />
                </li>
              );
            })}
          </ul>
        </Card>

        {active ? (
          <div className="space-y-3">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    {active.name}
                    <Pill tone="blue">{active.topic || "待确定"}</Pill>
                  </h2>
                  <div className="mt-1 text-sm text-[var(--pbl-text-muted)]">
                    {active.members.length} 人
                  </div>
                </div>
                <div className="flex gap-2">
                  <PrimaryButton
                    className="h-9 px-3 text-sm"
                    onClick={() => setDocPreviewOpen(true)}
                    disabled={!groupSubmission}
                    type="button"
                    data-testid="view-group-doc"
                  >
                    <Eye size={15} /> 查看方案文档
                  </PrimaryButton>
                  <PrimaryButton
                    className="h-9 px-3 text-sm"
                    variant="outline"
                    tone="blue"
                    onClick={() => sendFeedback("comment", `请${active.name}补充数据来源、实施步骤和预期效果。`)}
                    type="button"
                  >
                    <MessageSquare size={15} /> 留言反馈
                  </PrimaryButton>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <AvatarStack names={active.members.map((m) => m.name)} />
                <div className="text-sm text-[var(--pbl-text-muted)]">{active.members.map((m) => m.name).join("、")}</div>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold">
                  <Lightbulb className="text-[var(--pbl-warning)]" size={18} /> AI 过程观察
                </h3>
                <Pill tone={activeSignal ? (activeSignal.riskLevel === "high" ? "red" : "orange") : "green"}>
                  {activeSignal ? "需确认" : "稳定推进"}
                </Pill>
              </div>
              {activeSignal ? (
                <div className="rounded-[var(--radius-sm)] border border-[var(--pbl-warning-soft)] bg-[var(--pbl-warning-soft)]/50 p-4">
                  <div className="font-bold text-[var(--pbl-warning)]">{activeSignal.reasons.join("、")}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--pbl-text)]">{activeSignal.supportCard}</p>
                  <div className="mt-2 text-xs leading-5 text-[var(--pbl-text-muted)]">依据：{activeSignal.evidence.join("；")}</div>
                  <PrimaryButton className="mt-3 h-9 px-3 text-sm" onClick={confirmAiSupport} type="button">
                    <Send size={15} /> 教师确认并推送
                  </PrimaryButton>
                </div>
              ) : (
                <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--pbl-border-strong)] py-7 text-center text-sm text-[var(--pbl-text-muted)]">
                  点击上方刷新获取 AI 观察。
                </div>
              )}
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-bold">
                  <FileText className="text-[var(--pbl-teacher)]" size={18} /> 方案文档
                </h3>
                {groupSubmission ? (
                  <div className="rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface-soft)] p-3 text-sm">
                    <p className="line-clamp-4 text-[var(--pbl-text)]" data-testid="group-doc-preview">
                      {stripHtml(groupSubmission.content).slice(0, 200) || "（空文档）"}
                    </p>
                    <div className="mt-2 text-xs text-[var(--pbl-text-muted)]">
                      更新时间：{new Date(groupSubmission.updatedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-xs)] border border-dashed border-[var(--pbl-border-strong)] py-8 text-center text-sm text-[var(--pbl-text-muted)]">
                    该学生尚未提交个人方案文档
                  </div>
                )}
                <div className="mt-3">
                  <div className="mb-1 text-xs text-[var(--pbl-text-muted)]">本阶段进度</div>
                  <ProgressBar value={groupProgressValue} tone={groupProgressValue >= 70 ? "green" : groupProgressValue >= 30 ? "blue" : "red"} />
                </div>
              </Card>

              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-bold">
                  <Eye className="text-[var(--pbl-teacher)]" size={18} /> 上传材料（{groupUploads.length}）
                </h3>
                {groupUploads.length > 0 ? (
                  <ul className="space-y-2" data-testid="group-uploads-list">
                    {groupUploads.map((u) => (
                      <li className="flex items-center gap-3 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] px-3 py-2" key={u.id}>
                        <FileBadge type={u.fileType} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{u.fileName}</div>
                          <div className="text-xs text-[var(--pbl-text-muted)]">{u.title} · {u.size} · {u.studentName ?? "未知"}</div>
                        </div>
                        <button
                          className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-teacher-border)] px-2 text-xs font-semibold text-[var(--pbl-teacher)] hover:bg-[var(--pbl-teacher-soft)]"
                          onClick={() => setPreviewUpload(u)}
                          type="button"
                          data-testid={`view-upload-${u.id}`}
                        >
                          <Eye size={13} /> 查看
                        </button>
                        <a
                          className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border-strong)] px-2 text-xs font-semibold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]"
                          href={u.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} /> 下载
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-[var(--radius-xs)] border border-dashed border-[var(--pbl-border-strong)] py-8 text-center text-sm text-[var(--pbl-text-muted)]">
                    该个人项目暂无上传材料
                  </div>
                )}
              </Card>
            </div>

            {groupProgressValue < 30 ? (
              <Card>
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-1 text-[var(--pbl-danger)]" size={20} />
                  <div>
                    <h3 className="font-bold text-[var(--pbl-danger)]">此个人项目进展停滞</h3>
                    <p className="mt-1 text-sm text-[var(--pbl-text-muted)]">
                      当前进度仅 {groupProgressValue}%，建议发起一对一沟通或推送 AI 支架内容。
                    </p>
                    <div className="mt-3 flex gap-2">
                      <PrimaryButton
                        className="h-9 px-3 text-sm"
                        onClick={() => activeSignal ? confirmAiSupport() : sendFeedback("ai-support", "请先列出可获取的数据，再用三步法完善实施路径。")}
                        type="button"
                      >
                        <Send size={15} /> 推送 AI 支架
                      </PrimaryButton>
                      <PrimaryButton
                        className="h-9 px-3 text-sm"
                        onClick={() => sendFeedback("comment", "教师已发起一对一沟通，请学生在 5 分钟内回应当前卡点。")}
                        type="button"
                        variant="outline"
                      >
                        发起一对一
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        ) : (
          <div className="grid place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--pbl-border-strong)] py-20 text-sm text-[var(--pbl-text-muted)]">
            暂无个人项目数据
          </div>
        )}
      </div>

      {previewUpload ? (
        <UploadPreviewOverlay upload={previewUpload} onClose={() => setPreviewUpload(null)} />
      ) : null}

      {docPreviewOpen && active && groupSubmission ? (
        <DocumentPreviewOverlay
          groupName={active.name}
          content={groupSubmission.content}
          updatedAt={groupSubmission.updatedAt}
          onClose={() => setDocPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Strip HTML tags for plain-text preview. */
function stripHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, "");
  const div = window.document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

// Tag/attribute denylist for sanitizing student-submitted HTML before rendering
// via dangerouslySetInnerHTML. The content originates from a constrained
// TipTap editor, but we strip dangerous elements/attributes defensively in
// case a student bypasses the editor and submits raw HTML through the API.
const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "style",
  "svg",
]);

function sanitizeStudentHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag)) {
      el.remove();
      return;
    }
    // Drop event handlers and javascript: URLs
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if ((name === "href" || name === "src") && (value.startsWith("javascript:") || value.startsWith("data:text/html"))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

function UploadPreviewOverlay({ upload, onClose }: { upload: CourseUpload; onClose: () => void }) {
  const fileType = upload.fileType?.toUpperCase();
  const isImage = fileType === "PNG" || fileType === "JPG" || fileType === "JPEG" || fileType === "GIF";
  const isPdf = fileType === "PDF";
  const isVideo = fileType === "MP4";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--pbl-ink)]/60" role="dialog" aria-modal="true" data-testid="upload-preview-overlay">
      <div className="flex items-center justify-between bg-[var(--pbl-surface)] px-5 py-3 shadow">
        <div className="flex min-w-0 items-center gap-3">
          <FileBadge type={upload.fileType} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold">{upload.fileName}</h3>
            <p className="text-xs text-[var(--pbl-text-muted)]">
              {upload.title} · {upload.size} · 上传者：{upload.studentName ?? "未知"} · {new Date(upload.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-4 text-sm font-semibold text-white hover:bg-[var(--pbl-teacher-hover)]"
            href={upload.url}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} /> 下载
          </a>
          <button
            className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] px-4 text-sm font-semibold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]"
            onClick={onClose}
            type="button"
          >
            <X size={16} /> 关闭
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--pbl-surface-soft)] p-6">
        <div className="mx-auto max-w-4xl">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={upload.fileName} className="mx-auto max-h-[70vh] rounded-[var(--radius-sm)] shadow-lg" src={upload.url} />
          ) : isPdf ? (
            <iframe className="h-[70vh] w-full rounded-[var(--radius-sm)] bg-[var(--pbl-surface)] shadow-lg" src={upload.url} title={upload.fileName} />
          ) : isVideo ? (
            <video className="mx-auto max-h-[70vh] rounded-[var(--radius-sm)] shadow-lg" controls src={upload.url} />
          ) : (
            <div className="grid place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-surface)] py-20 shadow-lg">
              <FileText className="text-[var(--pbl-text-subtle)]" size={48} />
              <p className="mt-4 text-sm text-[var(--pbl-text-muted)]">此文件类型暂不支持在线预览</p>
              <a
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-[var(--radius-xs)] bg-[var(--pbl-teacher)] px-5 text-sm font-semibold text-white hover:bg-[var(--pbl-teacher-hover)]"
                href={upload.url}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} /> 下载查看
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentPreviewOverlay({
  groupName,
  content,
  updatedAt,
  onClose,
}: {
  groupName: string;
  content: string;
  updatedAt: string;
  onClose: () => void;
}) {
  // Sanitize student HTML before rendering to prevent XSS
  const safeHtml = useMemo(() => sanitizeStudentHtml(content), [content]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--pbl-ink)]/60" role="dialog" aria-modal="true" data-testid="doc-preview-overlay">
      <div className="flex items-center justify-between bg-[var(--pbl-surface)] px-5 py-3 shadow">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{groupName} · 方案文档</h3>
          <p className="text-xs text-[var(--pbl-text-muted)]">更新时间：{new Date(updatedAt).toLocaleString("zh-CN")}</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-xs)] border border-[var(--pbl-border)] bg-[var(--pbl-surface)] px-4 text-sm font-semibold text-[var(--pbl-text-muted)] hover:bg-[var(--pbl-surface-soft)]"
          onClick={onClose}
          type="button"
        >
          <X size={16} /> 关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--pbl-surface-soft)] p-6">
        <div
          className="prose prose-stone mx-auto max-w-3xl rounded-[var(--radius-sm)] bg-[var(--pbl-surface)] p-8 shadow-lg"
          // Content is sanitized student HTML from the TipTap editor.
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      </div>
    </div>
  );
}
