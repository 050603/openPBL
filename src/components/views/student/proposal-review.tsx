import type { Course } from "@/lib/session/types";
import { FeedbackLanes } from "@/components/classroom/classroom-chrome";
import { WorkspaceView } from "./workspace";

export function ProposalReviewView({ course }: { course: Course }) {
  return <div className="space-y-8"><header className="border-b border-[var(--pbl-border)] pb-5"><p className="text-sm font-semibold text-[var(--pbl-student)]">方案汇报与纠偏</p><h1 className="font-editorial mt-1 text-2xl font-semibold">回应每一类反馈，并留下方案如何改变的证据</h1></header><FeedbackLanes feedback={(course.feedback ?? []).filter((item) => item.stageKey === "review")} /><WorkspaceView course={course} /></div>;
}
