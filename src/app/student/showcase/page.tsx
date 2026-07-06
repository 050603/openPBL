"use client";

import { LegacyRedirectShell } from "@/components/legacy-redirect-shell";
import { useStudentLegacyResolver } from "@/components/student-legacy-redirect";

export default function StudentShowcaseLegacyPage() {
  const resolve = useStudentLegacyResolver();
  return <LegacyRedirectShell resolveTarget={resolve} role="student" />;
}
