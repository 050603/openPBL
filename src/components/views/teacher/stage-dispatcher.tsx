import type { Course, StageViewKey } from "@/lib/session/types";
import { ProjectLaunchTeacherView } from "./project-launch";
import { AiLearningTeacherView } from "./ai-learning";
import { GroupTeacherView } from "./group";
import { WorkspaceTeacherView } from "./workspace";
import { ShowcaseTeacherView } from "./showcase";
import { ReflectionTeacherView } from "./reflection";
import { ProposalReviewTeacherView } from "./proposal-review";
import { ProjectMakingTeacherView } from "./project-making";

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
      return <GroupTeacherView course={course} onSelectGroup={onSelectGroup} />;
    case "workspace":
      return (
        <WorkspaceTeacherView
          course={course}
          onSelectGroup={onSelectGroup}
        />
      );
    case "proposal-review":
      return <ProposalReviewTeacherView course={course} onSelectGroup={onSelectGroup} />;
    case "project-making":
      return <ProjectMakingTeacherView course={course} onSelectGroup={onSelectGroup} />;
    case "showcase":
      return (
        <ShowcaseTeacherView
          course={course}
          onSelectGroup={onSelectGroup}
        />
      );
    case "reflection":
      return (
        <ReflectionTeacherView
          course={course}
          onSelectStudent={onSelectStudent}
        />
      );
    default:
      return <ProjectLaunchTeacherView course={course} />;
  }
}
