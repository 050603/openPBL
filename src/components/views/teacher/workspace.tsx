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
  onSelectGroup?: (id: string) => void;
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
      <Card className="grid place-items-center py-20 text-sm text-slate-500">
        暂无个人项目数据，请等待学生加入课堂并建立项目空间。
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-sm text-slate-500">个人项目总数</div>
          <div className="mt-2 text-2xl font-bold">{groups.length}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">已上传作品</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {(course.uploads ?? []).filter((u) => u.stageKey === "showcase" || u.stageKey === stageKey).length}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-500">平均进度</div>
          <div className="mt-2 text-2xl font-bold text-blue-700">
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
          <div className="text-sm text-slate-500">需介入</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">
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
                <ClipboardCheck className="text-amber-600" size={18} /> AI 方案诊断
              </h3>
              <p className="mt-1 text-xs text-slate-500">
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
            <div className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {diagnosisError}
            </div>
          ) : null}
          {proposalDiagnosis.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {proposalDiagnosis.map((d) => (
                <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4" key={d.groupId}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-bold">{d.groupName}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.source === "llm" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {d.source === "llm" ? "LLM" : "本地"}
                    </span>
                  </div>
                  <div className="mb-1 text-xs text-slate-500">选题：{d.topic || "未填写"}</div>
                  <p className="text-sm leading-6 text-slate-700">{d.diagnosis}</p>
                  {d.risks.length > 0 ? (
                    <div className="mt-2 text-xs leading-5 text-rose-700">风险：{d.risks.join("、")}</div>
                  ) : null}
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-semibold text-slate-700">可推送的追问问题（可编辑）：</div>
                    <textarea
                      className="min-h-[60px] w-full rounded-[6px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                <Lightbulb className="text-blue-600" size={18} /> AI 制作观察
              </h3>
              <p className="mt-1 text-xs text-slate-500">
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
            <Users className="text-blue-700" size={20} /> 各组制作进度
          </h2>
          <ul className="max-h-[32rem] space-y-1.5 overflow-auto pr-1">
            {groups.map((g) => {
              const m = g.members;
              const prog = m.length
                ? Math.round(m.reduce((s, mem) => s + (course.students.find((st) => st.id === mem.studentId)?.stageProgress?.[stageKey] ?? 0), 0) / m.length)
                : 0;
              const tone = prog >= 70 ? "green" : prog >= 30 ? "blue" : "red";
              return (
                <li
                  className={`cursor-pointer rounded-[6px] border px-3 py-2 transition ${
                    g.id === activeId ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white hover:border-blue-300"
                  }`}
                  key={g.id}
                  onClick={() => setActiveId(g.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                    <Pill tone={tone}>{prog}%</Pill>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">{g.topic || "待确定选题"}</div>
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
                  <div className="mt-1 text-sm text-slate-500">
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
                    tone="orange"
                    onClick={() => sendFeedback("comment", `请${active.name}补充数据来源、实施步骤和预期效果。`)}
                    type="button"
                  >
                    <MessageSquare size={15} /> 留言反馈
                  </PrimaryButton>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <AvatarStack names={active.members.map((m) => m.name)} />
                <div className="text-sm text-slate-500">{active.members.map((m) => m.name).join("、")}</div>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold">
                  <Lightbulb className="text-amber-600" size={18} /> AI 过程观察
                </h3>
                <Pill tone={activeSignal ? (activeSignal.riskLevel === "high" ? "red" : "orange") : "green"}>
                  {activeSignal ? "需确认" : "稳定推进"}
                </Pill>
              </div>
              {activeSignal ? (
                <div className="rounded-[8px] border border-amber-200 bg-amber-50/50 p-4">
                  <div className="font-bold text-amber-800">{activeSignal.reasons.join("、")}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{activeSignal.supportCard}</p>
                  <div className="mt-2 text-xs leading-5 text-slate-500">依据：{activeSignal.evidence.join("；")}</div>
                  <PrimaryButton className="mt-3 h-9 px-3 text-sm" onClick={confirmAiSupport} type="button">
                    <Send size={15} /> 教师确认并推送
                  </PrimaryButton>
                </div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-slate-300 py-7 text-center text-sm text-slate-500">
                  点击上方刷新获取 AI 观察。
                </div>
              )}
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-bold">
                  <FileText className="text-blue-700" size={18} /> 方案文档
                </h3>
                {groupSubmission ? (
                  <div className="rounded-[6px] border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="line-clamp-4 text-slate-700" data-testid="group-doc-preview">
                      {stripHtml(groupSubmission.content).slice(0, 200) || "（空文档）"}
                    </p>
                    <div className="mt-2 text-xs text-slate-500">
                      更新时间：{new Date(groupSubmission.updatedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
                    该学生尚未提交个人方案文档
                  </div>
                )}
                <div className="mt-3">
                  <div className="mb-1 text-xs text-slate-500">本阶段进度</div>
                  <ProgressBar value={groupProgressValue} tone={groupProgressValue >= 70 ? "green" : groupProgressValue >= 30 ? "blue" : "red"} />
                </div>
              </Card>

              <Card>
                <h3 className="mb-3 flex items-center gap-2 font-bold">
                  <Eye className="text-blue-700" size={18} /> 上传材料（{groupUploads.length}）
                </h3>
                {groupUploads.length > 0 ? (
                  <ul className="space-y-2" data-testid="group-uploads-list">
                    {groupUploads.map((u) => (
                      <li className="flex items-center gap-3 rounded-[6px] border border-slate-200 px-3 py-2" key={u.id}>
                        <FileBadge type={u.fileType} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{u.fileName}</div>
                          <div className="text-xs text-slate-500">{u.title} · {u.size} · {u.studentName ?? "未知"}</div>
                        </div>
                        <button
                          className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-blue-300 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          onClick={() => setPreviewUpload(u)}
                          type="button"
                          data-testid={`view-upload-${u.id}`}
                        >
                          <Eye size={13} /> 查看
                        </button>
                        <a
                          className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-slate-300 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
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
                  <div className="rounded-[6px] border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
                    该个人项目暂无上传材料
                  </div>
                )}
              </Card>
            </div>

            {groupProgressValue < 30 ? (
              <Card>
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-1 text-rose-600" size={20} />
                  <div>
                    <h3 className="font-bold text-rose-700">此个人项目进展停滞</h3>
                    <p className="mt-1 text-sm text-slate-600">
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
          <div className="grid place-items-center rounded-[10px] border border-dashed border-slate-300 py-20 text-sm text-slate-500">
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

function UploadPreviewOverlay({ upload, onClose }: { upload: CourseUpload; onClose: () => void }) {
  const isImage = upload.fileType === "PNG" || upload.fileType === "JPG" || upload.fileType === "JPEG" || upload.fileType === "GIF";
  const isPdf = upload.fileType === "PDF";
  const isVideo = upload.fileType === "MP4";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900/60" role="dialog" aria-modal="true" data-testid="upload-preview-overlay">
      <div className="flex items-center justify-between bg-white px-5 py-3 shadow">
        <div className="flex min-w-0 items-center gap-3">
          <FileBadge type={upload.fileType} />
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold">{upload.fileName}</h3>
            <p className="text-xs text-slate-500">
              {upload.title} · {upload.size} · 上传者：{upload.studentName ?? "未知"} · {new Date(upload.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            href={upload.url}
            target="_blank"
            rel="noreferrer"
          >
            <Download size={16} /> 下载
          </a>
          <button
            className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X size={16} /> 关闭
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-6">
        <div className="mx-auto max-w-4xl">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={upload.fileName} className="mx-auto max-h-[70vh] rounded-[8px] shadow-lg" src={upload.url} />
          ) : isPdf ? (
            <iframe className="h-[70vh] w-full rounded-[8px] bg-white shadow-lg" src={upload.url} title={upload.fileName} />
          ) : isVideo ? (
            <video className="mx-auto max-h-[70vh] rounded-[8px] shadow-lg" controls src={upload.url} />
          ) : (
            <div className="grid place-items-center rounded-[8px] bg-white py-20 shadow-lg">
              <FileText className="text-slate-400" size={48} />
              <p className="mt-4 text-sm text-slate-500">此文件类型暂不支持在线预览</p>
              <a
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-[6px] bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
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
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900/60" role="dialog" aria-modal="true" data-testid="doc-preview-overlay">
      <div className="flex items-center justify-between bg-white px-5 py-3 shadow">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{groupName} · 方案文档</h3>
          <p className="text-xs text-slate-500">更新时间：{new Date(updatedAt).toLocaleString("zh-CN")}</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          onClick={onClose}
          type="button"
        >
          <X size={16} /> 关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-6">
        <div
          className="prose prose-slate mx-auto max-w-3xl rounded-[8px] bg-white p-8 shadow-lg"
          // The content is HTML generated by the TipTap editor on the student side.
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
}
