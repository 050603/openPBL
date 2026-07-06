"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSession } from "@/lib/session/store";

export function StudentLeaveButton({
  redirectTo = "/student",
  label = "离开课堂",
  className,
}: {
  redirectTo?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const { leaveClass, joinedCourseId, studentId } = useSession();

  function handleClick() {
    if (!window.confirm("确定离开当前课堂？离开后需要重新输入邀请码。")) return;
    // Fire-and-forget: mark the student offline on the server before
    // navigating away. sendBeacon works even during unload.
    if (joinedCourseId && studentId) {
      const url = `/api/session/presence?courseId=${encodeURIComponent(joinedCourseId)}&studentId=${encodeURIComponent(studentId)}`;
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url, "");
      } else {
        fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    }
    leaveClass();
    router.replace(redirectTo);
  }

  return (
    <button
      className={
        "inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 " +
        (className ?? "")
      }
      onClick={handleClick}
      type="button"
    >
      <LogOut size={15} /> {label}
    </button>
  );
}
