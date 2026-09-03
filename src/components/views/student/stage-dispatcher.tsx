import type { Course, StageViewKey } from "@/lib/session/types";
import { AiLearningView } from "./ai-learning";
import { ProjectLaunchView } from "./project-launch";
import { ProjectMakingView } from "./project-making";
import { ProposalReviewView } from "./proposal-review";
import { ReflectionView } from "./reflection";
import { NewReflectionStudentView } from "./reflection-survey";
import { ShowcaseView } from "./showcase";
import { SimplifiedStudentStageView } from "@/components/classroom/simple-stage-resources";
import { NewShowcaseStudentView } from "./showcase-reporting";
import { inferStageCollectionMode } from "@/lib/system-mode";

export function StudentStageView({
  view,
  course,
  embedded = false,
}: {
  view: StageViewKey;
  course: Course;
  embedded?: boolean;
}) {
  // Courses created before the dedicated reporting view may still have the
  // fourth stage persisted as `simple-resource`. Normalize that persisted
  // view at the dispatcher boundary without changing legacy six-stage data.
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
      return <ProjectLaunchView course={course} />;
    case "ai-learning":
      return <AiLearningView course={course} />;
    case "simple-resource":
      return (
        <SimplifiedStudentStageView
          course={course}
          stageKey={course.stages[course.currentStageIndex]?.key ?? "launch"}
        />
      );
    case "ai-collaboration":
      return <ProjectMakingView course={course} />;
    case "group":
      return <ProposalReviewView course={course} embedded={embedded} />;
    case "workspace":
      return <ProjectMakingView course={course} />;
    case "proposal-review":
      return <ProposalReviewView course={course} embedded={embedded} />;
    case "project-making":
      return <ProjectMakingView course={course} />;
    case "showcase-reporting":
      return <NewShowcaseStudentView course={course} />;
    case "showcase":
      return <ShowcaseView course={course} embedded={embedded} />;
    case "reflection-survey":
      return <NewReflectionStudentView course={course} />;
    case "reflection":
      return <ReflectionView course={course} embedded={embedded} />;
    default:
      return <ProjectLaunchView course={course} />;
  }
}
