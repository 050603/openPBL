"use client";

import { useMemo, useState } from "react";
import { Bot, Clock3, Download, FileCode2, FileText, MessageSquareText, ShieldAlert, UserRound } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { RichDocumentPreview } from "@/components/teacher/rich-document-preview";
import { parseCodeArtifact } from "@/lib/ai-collaboration/code-artifact";
import { buildStudentAiInteractionTurns } from "@/lib/ai-collaboration/interaction-transcript";
import type { ClassroomSubmission, Course } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { StageEmptyState, StagePageHeader, StageSplitLayout } from "@/components/classroom/classroom-ui";

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function deriveAiCollaborationMetrics(events: NonNullable<Course["aiInteractionEvents"]>) {
  const turns = buildStudentAiInteractionTurns(events);
  const proactiveSuggestions = turns.filter((turn) =>
    turn.location === "paragraph-comment"
    && turn.messages.some((message) => message.role === "ai"),
  ).length;
  const dialogueRounds = new Set(events.flatMap((event) =>
    event.eventType === "request" && event.actorRole === "student"
      ? [event.requestId || event.id]
      : [],
  )).size;
  const boundaryTriggers = new Set(events.flatMap((event) => {
    const payload = payloadRecord(event.payload);
    const boundaryResponse = event.eventType === "response" && payload.kind === "boundary";
    const protectedPolicy = event.eventType === "policy"
      && typeof payload.protectedCapability === "string"
      && payload.protectedCapability.length > 0;
    return boundaryResponse || protectedPolicy
      ? [event.requestId || `${event.conversationId ?? "conversation"}:${event.id}`]
      : [];
  })).size;
  return { proactiveSuggestions, dialogueRounds, boundaryTriggers, turns };
}

function latestArtifactForStudent(course: Course, studentId: string): ClassroomSubmission | undefined {
  const groupIds = new Set((course.groups ?? [])
    .filter((group) => group.members.some((member) => member.studentId === studentId))
    .map((group) => group.id));
  return [...(course.submissions ?? [])]
    .filter((submission) =>
      submission.stageKey === "make"
      && (submission.type === "document" || submission.type === "code")
      && (submission.studentId === studentId || Boolean(submission.groupId && groupIds.has(submission.groupId))))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
}

export function AiCollaborationTeacherMonitor({ course }: { course: Course }) {
  const rows = useMemo(() => course.students.map((student) => ({
    student,
    artifact: latestArtifactForStudent(course, student.id),
    aiEvents: (course.aiInteractionEvents ?? []).filter((item) =>
      item.stageKey === "make" && item.studentId === student.id),
    documentVersions: (course.projectDocumentVersions ?? []).filter((item) =>
      item.stageKey === "make" && item.studentId === student.id),
  })), [course]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
  const selected = rows.find((row) => row.student.id === selectedStudentId)
    ?? rows.find((row) => row.artifact)
    ?? rows[0];
  const savedCount = rows.filter((row) => row.artifact).length;
  const submittedVersionCount = rows.reduce((total, row) => total + row.documentVersions.filter((version) => version.status === "submitted").length, 0);
  const interactionCount = rows.reduce((total, row) => total + row.aiEvents.length, 0);

  return (
    <div className="classroom-stage space-y-4">
      <StagePageHeader
        action={(
          <a
            className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--pbl-border)] bg-white px-3.5 text-sm font-semibold text-[var(--pbl-text-muted)] transition hover:border-[var(--pbl-teacher-border)] hover:text-[var(--pbl-teacher)]"
            download
            href={`/api/project-practice/export?courseId=${encodeURIComponent(course.id)}`}
          >
            <Download size={14} />导出过程档案
          </a>
        )}
        description="查看学生成果与 AI 协作进度，优先处理尚未形成成果的学生。"
        title="项目实践进度"
      />

      <section aria-label="项目实践班级指标" className="grid gap-3 sm:grid-cols-3">
        <MonitorMetric label="已保存成果" value={`${savedCount}/${rows.length}`} hint="文档或代码" />
        <MonitorMetric label="已提交版本" value={`${submittedVersionCount}`} hint="保留全部有效提交" />
        <MonitorMetric label="AI 协作记录" value={`${interactionCount}`} hint="对话与建议事件" />
      </section>

      <StageSplitLayout
        aside={(
          <Card className="classroom-panel" compact>
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-[var(--pbl-text-strong)]">学生列表</h2><Pill tone="gray">{rows.length} 人</Pill></div>
            <div className="mt-3 max-h-[42rem] space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => (
                <button
                  className={cn("w-full rounded-[var(--radius-sm)] border p-3 text-left transition", selected?.student.id === row.student.id ? "border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/70" : "border-[var(--pbl-border)] bg-white hover:border-[var(--pbl-teacher-border)]")}
                  key={row.student.id}
                  onClick={() => setSelectedStudentId(row.student.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-stone-900">{row.student.name}</span><Pill size="sm" tone={row.artifact ? "green" : "gray"}>{row.artifact ? "已保存" : "未保存"}</Pill></div>
                  <p className="mt-1 truncate text-xs text-[var(--pbl-text-muted)]">{row.artifact?.title ?? "尚未保存学习成果"}</p>
                </button>
              ))}
              {!rows.length ? <StageEmptyState description="学生加入课堂后，成果会显示在这里。" title="暂无学生进入课堂" /> : null}
            </div>
          </Card>
        )}
        main={(
          <Card className="classroom-panel" compact>
            {selected ? (
              <ArtifactPreview
                aiEvents={selected.aiEvents}
                artifact={selected.artifact}
                documentVersions={selected.documentVersions}
                courseId={course.id}
                studentId={selected.student.id}
                studentName={selected.student.name}
              />
            ) : <StageEmptyState description="从右侧学生列表选择一名学生查看成果。" title="暂无可查看的学习成果" />}
          </Card>
        )}
      />
    </div>
  );
}

function MonitorMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="classroom-metric">
      <div className="text-sm text-[var(--pbl-text-muted)]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--pbl-text-strong)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--pbl-text-subtle)]">{hint}</div>
    </div>
  );
}

function ArtifactPreview({
  artifact,
  studentName,
  aiEvents,
  documentVersions,
  courseId,
  studentId,
}: {
  artifact?: ClassroomSubmission;
  studentName: string;
  aiEvents: Course["aiInteractionEvents"];
  documentVersions: Course["projectDocumentVersions"];
  courseId: string;
  studentId: string;
}) {
  const code = artifact?.type === "code" ? parseCodeArtifact(artifact.content) : null;
  const metrics = deriveAiCollaborationMetrics(aiEvents ?? []);
  const interactionTurns = metrics.turns;
  const displayedInteractionTurns = [...interactionTurns].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || right.sequence - left.sequence
  );
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
        <div><p className="text-xs font-semibold text-[var(--pbl-ai)]">{studentName} · {artifact?.type === "code" ? "代码" : "文档"}</p><h3 className="mt-1 text-xl font-bold text-[var(--pbl-text-strong)]">{artifact?.title ?? "尚未保存学习成果"}</h3>{artifact ? <p className="mt-1 flex items-center gap-1 text-xs text-[var(--pbl-text-muted)]"><Clock3 size={13} />最近保存：{new Date(artifact.updatedAt).toLocaleString("zh-CN")}</p> : <p className="mt-1 text-xs text-[var(--pbl-text-muted)]">仍可查看该学生已经发生的 AI 协作过程。</p>}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Pill tone="blue"><Bot size={13} />AI 主动建议 {metrics.proactiveSuggestions}</Pill>
          <Pill tone="gray"><MessageSquareText size={13} />学生对话 {metrics.dialogueRounds} 轮</Pill>
          <Pill tone={metrics.boundaryTriggers ? "red" : "green"}><ShieldAlert size={13} />边界触发 {metrics.boundaryTriggers} 次</Pill>
          {documentVersions?.length ? <Pill tone="green">已提交 {documentVersions.filter((version) => version.status === "submitted").length} 版</Pill> : null}
          <a className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:border-blue-300 hover:text-blue-700" download href={`/api/project-practice/export?courseId=${encodeURIComponent(courseId)}&studentId=${encodeURIComponent(studentId)}`}><Download size={13} />导出该生 JSON</a>
        </div>
      </div>
      {!artifact ? (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">该生尚未保存文档或代码。</div>
      ) : code ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-stone-800"><FileCode2 size={17} className="text-[var(--pbl-teacher)]" />{code.language === "python" ? "Python" : "C"} · {code.files.length} 个文件</div>
          {code.files.map((file) => <section className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950" key={file.id}><header className="border-b border-stone-800 px-4 py-2 font-mono text-xs text-stone-300">{file.path}</header><pre className="max-h-80 overflow-auto p-4 text-xs leading-6 text-stone-100"><code>{file.content}</code></pre></section>)}
        </div>
      ) : artifact ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-5"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-800"><FileText size={17} className="text-blue-600" />富文档实时预览</div><RichDocumentPreview className="max-h-[30rem] overflow-auto rounded-lg bg-white p-4" html={artifact.content} minHeight={160} /></div>
      ) : null}
      {documentVersions?.length ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-emerald-950">Word 提交版本</p><span className="text-[10px] text-emerald-700">保留每次提交</span></div>
          <div className="mt-2 space-y-1.5">
            {[...documentVersions].sort((a, b) => b.sequence - a.sequence).map((version) => (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs" key={version.id}>
                <span className="text-stone-700">第 {version.sequence} 版 · {new Date(version.submittedAt ?? version.createdAt).toLocaleString("zh-CN")}</span>
                {version.docxUploadId ? <a className="font-semibold text-emerald-700 hover:underline" download href={`/api/uploads/${version.docxUploadId}?download=1`}>下载 Word</a> : version.status === "failed" ? <span className="text-rose-700">生成失败</span> : <span className="text-amber-700">生成中</span>}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {interactionTurns.length ? (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-bold text-stone-800"><MessageSquareText size={16} className="text-blue-600" />学生与 AI 协作对话</p><span className="text-[10px] text-stone-500">按上下文对话轮整理</span></div>
          <div className="mt-3 max-h-[42rem] space-y-4 overflow-auto pr-1">
            {displayedInteractionTurns.map((turn) => (
              <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-3" key={`${turn.conversationId}-${turn.sequence}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">{turn.locationLabel}</span><span>第 {turn.turn} 轮对话 · {turn.messages.length} 条消息</span></div>
                  <time>{new Date(turn.occurredAt).toLocaleString("zh-CN")}</time>
                </div>
                {turn.context?.targetText ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-stone-700"><span className="font-semibold text-amber-800">{turn.context.issueType ? `${turn.context.issueType} · ` : ""}批注对象：</span>{turn.context.targetText}</div> : null}
                <div className="mt-3 space-y-2">
                  {turn.messages.map((message) => (
                    <div key={message.id}>
                      <div className={cn(
                        "max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-5",
                        message.role === "student"
                          ? "ml-auto rounded-br-sm bg-stone-900 text-white"
                          : message.error
                            ? "rounded-bl-sm bg-rose-50 text-rose-700"
                            : "rounded-bl-sm border border-stone-200 bg-white text-stone-800",
                      )}>
                        <p className={cn("mb-1 flex items-center gap-1 text-[10px]", message.role === "student" ? "justify-end text-stone-300" : message.error ? "text-rose-600" : "font-semibold text-blue-700")}>
                          {message.role === "student" ? <><UserRound size={11} />学生</> : <><Bot size={11} />{message.error ? "系统" : "AI 组员"}</>}
                          <time className="ml-1 opacity-70">{new Date(message.occurredAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                        </p>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.modification ? <div className="mt-2 rounded-lg border border-[var(--pbl-teacher-border)] bg-[var(--pbl-teacher-soft)]/70 p-3 text-xs text-stone-900"><div className="flex flex-wrap items-center justify-between gap-2"><strong>AI 修改 · {message.modification.title ?? (message.modification.type === "work-delivery" ? "组员交付" : "局部建议")}</strong><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">{message.modification.undoneAt ? "已撤销" : message.modification.decision === "adopted" ? "学生已采用" : message.modification.decision === "revision" ? "已退回修改" : message.modification.decision === "rejected" ? "学生未采用" : "等待决定"}</span></div>{message.modification.targetText ? <div className="mt-2 rounded-md bg-rose-50 px-2.5 py-2"><span className="font-semibold text-rose-700">原内容：</span><span className="whitespace-pre-wrap text-stone-700">{message.modification.targetText}</span></div> : null}{message.modification.replacement ? <div className="mt-1.5 rounded-md bg-emerald-50 px-2.5 py-2"><span className="font-semibold text-emerald-700">AI 建议：</span><span className="whitespace-pre-wrap text-stone-700">{message.modification.replacement}</span></div> : null}{message.modification.decisionSummary ? <p className="mt-2 text-[11px] text-[var(--pbl-teacher)]">{message.modification.decisionSummary}</p> : null}</div> : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : <div className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">尚无学生与 AI 的协作对话。</div>}
    </div>
  );
}
