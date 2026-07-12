"use client";

import { useState } from "react";
import { Send, Target, Users } from "lucide-react";
import { PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";
import { cn } from "@/lib/utils";

export function TeacherDirectiveForm({ course, stageKey, initialStudentId }: { course: Course; stageKey: string; initialStudentId?: string }) {
  const session = useSession();
  const [targets, setTargets] = useState<string[]>(initialStudentId ? [initialStudentId] : []);
  const [allStudents, setAllStudents] = useState(false);
  const [goal, setGoal] = useState("");
  const [instruction, setInstruction] = useState("");
  const [criteria, setCriteria] = useState("");

  function submit() {
    const targetStudentIds = allStudents ? course.students.map((student) => student.id) : targets;
    if (!goal.trim() || !instruction.trim() || !targetStudentIds.length) return;
    session.upsertTeacherAgentDirective({
      courseId: course.id,
      stageKey,
      targetStudentIds,
      targetScope: allStudents ? "course" : targetStudentIds.length > 1 ? "multiple" : "student",
      goal: goal.trim(),
      instruction: instruction.trim(),
      successCriteria: criteria.split(/\n|；|;/).map((item) => item.trim()).filter(Boolean),
      status: "active",
    });
    setGoal(""); setInstruction(""); setCriteria("");
  }

  return <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"><div><h4 className="flex items-center gap-2 font-black text-indigo-950"><Target size={17} /> 向伴学 Agent 下发持续目标</h4><p className="mt-1 text-xs leading-5 text-indigo-700">目标会持续生效，直到系统检测完成或教师手动撤销。</p></div><div><p className="mb-2 text-xs font-bold text-slate-500">指导对象</p><div className="flex flex-wrap gap-2"><button className={cn("h-8 rounded-full border px-3 text-xs font-bold", allStudents ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600")} onClick={() => { setAllStudents((value) => !value); setTargets([]); }} type="button"><Users className="mr-1 inline" size={13} />全班</button>{course.students.map((student) => <button className={cn("h-8 rounded-full border px-3 text-xs font-bold", !allStudents && targets.includes(student.id) ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "border-slate-200 bg-white text-slate-600")} key={student.id} onClick={() => { setAllStudents(false); setTargets((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id]); }} type="button">{student.name}</button>)}</div></div><label className="block text-xs font-bold text-slate-600">目标<input className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setGoal(event.target.value)} placeholder="例如：用两条可靠证据支持核心判断" value={goal} /></label><label className="block text-xs font-bold text-slate-600">Agent 引导要求<textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-200 bg-white p-3 text-sm" onChange={(event) => setInstruction(event.target.value)} placeholder="说明希望 Agent 如何提问、解释或推动学生" value={instruction} /></label><label className="block text-xs font-bold text-slate-600">完成标准（每行一条）<textarea className="mt-1 min-h-16 w-full rounded-md border border-slate-200 bg-white p-3 text-sm" onChange={(event) => setCriteria(event.target.value)} value={criteria} /></label><PrimaryButton onClick={submit} type="button"><Send size={15} />下发目标</PrimaryButton></div>;
}
