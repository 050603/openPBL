"use client";

import { useState } from "react";
import { Check, Send, Users } from "lucide-react";
import { PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session/store";
import type { Course } from "@/lib/session/types";
import { cn } from "@/lib/utils";

export function TeacherDirectiveForm({
  course,
  stageKey,
  initialStudentId,
  initialStudentIds,
  initialAllStudents = false,
  onSubmitted,
}: {
  course: Course;
  stageKey: string;
  initialStudentId?: string;
  initialStudentIds?: string[];
  initialAllStudents?: boolean;
  onSubmitted?: () => void;
}) {
  const session = useSession();
  const initialTargets = initialStudentIds ?? (initialStudentId ? [initialStudentId] : []);
  const [targets, setTargets] = useState<string[]>(initialAllStudents ? [] : initialTargets);
  const [allStudents, setAllStudents] = useState(initialAllStudents);
  const [goal, setGoal] = useState("");
  const [instruction, setInstruction] = useState("");
  const [criteria, setCriteria] = useState("");

  const targetStudentIds = allStudents
    ? course.students.map((student) => student.id)
    : targets;
  const canSubmit = Boolean(goal.trim() && instruction.trim() && targetStudentIds.length);

  function submit() {
    if (!canSubmit) return;
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
    setGoal("");
    setInstruction("");
    setCriteria("");
    onSubmitted?.();
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-stone-600">指导对象</p>
          <span className="text-xs text-stone-400">
            {allStudents ? `全班 ${course.students.length} 人` : `已选择 ${targets.length} 人`}
          </span>
        </div>
        <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-[8px] border border-stone-200 bg-stone-50 p-3">
          <button
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
              allStudents
                ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher)] text-white"
                : "border-stone-200 bg-white text-stone-600",
            )}
            onClick={() => { setAllStudents(true); setTargets([]); }}
            type="button"
          >
            <Users size={13} />全班
          </button>
          {course.students.map((student) => {
            const selected = !allStudents && targets.includes(student.id);
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
                  selected
                    ? "border-[var(--pbl-teacher)] bg-[var(--pbl-teacher-soft)] text-[var(--pbl-teacher)]"
                    : "border-stone-200 bg-white text-stone-600",
                )}
                key={student.id}
                onClick={() => {
                  setAllStudents(false);
                  setTargets((current) => current.includes(student.id)
                    ? current.filter((id) => id !== student.id)
                    : [...current, student.id]);
                }}
                type="button"
              >
                {selected ? <Check size={12} /> : null}{student.name}
              </button>
            );
          })}
        </div>
      </section>

      <label className="block text-xs font-bold text-stone-600">
        持续目标
        <input
          className="mt-1.5 h-11 w-full rounded-[7px] border border-stone-200 bg-white px-3 text-sm outline-none focus:border-[var(--pbl-teacher-border)] focus:ring-2 focus:ring-[var(--pbl-teacher-soft)]"
          onChange={(event) => setGoal(event.target.value)}
          placeholder="例如：用两条可靠证据支持核心判断"
          value={goal}
        />
      </label>
      <label className="block text-xs font-bold text-stone-600">
        Agent 引导要求
        <textarea
          className="mt-1.5 min-h-24 w-full resize-y rounded-[7px] border border-stone-200 bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--pbl-teacher-border)] focus:ring-2 focus:ring-[var(--pbl-teacher-soft)]"
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="说明希望 Agent 如何提问、解释或推动学生"
          value={instruction}
        />
      </label>
      <label className="block text-xs font-bold text-stone-600">
        完成标准（每行一条）
        <textarea
          className="mt-1.5 min-h-20 w-full resize-y rounded-[7px] border border-stone-200 bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--pbl-teacher-border)] focus:ring-2 focus:ring-[var(--pbl-teacher-soft)]"
          onChange={(event) => setCriteria(event.target.value)}
          placeholder="例如：方案中出现两条可追溯证据"
          value={criteria}
        />
      </label>
      <div className="flex justify-end">
        <PrimaryButton disabled={!canSubmit} onClick={submit} type="button">
          <Send size={15} />向 {allStudents ? "全班" : `${targets.length} 名学生`} 下发目标
        </PrimaryButton>
      </div>
    </div>
  );
}
