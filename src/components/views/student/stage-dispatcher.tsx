import type { Course, StageViewKey } from "@/lib/session/types";
import { ProjectLaunchView } from "./project-launch";
import { AiLearningView } from "./ai-learning";
import { WorkspaceView } from "./workspace";
import { ShowcaseView } from "./showcase";
import { ReflectionView } from "./reflection";
import { ProposalReviewView } from "./proposal-review";
import { ProjectMakingView } from "./project-making";

export function StudentStageView({
  view,
  course,
  embedded = false,
}: {
  view: StageViewKey;
  course: Course;
  embedded?: boolean;
}) {
  switch (view) {
    case "project-launch":
      return <ProjectLaunchView course={course} />;
    case "ai-learning":
      return <AiLearningView course={course} />;
    case "group":
      return <ProposalReviewView course={course} embedded={embedded} />;
    case "workspace":
      return <WorkspaceView course={course} embedded={embedded} />;
    case "proposal-review":
      return <ProposalReviewView course={course} embedded={embedded} />;
    case "project-making":
      return <ProjectMakingView course={course} />;
    case "showcase":
      return <ShowcaseView course={course} embedded={embedded} />;
    case "reflection":
      return <ReflectionView course={course} embedded={embedded} />;
    default:
      return <ProjectLaunchView course={course} />;
  }
}
