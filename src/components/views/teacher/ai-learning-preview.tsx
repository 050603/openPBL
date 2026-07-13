"use client";

import { useState } from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { StudentStageHost } from "@/components/openmaic-bridge/student-stage-host";
import { useInteractiveIframePool } from "@openmaic/lib/store/interactive-iframe-pool";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  PrimaryButton,
} from "@/components/ui";
import type { Course } from "@/lib/session/types";

export function AiLearningTeacherPreview({ course }: { course: Course }) {
  const [open, setOpen] = useState(false);
  const setElevatedZIndex = useInteractiveIframePool((s) => s.setElevatedZIndex);
  if (!course.aiLearningClassroomId) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setElevatedZIndex(next);
      }}
    >
      <DialogTrigger asChild>
        <PrimaryButton type="button" variant="outline">
          <Eye size={16} /> 预览学生 AI 课程
        </PrimaryButton>
      </DialogTrigger>
      <DialogContent className="h-[min(92vh,900px)] max-h-[92vh] w-[min(1200px,calc(100vw-24px))] max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-stone-200 bg-stone-50 px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="text-blue-700" size={19} /> 教师预览 · {course.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" size={15} />
            可以自由播放和测试互动；不会写入任何学生进度、停留时长或重复播放数据。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-3">
          <StudentStageHost
            backHref="#"
            className="min-h-0"
            classroomId={course.aiLearningClassroomId}
            courseId={course.id}
            mode="teacher-preview"
            variant="embedded"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
