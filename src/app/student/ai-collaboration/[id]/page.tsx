"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CodeAiCollaboration } from "@/components/views/student/code-ai-collaboration";
import { DocumentAiCollaboration } from "@/components/views/student/document-ai-collaboration";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import {
  isCollaborationArtifactType,
  type CollaborationArtifactType,
} from "@/lib/ai-collaboration/artifact-types";
import { useCourse, useHydrated } from "@/lib/session/store";
import { isNewOpenPblSystem } from "@/lib/system-mode";
import { normalizePblCourseConfig } from "@/lib/pbl-course-config";
import { OtherArtifactCollaboration } from "@/components/views/student/other-artifact-collaboration";

export default function StudentAiCollaborationPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const course = useCourse(params.id);
  const hydrated = useHydrated();
  const newSystem = isNewOpenPblSystem();
  useRealtimeSync(params.id);
  const currentStage = course?.stages[course.currentStageIndex];
  const makeArtifactMode = normalizePblCourseConfig(course?.pblConfig).makeArtifactMode;
  const returningToClassroom = Boolean(
    hydrated
    && newSystem
    && course
    && (course.status !== "teaching"
      || currentStage?.view !== "ai-collaboration"),
  );
  const requestedArtifact = searchParams.get("artifact");
  const artifactType: CollaborationArtifactType = newSystem
    ? makeArtifactMode === "python" || makeArtifactMode === "c" ? makeArtifactMode : "document"
    : isCollaborationArtifactType(requestedArtifact)
    ? requestedArtifact
    : "document";

  function changeArtifactType(value: CollaborationArtifactType) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "document") next.delete("artifact");
    else next.set("artifact", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!returningToClassroom || !course) return;
    router.replace(`/student/classroom/${course.id}`);
  }, [course, returningToClassroom, router]);

  if (returningToClassroom) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--pbl-bg)] text-sm text-stone-500">
        正在进入新的课堂阶段…
      </div>
    );
  }

  if (newSystem && currentStage?.key === "make" && makeArtifactMode === "other") {
    return <OtherArtifactCollaboration courseId={params.id} />;
  }

  if (artifactType === "python" || artifactType === "c") {
    return (
      <CodeAiCollaboration
        courseId={params.id}
        language={artifactType}
        onArtifactTypeChange={changeArtifactType}
      />
    );
  }

  return (
    <DocumentAiCollaboration
      courseId={params.id}
      onArtifactTypeChange={changeArtifactType}
    />
  );
}
