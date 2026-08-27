"use client";

import { useParams } from "next/navigation";
import { DocumentAiCollaboration } from "@/components/views/student/document-ai-collaboration";

export default function StudentAiCollaborationPage() {
  const params = useParams<{ id: string }>();
  return <DocumentAiCollaboration courseId={params.id} />;
}
