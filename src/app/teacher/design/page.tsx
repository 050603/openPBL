"use client";

import { useCallback } from "react";
import { LegacyRedirectShell } from "@/components/legacy-redirect-shell";
import type { Course } from "@/lib/session/types";

export default function TeacherDesignLegacyPage() {
  const resolve = useCallback(
    ({ courses }: { courses: Course[]; joinedCourseId?: string }) => {
      const target = courses.find(
        (c) => c.status === "draft" || c.status === "preparing",
      );
      if (target) {
        return `/teacher/prepare/${target.id}/verify`;
      }
      return "/teacher/prepare/new";
    },
    [],
  );
  return <LegacyRedirectShell resolveTarget={resolve} role="teacher" />;
}
