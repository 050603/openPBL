"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { useSession, useHydrated } from "@/lib/session/store";

/**
 * Generic redirect shell used by legacy routes.
 * Resolves target URL based on session state and replaces the current route.
 */
export function LegacyRedirectShell({
  role,
  resolveTarget,
  loadingMessage = "正在跳转…",
}: {
  role: "teacher" | "student";
  resolveTarget: (ctx: {
    courses: ReturnType<typeof useSession>["courses"];
    joinedCourseId?: string;
  }) => string;
  loadingMessage?: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { courses, joinedCourseId } = useSession();

  useEffect(() => {
    if (!hydrated) return;
    const target = resolveTarget({ courses, joinedCourseId });
    router.replace(target);
  }, [hydrated, courses, joinedCourseId, resolveTarget, router]);

  return (
    <DashboardShell role={role} variant="bare">
      <div className="grid place-items-center py-24 text-slate-500">
        {loadingMessage}
      </div>
    </DashboardShell>
  );
}
