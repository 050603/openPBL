import type { Course, StageViewKey } from "@/lib/session/types";
import type { TeacherStageFocus } from "@/lib/classroom/teacher-dashboard-metrics";
import type { ShowcasePresentationController } from "@/hooks/use-showcase-presentation";
import { AiLearningTeacherView } from "./ai-learning";
import { ProjectLaunchTeacherView } from "./project-launch";
import { ReflectionTeacherView } from "./reflection";
import { NewReflectionTeacherView } from "./reflection-survey";
import { ShowcaseTeacherView } from "./showcase";
import { CompanionMonitor } from "./companion-monitor";
import { SimplifiedTeacherStageView } from "@/components/classroom/simple-stage-resources";
import { AiCollaborationTeacherMonitor } from "./ai-collaboration-monitor";
import { NewShowcaseTeacherView } from "./showcase-reporting";
import { inferStageCollectionMode } from "@/lib/system-mode";

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
  focus,
  showcaseController,
}: {
  view: StageViewKey;
  course: Course;
  onSelectStudent?: (studentId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  focus?: TeacherStageFocus;
  showcaseController?: ShowcasePresentationController;
}) {
  // Normalize old persisted five-stage courses whose fourth stage still uses
  // the generic resource view. Legacy six-stage courses retain their original
  // showcase evaluation view.
  const currentStage = course.stages[course.currentStageIndex];
  const normalizedView = view === "simple-resource"
    && currentStage?.key === "showcase"
    && inferStageCollectionMode(course.stages) === "new"
    ? "showcase-reporting"
    : view === "simple-resource"
      && currentStage?.key === "reflection"
      && inferStageCollectionMode(course.stages) === "new"
      ? "reflection-survey"
    : view;
  switch (normalizedView) {
    case "project-launch":
      return <ProjectLaunchTeacherView course={course} />;
    case "ai-learning":
      return (
        <AiLearningTeacherView
          course={course}
          onSelectStudent={onSelectStudent}
          focus={focus?.stageKey === "ai-learning" ? focus : undefined}
        />
      );
    case "simple-resource":
      return (
        <SimplifiedTeacherStageView
          course={course}
          stageKey={course.stages[course.currentStageIndex]?.key ?? "launch"}
          focus={focus?.stageKey === "launch" ? focus : undefined}
        />
      );
    case "ai-collaboration":
      return <AiCollaborationTeacherMonitor course={course} focus={focus?.stageKey === "make" ? focus : undefined} />;
    case "group":
      return <CompanionMonitor className="mt-0" course={course} stageKey="proposal" />;
    case "workspace":
      return <CompanionMonitor className="mt-0" course={course} stageKey="make" />;
    case "proposal-review":
      return <CompanionMonitor className="mt-0" course={course} stageKey="proposal" />;
    case "project-making":
      return <AiCollaborationTeacherMonitor course={course} focus={focus?.stageKey === "make" ? focus : undefined} />;
    case "showcase-reporting":
      return <NewShowcaseTeacherView course={course} focus={focus?.stageKey === "showcase" ? focus : undefined} controller={showcaseController} />;
    case "showcase":
      return <ShowcaseTeacherView course={course} onSelectGroup={onSelectGroup} />;
    case "reflection-survey":
      return <NewReflectionTeacherView course={course} focus={focus?.stageKey === "reflection" ? focus : undefined} />;
    case "reflection":
      return <ReflectionTeacherView course={course} onSelectStudent={onSelectStudent} />;
    default:
      return <ProjectLaunchTeacherView course={course} />;
  }
}
