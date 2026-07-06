"use client";

import { useCallback } from "react";
import { LegacyRedirectShell } from "@/components/legacy-redirect-shell";
import type { Course } from "@/lib/session/types";

export default function TeacherReviewLegacyPage() {
  const resolve = useCallback(
    ({ courses }: { courses: Course[]; joinedCourseId?: string }) => {
      const target = courses.find((c) => c.status === "teaching");
      if (target) return `/teacher/teach-classroom/${target.id}`;
      return "/teacher";
    },
    [],
  );
  return <LegacyRedirectShell resolveTarget={resolve} role="teacher" />;
}
