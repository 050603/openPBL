"use client";

import { useState } from "react";
import type { Course, TeacherInterventionAction } from "@/lib/session/types";
import type { InterventionSignal } from "@/lib/classroom/stage-gates";
import { TeacherInterventionQueue } from "@/components/classroom/classroom-chrome";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, NativeSelect, Textarea, toast } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import { makeRecordId } from "@/lib/session/actions";
import { WorkspaceTeacherView } from "./workspace";

export function ProjectMakingTeacherView({ course, onSelectGroup }: { course: Course; onSelectGroup?: (groupId: string) => void }) {
  const session = useSession();
  const [signal, setSignal] = useState<InterventionSignal>();
  const [action, setAction] = useState<TeacherInterventionAction>("guidance");
  const [instruction, setInstruction] = useState("");

  function saveIntervention() {
    if (!signal || !instruction.trim()) return;
    const createdAt = new Date().toISOString();
    const intervention = {
      id: makeRecordId("intervention"), stageKey: "make", scope: signal.targetType, targetIds: signal.targetIds,
      reason: signal.whatHappened, evidence: signal.evidence, action, instruction: instruction.trim(),
      severity: signal.kind === "ethics" || signal.kind === "over-generation" ? "high" as const : "warning" as const,
      status: "open" as const, teacherName: session.user.name, createdAt,
    };
    session.updateCourse(course.id, { teacherInterventions: [...(course.teacherInterventions ?? []), intervention] });
    signal.targetIds.forEach((targetId) => session.addFeedback({ courseId: course.id, targetType: signal.targetType, targetId, stageKey: "make", kind: "revision", content: instruction.trim(), sourceRole: "teacher", sourceName: session.user.name, evidence: signal.evidence, status: "open" }));
    session.upsertAiSupport({ courseId: course.id, stageKey: "make", targetType: signal.targetType, targetId: signal.targetIds[0] ?? course.id, groupId: signal.targetType === "group" ? signal.targetIds[0] : undefined, kind: "teacher-intervention", trigger: "教师介入后重新交还 AI", inputSummary: signal.whatHappened, diagnosis: instruction.trim(), suggestions: ["后续支架必须遵循教师介入要求", "记录学生如何回应和修改"], evidence: signal.evidence, status: "teacher-confirmed", source: "local", editedContent: instruction.trim() });
    session.addActivity(course.id, "教师介入", `${signal.title}：${instruction.trim()}`, session.user.name);
    setSignal(undefined); setInstruction("");
    toast.success("教师介入已同步", { description: "学生任务与 AI 后续支架将读取这条要求。" });
  }

  return <div className="space-y-8"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-teacher)]">课堂巡视与介入台</p><h2 className="font-editorial mt-1 text-2xl font-semibold">先看需要教师判断的问题，再进入小组作品</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--pbl-text-muted)]">AI 持续记录进度、支架使用和风险信号；只有涉及目标偏离、伦理判断、过度生成或持续停滞时才升级给教师。</p></header><section><h3 className="mb-3 text-lg font-semibold">需要介入</h3><TeacherInterventionQueue course={course} onSelect={setSignal} /></section><WorkspaceTeacherView course={course} onSelectGroup={onSelectGroup} />
    <Dialog onOpenChange={(open) => { if (!open) setSignal(undefined); }} open={Boolean(signal)}><DialogContent><DialogHeader><DialogTitle>记录教师介入</DialogTitle><DialogDescription>{signal?.whatHappened}。判断依据和对象会随介入要求一起写入课堂记录。</DialogDescription></DialogHeader><FormField label="介入方式">{({ id }) => <NativeSelect id={id} onChange={(event) => setAction(event.target.value as TeacherInterventionAction)} value={action}><option value="guidance">发布导学</option><option value="scope-adjustment">调整任务范围</option><option value="regroup">调整小组分工</option><option value="evaluation-requirement">补充评价要求</option><option value="pause-ai">暂停特定 AI 能力</option><option value="request-reasoning">要求学生重述判断</option><option value="override-stage">覆盖 AI 阶段建议</option></NativeSelect>}</FormField><FormField description="保存后，学生将看到这条要求，AI 也会把它作为后续支架上下文。" label="具体要求">{({ id, describedBy }) => <Textarea aria-describedby={describedBy} id={id} onChange={(event) => setInstruction(event.target.value)} placeholder={signal?.suggestedAction} value={instruction} />}</FormField><DialogFooter><Button onClick={() => setSignal(undefined)} variant="secondary">取消</Button><Button disabled={!instruction.trim()} onClick={saveIntervention}>同步给学生与 AI</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
