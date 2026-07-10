"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useSession } from "@/lib/session/store";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui";

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
    <AlertDialog>
      <AlertDialogTrigger asChild><button
      className={
        "inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 " +
        (className ?? "")
      }
      onClick={handleClick}
      type="button"
    >
      <LogOut size={15} /> {label}
      </button></AlertDialogTrigger>
      <AlertDialogContent><AlertDialogTitle>离开当前课堂？</AlertDialogTitle><AlertDialogDescription>离开后当前身份会退出课堂，再次进入需要重新输入邀请码。</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>继续学习</AlertDialogCancel><AlertDialogAction onClick={handleClick}>确认离开</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  );
}
