import type { Course } from "@/lib/session/types";
import { WorkspaceView } from "./workspace";

export function ProjectMakingView({ course }: { course: Course }) {
  return <div className="space-y-6"><header className="border-b border-[var(--pbl-border)] pb-5"><h1 className="font-editorial text-2xl font-semibold">项目实践</h1></header><WorkspaceView course={course} /></div>;
}
