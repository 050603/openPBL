import type { Course, StageViewKey } from "@/lib/session/types";
import { ProjectLaunchTeacherView } from "./project-launch";
import { AiLearningTeacherView } from "./ai-learning";
import { WorkspaceTeacherView } from "./workspace";
import { ShowcaseTeacherView } from "./showcase";
import { ReflectionTeacherView } from "./reflection";
import { ProposalReviewTeacherView } from "./proposal-review";
import { ProjectMakingTeacherView } from "./project-making";
import { CompanionMonitor } from "./companion-monitor";

/**
 * Teacher-side stage view dispatcher.
 * Renders a different UI per stage, focused on:
 *  - 课堂整体进度
 *  - 需关注的学生
 *  - 切换查看各组作品/方案
 *  - 实时打分与评价
 */
export function TeacherStageView({
  view,
  course,
  onSelectStudent,
  onSelectGroup,
}: {
  view: StageViewKey;
  course: Course;
  onSelectStudent?: (studentId: string) => void;
  onSelectGroup?: (groupId: string) => void;
}) {
  const stageKey = course.stages[course.currentStageIndex]?.key ?? "launch";
  const withCompanionMonitor = (content: React.ReactNode) => (
    <>{content}{["proposal", "make", "showcase", "reflection"].includes(stageKey) ? <CompanionMonitor course={course} stageKey={stageKey} /> : null}</>
  );
  switch (view) {
    case "project-launch":
      return <ProjectLaunchTeacherView course={course} />;
    case "ai-learning":
      return (
        <AiLearningTeacherView
          course={course}
          onSelectStudent={onSelectStudent}
        />
      );
    case "group":
      return withCompanionMonitor(<ProposalReviewTeacherView course={course} onSelectGroup={onSelectGroup} />);
    case "workspace":
      return withCompanionMonitor(
        <WorkspaceTeacherView
          course={course}
          onSelectGroup={onSelectGroup}
        />
      );
    case "proposal-review":
      return withCompanionMonitor(<ProposalReviewTeacherView course={course} onSelectGroup={onSelectGroup} />);
    case "project-making":
      return withCompanionMonitor(<ProjectMakingTeacherView course={course} onSelectGroup={onSelectGroup} />);
    case "showcase":
      return withCompanionMonitor(
        <ShowcaseTeacherView
          course={course}
          onSelectGroup={onSelectGroup}
        />
      );
    case "reflection":
      return withCompanionMonitor(
        <ReflectionTeacherView
          course={course}
          onSelectStudent={onSelectStudent}
        />
      );
    default:
      return <ProjectLaunchTeacherView course={course} />;
  }
}
