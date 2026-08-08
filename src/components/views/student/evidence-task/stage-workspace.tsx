"use client";

import type { Course } from "@/lib/session/types";
import { useSession } from "@/lib/session/store";
import { StageMissionHud } from "../stage-mission-hud";
import { AiDecisionInbox } from "./ai-decision-inbox";
import { LaunchEvidenceTask } from "./launch-task";
import { MakeEvidenceTask } from "./make-task";
import { ProposalEvidenceTask } from "./proposal-task";
import { ReflectionEvidenceTask } from "./reflection-task";
import { EvidenceTaskFocusProvider } from "./shared";
import { ShowcaseEvidenceTask } from "./showcase-task";

export function EvidenceStageWorkspace({
  course,
  stageKey,
  embedded = false,
  showMission = true,
  focusActionId,
  showAiInbox = true,
}: {
  course: Course;
  stageKey: string;
  embedded?: boolean;
  showMission?: boolean;
  focusActionId?: string;
  showAiInbox?: boolean;
}) {
  const session = useSession();
  const studentId = session.studentId ?? "";

  if (!studentId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        请先以学生身份进入课堂，再开始个人项目任务。
      </div>
    );
  }

  return (
    <div className={embedded ? "grid gap-4" : "grid gap-5"}>
      {showMission ? (
        <StageMissionHud
          compact={embedded}
          course={course}
          stageKey={stageKey}
          studentId={studentId}
        />
      ) : null}
      {showAiInbox ? (
        <AiDecisionInbox
          course={course}
          stageKey={stageKey}
          studentId={studentId}
        />
      ) : null}
      <EvidenceTaskFocusProvider actionId={focusActionId}>
        {stageKey === "launch" ? (
          <LaunchEvidenceTask course={course} studentId={studentId} />
        ) : stageKey === "proposal" ? (
          <ProposalEvidenceTask course={course} studentId={studentId} />
        ) : stageKey === "make" ? (
          <MakeEvidenceTask course={course} studentId={studentId} />
        ) : stageKey === "showcase" ? (
          <ShowcaseEvidenceTask course={course} studentId={studentId} />
        ) : stageKey === "reflection" ? (
          <ReflectionEvidenceTask course={course} studentId={studentId} />
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
            当前阶段沿用专用学习界面。
          </div>
        )}
      </EvidenceTaskFocusProvider>
    </div>
  );
}
