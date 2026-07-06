import type { Course, StageViewKey } from "@/lib/session/types";
import { ProjectLaunchView } from "./project-launch";
import { AiLearningView } from "./ai-learning";
import { GroupView } from "./group";
import { WorkspaceView } from "./workspace";
import { ShowcaseView } from "./showcase";
import { ReflectionView } from "./reflection";

export function StudentStageView({
  view,
  course,
}: {
  view: StageViewKey;
  course: Course;
}) {
  switch (view) {
    case "project-launch":
      return <ProjectLaunchView course={course} />;
    case "ai-learning":
      return <AiLearningView course={course} />;
    case "group":
      return <GroupView course={course} />;
    case "workspace":
      return <WorkspaceView course={course} />;
    case "showcase":
      return <ShowcaseView course={course} />;
    case "reflection":
      return <ReflectionView course={course} />;
    default:
      return <ProjectLaunchView course={course} />;
  }
}
