"use client";

import { useCallback } from "react";
import type { Course } from "@/lib/session/types";

/**
 * Shared redirect logic for legacy student routes.
 * - If the student has joined a teaching class, send them straight to the controlled classroom view.
 * - Otherwise, send them to the entry page to enter an invite code.
 */
export function studentLegacyResolver({
  courses,
  joinedCourseId,
}: {
  courses: Course[];
  joinedCourseId?: string;
}) {
  if (joinedCourseId) {
    const course = courses.find((c) => c.id === joinedCourseId);
    if (course?.status === "teaching") {
      return `/student/classroom/${course.id}`;
    }
  }
  return "/student";
}

export function useStudentLegacyResolver() {
  return useCallback(
    (ctx: { courses: Course[]; joinedCourseId?: string }) =>
      studentLegacyResolver(ctx),
    [],
  );
}
