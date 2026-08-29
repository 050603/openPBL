"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { CodeAiCollaboration } from "@/components/views/student/code-ai-collaboration";
import { DocumentAiCollaboration } from "@/components/views/student/document-ai-collaboration";
import {
  isCollaborationArtifactType,
  type CollaborationArtifactType,
} from "@/lib/ai-collaboration/artifact-types";

export default function StudentAiCollaborationPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedArtifact = searchParams.get("artifact");
  const artifactType: CollaborationArtifactType = isCollaborationArtifactType(requestedArtifact)
    ? requestedArtifact
    : "document";

  function changeArtifactType(value: CollaborationArtifactType) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "document") next.delete("artifact");
    else next.set("artifact", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
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
