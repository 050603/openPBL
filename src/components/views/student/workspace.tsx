"use client";

import { useMemo, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Card, Pill, PrimaryButton } from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { emitStudentArtifactEvent } from "@/lib/companion/events";
import { StudentActionConfirmationDialog, useStudentActionConfirmation } from "./student-confirmation";

const defaultDoc = "";

/** Strip HTML tags and return plain-text length for the word counter. */
function plainTextLength(html: string): number {
  if (typeof window === "undefined") return html.length;
  const div = window.document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").trim().length;
}

export function WorkspaceView({ course }: { course: Course; embedded?: boolean }) {
  const session = useSession();
  const stageKey = course.stages[course.currentStageIndex]?.key ?? "make";
  const isReviewStage = stageKey === "proposal";
  const stageMode = isReviewStage
    ? {
        eyebrow: "阶段三 · 方案构思与校准",
        title: "方案汇报准备区",
        description: "先讲清楚做什么、为什么做、怎么做，再根据 AI 建议和教师反馈自行修改。",
        editorTitle: "结构化方案文档",
        placeholder: "按问题、用户/场景、成果形式、实施步骤、AI 使用方式、风险预案来补全方案...",
        submitLabel: "提交方案并等待纠偏",
      }
    : {
        eyebrow: "阶段四 · 项目实践",
        title: "项目制作工作台",
        description: "围绕已确认方案持续制作、测试和修改核心作品；材料上传与过程记录统一在工作台的“材料与过程”中完成。",
        editorTitle: "项目作品与过程文档",
        placeholder: "记录项目制作过程、资料来源、作品迭代、测试结果和下一步修改计划...",
        submitLabel: "提交阶段成果",
      };
  const group = useMemo(() => course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId)), [course.groups, session.studentId]);
  const existing = course.submissions?.find((item) => item.groupId === group?.id && item.stageKey === stageKey && item.type === "document");
  const [documentText, setDocumentText] = useState(existing?.content ?? defaultDoc);
  const [status, setStatus] = useState<string | null>(null);
  const confirmation = useStudentActionConfirmation({ course, stageKey });
  const feedback = (course.feedback ?? []).filter((item) =>
    item.stageKey === stageKey
    && (item.targetId === group?.id || item.targetId === session.studentId),
  );

  function performSaveDocument(action = "保存项目文档") {
    const submission = session.upsertSubmission({
      courseId: course.id,
      stageKey,
      type: "document",
      title: "项目设计报告",
      content: documentText,
      groupId: group?.id,
    });
    session.addActivity(course.id, action, "项目设计报告已更新", group?.name ?? "个人项目");
    session.updateStudentProgress(stageKey, 75);
    if (session.studentId) emitStudentArtifactEvent({ courseId: course.id, studentId: session.studentId, stageKey, kind: "document-saved", artifactId: submission?.id, summary: "项目设计报告", content: documentText });
    setStatus("已保存");
  }

  function requestSaveDocument() {
    confirmation.request({
      action: existing ? "overwrite" : "save",
      title: existing ? "覆盖当前项目文档" : "保存当前项目文档",
      summary: existing ? "这会覆盖课堂中当前阶段已有的项目设计报告，并形成新的过程记录。" : "这会把当前编辑器中的项目设计报告写入课堂记录，供伴学伙伴和教师继续参考。",
      payload: { submissionId: existing?.id, title: "项目设计报告" },
      onConfirm: () => performSaveDocument(),
    });
  }

  function performSubmitDocument() {
    const submission = session.upsertSubmission({
      courseId: course.id,
      stageKey,
      type: "document",
      title: "项目设计报告",
      content: documentText,
      groupId: group?.id,
    });
    session.addActivity(course.id, "提交项目方案", "学生已提交个人项目设计报告", group?.name ?? "个人项目");
    session.updateStudentProgress(stageKey, 100);
    if (session.studentId) emitStudentArtifactEvent({ courseId: course.id, studentId: session.studentId, stageKey, kind: "document-saved", artifactId: submission?.id, summary: "已提交项目设计报告", content: documentText, milestone: true });
    setStatus("已提交");
  }

  function requestSubmitDocument() {
    confirmation.request({
      action: "submit",
      title: stageMode.submitLabel,
      summary: "提交后会把当前文档标记为本阶段正式成果，并将阶段进度推进到 100%。请确认文档中的内容已经代表你的当前判断。",
      payload: { title: "项目设计报告", stageKey },
      onConfirm: performSubmitDocument,
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        <div className="space-y-4">
          <section className="rounded-[12px] border border-blue-100 bg-blue-50/50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--pbl-student)]">{stageMode.eyebrow}</div>
                <h2 className="mt-1 text-xl font-bold text-stone-900">{stageMode.title}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{stageMode.description}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
                <ShieldCheck size={14} />核心判断由我完成
              </span>
            </div>
          </section>

          <Card className="overflow-hidden p-0">
            <div className="p-6">
              <h1 className="text-[26px] font-bold">{stageMode.editorTitle}</h1>
              <div className="mt-5">
                <RichTextEditor value={documentText} onChange={setDocumentText} placeholder={stageMode.placeholder} />
              </div>
            </div>
            <div className="flex h-10 items-center justify-between border-t border-stone-100 px-5 text-sm text-stone-500">
              <span>字数：{plainTextLength(documentText)}{group?.keywords?.length ? ` · 主题词：${group.keywords.join("、")}` : ""}</span>
              <span className="inline-flex items-center gap-1 text-[var(--pbl-success)]">保存后同步给教师 <Check size={16} /></span>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-xl font-bold">修改建议（{feedback.length}）</h2>
            <div className="space-y-3">
              {feedback.map((item) => (
                <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-3" key={item.id}>
                  <Pill tone={item.kind === "revision" ? "orange" : item.kind === "praise" ? "green" : "blue"}>{item.kind}</Pill>
                  <p className="mt-2 text-sm leading-6 text-stone-700">{item.content}</p>
                  <div className="mt-2 text-xs text-stone-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                </div>
              ))}
              {!feedback.length ? <div className="rounded-[8px] border border-dashed border-stone-300 py-8 text-center text-sm text-stone-500">暂无教师修改建议</div> : null}
            </div>
          </Card>
        </div>

      </div>
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-[10px] border border-stone-200/80 bg-white/95 px-4 py-3 shadow-[0_16px_44px_rgba(15,23,42,0.12)] backdrop-blur">
        {status ? <Pill tone="green">{status}</Pill> : null}
        <PrimaryButton variant="outline" onClick={requestSaveDocument}>保存当前项目文档</PrimaryButton>
        <PrimaryButton tone="green" onClick={requestSubmitDocument}>{stageMode.submitLabel}</PrimaryButton>
      </div>
      <StudentActionConfirmationDialog busy={confirmation.busy} onConfirm={() => void confirmation.confirm()} onReject={confirmation.reject} pending={confirmation.pending} />
    </div>
  );
}
