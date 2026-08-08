import type { Course, StageViewKey } from "@/lib/session/types";
import { AiLearningTeacherView } from "./ai-learning";
import { ProjectLaunchTeacherView } from "./project-launch";
import { ReflectionTeacherView } from "./reflection";
import { ShowcaseTeacherView } from "./showcase";
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
      return <CompanionMonitor className="mt-0" course={course} stageKey="proposal" />;
    case "workspace":
      return <CompanionMonitor className="mt-0" course={course} stageKey="make" />;
    case "proposal-review":
      return <CompanionMonitor className="mt-0" course={course} stageKey="proposal" />;
    case "project-making":
      return <CompanionMonitor className="mt-0" course={course} stageKey="make" />;
    case "showcase":
      return <ShowcaseTeacherView course={course} onSelectGroup={onSelectGroup} />;
    case "reflection":
      return <ReflectionTeacherView course={course} onSelectStudent={onSelectStudent} />;
    default:
      return <ProjectLaunchTeacherView course={course} />;
  }
}
