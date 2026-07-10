"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Compass, Eye, PauseCircle, PlayCircle, RotateCcw, UploadCloud, X } from "lucide-react";
import { Avatar } from "@/components/dashboard-shell";
import { Card, FileBadge, PrimaryButton } from "@/components/ui";
import { EvidenceStrip, SlidePreview } from "@/components/visuals";
import type { Course, CourseUpload } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { buildShowcaseCoach } from "@/lib/teaching-ai/client-api";
import { StudentAiChatPanel } from "./ai-chat-panel";

type UploadSlot = {
  category: "artifact" | "evidence" | "presentation";
  type: string;
  title: string;
  rule: string;
};

const uploadSlots: UploadSlot[] = [
  { category: "artifact", type: "PDF", title: "研究报告（PDF）", rule: "要求：PDF，≤ 50MB" },
  { category: "presentation", type: "PPTX", title: "汇报PPT", rule: "要求：PPTX，≤ 100MB" },
  { category: "presentation", type: "MP4", title: "演示视频（可选）", rule: "要求：MP4，≤ 200MB" },
  { category: "artifact", type: "XLSX", title: "数据表（可选）", rule: "要求：XLSX，≤ 50MB" },
];

export function ShowcaseView({ course }: { course: Course }) {
  const session = useSession();
  const group = useMemo(() => course.groups?.find((item) => item.members.some((member) => member.studentId === session.studentId)) ?? course.groups?.[0], [course.groups, session.studentId]);
  const uploads = (course.uploads ?? []).filter((item) => item.groupId === group?.id);
  const previewUpload = uploads.find((item) => item.id === course.uiState?.previewUploadId);
  const latestShowcaseSupport = (course.aiSupports ?? [])
    .filter((item) => item.groupId === group?.id && item.kind === "showcase-coach")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  // 当前学生的整体阶段进度（用于状态展示）
  const myStageProgress = session.studentId
    ? (course.students.find((s) => s.id === session.studentId)?.stageProgress ?? {})
    : {};
  const stageKeys = course.stages.map((s) => s.key);
  const myOverallProgress = stageKeys.length > 0
    ? Math.round(stageKeys.reduce((acc, k) => acc + (myStageProgress[k] ?? 0), 0) / stageKeys.length)
    : 0;
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [timerRunning]);
  const [contribDraft, setContribDraft] = useState<Record<string, number>>(() => Object.fromEntries((group?.members ?? []).map((m) => [m.studentId, Math.round(100 / Math.max(1, group?.members.length ?? 1))])));
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFile(slot: UploadSlot, file: File, input?: HTMLInputElement) {
    if (!group) return;
    setUploading(slot.title);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", slot.title);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) throw new Error(`上传失败 (${res.status})`);
      const data = await res.json();
      if (!data?.id || !data?.url) throw new Error("上传响应异常");
      const upload: CourseUpload = session.upsertUpload({
        id: data.id,
        courseId: course.id,
        groupId: group.id,
        studentId: session.studentId,
        studentName: session.studentName ?? session.user.name,
        stageKey: "showcase",
        category: slot.category,
        title: slot.title,
        fileName: data.fileName,
        fileType: data.fileType,
        size: data.size,
        url: data.url,
      });
      session.upsertSubmission({
        courseId: course.id,
        stageKey: "showcase",
        type: slot.category === "evidence" ? "evidence" : "showcase",
        title: slot.title,
        content: `上传文件：${data.fileName}`,
        groupId: group.id,
        files: [{ name: data.fileName, type: data.fileType, size: data.size, url: data.url }],
      });
      session.setPreviewUpload(course.id, upload.id);
      session.updateStudentProgress("showcase", 85);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败，请重试");
    } finally {
      setUploading(null);
      // Reset the file input so the same file can be re-selected later.
      if (input) input.value = "";
    }
  }

  function saveContributions() {
    if (!group) return;
    group.members.forEach((member) => {
      session.upsertTeamContribution({
        groupId: group.id,
        studentId: member.studentId,
        studentName: member.name,
        percent: contribDraft[member.studentId] ?? 0,
      });
    });
  }

  function startPresentation() {
    session.addActivity(course.id, "开始演示", group?.name ?? "学生小组", session.studentName ?? "学生");
    session.updateStudentProgress("showcase", 100);
  }

  async function prepareShowcaseCoach() {
    if (!group) return;
    try {
      const draft = await buildShowcaseCoach({
        course,
        group,
        uploads,
        activities: course.activityLog ?? [],
        aiSupports: course.aiSupports ?? [],
      });
      session.upsertAiSupport({
        ...draft,
        courseId: course.id,
        studentId: session.studentId,
        studentName: session.studentName ?? session.user.name,
      });
      session.updateStudentProgress("showcase", Math.max(90, myStageProgress.showcase ?? 0));
      // 提醒教师有新数据可刷新
      session.setUiState(course.id, { aiAnalysisPending: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI 汇报教练生成失败";
      window.alert(message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-black leading-tight md:text-4xl">成果提交与演示准备</h1>
          <p className="mt-3 break-words text-base text-slate-500">完成成果上传、预览演示与团队贡献记录 · {course.name}</p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 rounded-[6px] border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
          <Clock3 size={18} />
          当前阶段：{course.stages[course.currentStageIndex]?.label ?? "—"}
          {myOverallProgress >= 100 ? " · 已完成" : " · 进行中"}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr_minmax(18rem,1fr)]">
        <Card className="overflow-hidden p-0">
          <h2 className="border-b border-slate-100 px-5 py-4 text-xl font-black">成果上传列表</h2>
          {uploadSlots.map((slot) => {
            const uploaded = uploads.find((item) => item.title === slot.title);
            const isUploading = uploading === slot.title;
            return (
              <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:grid-cols-[58px_1fr_1fr_116px]" key={slot.title}>
                <FileBadge type={slot.type} />
                <div><div className="font-black">{slot.title}{slot.title.includes("报告") || slot.title.includes("PPT") ? <span className="text-red-500"> *</span> : null}</div><div className="mt-1 text-sm text-slate-500">{slot.rule}</div></div>
                <div>
                  <div className="truncate text-sm font-semibold">{uploaded ? uploaded.fileName : isUploading ? "上传中..." : "尚未上传"}</div>
                  <div className="mt-1 text-sm text-slate-500">{uploaded ? uploaded.size : isUploading ? "请稍候..." : ""}</div>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-[6px] border border-blue-300 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                  <UploadCloud size={15} /> 上传
                  <input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(slot, file, event.target); }} />
                </label>
              </div>
            );
          })}
          {uploadError ? <div className="border-t border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-700">{uploadError}</div> : null}
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-black">演示预览区</h2>
          {previewUpload ? (
            <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3"><FileBadge type={previewUpload.fileType} /><div className="min-w-0"><div className="truncate font-black">{previewUpload.fileName}</div><div className="text-sm text-slate-500">{previewUpload.size}</div></div></div>
              <div className="mt-4 flex gap-2">
                <a className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[6px] bg-blue-600 font-semibold text-white" href={previewUpload.url} target="_blank" rel="noreferrer"><Eye size={16} /> 打开预览</a>
                <button className="grid h-10 w-10 place-items-center rounded-[6px] border border-slate-200" onClick={() => session.setPreviewUpload(course.id, undefined)} type="button"><X size={16} /></button>
              </div>
            </div>
          ) : (
            <SlidePreview className="h-72 min-h-[18rem]" />
          )}
          <div className="mt-4 flex items-center justify-center gap-5 text-base font-semibold">
            <span>{uploads.length ? `已上传 ${uploads.length} 个文件` : "暂无预览文件"}</span>
            {uploads.map((item) => <button className="rounded-[6px] border border-slate-200 px-3 py-1 text-sm text-blue-700" key={item.id} onClick={() => session.setPreviewUpload(course.id, item.id)} type="button">{item.fileType}</button>)}
          </div>
        </Card>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-4 inline-flex items-center gap-2 text-xl font-black">演示计时</h2>
            <div className="rounded-[8px] border border-slate-200 p-5 text-center">
              <div className="text-sm text-slate-500">当前用时</div>
              <time aria-live="polite" className="mt-4 block text-3xl font-black tabular-nums" data-testid="presentation-timer">
                {String(Math.floor(timer / 60)).padStart(2, "0")}:{String(timer % 60).padStart(2, "0")} <span className="text-base font-medium text-slate-500">/ 08:00</span>
              </time>
              <div className="mt-5 flex gap-2">
                <PrimaryButton className="flex-1" variant="outline" onClick={() => setTimerRunning((v) => !v)}>
                  {timerRunning ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
                  {timerRunning ? "暂停" : "开始"}
                </PrimaryButton>
                <PrimaryButton className="flex-1" variant="ghost" onClick={() => { setTimerRunning(false); setTimer(0); }}>
                  <RotateCcw size={18} /> 重置
                </PrimaryButton>
              </div>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">团队贡献</h2><button className="text-sm font-semibold text-blue-700" onClick={saveContributions} type="button">保存</button></div>
            {(group?.members ?? []).map((member) => (
              <div className="mb-3 flex items-center gap-3 last:mb-0" key={member.studentId}>
                <Avatar name={member.name} size={30} />
                <span className="flex-1 font-semibold">{member.name}</span>
                <input className="w-20 accent-blue-600" type="range" min={0} max={100} value={contribDraft[member.studentId] ?? 0} onChange={(event) => setContribDraft((draft) => ({ ...draft, [member.studentId]: Number(event.target.value) }))} />
                <span className="w-10 text-right text-sm text-slate-500">{contribDraft[member.studentId] ?? 0}%</span>
              </div>
            ))}
          </Card>
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_minmax(18rem,1fr)]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Compass className="text-amber-600" size={20} /> AI 汇报教练
            </h2>
            <button className="text-sm font-semibold text-blue-700" onClick={prepareShowcaseCoach} type="button">生成检查清单</button>
          </div>
          {latestShowcaseSupport ? (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-blue-100 bg-blue-50/70 p-3 text-sm leading-6 text-slate-700">
                {latestShowcaseSupport.diagnosis}
              </div>
              {latestShowcaseSupport.suggestions.map((tip, index) => (
                <div className="flex gap-3" key={tip}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 font-black text-white">{index + 1}</span>
                  <p className="text-[15px] leading-7 text-slate-700">{tip}</p>
                </div>
              ))}
              <div className="rounded-[8px] bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                依据：{latestShowcaseSupport.evidence.join("；")}
              </div>
            </div>
          ) : (
            ["突出问题与洞察：用数据和事实清晰展示关键问题。", "展示方案亮点：说明创新点、可行性及预期效果。", "总结与展望：提出未来改进方向或行动倡议。"].map((tip, index) => (
              <div className="mb-4 flex gap-3 last:mb-0" key={tip}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 font-black text-white">{index + 1}</span><p className="text-[15px] leading-7 text-slate-700">{tip}</p></div>
            ))
          )}
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">过程证据</h2><label className="cursor-pointer text-sm font-semibold text-blue-700">上传证据<input className="hidden" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile({ category: "evidence", type: "FILE", title: "过程证据", rule: "课堂过程记录" }, file, event.target); }} /></label></div>
          <EvidenceStrip />
        </Card>
        <div />
      </div>

      <div className="grid min-h-[88px] gap-5 rounded-[10px] border border-slate-200/80 bg-white px-6 py-4 md:grid-cols-3">
        <PrimaryButton onClick={() => saveContributions()} variant="outline">继续完善</PrimaryButton>
        <PrimaryButton onClick={() => session.setPreviewUpload(course.id, uploads[0]?.id)} variant="outline"><UploadCloud size={21} /> 预览演示</PrimaryButton>
        <PrimaryButton onClick={startPresentation}>开始演示</PrimaryButton>
      </div>
      <StudentAiChatPanel course={course} stageKey="showcase" contextLabel="成果汇报" />
    </div>
  );
}
