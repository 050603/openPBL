"use client";

import { useMemo, useState } from "react";
import { Bot, Clock3, FileCode2, FileText, Users } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import { parseCodeArtifact } from "@/lib/ai-collaboration/code-artifact";
import type { ClassroomSubmission, Course } from "@/lib/session/types";
import { cn } from "@/lib/utils";

function plainDocumentText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
    aiContributions: (course.aiContributions ?? []).filter((item) =>
      item.stageKey === "make" && item.studentId === student.id).length,
    pendingDecisions: (course.aiContributions ?? []).filter((item) =>
      item.stageKey === "make"
      && item.studentId === student.id
      && item.status === "pending-decision").length,
  })), [course]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>();
  const selected = rows.find((row) => row.student.id === selectedStudentId)
    ?? rows.find((row) => row.artifact)
    ?? rows[0];
  const savedCount = rows.filter((row) => row.artifact).length;

  return (
    <div className="space-y-4">
      <Card className="border-[var(--pbl-ai-border)]" compact>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--pbl-ai-soft)] text-[var(--pbl-ai)]"><Users size={21} /></span>
            <div><p className="text-xs font-semibold text-[var(--pbl-ai)]">项目实践</p><h2 className="mt-0.5 text-xl font-bold text-[var(--pbl-text-strong)]">学习进度</h2><p className="mt-1 text-sm text-[var(--pbl-text-muted)]">查看学生的文档、代码与小组协作情况。</p></div>
          </div>
          <div className="flex gap-2"><Pill tone="blue"><Users size={13} />{course.students.length} 名学生</Pill><Pill tone={savedCount === course.students.length && course.students.length ? "green" : "amber"}>{savedCount}/{course.students.length} 已保存</Pill></div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <Card compact>
          <h3 className="font-bold text-[var(--pbl-text-strong)]">学生列表</h3>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <button
                className={cn("w-full rounded-[var(--radius-sm)] border p-3 text-left transition", selected?.student.id === row.student.id ? "border-[var(--pbl-ai-border)] bg-[var(--pbl-ai-soft)]" : "border-[var(--pbl-border)] hover:border-[var(--pbl-ai-border)]")}
                key={row.student.id}
                onClick={() => setSelectedStudentId(row.student.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-2"><span className="truncate font-bold text-stone-900">{row.student.name}</span><Pill tone={row.artifact ? "green" : "gray"}>{row.artifact ? "已保存" : "未保存"}</Pill></div>
                <p className="mt-1 truncate text-xs text-[var(--pbl-text-muted)]">{row.artifact?.title ?? "尚未保存学习成果"}</p>
              </button>
            ))}
            {!rows.length ? <p className="rounded-xl border border-dashed border-stone-300 py-8 text-center text-sm text-stone-500">尚无学生进入课堂。</p> : null}
          </div>
        </Card>

        <Card compact>
          {selected ? (
            <ArtifactPreview
              aiContributions={selected.aiContributions}
              artifact={selected.artifact}
              pendingDecisions={selected.pendingDecisions}
              studentName={selected.student.name}
            />
          ) : <div className="grid min-h-72 place-items-center text-sm text-[var(--pbl-text-muted)]">暂无学生学习成果</div>}
        </Card>
      </div>
    </div>
  );
}

function ArtifactPreview({
  artifact,
  studentName,
  aiContributions,
  pendingDecisions,
}: {
  artifact?: ClassroomSubmission;
  studentName: string;
  aiContributions: number;
  pendingDecisions: number;
}) {
  if (!artifact) {
    return <div className="grid min-h-72 place-items-center text-center"><div><p className="font-bold text-[var(--pbl-text-strong)]">{studentName} 尚未保存学习成果</p><p className="mt-2 text-sm text-[var(--pbl-text-muted)]">保存文档或代码后，内容会显示在这里。</p></div></div>;
  }
  const code = artifact.type === "code" ? parseCodeArtifact(artifact.content) : null;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4">
        <div><p className="text-xs font-semibold text-[var(--pbl-ai)]">{studentName} · {artifact.type === "code" ? "代码" : "文档"}</p><h3 className="mt-1 text-xl font-bold text-[var(--pbl-text-strong)]">{artifact.title}</h3><p className="mt-1 flex items-center gap-1 text-xs text-[var(--pbl-text-muted)]"><Clock3 size={13} />最近保存：{new Date(artifact.updatedAt).toLocaleString("zh-CN")}</p></div>
        <div className="flex gap-2"><Pill tone="blue"><Bot size={13} />AI 建议 {aiContributions}</Pill>{pendingDecisions ? <Pill tone="amber">{pendingDecisions} 项待学生决定</Pill> : null}</div>
      </div>
      {code ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-stone-800"><FileCode2 size={17} className="text-violet-600" />{code.language === "python" ? "Python" : "C"} · {code.files.length} 个文件</div>
          {code.files.map((file) => <section className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950" key={file.id}><header className="border-b border-stone-800 px-4 py-2 font-mono text-xs text-stone-300">{file.path}</header><pre className="max-h-80 overflow-auto p-4 text-xs leading-6 text-stone-100"><code>{file.content}</code></pre></section>)}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-5"><div className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-800"><FileText size={17} className="text-blue-600" />文档内容预览</div><p className="max-h-[30rem] overflow-auto whitespace-pre-wrap text-sm leading-7 text-stone-700">{plainDocumentText(artifact.content) || "文档当前没有可显示的文字。"}</p></div>
      )}
    </div>
  );
}
